/**
 * Adaptadores: filas de la base (tal como las devuelven las consultas) → entradas del motor.
 * Puros y estrictos: un importe con más de dos decimales significativos o no numérico es un error, no se redondea.
 */
import type { CompraEntrada, DevolucionEntrada, LineaCostoEntrada, PagoEntrada, VentaEntrada } from './reglas';

/** Decimal exacto («115.5», «115.50», Decimal de Prisma) → centavos enteros, sin coma flotante. */
export function centavosDeFila(valor: unknown, etiqueta = 'importe'): number {
  const texto = typeof valor === 'number' ? (Number.isFinite(valor) ? valor.toFixed(2) : 'x') : String(valor ?? '').trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto);
  if (!m) throw new RangeError(`${etiqueta}: valor no numérico`);
  const decimales = m[3] ?? '';
  if (/[1-9]/.test(decimales.slice(2))) throw new RangeError(`${etiqueta}: más de dos decimales`);
  const centavos = Number(m[2]) * 100 + Number((decimales + '00').slice(0, 2));
  if (!Number.isSafeInteger(centavos)) throw new RangeError(`${etiqueta}: fuera de rango`);
  return m[1] === '-' && centavos !== 0 ? -centavos : centavos;
}
/** Cantidad con dos decimales → centésimas enteras (misma conversión). */
export const centesimasDeFila = (valor: unknown, etiqueta = 'cantidad') => centavosDeFila(valor, etiqueta);

type Fila = Record<string, unknown>;

export function ventaDesdeFila(f: Fila): VentaEntrada {
  return {
    subtotalCentavos: centavosDeFila(f.subtotal, 'subtotal'),
    descuentoCentavos: centavosDeFila(f.descuento, 'descuento'),
    isvCentavos: centavosDeFila(f.isv, 'isv'),
    totalCentavos: centavosDeFila(f.total, 'total'),
    tipoPago: f.tipo_pago as VentaEntrada['tipoPago'],
    metodoPago: String(f.metodo_pago ?? ''),
  };
}
export function lineasCostoDesdeFilas(filas: readonly Fila[]): LineaCostoEntrada[] {
  return filas.map((f) => ({
    cantidadCentesimas: centesimasDeFila(f.cantidad),
    costoUnitarioCentavos: centavosDeFila(f.costo_unitario, 'costo_unitario'),
    sinInventario: f.sin_inventario === true,
  }));
}
export function pagoDesdeFila(f: Fila): PagoEntrada {
  return { montoCentavos: centavosDeFila(f.monto, 'monto'), metodo: String(f.metodo ?? '') };
}
export function compraDesdeFila(f: Fila): CompraEntrada {
  return { subtotalCentavos: centavosDeFila(f.subtotal, 'subtotal'), isvCentavos: centavosDeFila(f.isv, 'isv'), totalCentavos: centavosDeFila(f.total, 'total') };
}
/** `devolucion` es la fila de `devoluciones`; `venta` la de la venta de origen. */
export function devolucionDesdeFilas(devolucion: Fila, venta: Fila): DevolucionEntrada {
  const v = ventaDesdeFila(venta);
  return {
    montoCentavos: centavosDeFila(devolucion.monto, 'monto'),
    creditoCanceladoCentavos: centavosDeFila(devolucion.credito_cancelado, 'credito_cancelado'),
    reembolsoCentavos: centavosDeFila(devolucion.reembolso, 'reembolso'),
    metodoReembolso: devolucion.metodo === undefined || devolucion.metodo === null ? undefined : String(devolucion.metodo),
    venta: { subtotalCentavos: v.subtotalCentavos, descuentoCentavos: v.descuentoCentavos, isvCentavos: v.isvCentavos, totalCentavos: v.totalCentavos },
  };
}
