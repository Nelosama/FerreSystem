// Utilidades puras de la pantalla de Contabilidad. Los cálculos fiscales los hace el servidor; aquí solo se
// presenta lo que devuelve y se arma lo que se envía.

export type Pestana = 'resumen' | 'ventas' | 'compras' | 'documentos' | 'retenciones' | 'configuracion' | 'periodos' | 'partida' | 'ajustes'
  | 'asientos' | 'catalogo' | 'balanza' | 'mayor' | 'excel';
export const PESTANAS: Pestana[] = ['resumen', 'ventas', 'compras', 'documentos', 'retenciones', 'configuracion', 'periodos', 'partida', 'ajustes'];

/** Mes anterior al día dado (AAAA-MM-DD): es el período que normalmente se revisa y declara. */
export function periodoAnterior(hoy: string): { anio: number; mes: number } {
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7));
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

export const consultaPeriodo = (p: { anio: number; mes: number }) => `anio=${p.anio}&mes=${p.mes}`;

/** Clave de traducción de un hallazgo; los desconocidos se muestran con su código. */
export const CODIGOS_HALLAZGO = [
  'SIN_DOCUMENTO_FISCAL', 'SIN_OPERACION', 'SIN_CAI', 'CAI_VENCIDO', 'FUERA_DE_RANGO', 'CAI_TIPO_DISTINTO', 'CAI_PUNTO_DISTINTO',
  'ISV_GENERAL_INCORRECTO', 'ISV_ESPECIAL_INCORRECTO', 'SIN_TASA_GENERAL', 'SIN_TASA_ESPECIAL', 'TOTAL_DISTINTO', 'BASE_DISTINTA', 'ISV_DISTINTO',
  'VENTA_ANULADA_CON_DOCUMENTO_VIGENTE', 'COMPRA_CANCELADA_CON_DOCUMENTO_VIGENTE', 'FECHA_DISTINTA_A_VENTA', 'RTN_DISTINTO_A_VENTA', 'RTN_INVALIDO',
  'SIN_RTN_PROVEEDOR', 'SIN_DOCUMENTO_REFERENCIA', 'DEVOLUCION_SIN_NOTA_CREDITO', 'SALTO_CORRELATIVO', 'SIN_RTN_EMPRESA',
  'SIN_TASA_GENERAL_VIGENTE', 'LIBRO_CAMBIO_TRAS_CIERRE',
] as const;

export function etiquetaHallazgo(codigo: string, t: (k: string) => string): string {
  const clave = `accounting.finding.${codigo}`;
  const texto = (CODIGOS_HALLAZGO as readonly string[]).includes(codigo) ? t(clave) : '';
  return texto && texto !== clave ? texto : codigo;
}

/** Número fiscal NNN-NNN-NN-NNNNNNNN; el tipo (3.er grupo) debe coincidir con el tipo elegido. */
export function numeroFiscalValido(numero: string, tipo: string): boolean {
  const m = /^(\d{3})-(\d{3})-(\d{2})-(\d{8})$/.exec(numero.trim());
  return !!m && m[3] === tipo && Number(m[4]) >= 1;
}

/** Importe opcional del formulario: vacío = no enviado (el servidor lo toma de la operación si corresponde). */
export function importeOpcional(valor: string): number | undefined {
  if (!valor.trim()) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

/** Nombre de archivo que propone el servidor en Content-Disposition, con respaldo local. */
export function nombreArchivo(cabecera: string | undefined, respaldo: string): string {
  const m = /filename="([^"]+)"/.exec(cabecera ?? '');
  return m ? m[1] : respaldo;
}

/** Líneas de asiento listas para el servidor (solo las que tienen cuenta e importe) y si cuadran. */
export function prepararAsiento(lineas: { cuentaId: string; debe: string; haber: string }[]) {
  const validas = lineas.filter(l => l.cuentaId && (Number(l.debe) > 0 || Number(l.haber) > 0))
    .map(l => ({ cuentaId: l.cuentaId, ...(Number(l.debe) > 0 ? { debe: Number(l.debe) } : {}), ...(Number(l.haber) > 0 ? { haber: Number(l.haber) } : {}) }));
  const centavos = (v: number | undefined) => Math.round((v ?? 0) * 100);
  const debe = validas.reduce((s, l) => s + centavos(l.debe), 0);
  const haber = validas.reduce((s, l) => s + centavos(l.haber), 0);
  return { lineas: validas, debe: debe / 100, haber: haber / 100, cuadra: validas.length >= 2 && debe === haber && debe > 0 && validas.every(l => !(l.debe && l.haber)) };
}

/** Mensaje de error del servidor (incluye la lista de hallazgos cuando el documento no cumple las reglas). */
export function mensajeError(err: any, t: (k: string) => string, respaldo: string): string {
  const data = err?.response?.data;
  const base = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
  const hallazgos = Array.isArray(data?.hallazgos) ? `: ${data.hallazgos.map((h: string) => etiquetaHallazgo(h, t)).join('; ')}` : '';
  if (!err?.response) return t('accounting.network_error');
  return `${base || respaldo}${hallazgos}`;
}

export type FormatoDescarga = 'xlsx' | 'csv' | 'pdf';

/**
 * Nombre del archivo descargado. Lo calcula el cliente con el mismo criterio que el servidor: así no depende de que
 * el navegador pueda leer la cabecera Content-Disposition (no siempre está expuesta entre orígenes).
 */
export function nombreExportacion(reporte: string, anio: number, mes: number, formato: FormatoDescarga): string {
  const base = reporte === 'mensual' ? 'libro-contable' : reporte;
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  return reporte === 'catalogo' || reporte === 'periodos' ? `${base}-${anio}.${formato}` : `${base}-${periodo}.${formato}`;
}

/** Los errores de una descarga llegan como blob: se leen como JSON para mostrar el mensaje del servidor. */
export async function mensajeErrorDescarga(err: any, t: (k: string) => string, respaldo: string): Promise<string> {
  const data = err?.response?.data;
  if (typeof data?.text === 'function') {
    try {
      const json = JSON.parse(await data.text());
      const base = Array.isArray(json?.message) ? json.message.join(', ') : json?.message;
      return base || respaldo;
    } catch { return respaldo; }
  }
  return mensajeError(err, t, respaldo);
}
