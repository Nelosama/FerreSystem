/**
 * Formatea un número como moneda Lempiras (HNL) con separador de miles (,) y decimales (.).
 * Ej: 21275 -> "L. 21,275.00"
 */
export function formatLempiras(amount: number): string {
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `L. ${formatted}`;
}

/**
 * Formatea solo el número con separador de miles y 2 decimales.
 * Ej: 21275 -> "21,275.00"
 */
export function formatNumber(amount: number): string {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea una fecha de calendario (sin hora, p. ej. un vencimiento) tal como fue
 * capturada. Las fechas llegan como medianoche UTC; convertirlas a la zona local
 * las mostraría un día antes en America/Tegucigalpa (UTC-6).
 * Ej: "2026-10-09T00:00:00.000Z" -> "09/10/2026"
 */
export function formatFechaCalendario(value?: string | Date | null): string {
  if (!value) return '—';
  if (value instanceof Date && Number.isNaN(value.getTime())) return '—';
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?=$|T|\s)/.exec(iso);
  if (!m) return '—';
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Rechaza fechas imposibles (p. ej. 2026-99-99 o 2026-02-30) comparando contra el calendario real.
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}
