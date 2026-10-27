import { BadRequestException } from '@nestjs/common';
import { aCentavos } from '../common/redondeo-monetario';

/**
 * Reglas fiscales de Honduras usadas por Contabilidad (fase 1). Funciones puras: sin base de datos.
 *
 * Fuentes (ver docs/CONTABILIDAD_HONDURAS.md):
 * - Formato del correlativo NNN-NNN-NN-NNNNNNNN (establecimiento, punto de emisión, tipo, correlativo) y
 *   datos de CAI (rango autorizado y fecha límite de emisión): Acuerdo 481-2017, art. 10, y reformas
 *   (Acuerdos 609-2017, 725-2018, 817-2018).
 * - Tabla de tipos de documento: la vigente tras el Acuerdo 609-2017.
 * - RTN de 14 dígitos. No se aplica dígito verificador: no hay algoritmo oficial publicado.
 *
 * Ninguna tasa ni porcentaje de retención está fijado aquí: llegan de la configuración de cada empresa,
 * que exige su base legal y su vigencia.
 */

export const TIPOS_DOCUMENTO: Record<string, string> = {
  '01': 'Factura',
  '04': 'Recibo por honorarios profesionales',
  '05': 'Comprobante de retención',
  '06': 'Nota de crédito',
  '07': 'Nota de débito',
  '09': 'Ticket',
  '10': 'Factura prevalorada',
  '11': 'Boleta de compra',
  '12': 'Constancia de donación',
};
/** Tipos que modifican el importe de otro documento y deben referenciarlo. */
export const TIPOS_CON_REFERENCIA = new Set(['06', '07']);

const RE_NUMERO = /^(\d{3})-(\d{3})-(\d{2})-(\d{8})$/;

export function normalizarRtn(valor: unknown, etiqueta = 'RTN'): string {
  if (typeof valor !== 'string') throw new BadRequestException(`${etiqueta}: valor requerido`);
  // Se aceptan separadores visuales (espacios o guiones); el valor guardado son solo los 14 dígitos.
  const limpio = valor.trim().replace(/[\s-]/g, '');
  if (!/^\d{14}$/.test(limpio)) throw new BadRequestException(`${etiqueta}: debe tener 14 dígitos`);
  return limpio;
}

export interface NumeroDocumento { establecimiento: string; puntoEmision: string; tipoDocumento: string; correlativo: number }

export function analizarNumero(numero: unknown): NumeroDocumento {
  const m = typeof numero === 'string' ? RE_NUMERO.exec(numero.trim()) : null;
  if (!m) throw new BadRequestException('Número de documento: use el formato 000-001-01-00000001');
  const correlativo = Number(m[4]);
  if (correlativo < 1) throw new BadRequestException('Número de documento: el correlativo inicia en 00000001');
  return { establecimiento: m[1], puntoEmision: m[2], tipoDocumento: m[3], correlativo };
}

export function tipoDocumentoValido(tipo: unknown): string {
  if (typeof tipo !== 'string' || !TIPOS_DOCUMENTO[tipo]) throw new BadRequestException('Tipo de documento fiscal no admitido');
  return tipo;
}

export function normalizarCai(valor: unknown): string {
  // El reglamento lo define como serie alfanumérica sin longitud publicada: solo se normaliza y se acota.
  const cai = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  if (!/^[A-Z0-9-]{6,60}$/.test(cai)) throw new BadRequestException('CAI: use solo letras, números y guiones (6 a 60)');
  return cai;
}

export interface AutorizacionCai {
  cai: string; tipoDocumento: string; establecimiento: string; puntoEmision: string;
  rangoInicial: number; rangoFinal: number; fechaLimiteEmision: string; activo?: boolean;
}

/** Hallazgos de un documento emitido frente a su CAI. Lista vacía = el documento cumple. */
export function validarContraCai(numero: string, fechaEmision: string, cai: AutorizacionCai | null): string[] {
  if (!cai) return ['SIN_CAI'];
  const n = analizarNumero(numero);
  const hallazgos: string[] = [];
  if (n.tipoDocumento !== cai.tipoDocumento) hallazgos.push('CAI_TIPO_DISTINTO');
  if (n.establecimiento !== cai.establecimiento || n.puntoEmision !== cai.puntoEmision) hallazgos.push('CAI_PUNTO_DISTINTO');
  if (n.correlativo < cai.rangoInicial || n.correlativo > cai.rangoFinal) hallazgos.push('FUERA_DE_RANGO');
  if (fechaEmision > cai.fechaLimiteEmision) hallazgos.push('CAI_VENCIDO');
  return hallazgos;
}

export interface Vigencia { vigenteDesde: string; vigenteHasta: string | null }
export const vigenteEn = (v: Vigencia, fecha: string) => v.vigenteDesde <= fecha && (v.vigenteHasta === null || fecha <= v.vigenteHasta);
export const seSolapan = (a: Vigencia, b: Vigencia) =>
  a.vigenteDesde <= (b.vigenteHasta ?? '9999-12-31') && b.vigenteDesde <= (a.vigenteHasta ?? '9999-12-31');

/** Única tasa vigente de una categoría en la fecha (las vigencias no se solapan por diseño). */
export function tasaVigente<T extends Vigencia & { categoria: string }>(tasas: T[], categoria: string, fecha: string): T | null {
  return tasas.find(t => t.categoria === categoria && vigenteEn(t, fecha)) ?? null;
}

/** Porcentaje (hasta dos decimales) aplicado a un importe en centavos, mitad hacia arriba. */
export function aplicarPorcentaje(baseCentavos: number, porcentaje: number): number {
  const centesimas = aCentavos(porcentaje, 'Porcentaje');
  if (!Number.isSafeInteger(baseCentavos) || baseCentavos < 0 || centesimas < 0) throw new BadRequestException('Importe o porcentaje inválido');
  // El producto de dos enteros seguros puede exceder la precisión de Number aun con DECIMAL(14,2).
  const resultado = Number((BigInt(baseCentavos) * BigInt(centesimas) * 2n + 10000n) / 20000n);
  if (!Number.isSafeInteger(resultado)) throw new BadRequestException('Importe fuera de rango');
  return resultado;
}

export interface ImportesDocumento {
  importeExento: number; importeExonerado: number; importeGravadoGeneral: number; importeGravadoEspecial: number;
  isvGeneral: number; isvEspecial: number;
}
export const CAMPOS_IMPORTE: (keyof ImportesDocumento)[] = ['importeExento', 'importeExonerado', 'importeGravadoGeneral', 'importeGravadoEspecial', 'isvGeneral', 'isvEspecial'];
/** Capacidad real de las columnas monetarias contables DECIMAL(14,2), no un límite fiscal. */
export const MAX_IMPORTE_CONTABLE = 999999999999.99;
export const MAX_CENTAVOS_CONTABLES = 99999999999999;

/** Total en centavos del documento: suma exacta de sus importes. */
export function totalDocumentoCentavos(d: ImportesDocumento): number {
  const total = CAMPOS_IMPORTE.reduce((suma, campo) => suma + aCentavos(Number(d[campo]), campo), 0);
  if (!Number.isSafeInteger(total) || total > MAX_CENTAVOS_CONTABLES) throw new BadRequestException('Total del documento fuera de rango');
  return total;
}

/**
 * Comprueba el ISV declarado en el documento contra la tasa vigente de la empresa. Tolerancia: 1 centavo por
 * redondeo del emisor. Sin tasa configurada para una base gravada se informa, nunca se supone un porcentaje.
 */
export function verificarIsv(d: ImportesDocumento, tasaGeneral: number | null, tasaEspecial: number | null): string[] {
  const hallazgos: string[] = [];
  const revisar = (base: number, isv: number, tasa: number | null, sufijo: string) => {
    const b = aCentavos(Number(base)), i = aCentavos(Number(isv));
    if (b === 0 && i === 0) return;
    if (tasa === null) { hallazgos.push(`SIN_TASA_${sufijo}`); return; }
    if (Math.abs(aplicarPorcentaje(b, tasa) - i) > 1) hallazgos.push(`ISV_${sufijo}_INCORRECTO`);
  };
  revisar(d.importeGravadoGeneral, d.isvGeneral, tasaGeneral, 'GENERAL');
  revisar(d.importeGravadoEspecial, d.isvEspecial, tasaEspecial, 'ESPECIAL');
  return hallazgos;
}

export type BaseRetencion = 'IMPUESTO' | 'BASE_GRAVABLE' | 'TOTAL';

/** Base y monto (centavos) de una retención según la regla configurada. */
export function calcularRetencion(d: ImportesDocumento & { total: number }, baseCalculo: BaseRetencion, porcentaje: number) {
  const c = (v: number) => aCentavos(Number(v));
  const base = baseCalculo === 'IMPUESTO' ? c(d.isvGeneral) + c(d.isvEspecial)
    : baseCalculo === 'BASE_GRAVABLE' ? c(d.importeGravadoGeneral) + c(d.importeGravadoEspecial)
      : c(d.total);
  if (base <= 0) throw new BadRequestException('El documento no tiene base para esta retención');
  const monto = aplicarPorcentaje(base, porcentaje);
  if (monto <= 0) throw new BadRequestException('La retención resulta en cero');
  return { baseCentavos: base, montoCentavos: monto };
}

/** Importes de una venta tal como los guarda el POS (ISV sobre subtotal − descuento). */
export interface VentaFiscal { subtotal: number; descuento: number; isv: number; total: number }

/** Origen de una venta convertida desde cotización: tasa aplicada y líneas (subtotal tras su descuento) exentas o gravadas. */
export interface OrigenCotizacion { porcentajeIsv: number; lineas: { subtotal: number; exento: boolean }[] }

/**
 * Importes fiscales de una venta. La venta directa del POS siempre grava todo al 15 %; una venta convertida desde
 * cotización (solo ADMIN) puede llevar líneas exentas o una tasa distinta, que la venta no guarda desglosadas. La parte
 * exenta se reconstruye de las líneas de la cotización, prorrateando el descuento general como lo hace la cotización
 * (centavos enteros, mitad hacia arriba). Si la tasa aplicada no es la tasa general configurada, no se adivina la
 * categoría: el desglose debe registrarse a mano.
 */
export function importesDeVenta(v: VentaFiscal, origen: OrigenCotizacion | null, tasaGeneral: number | null): ImportesDocumento {
  const cv = (x: number) => aCentavos(Number(x));
  const base = cv(v.subtotal) - cv(v.descuento), isv = cv(v.isv);
  const lineas = origen?.lineas ?? [];
  const exentas = lineas.filter(l => l.exento).reduce((s, l) => s + cv(l.subtotal), 0);
  const brutoLineas = lineas.reduce((s, l) => s + cv(l.subtotal), 0);
  const exento = exentas > 0 && brutoLineas > 0 ? Number((BigInt(exentas) * BigInt(base) * 2n + BigInt(brutoLineas)) / (BigInt(brutoLineas) * 2n)) : 0;
  const gravado = base - exento;
  if (origen && gravado > 0 && tasaGeneral !== null && cv(origen.porcentajeIsv) !== cv(tasaGeneral)) {
    throw new BadRequestException(`La venta se facturó con ISV de ${Number(origen.porcentajeIsv).toFixed(2)} % y la tasa general configurada es ${Number(tasaGeneral).toFixed(2)} %: registre el desglose del documento manualmente`);
  }
  return { importeExento: exento / 100, importeExonerado: 0, importeGravadoGeneral: gravado / 100, importeGravadoEspecial: 0, isvGeneral: isv / 100, isvEspecial: 0 };
}

/**
 * Diferencias entre un documento emitido y la venta real que respalda. Las ventas del POS no registran
 * importes exentos ni con tasa especial: todo lo que el documento declare así es una diferencia a revisar.
 */
export function conciliarConVenta(d: ImportesDocumento & { total: number }, v: VentaFiscal): string[] {
  const c = (x: number) => aCentavos(Number(x));
  const hallazgos: string[] = [];
  const baseVenta = c(v.subtotal) - c(v.descuento);
  const gravado = c(d.importeGravadoGeneral) + c(d.importeGravadoEspecial) + c(d.importeExento) + c(d.importeExonerado);
  if (c(d.total) !== c(v.total)) hallazgos.push('TOTAL_DISTINTO');
  if (gravado !== baseVenta) hallazgos.push('BASE_DISTINTA');
  if (c(d.isvGeneral) + c(d.isvEspecial) !== c(v.isv)) hallazgos.push('ISV_DISTINTO');
  return hallazgos;
}

/** Diferencias entre un documento recibido y la compra registrada (subtotal, ISV y total del proveedor). */
export function conciliarConCompra(d: ImportesDocumento & { total: number }, o: { subtotal: number; isv: number; total: number }): string[] {
  const c = (x: number) => aCentavos(Number(x));
  const hallazgos: string[] = [];
  const base = c(d.importeGravadoGeneral) + c(d.importeGravadoEspecial) + c(d.importeExento) + c(d.importeExonerado);
  if (c(d.total) !== c(o.total)) hallazgos.push('TOTAL_DISTINTO');
  if (base !== c(o.subtotal)) hallazgos.push('BASE_DISTINTA');
  if (c(d.isvGeneral) + c(d.isvEspecial) !== c(o.isv)) hallazgos.push('ISV_DISTINTO');
  return hallazgos;
}

export function periodoValido(anio: unknown, mes: unknown): { anio: number; mes: number } {
  const a = Number(anio), m = Number(mes);
  if (!Number.isInteger(a) || a < 2000 || a > 2100 || !Number.isInteger(m) || m < 1 || m > 12) throw new BadRequestException('Período inválido');
  return { anio: a, mes: m };
}
export const periodoDeFecha = (fecha: string) => ({ anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) });
export function limitesPeriodo(anio: number, mes: number) {
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde, hasta: `${anio}-${String(mes).padStart(2, '0')}-${String(fin).padStart(2, '0')}` };
}
export function fechaValida(valor: unknown, etiqueta = 'Fecha'): string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new BadRequestException(`${etiqueta}: use AAAA-MM-DD`);
  const d = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) throw new BadRequestException(`${etiqueta}: fecha inexistente`);
  const anio = Number(valor.slice(0, 4));
  if (anio < 2000 || anio > 2100) throw new BadRequestException(`${etiqueta}: fuera de rango`);
  return valor;
}
export const centavosAImporte = (centavos: number) => (centavos / 100).toFixed(2);
