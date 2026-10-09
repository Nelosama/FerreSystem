import { OperacionesService } from './operaciones.service';
import { query } from './ledger';

vi.mock('./ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ledger')>()),
  query: vi.fn().mockResolvedValue([]),
}));

// Un día calendario de la ferretería (America/Tegucigalpa) empieza a las 06:00 UTC.
describe('Reporte de resumen — rango por día calendario de Tegucigalpa', () => {
  beforeEach(() => {
    vi.mocked(query).mockClear();
  });

  it('pasa a las consultas los instantes UTC del día local, no la fecha cruda', async () => {
    await new OperacionesService({} as any).resumen('t1', '2026-10-09', '2026-10-09');

    const consultasConRango = vi.mocked(query).mock.calls.slice(0, 3);
    expect(consultasConRango).toHaveLength(3);
    for (const [, , tenantId, inicio, fin] of consultasConRango) {
      expect(tenantId).toBe('t1');
      expect(inicio).toBe('2026-10-09T06:00:00.000Z');
      expect(fin).toBe('2026-10-10T06:00:00.000Z');
    }
  });

  it('el rango de varios días termina al inicio del día siguiente local', async () => {
    await new OperacionesService({} as any).resumen('t1', '2026-10-01', '2026-10-31');

    const [, , , inicio, fin] = vi.mocked(query).mock.calls[0];
    expect(inicio).toBe('2026-10-01T06:00:00.000Z');
    expect(fin).toBe('2026-11-01T06:00:00.000Z');
  });
});
