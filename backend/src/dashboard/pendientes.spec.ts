import { DashboardService } from './dashboard.service';
import { reglasAutorizadas } from './pendientes';

// Pendientes del inicio: cada rol recibe solo lo que puede abrir, y lo no autorizado ni siquiera se consulta.
describe('Pendientes del inicio — autorización por rol, módulo y permiso', () => {
  const claves = (rol: string, registros: { moduleKey: string; enabled: boolean }[] = [], extra: object = {}) =>
    reglasAutorizadas({ rol, ...extra }, registros).map((r) => r.clave);

  it('ADMIN recibe los cinco indicadores, ordenados por prioridad', () => {
    expect(claves('ADMIN')).toEqual(['contingencia_revision', 'precios_pendientes', 'entregas_pendientes', 'cotizaciones_vencen_hoy', 'stock_bajo_minimo']);
  });

  it('cada rol replica la autorización de la pantalla de destino', () => {
    expect(claves('CAJERO')).toEqual(['entregas_pendientes', 'cotizaciones_vencen_hoy']);
    expect(claves('VENDEDOR')).toEqual(['cotizaciones_vencen_hoy']);
    expect(claves('BODEGUERO')).toEqual(['entregas_pendientes', 'stock_bajo_minimo']);
    expect(claves('SUPERADMIN')).toEqual([]);
    expect(claves('')).toEqual([]);
  });

  it('CAJERO solo cuenta sus propias entregas; ADMIN y BODEGUERO, las del negocio', () => {
    const alcance = (rol: string) => reglasAutorizadas({ rol }, []).find((r) => r.clave === 'entregas_pendientes')?.alcance;
    expect(alcance('CAJERO')).toBe('PROPIAS');
    expect(alcance('ADMIN')).toBe('NEGOCIO');
    expect(alcance('BODEGUERO')).toBe('NEGOCIO');
  });

  it('un módulo deshabilitado explícitamente oculta sus indicadores; sin registro se considera habilitado', () => {
    expect(claves('ADMIN', [{ moduleKey: 'pos', enabled: false }])).toEqual(['precios_pendientes', 'cotizaciones_vencen_hoy', 'stock_bajo_minimo']);
    expect(claves('ADMIN', [{ moduleKey: 'inventario', enabled: false }, { moduleKey: 'cotizaciones', enabled: false }])).toEqual(['contingencia_revision', 'entregas_pendientes']);
    expect(claves('ADMIN', [{ moduleKey: 'pos', enabled: true }])).toHaveLength(5);
  });

  it('el permiso solo restringe a usuarios con permisos configurados y nunca a ADMIN', () => {
    expect(claves('ADMIN', [], { permisosConfigurados: true, permisos: [] })).toContain('precios_pendientes');
  });
});

describe('DashboardService.getPendientes', () => {
  afterEach(() => { vi.useRealTimers(); });

  function prismaMock(registros: { moduleKey: string; enabled: boolean }[] = []) {
    return {
      tenantModule: { findMany: vi.fn().mockResolvedValue(registros) },
      operacionContingencia: { count: vi.fn().mockResolvedValue(2) },
      producto: { count: vi.fn().mockResolvedValue(3) },
      cotizacion: { count: vi.fn().mockResolvedValue(0) },
      $queryRawUnsafe: vi.fn().mockImplementation(async (sql: string) => [{ cantidad: sql.includes('detalles_venta') ? 4 : 5 }]),
    };
  }

  it('ADMIN: devuelve cifras del servidor con su ruta; cero solo cuando la consulta lo confirma', async () => {
    const prisma = prismaMock();
    const r = await new DashboardService(prisma as any).getPendientes('t1', { sub: 'u1', rol: 'ADMIN' });
    expect(r.indicadores).toEqual([
      { clave: 'contingencia_revision', cantidad: 2, ruta: '/contingencia-admin', alcance: 'NEGOCIO' },
      { clave: 'precios_pendientes', cantidad: 3, ruta: '/precios', alcance: 'NEGOCIO' },
      { clave: 'entregas_pendientes', cantidad: 4, ruta: '/entregas', alcance: 'NEGOCIO' },
      { clave: 'cotizaciones_vencen_hoy', cantidad: 0, ruta: '/cotizaciones', alcance: 'NEGOCIO' },
      { clave: 'stock_bajo_minimo', cantidad: 5, ruta: '/inventario', alcance: 'NEGOCIO' },
    ]);
    expect(typeof r.generadoAt).toBe('string');
  });

  it('todas las consultas se filtran por tenant', async () => {
    const prisma = prismaMock();
    await new DashboardService(prisma as any).getPendientes('t1', { sub: 'u1', rol: 'ADMIN' });
    expect(prisma.tenantModule.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(prisma.operacionContingencia.count.mock.calls[0][0].where).toEqual({ tenantId: 't1', requiereRevision: true });
    expect(prisma.producto.count.mock.calls[0][0].where).toEqual({ tenantId: 't1', activo: true, precioAprobado: false });
    expect(prisma.cotizacion.count.mock.calls[0][0].where.tenantId).toBe('t1');
    for (const [sql, tenant] of prisma.$queryRawUnsafe.mock.calls) {
      expect(sql).toContain('tenant_id = $1');
      expect(tenant).toBe('t1');
    }
  });

  it('CAJERO: entregas filtradas por su usuario y sin consultar precios, contingencia ni existencias', async () => {
    const prisma = prismaMock();
    const r = await new DashboardService(prisma as any).getPendientes('t1', { sub: 'cajero-1', rol: 'CAJERO' });
    expect(r.indicadores.map((i) => i.clave)).toEqual(['entregas_pendientes', 'cotizaciones_vencen_hoy']);
    expect(r.indicadores[0].alcance).toBe('PROPIAS');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRawUnsafe.mock.calls[0][2]).toBe('cajero-1');
    expect(prisma.operacionContingencia.count).not.toHaveBeenCalled();
    expect(prisma.producto.count).not.toHaveBeenCalled();
  });

  it('ADMIN: las entregas no se filtran por usuario', async () => {
    const prisma = prismaMock();
    await new DashboardService(prisma as any).getPendientes('t1', { sub: 'u1', rol: 'ADMIN' });
    const entregas = prisma.$queryRawUnsafe.mock.calls.find(([sql]) => sql.includes('detalles_venta'))!;
    expect(entregas[2]).toBeNull();
  });

  it('módulo POS deshabilitado: no consulta contingencia ni entregas', async () => {
    const prisma = prismaMock([{ moduleKey: 'pos', enabled: false }]);
    const r = await new DashboardService(prisma as any).getPendientes('t1', { sub: 'u1', rol: 'ADMIN' });
    expect(r.indicadores.map((i) => i.clave)).not.toContain('entregas_pendientes');
    expect(prisma.operacionContingencia.count).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe.mock.calls.some(([sql]) => sql.includes('detalles_venta'))).toBe(false);
  });

  it('cotizaciones que vencen hoy usan el día calendario de Tegucigalpa, no el del servidor', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T03:30:00.000Z'));
    const prisma = prismaMock();
    await new DashboardService(prisma as any).getPendientes('t1', { sub: 'u1', rol: 'VENDEDOR' });
    expect(prisma.cotizacion.count.mock.calls[0][0].where.fechaValidez.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('un fallo de la base se propaga (el inicio lo muestra como error, nunca como cero)', async () => {
    const prisma = prismaMock();
    prisma.producto.count.mockRejectedValue(new Error('caída'));
    await expect(new DashboardService(prisma as any).getPendientes('t1', { sub: 'u1', rol: 'ADMIN' })).rejects.toThrow('caída');
  });
});
