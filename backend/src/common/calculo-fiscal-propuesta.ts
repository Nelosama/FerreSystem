// PROPUESTA P2-H2 — NO CONECTADA a ninguna ruta de venta (docs/AUDITORIA_P2_FISCAL_20261029.md §H2).
// Cálculo común de totales con líneas gravadas y exentas para POS en línea, POS sin conexión y cotizaciones.
// Conectarlo cambia una regla fiscal (qué se exenta, de dónde sale la marca y cómo se reparte el descuento), así que
// requiere aprobación del contador, la marca de exención en `productos`/`detalles_venta` (cambio de esquema, NEXUS) y
// el espejo idéntico en frontend/src/offline/money.ts con vectores compartidos.
import { subtotalLinea, TASA_ISV_PORCIENTO, type LineaCentavos, type TotalesCentavos } from './dinero';
import { exigirTasaIsvAutorizada } from './politica-isv';

export interface LineaFiscalCentavos extends LineaCentavos { exento: boolean }
export interface TotalesFiscalesCentavos extends TotalesCentavos { baseGravada: number; baseExenta: number }

const big = (n: number) => BigInt(n);
const mitadArriba = (numerador: bigint, divisor: bigint) => Number((numerador * 2n + divisor) / (divisor * 2n));

/**
 * Totales en centavos enteros, redondeo mitad hacia arriba.
 * - El descuento general se reparte entre la parte exenta y la gravada en proporción a su importe bruto, con el mismo
 *   redondeo que `importesDeVenta` de contabilidad (se redondea la parte exenta; la gravada es el resto).
 * - El ISV se calcula una sola vez sobre la base gravada (no por línea).
 * - Sin líneas exentas el resultado es idéntico a `calcularTotales` (prueba en el spec).
 */
export function calcularTotalesConExencion(lineas: LineaFiscalCentavos[], descuentoCentavos = 0, tasaPorciento = TASA_ISV_PORCIENTO): TotalesFiscalesCentavos {
  const tasaCentesimas = Math.round(exigirTasaIsvAutorizada(tasaPorciento) * 100);
  const subtotales = lineas.map((l) => subtotalLinea(l.precioCentavos, l.cantidadCentesimas));
  const subtotal = subtotales.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(descuentoCentavos) || descuentoCentavos < 0) throw new RangeError('Descuento debe ser un entero no negativo');
  if (descuentoCentavos > subtotal) throw new RangeError('Descuento mayor al subtotal');
  const base = subtotal - descuentoCentavos;
  const exentoBruto = subtotales.reduce((s, v, i) => s + (lineas[i].exento ? v : 0), 0);
  const baseExenta = exentoBruto > 0 && subtotal > 0 ? mitadArriba(big(exentoBruto) * big(base), big(subtotal)) : 0;
  const baseGravada = base - baseExenta;
  const isv = mitadArriba(big(baseGravada) * big(tasaCentesimas), 10000n);
  return { lineas: subtotales, subtotal, isv, total: base + isv, baseGravada, baseExenta };
}
