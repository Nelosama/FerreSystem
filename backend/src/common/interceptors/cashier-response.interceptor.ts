import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

/** Campos de costo y margen que nunca se envían a roles distintos de ADMIN. */
export const COSTO_KEYS = ['precioCosto', 'precio_costo', 'costoUnitario', 'costo_unitario', 'costo', 'costos', 'margen', 'margenCalculado',
  'ultimaCompraAt', 'costoVigente', 'costo_vigente', 'costoCentavos'];

// Apply at the HTTP boundary, including nested products returned by POS and quotes.
export function withoutCosts(value: any): any {
  if (Array.isArray(value)) return value.map(withoutCosts);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value)
    // Lista explícita más cualquier clave de costo o margen, con o sin formato (p. ej. ultimo_costo).
    .filter(([key]) => !COSTO_KEYS.includes(key) && !/costo|margen/i.test(key))
    .map(([key, item]) => [key, withoutCosts(item)]));
}

@Injectable()
export class CashierResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    // Todo usuario del tenant que no sea ADMIN (cajero, vendedor, bodeguero) recibe respuestas sin costos ni márgenes.
    const user = context.switchToHttp().getRequest().user;
    const ocultar = user?.type === 'tenant' && user?.rol !== 'ADMIN';
    return next.handle().pipe(map(value => ocultar ? withoutCosts(value) : value));
  }
}
