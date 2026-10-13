import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { audit, authorizedActor, lockTenant } from '../operaciones/ledger';

vi.mock('../operaciones/ledger', () => ({
  audit: vi.fn(async () => undefined),
  authorizedActor: vi.fn(async () => undefined),
  lockTenant: vi.fn(async () => undefined),
}));

// Desactivación como eliminación lógica: reglas de último administrador, autoprotección, sesiones y auditoría.
describe('UsuariosService · desactivar, reactivar y eliminación lógica', () => {
  let usuarios: any[];
  let sesiones: { sujetoId: string; motivo: string }[];
  let prisma: any;
  let service: UsuariosService;

  const base = (extra: object) => ({ tenantId: 't1', nombre: 'x', email: 'x@t1.hn', rol: 'CAJERO', activo: true, permisos: [], permisosConfigurados: false, descuentoMaximo: 0, ...extra });

  beforeEach(() => {
    vi.clearAllMocks();
    usuarios = [
      base({ id: 'adm-1', nombre: 'Dueño', email: 'a1@t1.hn', rol: 'ADMIN' }),
      base({ id: 'adm-2', nombre: 'Gerente', email: 'a2@t1.hn', rol: 'ADMIN' }),
      base({ id: 'caj-1', nombre: 'Caja', email: 'c1@t1.hn', rol: 'CAJERO' }),
      base({ id: 'otra-1', tenantId: 't2', nombre: 'Ajena', email: 'o@t2.hn', rol: 'ADMIN' }),
    ];
    sesiones = [];
    const tx: any = {
      usuario: {
        findFirst: vi.fn(async ({ where, select }: any) => {
          const u = usuarios.find(x => x.id === where.id && x.tenantId === where.tenantId && (where.email === undefined || x.email === where.email));
          return u ? { ...u } : null;
        }),
        count: vi.fn(async ({ where }: any) => usuarios.filter(x => x.tenantId === where.tenantId && x.rol === where.rol && x.activo === where.activo).length),
        update: vi.fn(async ({ where, data }: any) => {
          const u = usuarios.find(x => x.id === where.id);
          Object.assign(u, data);
          return { ...u };
        }),
      },
      sesionAuth: { updateMany: vi.fn(async ({ where, data }: any) => { sesiones.push({ sujetoId: where.sujetoId, motivo: data.revocationMotivo }); return { count: 1 }; }) },
    };
    prisma = {
      usuario: { findFirst: vi.fn(async ({ where }: any) => { const u = usuarios.find(x => x.id === where.id && x.tenantId === where.tenantId); return u ? { ...u } : null; }) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
      _tx: tx,
    };
    service = new UsuariosService(prisma);
  });

  const usuario = (id: string) => usuarios.find(u => u.id === id);

  it('desactiva un cajero, revoca sus sesiones y registra quién lo hizo', async () => {
    const res = await service.remove('t1', 'caj-1', 'adm-1');
    expect(res.activo).toBe(false);
    expect(usuario('caj-1').activo).toBe(false);
    expect(sesiones).toEqual([{ sujetoId: 'caj-1', motivo: 'USUARIO_DESACTIVADO' }]);
    expect(audit).toHaveBeenCalledWith(expect.anything(), 't1', 'adm-1', 'USUARIO_DESACTIVAR', 'caj-1', expect.objectContaining({ anterior: expect.objectContaining({ activo: true }), nuevo: expect.objectContaining({ activo: false }) }));
    expect(lockTenant).toHaveBeenCalled();
    expect(authorizedActor).toHaveBeenCalledWith(expect.anything(), 't1', 'adm-1', ['ADMIN'], 'usuarios.gestionar');
  });

  it('no borra la fila: el usuario sigue existiendo para la auditoría y el historial', async () => {
    await service.remove('t1', 'caj-1', 'adm-1');
    expect(usuarios.some(u => u.id === 'caj-1')).toBe(true);
    expect(prisma._tx.usuario).not.toHaveProperty('delete');
  });

  it('reactiva un usuario sin revocar sesiones y audita USUARIO_REACTIVAR', async () => {
    await service.remove('t1', 'caj-1', 'adm-1');
    sesiones = [];
    const res = await service.update('t1', 'caj-1', { activo: true }, 'adm-1');
    expect(res.activo).toBe(true);
    expect(sesiones).toEqual([]);
    expect(audit).toHaveBeenLastCalledWith(expect.anything(), 't1', 'adm-1', 'USUARIO_REACTIVAR', 'caj-1', expect.anything());
  });

  it('desactivar un usuario ya inactivo es idempotente: no escribe ni audita de nuevo', async () => {
    await service.remove('t1', 'caj-1', 'adm-1');
    vi.clearAllMocks();
    const res = await service.remove('t1', 'caj-1', 'adm-1');
    expect(res.activo).toBe(false);
    expect(prisma._tx.usuario.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('desactivar un administrador deja de permitirse cuando es el último activo', async () => {
    await service.remove('t1', 'adm-2', 'adm-1');
    expect(usuario('adm-2').activo).toBe(false);
    await expect(service.remove('t1', 'adm-1', 'adm-1')).rejects.toBeInstanceOf(ConflictException);
    expect(usuario('adm-1').activo).toBe(true);
  });

  it('no permite que un administrador desactive su propia cuenta', async () => {
    await expect(service.remove('t1', 'adm-1', 'adm-1')).rejects.toBeInstanceOf(ConflictException);
    expect(usuario('adm-1').activo).toBe(true);
    expect(sesiones).toEqual([]);
  });

  it('quitar el rol ADMIN al último administrador activo también se rechaza', async () => {
    await expect(service.update('t1', 'adm-1', { rol: 'CAJERO' as any }, 'adm-2')).resolves.toBeDefined();
    await expect(service.update('t1', 'adm-2', { rol: 'CAJERO' as any }, 'adm-2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('no encuentra ni modifica usuarios de otra empresa', async () => {
    await expect(service.remove('t1', 'otra-1', 'adm-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(usuarios.find(u => u.id === 'otra-1').activo).toBe(true);
    expect(prisma._tx.usuario.update).not.toHaveBeenCalled();
  });

  it('desactivar a un usuario con historial conserva su identidad en la auditoría (no hay borrado físico)', async () => {
    await service.remove('t1', 'caj-1', 'adm-1');
    expect(audit.mock.calls.at(-1)?.[4]).toBe('caj-1');
  });
});
