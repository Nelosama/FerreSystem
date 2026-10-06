import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

// Apply at the HTTP boundary, including nested products returned by POS and quotes.
export function withoutCosts(value: any): any {
  if (Array.isArray(value)) return value.map(withoutCosts);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['precioCosto', 'precio_costo', 'costoUnitario', 'costo_unitario', 'costo', 'costos', 'margen', 'ultimaCompraAt'].includes(key))
    .map(([key, item]) => [key, withoutCosts(item)]));
}

@Injectable()
export class CashierResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const isCashier = context.switchToHttp().getRequest().user?.rol === 'CAJERO';
    return next.handle().pipe(map(value => isCashier ? withoutCosts(value) : value));
  }
}
