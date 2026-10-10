/**
 * Aritmética de fechas de calendario (YYYY-MM-DD) para fechas de negocio.
 *
 * Las fechas de negocio se guardan como día calendario de la zona del negocio
 * (ver `diaCalendarioEnZona` en format.ts). Sumar días o meses sobre ese día debe
 * hacerse en aritmética de calendario, no sobre instantes con `Date` local, para que
 * el resultado no dependa de la zona horaria del navegador ni del servidor.
 */

const parseDia = (dia: string): [number, number, number] => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) throw new Error(`Fecha de calendario inválida: ${dia}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const aDia = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Suma días a un día calendario YYYY-MM-DD. Ej: ('2026-10-09', 30) -> '2026-11-08'. */
export function sumarDiasCalendario(dia: string, dias: number): string {
  const [y, m, d] = parseDia(dia);
  return aDia(Date.UTC(y, m - 1, d + dias));
}

/**
 * Suma meses a un día calendario YYYY-MM-DD. Mantiene el comportamiento de
 * `Date.prototype.setMonth` (si el día no existe en el mes destino, desborda al
 * siguiente). Ej: ('2026-10-09', 12) -> '2027-10-09'.
 */
export function sumarMesesCalendario(dia: string, meses: number): string {
  const [y, m, d] = parseDia(dia);
  return aDia(Date.UTC(y, m - 1 + meses, d));
}
