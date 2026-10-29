import { BadRequestException } from '@nestjs/common';
import { aCentavos } from '../common/redondeo-monetario';
import { centavosADecimal, subtotalLinea } from '../common/dinero';

/**
 * Totales de una compra (JW-07). Todo el cálculo es en centavos enteros, con la misma regla de mitad hacia arriba
 * que venta, cotización y devoluciones: precio en centavos × cantidad en centésimas / 100, redondeado por línea.
 * El ISV llega del formulario y se valida como importe; no se recalcula ni se cambia su regla.
 */
export interface LineaCompraEntrada { cantidad: number; costo: number }
export interface TotalesCompra { lineas: number[]; subtotal: number; isv: number; total: number }

/**
 * Validación aritmética de una compra. No es una decisión tributaria: no fija ninguna tasa ni exención.
 * - Un costo debe ser mayor que cero: una línea sin costo distorsiona el costo promedio.
 * - El ISV no puede superar el subtotal: ninguna tasa de impuesto tiene sentido por encima del 100 % de la base.
 * Qué tasa aplica a cada factura (0 %, 15 %, exenta o exonerada) queda pendiente de decisión del contador: no se valida aquí.
 */
export function calcularTotalesCompra(items: LineaCompraEntrada[], isv: number): TotalesCompra {
  if (items.some((i) => !(i.costo > 0))) throw new BadRequestException('Costo: debe ser mayor que cero');
  const lineas = items.map((i) => subtotalLinea(aCentavos(i.costo, 'Costo'), aCentavos(i.cantidad, 'Cantidad')));
  const subtotalCentavos = lineas.reduce((a, b) => a + b, 0);
  const isvCentavos = aCentavos(isv, 'Impuesto');
  if (isvCentavos > subtotalCentavos) throw new BadRequestException('El ISV no puede superar el subtotal de la compra');
  return {
    lineas: lineas.map(centavosADecimal),
    subtotal: centavosADecimal(subtotalCentavos),
    isv: centavosADecimal(isvCentavos),
    total: centavosADecimal(subtotalCentavos + isvCentavos),
  };
}
