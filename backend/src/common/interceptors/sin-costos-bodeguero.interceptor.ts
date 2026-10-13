import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Type } from '@nestjs/common';
import { map } from 'rxjs/operators';

// KARDEX (consolidación #134/#140): BODEGUERO registra y recibe mercancía; costos, márgenes y totales
// de compra o de proveedor no forman parte de sus tareas. El control vive en el backend, no en la UI.
const CAMPOS_COSTO = [
  'precioCosto', 'precio_costo', 'costoVigente', 'costo_vigente', 'costoUnitario', 'costo_unitario',
  'costo', 'costos', 'ultimo_costo', 'ultimoCosto', 'margen', 'margenCalculado',
];

function quitarCampos(valor: any, campos: Set<string>): any {
  if (Array.isArray(valor)) return valor.map(item => quitarCampos(item, campos));
  if (!valor || typeof valor !== 'object' || Object.getPrototypeOf(valor) !== Object.prototype) return valor;
  return Object.fromEntries(Object.entries(valor)
    .filter(([clave]) => !campos.has(clave))
    .map(([clave, item]) => [clave, quitarCampos(item, campos)]));
}

/** Respuesta sin costos para BODEGUERO. `camposFinancieros` añade totales de compra cuando la ruta los devuelve. */
export function SinCostosParaBodeguero(camposFinancieros: string[] = []): Type<NestInterceptor> {
  const campos = new Set([...CAMPOS_COSTO, ...camposFinancieros]);
  @Injectable()
  class SinCostosInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler) {
      const rol = context.switchToHttp().getRequest().user?.rol;
      return next.handle().pipe(map(value => (rol === 'BODEGUERO' ? quitarCampos(value, campos) : value)));
    }
  }
  return SinCostosInterceptor;
}
