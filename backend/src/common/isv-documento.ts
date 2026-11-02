// Regla fiscal confirmada por el dueño (2026-11-02): solo 15 %, sin exentas en el piloto, y el ISV se calcula UNA vez
// sobre la base gravada total del documento (no por línea). Es la misma regla que el POS (`calcularTotales`) y que SICOFI
// (docs/COMPARACION_SICOFI_20261102.md). El descuento general se reparte entre gravado y exento en proporción a su
// importe, para no reducir el ISV con descuentos de productos exentos; sin exentas, se resta entero de la base gravada.
import { divisionMitadArriba } from './redondeo-monetario';

export interface LineaDocumentoCentavos { subtotalCentavos: number; exento: boolean }

export function isvDocumentoCentavos(lineas: LineaDocumentoCentavos[], descuentoGeneralCentavos: number, porcentajeIsv: number): number {
  const subtotal = lineas.reduce((s, l) => s + l.subtotalCentavos, 0);
  if (subtotal <= 0) return 0;
  const gravado = lineas.reduce((s, l) => s + (l.exento ? 0 : l.subtotalCentavos), 0);
  const descuento = Math.min(Math.max(descuentoGeneralCentavos, 0), subtotal);
  const descuentoGravado = gravado === subtotal ? descuento : divisionMitadArriba(descuento * gravado, subtotal);
  return divisionMitadArriba((gravado - descuentoGravado) * Math.round(porcentajeIsv * 100), 10000);
}
