import { OperacionesService } from './operaciones.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('Caja — precisión monetaria del resumen y cierre', () => {
  const movimientosElevados = () => Array.from({ length: 1000 }, () => [
    { metodo: 'EFECTIVO', monto: '1000000000.01' },
    { metodo: 'EFECTIVO', monto: '-1000000000.00' },
  ]).flat();

  function servicio(movimientos: { metodo: string; monto: string }[], apertura = '0.00') {
    const caja = { id: 'caja', tenant_id: 'empresa', usuario_id: 'cajero', monto_apertura: apertura, estado: 'ABIERTA' };
    const consulta = vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.startsWith('SELECT * FROM cajas')) return [caja];
      if (sql.startsWith('SELECT * FROM movimientos_caja')) return movimientos;
      if (sql.startsWith('SELECT u.rol')) return [{ rol: 'CAJERO' }];
      if (sql.startsWith('UPDATE cajas SET')) return [{ ...caja, monto_cierre_fisico: args[0], monto_esperado: args[1], diferencia: args[2], estado: 'CERRADA' }];
      return [];
    });
    const tx = { $queryRawUnsafe: consulta };
    const prisma = { $transaction: (callback: (db: typeof tx) => unknown) => callback(tx) } as unknown as PrismaService;
    return new OperacionesService(prisma);
  }

  it('suma L 0.10 y L 0.20, resta egresos y conserva separados los métodos de pago', async () => {
    const ops = servicio([
      { metodo: 'EFECTIVO', monto: '0.10' },
      { metodo: 'EFECTIVO', monto: '0.20' },
      { metodo: 'EFECTIVO', monto: '-0.10' },
      { metodo: 'TARJETA', monto: '13.25' },
      { metodo: 'TRANSFERENCIA', monto: '7.10' },
      { metodo: 'CREDITO', monto: '11.20' },
    ], '5.00');

    const [caja] = await ops.caja('empresa', 'cajero');

    expect(caja.resumen).toEqual({
      fondoInicial: 5, ingresosEfectivo: 0.3, egresosEfectivo: 0.1, efectivoEsperado: 5.2,
      totalesPorMetodo: { EFECTIVO: 0.2, TARJETA: 13.25, TRANSFERENCIA: 7.1, CREDITO: 11.2 },
    });
    expect(caja.efectivoEsperado).toBe(5.2);
    expect(caja.totales).toEqual(caja.resumen.totalesPorMetodo);
  });

  it('mantiene el neto exacto de movimientos elevados sin inventar un centavo de diferencia', async () => {
    const [caja] = await servicio(movimientosElevados()).caja('empresa', 'cajero');

    expect(caja.resumen).toEqual({
      fondoInicial: 0, ingresosEfectivo: 1000000000010, egresosEfectivo: 1000000000000, efectivoEsperado: 10,
      totalesPorMetodo: { EFECTIVO: 10, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 },
    });
  });

  it('acepta el cierre por el efectivo exacto sin exigir explicación de un faltante inexistente', async () => {
    const cierre = await servicio(movimientosElevados()).cerrar('empresa', 'cajero', 'caja', { monto: 10 });

    expect(cierre).toMatchObject({ estado: 'CERRADA', monto_cierre_fisico: 10, monto_esperado: 10, diferencia: 0 });
    expect(cierre.resumen).toMatchObject({ efectivoContado: 10, efectivoEsperado: 10, diferencia: 0 });
  });

  it('conserva el neto aunque los ingresos y egresos acumulados superen el entero seguro de centavos', async () => {
    const movimientos = Array.from({ length: 10001 }, () => [
      { metodo: 'EFECTIVO', monto: '9999999999.99' },
      { metodo: 'EFECTIVO', monto: '-9999999999.98' },
    ]).flat();

    const [caja] = await servicio(movimientos).caja('empresa', 'cajero');

    expect(caja.efectivoEsperado).toBe(100.01);
    expect(caja.totales.EFECTIVO).toBe(100.01);
  });
});
