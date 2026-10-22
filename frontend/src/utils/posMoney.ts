import { aCentavos, calcularTotales } from '../offline/money';

/** El POS en línea usa las mismas líneas, base e ISV en centavos que contingencia y servidor. */
export function calcularVentaPOS(
  cart: { precioUnitario: number; cantidad: number }[],
  porcentaje: number,
) {
  const centesimas = (valor: number) => Number(valor.toFixed(2).replace('.', ''));
  const lineas = cart.map(item => ({
    precioCentavos: centesimas(item.precioUnitario),
    cantidadCentesimas: centesimas(item.cantidad),
  }));
  const bruto = calcularTotales(lineas).subtotal;
  // Conservar todos los decimales del porcentaje admitido por el POS (también notación exponencial).
  // Solo el importe del descuento se redondea: mitad hacia arriba sobre enteros.
  const [coeficiente, exponente = '0'] = porcentaje.toString().split('e');
  const [entera, fraccion = ''] = coeficiente.split('.');
  const divisor = 100n * 10n ** BigInt(fraccion.length - Number(exponente));
  const producto = BigInt(bruto) * BigInt(entera + fraccion);
  const descuento = Number((producto * 2n + divisor) / (divisor * 2n));
  const totales = calcularTotales(lineas, descuento);
  return { ...totales, descuento, base: totales.subtotal - descuento };
}

export type VueltoPOS =
  | { estado: 'VACIO' }
  | { estado: 'INVALIDO' }
  | { estado: 'FALTA'; centavos: number }
  | { estado: 'CAMBIO'; recibidoCentavos: number; centavos: number };

/**
 * Cambio a entregar en una venta en efectivo. Solo informa al cajero: no se envía al servidor
 * ni bloquea el cobro (misma lectura de importes que el POS de contingencia).
 */
export function calcularVuelto(efectivoTexto: string, totalCentavos: number): VueltoPOS {
  if (!efectivoTexto.trim()) return { estado: 'VACIO' };
  const recibido = aCentavos(efectivoTexto);
  if (recibido === null) return { estado: 'INVALIDO' };
  if (recibido < totalCentavos) return { estado: 'FALTA', centavos: totalCentavos - recibido };
  return { estado: 'CAMBIO', recibidoCentavos: recibido, centavos: recibido - totalCentavos };
}
