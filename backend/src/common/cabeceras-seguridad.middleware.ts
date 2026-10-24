import type { Request, Response, NextFunction } from 'express';
import { esProduccion } from './entorno';

/**
 * Cabeceras de seguridad de la API (sin dependencias). La API solo devuelve JSON e imágenes privadas a fetch/XHR:
 * nunca HTML para mostrar, así que no debe interpretarse, incrustarse ni ejecutar nada si se abre directamente.
 * HSTS solo en producción, donde Render sirve HTTPS; en local se sigue usando HTTP.
 */
export function crearCabecerasSeguridad(produccion = esProduccion(process.env.NODE_ENV)) {
  return function cabecerasSeguridad(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (produccion) res.setHeader('Strict-Transport-Security', 'max-age=63072000');
    next();
  };
}
