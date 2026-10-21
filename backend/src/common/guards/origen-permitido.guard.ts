import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { getAllowedFrontendOrigins } from '../frontend-cors';

/**
 * CSRF de los endpoints que usan la cookie de refresh (login, refresh y logout; H-05).
 * En producción la cookie es SameSite=None, así que un formulario o un fetch desde otro sitio la envía.
 * CORS solo impide leer la respuesta, no que la petición se ejecute: aquí se rechaza antes de tocar la sesión.
 * - Con `Origin`: debe ser uno de los orígenes del frontend configurados (los mismos de CORS).
 * - Sin `Origin`: se rechaza si el navegador declara `Sec-Fetch-Site: cross-site`. Clientes sin navegador
 *   (curl, monitores, pruebas) no envían ninguno de los dos y siguen funcionando.
 */
@Injectable()
export class OrigenPermitidoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin) {
      if (!getAllowedFrontendOrigins(process.env).includes(origin)) throw new ForbiddenException('Origen no autorizado');
      return true;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException('Origen no autorizado');
    return true;
  }
}
