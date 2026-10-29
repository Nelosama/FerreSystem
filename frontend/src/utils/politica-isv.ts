import { TASA_ISV_PORCIENTO } from '../offline/money';

// Espejo de backend/src/common/politica-isv.ts: el servidor rechaza cualquier otra tasa. Añadir una requiere aprobación del contador.
export const TASAS_ISV_AUTORIZADAS: readonly number[] = Object.freeze([TASA_ISV_PORCIENTO]);

export const esTasaIsvAutorizada = (tasa: number) => TASAS_ISV_AUTORIZADAS.some((t) => Math.round(t * 100) === Math.round(tasa * 100));
