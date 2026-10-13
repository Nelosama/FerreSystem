import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { canReadProductFinancials } from '../../productos/producto-response';

// Apply at the HTTP boundary, including nested products returned by POS and quotes.
export function withoutCosts(value: any): any {
  if (Array.isArray(value)) return value.map(withoutCosts);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['precioCosto', 'precio_costo', 'costoUnitario', 'costo_unitario', 'costo', 'costos', 'costoVigente', 'costo_vigente', 'margen', 'ultimaCompraAt'].includes(key))
    .map(([key, item]) => [key, withoutCosts(item)]));
}

// Same rule as product reads: costs leave the API unless the user can read product financials.
// Raw SQL rows (sale lines, deliveries, sale search) carry costo_unitario and must be filtered here too.
@Injectable()
export class CashierResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const authorized = canReadProductFinancials(context.switchToHttp().getRequest().user);
    return next.handle().pipe(map(value => authorized ? value : withoutCosts(value)));
  }
}
