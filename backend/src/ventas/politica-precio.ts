import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';

/**
 * Política única de precio distinto del vigente (venta directa del POS y conversión de cotización).
 *
 * 1. Cobrar un precio distinto del catálogo vigente en el momento de la operación exige una excepción EXPLÍCITA en la
 *    misma petición: `excepcionPrecio.motivo` (10 a 300 caracteres). Sin ella responde 409 y el cliente recarga el catálogo.
 * 2. La excepción solo la puede usar quien tiene rol ADMIN **y** el permiso «pos.excepcion_precio» asignado. El rol nunca
 *    la concede por sí mismo. Sin permiso responde 403, aunque venga el motivo.
 * 3. Cada excepción aceptada queda auditada (VENTA_EXCEPCION_PRECIO) con el motivo y, por línea, el precio vigente y el
 *    cobrado. Esa auditoría es lo que permite revisar después quién cobró por debajo o por encima del precio aprobado.
 * 4. La misma regla rige la venta directa y la conversión de cotizaciones: ninguna ruta autoriza un precio distinto de
 *    forma silenciosa.
 * El ISV distinto del 15 % o las líneas exentas al convertir una cotización son un asunto fiscal, no de precio: su
 * política está fuera de esta regla y sigue como estaba (pendiente de decisión del propietario).
 */
export const PERMISO_EXCEPCION_PRECIO = 'pos.excepcion_precio';
export const MOTIVO_EXCEPCION_MIN = 10;
export const MOTIVO_EXCEPCION_MAX = 300;

export interface LineaPrecio { productoId: string; producto: string; precioVigente: number; precioCobrado: number }
export interface ActorPrecio { rol: string; permisos?: string[] }
export interface ExcepcionPrecio { motivo?: string | null }
export interface ExcepcionAuditada { motivo: string; lineas: LineaPrecio[] }

/** Líneas cuyo precio cobrado difiere del vigente. Compara en centavos: 10.1 y 10.10 son el mismo precio. */
export function lineasConPrecioDistinto(lineas: LineaPrecio[]): LineaPrecio[] {
  return lineas.filter(l => Math.round(l.precioCobrado * 100) !== Math.round(l.precioVigente * 100));
}

/**
 * Aplica la política. Devuelve null si ninguna línea cambia de precio; si hay cambios, devuelve la excepción a auditar
 * o lanza el error correspondiente (409 sin motivo, 403 sin permiso, 400 con motivo inválido).
 */
export function exigirPoliticaPrecio(actor: ActorPrecio, lineas: LineaPrecio[], excepcion?: ExcepcionPrecio | null): ExcepcionAuditada | null {
  const distintas = lineasConPrecioDistinto(lineas);
  if (distintas.length === 0) return null;
  if (!excepcion) throw new ConflictException('El precio cambió; actualice el catálogo o solicite al administrador');
  const motivo = typeof excepcion.motivo === 'string' ? excepcion.motivo.trim() : '';
  if (motivo.length < MOTIVO_EXCEPCION_MIN || motivo.length > MOTIVO_EXCEPCION_MAX) {
    throw new BadRequestException(`Explique el motivo de la excepción de precio (entre ${MOTIVO_EXCEPCION_MIN} y ${MOTIVO_EXCEPCION_MAX} caracteres)`);
  }
  if (actor.rol !== 'ADMIN' || !(actor.permisos ?? []).includes(PERMISO_EXCEPCION_PRECIO)) {
    throw new ForbiddenException('Cobrar un precio distinto del vigente requiere el permiso explícito de excepción de precio');
  }
  return { motivo, lineas: distintas };
}
