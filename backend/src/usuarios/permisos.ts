import { BadRequestException } from '@nestjs/common';
import { PERMISOS_CONTABILIDAD } from '../contabilidad/permisos';
import { PERMISO_EXCEPCION_PRECIO } from '../ventas/politica-precio';

// Catálogo de permisos existentes en guards, servicios y matriz de Usuarios.
// pos.anular_venta se conserva por compatibilidad con listas históricas.
export const PERMISOS_USUARIO = [
  'pos.vender', 'pos.anular_venta', 'pos.aplicar_descuento', PERMISO_EXCEPCION_PRECIO,
  'caja.movimientos_manuales', 'inventario.ver', 'inventario.editar',
  'cotizaciones.crear', 'cotizaciones.aprobar', 'cotizaciones.convertir_venta',
  'reportes.ver', 'usuarios.gestionar', 'configuracion.editar',
  ...Object.values(PERMISOS_CONTABILIDAD),
] as const;

export function validarPermisos(permisos: string[] | undefined) {
  if (permisos === undefined) return;
  if (!Array.isArray(permisos) || permisos.some(p => !(PERMISOS_USUARIO as readonly string[]).includes(p))) {
    throw new BadRequestException('Permiso no permitido');
  }
}
