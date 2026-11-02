// Espejo de backend/src/common/isv-documento.ts (vista previa; el servidor recalcula y manda).
// ISV una sola vez sobre la base gravada tras el descuento general, en centavos enteros, mitad hacia arriba.
const mitadArriba = (numerador: number, divisor: number) => Math.floor((numerador * 2 + divisor) / (divisor * 2));

export interface LineaDocumentoCentavos { subtotalCentavos: number; exento: boolean }

export function isvDocumentoCentavos(lineas: LineaDocumentoCentavos[], descuentoGeneralCentavos: number, porcentajeIsv: number): number {
  const subtotal = lineas.reduce((s, l) => s + l.subtotalCentavos, 0);
  if (subtotal <= 0) return 0;
  const gravado = lineas.reduce((s, l) => s + (l.exento ? 0 : l.subtotalCentavos), 0);
  const descuento = Math.min(Math.max(descuentoGeneralCentavos, 0), subtotal);
  const descuentoGravado = gravado === subtotal ? descuento : mitadArriba(descuento * gravado, subtotal);
  return mitadArriba((gravado - descuentoGravado) * Math.round(porcentajeIsv * 100), 10000);
}
