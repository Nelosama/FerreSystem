/**
 * Zona horaria de referencia del negocio cuando la empresa no define otra.
 * Solo es un valor por defecto: los reportes reciben la zona como parámetro para
 * permitir configuración por empresa. Las marcas de tiempo se almacenan en UTC.
 */
export const ZONA_HORARIA_NEGOCIO = 'America/Tegucigalpa';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Diferencia en milisegundos entre la hora de pared de la zona y UTC en ese instante. */
function desfaseMs(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instante);
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Día calendario (YYYY-MM-DD) que corresponde a un instante en la zona indicada. */
export function diaCalendario(instante: Date, zona = ZONA_HORARIA_NEGOCIO): string {
  const local = new Date(instante.getTime() + desfaseMs(instante, zona));
  return local.toISOString().slice(0, 10);
}

/** Suma días a una fecha calendario YYYY-MM-DD (aritmética de calendario, sin zona). */
export function sumarDias(dia: string, dias: number): string {
  return new Date(Date.parse(`${dia}T00:00:00.000Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Instante UTC de las 00:00 de un día calendario en la zona indicada (considera horario de verano). */
export function inicioDiaEnZona(dia: string, zona = ZONA_HORARIA_NEGOCIO): Date {
  const comoUtc = Date.parse(`${dia}T00:00:00.000Z`);
  const primero = comoUtc - desfaseMs(new Date(comoUtc), zona);
  return new Date(comoUtc - desfaseMs(new Date(primero), zona));
}

/**
 * Rango semiabierto [inicio, fin) que cubre los días desde..hasta (inclusive) en la zona indicada.
 * Usar con `created_at >= inicio AND created_at < fin`.
 */
export function rangoDiasEnZona(desde: string, hasta: string, zona = ZONA_HORARIA_NEGOCIO): { inicio: Date; fin: Date } {
  return { inicio: inicioDiaEnZona(desde, zona), fin: inicioDiaEnZona(sumarDias(hasta, 1), zona) };
}
