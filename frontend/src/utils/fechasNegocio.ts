/**
 * Aritmética y formato de fechas de calendario (YYYY-MM-DD) para fechas de negocio.
 *
 * Las fechas de negocio se guardan como día calendario de la zona del negocio
 * (ver `diaCalendarioEnZona` en format.ts). Sumar días o meses y mostrar la fecha
 * deben hacerse sobre el día de calendario, no sobre instantes con `Date` local,
 * para que el resultado no dependa de la zona horaria del navegador ni del servidor.
 */

const parseDia = (dia: string): [number, number, number] => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) throw new Error(`Fecha de calendario inválida: ${dia}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const pad = (n: number) => String(n).padStart(2, '0');

const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

/** Suma días a un día calendario YYYY-MM-DD. Ej: ('2026-10-09', 30) -> '2026-11-08'. */
export function sumarDiasCalendario(dia: string, dias: number): string {
  const [y, m, d] = parseDia(dia);
  const fecha = new Date(Date.UTC(y, m - 1, d + dias));
  return `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())}`;
}

/**
 * Suma meses a un día calendario YYYY-MM-DD con regla de último día válido: si el día
 * no existe en el mes destino, se usa el último día de ese mes.
 * Ej: ('2026-01-31', 1) -> '2026-02-28'; ('2028-01-31', 1) -> '2028-02-29';
 *     ('2026-11-30', 3) -> '2027-02-28'; ('2026-10-09', 12) -> '2027-10-09'.
 *
 * SUPUESTO TÉCNICO: los requisitos no fijan esta regla para garantías. Requiere
 * validación del responsable funcional antes de usarla en producción.
 */
export function sumarMesesCalendario(dia: string, meses: number): string {
  const [y, m, d] = parseDia(dia);
  const total = m - 1 + meses;
  const anio = y + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  return `${anio}-${pad(mes + 1)}-${pad(Math.min(d, diasDelMes(anio, mes + 1)))}`;
}

/**
 * Muestra un día calendario YYYY-MM-DD en español de Honduras o en inglés, p. ej.
 * ('2026-10-09', 'es') -> "9 oct 2026"; ('2026-10-09', 'en') -> "Oct 9, 2026".
 * Formatea con UTC sobre el propio día: nunca desplaza la fecha por zona horaria.
 * Devuelve '—' si la entrada no es un día de calendario real.
 */
export function formatearFechaNegocio(dia: string | null | undefined, locale: string = 'es'): string {
  if (!dia) return '—';
  let y: number, m: number, d: number;
  try {
    [y, m, d] = parseDia(dia);
  } catch {
    return '—';
  }
  const fecha = new Date(Date.UTC(y, m - 1, d));
  if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return '—';
  const idioma = locale === 'en' ? 'en-US' : 'es-HN';
  return new Intl.DateTimeFormat(idioma, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(fecha);
}
