import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map } from 'rxjs/operators';
import { canReadProductFinancials, publicProduct } from './producto-response';

/** Marca una ruta cuya respuesta no es un producto (ya no contiene costos): el filtro público de producto no aplica. */
export const RESPUESTA_SIN_PRODUCTO = 'respuesta-sin-producto';
export const RespuestaSinProducto = () => SetMetadata(RESPUESTA_SIN_PRODUCTO, true);

@Injectable()
export class ProductoResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector = new Reflector()) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    if (this.reflector.get<boolean>(RESPUESTA_SIN_PRODUCTO, context.getHandler())) return next.handle();
    const authorized = canReadProductFinancials(context.switchToHttp().getRequest().user);
    return next.handle().pipe(map(value => authorized ? value : publicProduct(value)));
  }
}
