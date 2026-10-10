import { sumarDiasCalendario } from './fechasNegocio';

/**
 * Límite técnico de días por garantía (10 años). Coincide con la validación del backend
 * y con el CHECK de la base. No es una regla comercial.
 */
export const DIAS_GARANTIA_MAX = 3650;

/**
 * Interpreta el campo «Días de garantía»: entero entre 1 y DIAS_GARANTIA_MAX.
 * Rechaza decimales, signos, notación científica y texto. Devuelve null si no es válido.
 */
export function validarDiasGarantia(valor: string): number | null {
  const limpio = valor.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const dias = Number(limpio);
  if (dias < 1 || dias > DIAS_GARANTIA_MAX) return null;
  return dias;
}

/**
 * Vista previa del vencimiento: fecha de la factura (YYYY-MM-DD) más días calendario.
 * El servidor calcula el valor guardado; esta función solo previsualiza.
 */
export function vencimientoGarantia(fechaFactura: string, dias: number): string {
  return sumarDiasCalendario(fechaFactura, dias);
}

/**
 * Identificador de solicitud UUID v4 para reintentos seguros. Usa crypto.getRandomValues,
 * que existe también en HTTP sin contexto seguro (donde crypto.randomUUID no está disponible).
 */
export function generarSolicitudId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
