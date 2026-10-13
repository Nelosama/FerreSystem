// Aritmética monetaria en enteros para el POS de contingencia. Idéntica a backend/src/common/dinero.ts;
// ambas se prueban con test/fixtures/dinero-vectores.json (copia idéntica en backend/test/fixtures).
// Importes en centavos y cantidades en centésimas (enteros). Redondeo: mitad hacia arriba.
export const TASA_ISV_PORCIENTO = 15;

export interface LineaCentavos { precioCentavos: number; cantidadCentesimas: number }
export interface TotalesCentavos { lineas: number[]; subtotal: number; isv: number; total: number }

const entero = (valor: number, etiqueta: string) => {
  if (!Number.isSafeInteger(valor) || valor < 0) throw new RangeError(`${etiqueta} debe ser un entero no negativo`);
  return valor;
};
const mitadArriba = (numerador: number, divisor: number) => Math.floor((numerador * 2 + divisor) / (divisor * 2));

export function subtotalLinea(precioCentavos: number, cantidadCentesimas: number): number {
  return mitadArriba(entero(precioCentavos, 'Precio') * entero(cantidadCentesimas, 'Cantidad'), 100);
}

export function calcularTotales(lineas: LineaCentavos[], descuentoCentavos = 0): TotalesCentavos {
  const subtotales = lineas.map((l) => subtotalLinea(l.precioCentavos, l.cantidadCentesimas));
  const subtotal = subtotales.reduce((a, b) => a + b, 0);
  entero(descuentoCentavos, 'Descuento');
  if (descuentoCentavos > subtotal) throw new RangeError('Descuento mayor al subtotal');
  const base = subtotal - descuentoCentavos;
  const isv = mitadArriba(base * TASA_ISV_PORCIENTO, 100);
  return { lineas: subtotales, subtotal, isv, total: base + isv };
}

/** Acepta "12", "12.5" o "12.50" y devuelve centavos; null si el texto no es un importe válido. */
export function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(limpio)) return null;
  const [entera, decimales = ''] = limpio.split('.');
  return Number(entera) * 100 + Number(decimales.padEnd(2, '0'));
}

/** Cantidad con hasta 2 decimales a centésimas; null si no es válida. */
export function aCentesimas(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(limpio)) return null;
  const [entera, decimales = ''] = limpio.split('.');
  const total = Number(entera) * 100 + Number(decimales.padEnd(2, '0'));
  return total > 0 ? total : null;
}

export const formatearCentavos = (centavos: number) => `L ${(centavos / 100).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatearCentesimas = (centesimas: number) => (centesimas / 100).toLocaleString('es-HN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
