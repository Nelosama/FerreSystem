import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { withoutCosts } from '../common/interceptors/cashier-response.interceptor';

// P1 (PR #134): BODEGUERO cuenta productos, pero costos, márgenes y diferencias comerciales con valores son solo de ADMIN.
// Las advertencias se reducen a un conteo; el token de vista previa sigue calculándose en el servidor.
function sinDiferenciasComerciales(value: any): any {
  if (Array.isArray(value)) return value.map(sinDiferenciasComerciales);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const { advertencias, ...resto } = value;
  const limpio: any = Object.fromEntries(Object.entries(resto).map(([clave, valor]) => [clave, sinDiferenciasComerciales(valor)]));
  if (Array.isArray(advertencias)) limpio.diferenciasComerciales = advertencias.length;
  return limpio;
}

@Injectable()
export class LevantamientoResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const rol = context.switchToHttp().getRequest().user?.rol;
    return next.handle().pipe(map(value => (rol === 'ADMIN' ? value : sinDiferenciasComerciales(withoutCosts(value)))));
  }
}
