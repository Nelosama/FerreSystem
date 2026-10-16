import { aCentavos } from '../common/redondeo-monetario';
import { centavosADecimal, subtotalLinea } from '../common/dinero';

/**
 * Totales de una compra (JW-07). Todo el cálculo es en centavos enteros, con la misma regla de mitad hacia arriba
 * que venta, cotización y devoluciones: precio en centavos × cantidad en centésimas / 100, redondeado por línea.
 * El ISV llega del formulario y se valida como importe; no se recalcula ni se cambia su regla.
 */
export interface LineaCompraEntrada { cantidad: number; costo: number }
export interface TotalesCompra { lineas: number[]; subtotal: number; isv: number; total: number }

export function calcularTotalesCompra(items: LineaCompraEntrada[], isv: number): TotalesCompra {
  const lineas = items.map((i) => subtotalLinea(aCentavos(i.costo, 'Costo'), aCentavos(i.cantidad, 'Cantidad')));
  const subtotalCentavos = lineas.reduce((a, b) => a + b, 0);
  const isvCentavos = aCentavos(isv, 'Impuesto');
  return {
    lineas: lineas.map(centavosADecimal),
    subtotal: centavosADecimal(subtotalCentavos),
    isv: centavosADecimal(isvCentavos),
    total: centavosADecimal(subtotalCentavos + isvCentavos),
  };
}
