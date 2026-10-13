// Aritmética monetaria en enteros para el POS de contingencia. DEBE ser idéntica a frontend/src/offline/money.ts;
// ambas se prueban con test/fixtures/dinero-vectores.json (copia idéntica en frontend/test/fixtures).
// Importes en centavos y cantidades en centésimas (ambos enteros). Redondeo: mitad hacia arriba, sobre enteros no negativos.
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

export const centavosADecimal = (centavos: number) => entero(centavos, 'Importe') / 100;
export const decimalACentavos = (valor: number) => Math.round(valor * 100);
