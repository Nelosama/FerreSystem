// Excepción de precio del POS y de la conversión de cotizaciones. Sin dependencias: se prueba aislada
// (test/excepcion-precio.test.mjs). Refleja la política del servidor (backend/src/ventas/politica-precio.ts):
// un precio distinto del vigente exige `excepcionPrecio.motivo` (10 a 300 caracteres tras recortar), rol ADMIN
// y el permiso explícito «pos.excepcion_precio». El rol nunca lo concede por sí mismo. El servidor sigue decidiendo:
// esto solo evita ofrecer la excepción a quien no la tiene y enviar un motivo que se rechazaría con 400.

export const PERMISO_EXCEPCION_PRECIO = 'pos.excepcion_precio';
export const MOTIVO_EXCEPCION_MIN = 10;
export const MOTIVO_EXCEPCION_MAX = 300;

export interface ActorExcepcion { rol?: string; permisos?: string[] }

/** Solo ADMIN con el permiso asignado. A diferencia de otros permisos, ser ADMIN no basta. */
export function puedeExcepcionPrecio(user: ActorExcepcion | null | undefined): boolean {
  return user?.rol === 'ADMIN' && Array.isArray(user.permisos) && user.permisos.includes(PERMISO_EXCEPCION_PRECIO);
}

/** Misma medida que el servidor: longitud del texto recortado. */
export function motivoExcepcionValido(motivo: string): boolean {
  const largo = motivo.trim().length;
  return largo >= MOTIVO_EXCEPCION_MIN && largo <= MOTIVO_EXCEPCION_MAX;
}

/**
 * 409 de la política de precio. El servidor responde 409 también por otras causas (caja cerrada, solicitud reutilizada),
 * así que se reconoce por su mensaje fijo: «El precio cambió; actualice el catálogo o solicite al administrador».
 */
export function esRechazoPorPrecio(err: any): boolean {
  const mensaje = err?.response?.data?.message;
  return err?.response?.status === 409 && typeof mensaje === 'string' && /precio cambi/i.test(mensaje);
}
