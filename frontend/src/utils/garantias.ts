import { sumarDiasCalendario } from './fechasNegocio';

/**
 * Límite técnico de días por garantía (10 años). No es una regla comercial: evita
 * valores absurdos al escribir. Cambiarlo requiere revisión funcional.
 */
export const DIAS_GARANTIA_MAX = 3650;

/**
 * Interpreta el campo «Días de garantía»: entero positivo entre 1 y DIAS_GARANTIA_MAX.
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
 * Vencimiento de una garantía: fecha de venta más días calendario.
 * Ej: ('2026-10-09', 30) -> '2026-11-08'; ('2026-12-31', 1) -> '2027-01-01'.
 * Trabaja sobre el día de negocio (YYYY-MM-DD), nunca sobre instantes.
 */
export function vencimientoGarantia(fechaVenta: string, dias: number): string {
  return sumarDiasCalendario(fechaVenta, dias);
}

/** Campos de vigencia de un registro guardado. Los registros anteriores solo tienen meses. */
export interface VigenciaRegistro {
  diasGarantia?: number;
  mesesGarantia?: number;
}

/**
 * Vigencia tal como fue registrada. Un registro anterior con `mesesGarantia` se devuelve como
 * meses: NO se convierte a días (un mes no equivale a 30 días).
 */
export function vigenciaDeRegistro(
  registro: VigenciaRegistro,
): { tipo: 'dias'; valor: number } | { tipo: 'meses'; valor: number } | null {
  if (typeof registro.diasGarantia === 'number') return { tipo: 'dias', valor: registro.diasGarantia };
  if (typeof registro.mesesGarantia === 'number') return { tipo: 'meses', valor: registro.mesesGarantia };
  return null;
}
