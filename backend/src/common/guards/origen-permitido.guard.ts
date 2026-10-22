import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { getAllowedFrontendOrigins } from '../frontend-cors';

/**
 * CSRF de los endpoints que usan la cookie de refresh (login, refresh y logout; H-05).
 * En producción la cookie es SameSite=None, así que un formulario o un fetch desde otro sitio la envía.
 * CORS solo impide leer la respuesta, no que la petición se ejecute: aquí se rechaza antes de tocar la sesión.
 * - `Origin` entre los orígenes del frontend configurados (los mismos de CORS): se acepta.
 * - `Sec-Fetch-Site: same-origin`: el navegador certifica que la página es del mismo origen que la URL pedida
 *   (frontend que llega a la API por un proxy en /api, sin FRONTEND_URL). Ninguna página puede falsificar esta cabecera.
 * - Cualquier otro `Origin`, o `Sec-Fetch-Site` cross-site/same-site sin un origen autorizado: 403.
 * - Sin `Origin` ni `Sec-Fetch-Site`: clientes sin navegador (curl, monitores, pruebas) siguen funcionando.
 */
@Injectable()
export class OrigenPermitidoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.headers.origin;
    const sitio = req.headers['sec-fetch-site'];
    if (typeof origin === 'string' && origin && getAllowedFrontendOrigins(process.env).includes(origin)) return true;
    if (sitio === 'same-origin') return true;
    if ((typeof origin === 'string' && origin) || sitio === 'cross-site' || sitio === 'same-site') {
      throw new ForbiddenException('Origen no autorizado');
    }
    return true;
  }
}
