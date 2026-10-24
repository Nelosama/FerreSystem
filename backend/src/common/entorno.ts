/**
 * Único criterio de producción para cookies, cabeceras y arranque. Normaliza NODE_ENV igual que jwt-secret y auth-config:
 * "Production" o " production " (al pegarlo en Render) cuentan como producción, no como un entorno local sin Secure.
 */
export function esProduccion(valor: unknown): boolean {
  return String(valor ?? '').trim().toLowerCase() === 'production';
}
