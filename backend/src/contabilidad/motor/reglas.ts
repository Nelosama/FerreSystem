/**
 * Motor de reglas de contabilización — PURO: sin base de datos, sin NestJS y sin efectos.
 * Convierte una operación comercial ya registrada en una propuesta de asiento de partida doble expresada en conceptos.
 *
 * Principios:
 * - Todo importe es un entero en centavos; las cantidades, en centésimas (como `common/dinero.ts`).
 * - Nunca se corrige un descuadre: si la propuesta no cuadra, se devuelve el error y no hay líneas.
 * - No hay cuentas, tasas ni porcentajes fiscales: el ISV llega calculado por la operación.
 * - Las políticas contables aún no aprobadas por el contador son parámetros OBLIGATORIOS, sin valor por defecto.
 */
import { CONCEPTO_DE_METODO, esMetodoCobro, type Concepto } from './conceptos';

export const REGLAS_VERSION = 1;

export type PoliticaDescuento = 'BRUTO' | 'NETO';
export type MomentoInventarioCompra = 'FACTURA' | 'RECEPCION';

export interface LineaPropuesta {
  concepto: Concepto;
  debeCentavos: number;
  haberCentavos: number;
  descripcion: string;
}
export interface ErrorMotor {
  codigo:
    | 'POLITICA_REQUERIDA' | 'IMPORTE_INVALIDO' | 'METODO_SIN_CONCEPTO' | 'TOTAL_INCONSISTENTE'
    | 'MONTO_CERO' | 'DEVOLUCION_INCONSISTENTE' | 'LINEAS_INSUFICIENTES' | 'LINEA_INVALIDA' | 'DESCUADRE';
  mensaje: string;
}
export type ResultadoAsiento =
  | { ok: true; regla: string; version: number; lineas: LineaPropuesta[]; totalCentavos: number }
  | { ok: false; regla: string; version: number; errores: ErrorMotor[] };

// ---------- utilidades ----------
const esCentavos = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const error = (codigo: ErrorMotor['codigo'], mensaje: string): ErrorMotor => ({ codigo, mensaje });
const fallo = (regla: string, ...errores: ErrorMotor[]): ResultadoAsiento => ({ ok: false, regla, version: REGLAS_VERSION, errores });

/** (a × b) / divisor con mitad hacia arriba; BigInt para que los productos grandes no pierdan precisión. */
export function proporcion(a: number, b: number, divisor: number): number {
  const d = BigInt(divisor);
  return Number((BigInt(a) * BigInt(b) * 2n + d) / (d * 2n));
}

const metodoSinConcepto = (metodo: unknown) =>
  error('METODO_SIN_CONCEPTO', `El método «${String(metodo)}» no tiene un concepto contable asociado`);

/** Validación estructural de una propuesta. Devuelve la lista de errores (vacía si cuadra). Nunca ajusta importes. */
export function validarCuadre(lineas: readonly LineaPropuesta[]): ErrorMotor[] {
  const errores: ErrorMotor[] = [];
  if (!Array.isArray(lineas) || lineas.length < 2) {
    return [error('LINEAS_INSUFICIENTES', 'Un asiento requiere al menos dos líneas')];
  }
  let debe = 0, haber = 0;
  for (const [i, l] of lineas.entries()) {
    if (!esCentavos(l.debeCentavos) || !esCentavos(l.haberCentavos)) {
      errores.push(error('LINEA_INVALIDA', `Línea ${i + 1}: los importes deben ser centavos enteros no negativos`));
      continue;
    }
    if ((l.debeCentavos > 0) === (l.haberCentavos > 0)) {
      errores.push(error('LINEA_INVALIDA', `Línea ${i + 1}: lleva importe en el debe o en el haber, no en ambos ni en ninguno`));
      continue;
    }
    debe += l.debeCentavos;
    haber += l.haberCentavos;
  }
  if (errores.length) return errores;
  if (!Number.isSafeInteger(debe) || !Number.isSafeInteger(haber)) return [error('IMPORTE_INVALIDO', 'El total excede el rango exacto de centavos')];
  if (debe !== haber) errores.push(error('DESCUADRE', `El asiento no cuadra: debe ${debe} ≠ haber ${haber} (centavos)`));
  else if (debe === 0) errores.push(error('MONTO_CERO', 'El asiento no tiene importe'));
  return errores;
}

const debe = (concepto: Concepto, debeCentavos: number, descripcion: string): LineaPropuesta => ({ concepto, debeCentavos, haberCentavos: 0, descripcion });
const haber = (concepto: Concepto, haberCentavos: number, descripcion: string): LineaPropuesta => ({ concepto, debeCentavos: 0, haberCentavos, descripcion });

/** Quita las líneas en cero, valida el cuadre y arma el resultado. */
function construir(regla: string, candidatas: LineaPropuesta[]): ResultadoAsiento {
  const lineas = candidatas.filter((l) => l.debeCentavos !== 0 || l.haberCentavos !== 0);
  const errores = validarCuadre(lineas);
  if (errores.length) return fallo(regla, ...errores);
  return { ok: true, regla, version: REGLAS_VERSION, lineas, totalCentavos: lineas.reduce((s, l) => s + l.debeCentavos, 0) };
}

const importesInvalidos = (regla: string, valores: Record<string, unknown>): ResultadoAsiento | null => {
  const malos = Object.entries(valores).filter(([, v]) => !esCentavos(v)).map(([k]) => k);
  return malos.length ? fallo(regla, error('IMPORTE_INVALIDO', `Importe inválido (centavos enteros no negativos): ${malos.join(', ')}`)) : null;
};

// ---------- ventas ----------
export interface VentaEntrada {
  subtotalCentavos: number;
  descuentoCentavos: number;
  isvCentavos: number;
  totalCentavos: number;
  tipoPago: 'CONTADO' | 'CREDITO';
  /** Método de cobro de una venta de contado: EFECTIVO, TARJETA o TRANSFERENCIA. */
  metodoPago: string;
}
export interface PoliticaVenta { descuento: PoliticaDescuento }

/**
 * Venta de contado o a crédito.
 * Total = subtotal − descuento + ISV (se verifica contra la operación; no se recalcula el ISV).
 * BRUTO: ventas por el subtotal y el descuento en su propio concepto. NETO: ventas por subtotal − descuento.
 */
export function asientoVenta(v: VentaEntrada, politica: PoliticaVenta): ResultadoAsiento {
  const regla = 'venta';
  if (politica?.descuento !== 'BRUTO' && politica?.descuento !== 'NETO') {
    return fallo(regla, error('POLITICA_REQUERIDA', 'Falta la política de descuentos (BRUTO o NETO), pendiente de aprobación del contador'));
  }
  const malo = importesInvalidos(regla, { subtotal: v?.subtotalCentavos, descuento: v?.descuentoCentavos, isv: v?.isvCentavos, total: v?.totalCentavos });
  if (malo) return malo;
  if (v.descuentoCentavos > v.subtotalCentavos || v.subtotalCentavos - v.descuentoCentavos + v.isvCentavos !== v.totalCentavos) {
    return fallo(regla, error('TOTAL_INCONSISTENTE', 'El total no es subtotal − descuento + ISV'));
  }
  let cobro: Concepto;
  if (v.tipoPago === 'CREDITO') cobro = 'CXC_CLIENTES';
  else if (v.tipoPago === 'CONTADO' && esMetodoCobro(v.metodoPago)) cobro = CONCEPTO_DE_METODO[v.metodoPago];
  else return fallo(regla, metodoSinConcepto(v.tipoPago === 'CONTADO' ? v.metodoPago : v.tipoPago));

  const lineas = [debe(cobro, v.totalCentavos, 'Cobro de la venta')];
  if (politica.descuento === 'BRUTO') {
    lineas.push(debe('DESCUENTO_VENTAS', v.descuentoCentavos, 'Descuento concedido'));
    lineas.push(haber('VENTAS', v.subtotalCentavos, 'Ventas'));
  } else {
    lineas.push(haber('VENTAS', v.subtotalCentavos - v.descuentoCentavos, 'Ventas netas de descuento'));
  }
  lineas.push(haber('ISV_POR_PAGAR', v.isvCentavos, 'ISV de la venta'));
  return construir(regla, lineas);
}

export interface LineaCostoEntrada {
  cantidadCentesimas: number;
  /** Costo unitario registrado en la línea de venta (`detalles_venta.costo_unitario`). */
  costoUnitarioCentavos: number;
  sinInventario?: boolean;
}
/** Costo de venta contra inventario. Excluye líneas sin inventario; sin líneas costeables devuelve un resultado sin líneas. */
export function asientoCostoVenta(lineas: readonly LineaCostoEntrada[]): ResultadoAsiento {
  const regla = 'costo_venta';
  let total = 0;
  for (const l of lineas ?? []) {
    if (l.sinInventario) continue;
    if (!esCentavos(l.cantidadCentesimas) || !esCentavos(l.costoUnitarioCentavos)) return fallo(regla, error('IMPORTE_INVALIDO', 'Cantidad o costo inválido'));
    total += proporcion(l.costoUnitarioCentavos, l.cantidadCentesimas, 100);
  }
  if (total === 0) return { ok: true, regla, version: REGLAS_VERSION, lineas: [], totalCentavos: 0 };
  return construir(regla, [debe('COSTO_VENTA', total, 'Costo de la mercadería vendida'), haber('INVENTARIO', total, 'Salida de inventario')]);
}

// ---------- cobros y pagos ----------
export interface PagoEntrada { montoCentavos: number; metodo: string }

/** Cobro de una cuenta por cobrar: entra dinero (según método) y baja la CxC. */
export function asientoCobroCxc(p: PagoEntrada): ResultadoAsiento {
  const regla = 'cobro_cxc';
  const malo = importesInvalidos(regla, { monto: p?.montoCentavos });
  if (malo) return malo;
  if (p.montoCentavos === 0) return fallo(regla, error('MONTO_CERO', 'El cobro no tiene importe'));
  if (!esMetodoCobro(p.metodo)) return fallo(regla, metodoSinConcepto(p.metodo));
  return construir(regla, [debe(CONCEPTO_DE_METODO[p.metodo], p.montoCentavos, 'Cobro recibido'), haber('CXC_CLIENTES', p.montoCentavos, 'Abono a la cuenta del cliente')]);
}

/** Pago de una cuenta por pagar: baja la CxP y sale dinero (según método). */
export function asientoPagoCxp(p: PagoEntrada): ResultadoAsiento {
  const regla = 'pago_cxp';
  const malo = importesInvalidos(regla, { monto: p?.montoCentavos });
  if (malo) return malo;
  if (p.montoCentavos === 0) return fallo(regla, error('MONTO_CERO', 'El pago no tiene importe'));
  if (!esMetodoCobro(p.metodo)) return fallo(regla, metodoSinConcepto(p.metodo));
  return construir(regla, [debe('CXP_PROVEEDORES', p.montoCentavos, 'Pago al proveedor'), haber(CONCEPTO_DE_METODO[p.metodo], p.montoCentavos, 'Salida de fondos')]);
}

// ---------- compras ----------
export interface CompraEntrada { subtotalCentavos: number; isvCentavos: number; totalCentavos: number }
export interface PoliticaCompra { momentoInventario: MomentoInventarioCompra }

/**
 * Factura de compra a proveedor (crédito; si fue de contado, el pago es un asiento aparte).
 * FACTURA: el inventario entra al registrar la factura. RECEPCION: va a «mercadería en tránsito» hasta recibirla.
 */
export function asientoCompra(c: CompraEntrada, politica: PoliticaCompra): ResultadoAsiento {
  const regla = 'compra';
  if (politica?.momentoInventario !== 'FACTURA' && politica?.momentoInventario !== 'RECEPCION') {
    return fallo(regla, error('POLITICA_REQUERIDA', 'Falta el momento de reconocimiento del inventario (FACTURA o RECEPCION), pendiente de aprobación del contador'));
  }
  const malo = importesInvalidos(regla, { subtotal: c?.subtotalCentavos, isv: c?.isvCentavos, total: c?.totalCentavos });
  if (malo) return malo;
  if (c.subtotalCentavos + c.isvCentavos !== c.totalCentavos) return fallo(regla, error('TOTAL_INCONSISTENTE', 'El total no es subtotal + ISV'));
  const mercaderia: Concepto = politica.momentoInventario === 'FACTURA' ? 'INVENTARIO' : 'MERCADERIA_EN_TRANSITO';
  return construir(regla, [
    debe(mercaderia, c.subtotalCentavos, 'Mercadería comprada'),
    debe('ISV_CREDITO_FISCAL', c.isvCentavos, 'ISV de la compra'),
    haber('CXP_PROVEEDORES', c.totalCentavos, 'Cuenta por pagar al proveedor'),
  ]);
}

/** Recepción de mercadería facturada con política RECEPCION: del tránsito al inventario. */
export function asientoRecepcionCompra(valorCentavos: number): ResultadoAsiento {
  const regla = 'recepcion_compra';
  const malo = importesInvalidos(regla, { valor: valorCentavos });
  if (malo) return malo;
  return construir(regla, [debe('INVENTARIO', valorCentavos, 'Mercadería recibida'), haber('MERCADERIA_EN_TRANSITO', valorCentavos, 'Cierre del tránsito')]);
}

// ---------- devoluciones ----------
export interface DevolucionEntrada {
  /** `devoluciones.monto`: parte proporcional del TOTAL de la venta (ISV incluido). */
  montoCentavos: number;
  /** Parte que cancela la cuenta por cobrar. */
  creditoCanceladoCentavos: number;
  /** Parte que se devuelve en dinero. */
  reembolsoCentavos: number;
  metodoReembolso?: string;
  venta: { subtotalCentavos: number; descuentoCentavos: number; isvCentavos: number; totalCentavos: number };
}

/**
 * Devolución de venta. El monto incluye ISV: la parte de ISV es proporcional al ISV de la venta (mitad hacia arriba) y la
 * base es el resto. Con política BRUTO la base se reparte entre devolución por el valor bruto y reverso proporcional del descuento.
 * La regla de reparto es una propuesta pendiente de aprobación del contador.
 */
export function asientoDevolucion(d: DevolucionEntrada, politica: PoliticaVenta): ResultadoAsiento {
  const regla = 'devolucion';
  if (politica?.descuento !== 'BRUTO' && politica?.descuento !== 'NETO') {
    return fallo(regla, error('POLITICA_REQUERIDA', 'Falta la política de descuentos (BRUTO o NETO), pendiente de aprobación del contador'));
  }
  const v = d?.venta;
  const malo = importesInvalidos(regla, {
    monto: d?.montoCentavos, creditoCancelado: d?.creditoCanceladoCentavos, reembolso: d?.reembolsoCentavos,
    ventaSubtotal: v?.subtotalCentavos, ventaDescuento: v?.descuentoCentavos, ventaIsv: v?.isvCentavos, ventaTotal: v?.totalCentavos,
  });
  if (malo) return malo;
  if (d.montoCentavos === 0) return fallo(regla, error('MONTO_CERO', 'La devolución no tiene importe'));
  if (d.creditoCanceladoCentavos + d.reembolsoCentavos !== d.montoCentavos) {
    return fallo(regla, error('DEVOLUCION_INCONSISTENTE', 'Crédito cancelado + reembolso no es igual al monto devuelto'));
  }
  if (v.descuentoCentavos > v.subtotalCentavos || v.subtotalCentavos - v.descuentoCentavos + v.isvCentavos !== v.totalCentavos || v.totalCentavos === 0) {
    return fallo(regla, error('TOTAL_INCONSISTENTE', 'La venta de origen no cumple total = subtotal − descuento + ISV'));
  }
  if (d.montoCentavos > v.totalCentavos) return fallo(regla, error('DEVOLUCION_INCONSISTENTE', 'La devolución supera el total de la venta'));
  if (d.reembolsoCentavos > 0 && !esMetodoCobro(d.metodoReembolso)) return fallo(regla, metodoSinConcepto(d.metodoReembolso));

  const isv = proporcion(d.montoCentavos, v.isvCentavos, v.totalCentavos);
  const base = d.montoCentavos - isv;
  const lineas: LineaPropuesta[] = [];
  if (politica.descuento === 'BRUTO' && v.descuentoCentavos > 0) {
    const neto = v.subtotalCentavos - v.descuentoCentavos;
    if (neto === 0) return fallo(regla, error('TOTAL_INCONSISTENTE', 'La venta de origen tiene el subtotal descontado por completo'));
    const bruto = proporcion(base, v.subtotalCentavos, neto);
    lineas.push(debe('DEVOLUCIONES_VENTAS', bruto, 'Devolución de ventas'));
    lineas.push(haber('DESCUENTO_VENTAS', bruto - base, 'Reverso proporcional del descuento'));
  } else {
    lineas.push(debe('DEVOLUCIONES_VENTAS', base, 'Devolución de ventas'));
  }
  lineas.push(debe('ISV_POR_PAGAR', isv, 'ISV de la devolución'));
  lineas.push(haber('CXC_CLIENTES', d.creditoCanceladoCentavos, 'Crédito cancelado al cliente'));
  if (d.reembolsoCentavos > 0) lineas.push(haber(CONCEPTO_DE_METODO[d.metodoReembolso as keyof typeof CONCEPTO_DE_METODO], d.reembolsoCentavos, 'Reembolso al cliente'));
  return construir(regla, lineas);
}

/** Costo de la mercadería devuelta que vuelve al inventario (destino INVENTARIO): reverso del costo de venta. */
export function asientoCostoDevolucion(lineas: readonly LineaCostoEntrada[]): ResultadoAsiento {
  const costo = asientoCostoVenta(lineas);
  if (!costo.ok || costo.lineas.length === 0) return { ...costo, regla: 'costo_devolucion' };
  const total = costo.totalCentavos;
  return construir('costo_devolucion', [debe('INVENTARIO', total, 'Reingreso de mercadería devuelta'), haber('COSTO_VENTA', total, 'Reverso del costo de venta')]);
}
