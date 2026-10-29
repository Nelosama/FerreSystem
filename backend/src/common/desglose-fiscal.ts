// Desglose fiscal histórico por línea de venta y de devolución (docs/AUDITORIA_DEVOLUCIONES_EXENCIONES_20261029.md).
//
// Este módulo NO calcula impuestos ni decide qué es exento: reparte importes que la operación ya calculó (descuento e ISV
// de la venta) entre sus líneas, para que una devolución posterior pueda revertir exactamente la base gravada, la base
// exenta y el ISV de lo devuelto. Todo en centavos enteros. Reparto por restos mayores: la suma de las partes es siempre
// exactamente el total repartido.
//
// Escribir el desglose al vender está apagado por defecto (FISCAL_DESGLOSE_POR_LINEA). Mientras el contador no apruebe el
// reparto (decisiones D3, D6 y D8), las ventas quedan sin desglose y las devoluciones usan la regla vigente.

export const desgloseFiscalPorLineaActivo = (env: NodeJS.ProcessEnv = process.env) => env.FISCAL_DESGLOSE_POR_LINEA === 'true';

export interface LineaParaDesglose {
  /** Precio × cantidad de la línea, antes de cualquier descuento (detalles_venta.subtotal). */
  brutoCentavos: number;
  /** Descuento propio de la línea (cotizaciones); 0 en el POS. */
  descuentoLineaCentavos?: number;
  exento: boolean;
}
export interface DesgloseLinea { baseGravadaCentavos: number; baseExentaCentavos: number; isvCentavos: number }

const entero = (v: number, etiqueta: string) => {
  if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`${etiqueta} debe ser un entero no negativo de centavos`);
  return v;
};

/** Reparte `total` en proporción a `pesos` (enteros ≥ 0) por restos mayores; a igualdad de resto gana el índice menor. */
export function repartirProporcional(total: number, pesos: number[]): number[] {
  entero(total, 'Total');
  pesos.forEach((p) => entero(p, 'Peso'));
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (total === 0) return pesos.map(() => 0);
  if (suma === 0) throw new RangeError('No hay base sobre la cual repartir');
  const T = BigInt(total), S = BigInt(suma);
  const partes = pesos.map((p) => (T * BigInt(p)) / S);
  const restos = pesos.map((p, i) => ({ i, resto: (T * BigInt(p)) % S }));
  let faltante = total - partes.reduce((a, b) => a + Number(b), 0);
  restos.sort((a, b) => (a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1));
  for (const { i } of restos) { if (faltante <= 0) break; partes[i] += 1n; faltante -= 1; }
  return partes.map(Number);
}

/**
 * Desglose por línea de una venta ya calculada.
 * - El descuento general se reparte en proporción al importe de cada línea tras su descuento propio.
 * - El ISV de la venta se reparte solo entre las líneas gravadas, en proporción a su base. Las exentas llevan ISV 0.
 * Invariantes: Σ(base gravada + base exenta) = Σ bruto − Σ descuento propio − descuento general; Σ ISV = isvCentavos.
 */
export function desglosarVenta(lineas: LineaParaDesglose[], descuentoGeneralCentavos: number, isvCentavos: number): DesgloseLinea[] {
  if (!lineas.length) throw new RangeError('La venta no tiene líneas');
  entero(descuentoGeneralCentavos, 'Descuento general'); entero(isvCentavos, 'ISV');
  const netos = lineas.map((l, i) => {
    const bruto = entero(l.brutoCentavos, `Bruto de la línea ${i + 1}`), propio = entero(l.descuentoLineaCentavos ?? 0, `Descuento de la línea ${i + 1}`);
    if (propio > bruto) throw new RangeError(`El descuento de la línea ${i + 1} supera su importe`);
    return bruto - propio;
  });
  const sumaNetos = netos.reduce((a, b) => a + b, 0);
  if (descuentoGeneralCentavos > sumaNetos) throw new RangeError('El descuento general supera el importe de las líneas');
  const descuentos = repartirProporcional(descuentoGeneralCentavos, netos);
  const bases = netos.map((n, i) => n - descuentos[i]);
  const pesosIsv = bases.map((b, i) => (lineas[i].exento ? 0 : b));
  if (isvCentavos > 0 && pesosIsv.every((p) => p === 0)) throw new RangeError('La venta tiene ISV pero ninguna base gravada');
  const isv = repartirProporcional(isvCentavos, pesosIsv);
  return bases.map((b, i) => ({
    baseGravadaCentavos: lineas[i].exento ? 0 : b,
    baseExentaCentavos: lineas[i].exento ? b : 0,
    isvCentavos: isv[i],
  }));
}

export interface LineaVendidaDesglosada extends DesgloseLinea { cantidadCentesimas: number }

/**
 * Parte de una línea vendida que corresponde a una devolución, por cantidad y de forma acumulada: se calcula lo devuelto
 * hasta ahora y lo devuelto incluyendo esta devolución, y se resta. Así la suma de devoluciones parciales es exactamente la
 * línea cuando se devuelve completa, sin deriva de centavos.
 */
export function desgloseDevolucionLinea(linea: LineaVendidaDesglosada, devueltoAntesCentesimas: number, aDevolverCentesimas: number): DesgloseLinea {
  const Q = entero(linea.cantidadCentesimas, 'Cantidad vendida');
  entero(devueltoAntesCentesimas, 'Cantidad devuelta antes'); entero(aDevolverCentesimas, 'Cantidad a devolver');
  if (Q === 0) throw new RangeError('La línea no tiene cantidad');
  if (devueltoAntesCentesimas + aDevolverCentesimas > Q) throw new RangeError('La devolución supera la cantidad vendida');
  const acumulado = (importe: number, q: number) => Number((BigInt(entero(importe, 'Importe')) * BigInt(q) * 2n + BigInt(Q)) / (BigInt(Q) * 2n));
  const parte = (importe: number) => acumulado(importe, devueltoAntesCentesimas + aDevolverCentesimas) - acumulado(importe, devueltoAntesCentesimas);
  return { baseGravadaCentavos: parte(linea.baseGravadaCentavos), baseExentaCentavos: parte(linea.baseExentaCentavos), isvCentavos: parte(linea.isvCentavos) };
}

export const totalDesglose = (d: DesgloseLinea) => d.baseGravadaCentavos + d.baseExentaCentavos + d.isvCentavos;

/** Columnas de `detalles_venta` para una línea desglosada (importes en lempiras con dos decimales). */
export const columnasDesgloseVenta = (d: DesgloseLinea, exento: boolean, tasaIsvPorciento: number) => ({
  exento, baseGravada: d.baseGravadaCentavos / 100, baseExenta: d.baseExentaCentavos / 100, isv: d.isvCentavos / 100, tasaIsv: tasaIsvPorciento,
});

/** Desglose de cada línea, o un objeto vacío por línea si el interruptor está apagado (las columnas quedan NULL). */
export function desgloseParaEscribir(lineas: LineaParaDesglose[], descuentoGeneralCentavos: number, isvCentavos: number, tasaIsvPorciento: number, env: NodeJS.ProcessEnv = process.env) {
  if (!desgloseFiscalPorLineaActivo(env)) return lineas.map(() => ({}));
  return desglosarVenta(lineas, descuentoGeneralCentavos, isvCentavos).map((d, i) => columnasDesgloseVenta(d, lineas[i].exento, tasaIsvPorciento));
}
