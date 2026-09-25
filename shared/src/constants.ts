// ============================================================
// FerreSystem — Constantes compartidas
// ============================================================

/** Tasa de ISV en Honduras */
export const ISV_RATE = 0.15;

/** Color primario por defecto del sistema */
export const DEFAULT_PRIMARY_COLOR = '#EA580C';

/** Tamaño máximo de logo en bytes (2MB) */
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

/** Formatos de logo permitidos */
export const ALLOWED_LOGO_FORMATS = ['image/png', 'image/jpeg', 'image/svg+xml'];

/** Días de validez por defecto para cotizaciones */
export const DEFAULT_COTIZACION_VALIDEZ_DIAS = 15;

/** Moneda */
export const CURRENCY_CODE = 'HNL';
export const CURRENCY_SYMBOL = 'L.';
export const CURRENCY_NAME = 'Lempiras';

/**
 * Calcula ISV sobre un subtotal.
 * ISV Honduras = 15%
 */
export function calcularISV(subtotal: number): number {
  return Math.round(subtotal * ISV_RATE * 100) / 100;
}

/**
 * Calcula el total de una venta/cotización.
 */
export function calcularTotal(subtotal: number, descuento: number = 0): {
  isv: number;
  total: number;
} {
  const baseGravable = subtotal - descuento;
  const isv = calcularISV(baseGravable);
  const total = Math.round((baseGravable + isv) * 100) / 100;
  return { isv, total };
}

/**
 * Formatea un número como moneda hondureña.
 * Ej: 42580.00 → "L. 42,580.00"
 */
export function formatLempiras(amount: number): string {
  return `${CURRENCY_SYMBOL} ${amount.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
