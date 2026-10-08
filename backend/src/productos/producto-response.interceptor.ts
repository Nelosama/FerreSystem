import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { canReadProductFinancials, publicProduct } from './producto-response';

@Injectable()
export class ProductoResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const authorized = canReadProductFinancials(context.switchToHttp().getRequest().user);
    return next.handle().pipe(map(value => authorized ? value : publicProduct(value)));
  }
}
