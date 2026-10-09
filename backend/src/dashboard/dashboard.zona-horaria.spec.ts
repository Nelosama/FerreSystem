import { DashboardService } from './dashboard.service';

// 2026-10-10T03:30Z = 2026-10-09 21:30 en America/Tegucigalpa (UTC-6, sin horario de verano).
// El servidor puede correr en UTC: el dashboard debe usar el día calendario de la ferretería.
describe('Dashboard — día calendario de America/Tegucigalpa', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function prismaMock() {
    return {
      venta: { findMany: vi.fn().mockResolvedValue([]) },
      devolucion: { aggregate: vi.fn().mockResolvedValue({ _sum: { monto: null } }) },
      producto: { findMany: vi.fn().mockResolvedValue([]) },
      cotizacion: { findMany: vi.fn().mockResolvedValue([]) },
    };
  }

  it('"ventas de hoy" abarca 00:00–23:59 de Tegucigalpa aunque sea 21:30 local (03:30 UTC del día siguiente)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T03:30:00.000Z'));
    const prisma = prismaMock();

    await new DashboardService(prisma as any).getDashboardData('t1');

    const rango = prisma.venta.findMany.mock.calls[0][0].where.createdAt;
    expect(rango.gte.toISOString()).toBe('2026-10-09T06:00:00.000Z');
    expect(rango.lte.toISOString()).toBe('2026-10-10T05:59:59.999Z');
  });

  it('la tendencia semanal etiqueta HOY con la fecha calendario local y no con la UTC', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T03:30:00.000Z'));
    const prisma = prismaMock();

    const data = await new DashboardService(prisma as any).getDashboardData('t1');

    expect(data.tendenciaSemanal.at(-1)).toMatchObject({ fecha: '2026-10-09', esHoy: true, dia: 'HOY' });
    expect(data.tendenciaSemanal[0].fecha).toBe('2026-10-03');
  });

  it('"ayer" para la variación usa el día calendario anterior en Tegucigalpa', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T03:30:00.000Z'));
    const prisma = prismaMock();

    await new DashboardService(prisma as any).getDashboardData('t1');

    const ayer = prisma.venta.findMany.mock.calls[1][0].where.createdAt;
    expect(ayer.gte.toISOString()).toBe('2026-10-08T06:00:00.000Z');
    expect(ayer.lte.toISOString()).toBe('2026-10-09T05:59:59.999Z');
  });
});
