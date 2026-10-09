import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { OperacionesController } from '../operaciones/operaciones.controller';
import { OperacionesService } from '../operaciones/operaciones.service';
import { audit } from '../operaciones/ledger';
import { SupportAuditInterceptor } from './interceptors/support-audit.interceptor';

const SECRET = 'sec-012-test-secret-0123456789abcdef0123456789';
const PAGO = { solicitudId: '8f14e45f-ceea-4b2a-9d3e-111111111111', monto: 100, metodo: 'TRANSFERENCIA' };

describe('SEC-012 · sesiones de soporte (HTTP, guards, JWT e interceptor reales)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let auditRows: any[];
  let rawAuditRows: any[];
  let prisma: any;
  let service: any;

  const sign = (extra: object = {}, opts: object = { expiresIn: '5m' }, secret = SECRET) =>
    new JwtService({ secret }).sign({ sub: 'u1', tenantId: 't1', email: 'u@t.hn', type: 'tenant', ...extra }, opts);
  const soporte = (readOnly: boolean, extra: object = {}) => sign({ impersonatedBy: 'sa-1', soporteSesionId: 'ses-1', readOnly, ...extra });
  const pagar = (token: string, id = 'cta-1') => request(app.getHttpServer()).post(`/operaciones/cuentas/${id}/pagos`).set('Authorization', `Bearer ${token}`).send(PAGO);

  beforeEach(async () => {
    auditRows = []; rawAuditRows = [];
    prisma = {
      usuario: { findFirst: vi.fn(async ({ where }: any) => where.id === 'u1' && where.tenantId === 't1' ? { id: 'u1', rol: 'ADMIN', permisos: [], permisosConfigurados: false, descuentoMaximo: 0, tenant: { estado: 'ACTIVO' } } : null) },
      superAdmin: { findUnique: vi.fn(async ({ where }: any) => where.id === 'sa-1' ? { activo: true } : null) },
      auditoriaOperacion: { create: vi.fn(async ({ data }: any) => { auditRows.push(data); return data; }) },
    };
    // Transacción simulada que usa el mismo `audit()` real del ledger.
    const tx = { $queryRawUnsafe: vi.fn(async (_sql: string, ...args: any[]) => { rawAuditRows.push({ tenantId: args[1], usuarioId: args[2], operacion: args[3], entidadId: args[4], datos: JSON.parse(args[5]) }); return []; }) };
    service = { pagar: vi.fn(async (t: string, u: string, id: string) => { await audit(tx as any, t, u, 'CUENTA_PAGAR', id, { monto: 100 }); return { ok: true }; }) };
    const module = await Test.createTestingModule({
      controllers: [OperacionesController],
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? SECRET : undefined } },
        { provide: OperacionesService, useValue: service },
        { provide: APP_INTERCEPTOR, useClass: SupportAuditInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = new JwtService({ secret: SECRET });
  });
  afterEach(async () => { await app?.close(); });

  it('lectura permitida con token de soporte de solo lectura', async () => {
    service.cuentas = vi.fn().mockResolvedValue([]);
    (app.get(OperacionesService) as any).cuentas = service.cuentas;
    await request(app.getHttpServer()).get('/operaciones/cuentas?tipo=CXC').set('Authorization', `Bearer ${soporte(true)}`).expect(200);
  });

  it('bloquea una operación financiera con readOnly=true, no ejecuta el servicio y deja evidencia de la denegación', async () => {
    await pagar(soporte(true)).expect(403);
    expect(service.pagar).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(auditRows.some(r => r.operacion === 'SOPORTE_ESCRITURA_DENEGADA')).toBe(true));
    const row = auditRows.find(r => r.operacion === 'SOPORTE_ESCRITURA_DENEGADA');
    expect(row).toMatchObject({ tenantId: 't1', usuarioId: 'u1', datos: { _soporte: { superAdminId: 'sa-1', soporteSesionId: 'ses-1', resultado: 'DENEGADA' } } });
  });

  it('token sin readOnly explícito se trata como solo lectura', async () => {
    await pagar(sign({ impersonatedBy: 'sa-1', soporteSesionId: 'ses-1' })).expect(403);
    expect(service.pagar).not.toHaveBeenCalled();
  });

  it('escritura autorizada: auditoría de la operación identifica al Super Admin real, además del inicio y el resultado', async () => {
    await pagar(soporte(false)).expect(201);
    expect(rawAuditRows).toHaveLength(1);
    expect(rawAuditRows[0]).toMatchObject({ tenantId: 't1', usuarioId: 'u1', operacion: 'CUENTA_PAGAR', entidadId: 'cta-1' });
    expect(rawAuditRows[0].datos._soporte).toEqual({ superAdminId: 'sa-1', soporteSesionId: 'ses-1', readOnly: false, resultado: 'OK' });
    await vi.waitFor(() => expect(auditRows.map(r => r.operacion)).toEqual(['SOPORTE_ESCRITURA_INICIO', 'SOPORTE_ESCRITURA_RESULTADO']));
    expect(auditRows[1].datos).toMatchObject({ resultado: 'OK', metodo: 'POST', ruta: '/operaciones/cuentas/:id/pagos', _soporte: { superAdminId: 'sa-1' } });
  });

  it('no guarda cuerpo, token ni cabeceras en la auditoría', async () => {
    const token = soporte(false);
    await pagar(token).expect(201);
    await vi.waitFor(() => expect(auditRows).toHaveLength(2));
    const serializado = JSON.stringify([auditRows, rawAuditRows]);
    expect(serializado).not.toContain(token);
    expect(serializado).not.toContain(PAGO.solicitudId);
    expect(serializado).not.toContain('Bearer');
  });

  it('si no se puede registrar la evidencia previa, la escritura NO se ejecuta', async () => {
    prisma.auditoriaOperacion.create.mockRejectedValue(new Error('db caída'));
    await pagar(soporte(false)).expect(500);
    expect(service.pagar).not.toHaveBeenCalled();
  });

  it('un error de la operación queda registrado como ERROR con el Super Admin', async () => {
    service.pagar.mockRejectedValue(Object.assign(new Error('x'), { status: 409 }));
    await pagar(soporte(false));
    await vi.waitFor(() => expect(auditRows.at(-1)).toMatchObject({ operacion: 'SOPORTE_ESCRITURA_RESULTADO', datos: { resultado: 'ERROR', _soporte: { superAdminId: 'sa-1' } } }));
  });

  it('prevención de suplantación: el cliente no puede inyectar impersonatedBy por cuerpo, query ni cabeceras', async () => {
    await request(app.getHttpServer()).post('/operaciones/cuentas/cta-1/pagos?impersonatedBy=sa-1')
      .set('Authorization', `Bearer ${sign()}`).set('x-impersonated-by', 'sa-1').send({ ...PAGO, impersonatedBy: 'sa-1', readOnly: false, soporteSesionId: 'x' }).expect(201);
    expect(rawAuditRows[0].datos._soporte).toBeUndefined();
    expect(auditRows).toHaveLength(0);
  });

  it('prevención de suplantación: JWT firmado con otra clave o sin sesión de soporte es rechazado', async () => {
    await pagar(sign({ impersonatedBy: 'sa-1', soporteSesionId: 's', readOnly: false }, { expiresIn: '5m' }, 'otra-clave-distinta-0123456789abcdef012345')).expect(401);
    await pagar(sign({ impersonatedBy: 'sa-1', readOnly: false })).expect(401);
    expect(service.pagar).not.toHaveBeenCalled();
  });

  it('si el Super Admin ya no existe o está inactivo, el token de soporte deja de servir', async () => {
    await pagar(soporte(false, { impersonatedBy: 'sa-fantasma' })).expect(401);
    prisma.superAdmin.findUnique.mockResolvedValue({ activo: false });
    await pagar(soporte(false)).expect(401);
    expect(service.pagar).not.toHaveBeenCalled();
  });

  it('rechaza usuario deshabilitado y tenant suspendido', async () => {
    prisma.usuario.findFirst.mockResolvedValue(null);
    await pagar(soporte(false)).expect(401);
    prisma.usuario.findFirst.mockResolvedValue({ id: 'u1', rol: 'ADMIN', permisos: [], descuentoMaximo: 0, tenant: { estado: 'SUSPENDIDO' } });
    await pagar(soporte(false)).expect(401);
  });

  it('aislamiento entre tenants: el token de un tenant no resuelve usuarios de otro y la evidencia usa el tenant del JWT', async () => {
    await pagar(soporte(false, { tenantId: 't2' })).expect(401);
    await pagar(soporte(false)).expect(201);
    await vi.waitFor(() => expect(auditRows.length).toBeGreaterThan(0));
    expect(new Set([...auditRows, ...rawAuditRows].map(r => r.tenantId))).toEqual(new Set(['t1']));
  });

  it('token de soporte expirado es rechazado', async () => {
    await pagar(sign({ impersonatedBy: 'sa-1', soporteSesionId: 's', readOnly: false }, { expiresIn: -10 })).expect(401);
    expect(service.pagar).not.toHaveBeenCalled();
  });

  it('una sesión normal (sin soporte) no cambia: escribe y no genera registros de soporte', async () => {
    await pagar(sign()).expect(201);
    expect(auditRows).toHaveLength(0);
    expect(jwt).toBeDefined();
  });
});
