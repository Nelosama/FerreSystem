/**
 * Clave de derivación de los identificadores de operación de la contingencia (F4). Dedicada, obligatoria y por entorno:
 * sin valor por defecto ni fallback a otro secreto. Este módulo no importa nada de Nest para poder validarse al arrancar,
 * antes de crear la aplicación. NINGÚN mensaje de error incluye el valor de una clave.
 */
export const LONGITUD_MINIMA_CLAVE = 32;
export const DOCUMENTO_CLAVE = 'docs/CONTINGENCIA_CLAVE_OPERACIONES.md';

export function claveDeOperaciones(entorno: NodeJS.ProcessEnv): string {
  const clave = entorno.CONTINGENCIA_CLAVE_OPERACIONES ?? '';
  if (clave.trim().length < LONGITUD_MINIMA_CLAVE) throw new Error(`CONTINGENCIA_CLAVE_OPERACIONES es obligatoria y debe tener al menos ${LONGITUD_MINIMA_CLAVE} caracteres`);
  // Independiente de la sesión: reutilizar JWT_SECRET haría que rotarlo invalidara las ventanas emitidas.
  if (entorno.JWT_SECRET && clave === entorno.JWT_SECRET) throw new Error('CONTINGENCIA_CLAVE_OPERACIONES no puede ser igual a JWT_SECRET: deben ser claves independientes');
  return clave;
}

/** Transición: clave con la que se derivaron las ventanas emitidas antes del cambio. Solo verifica; se retira al vaciar pendientes. */
export function claveAnteriorDeOperaciones(entorno: NodeJS.ProcessEnv): string | null {
  const clave = entorno.CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR ?? '';
  if (!clave) return null;
  if (clave.length < LONGITUD_MINIMA_CLAVE) throw new Error(`CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR debe tener al menos ${LONGITUD_MINIMA_CLAVE} caracteres`);
  if (clave === entorno.CONTINGENCIA_CLAVE_OPERACIONES) throw new Error('CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR debe ser distinta de CONTINGENCIA_CLAVE_OPERACIONES; retírela si ya no hay operaciones pendientes');
  return clave;
}

/** Validación de arranque: devuelve el mensaje controlado (sin secretos) o null si la configuración es válida. */
export function errorDeConfiguracionContingencia(entorno: NodeJS.ProcessEnv): string | null {
  try {
    claveDeOperaciones(entorno);
    claveAnteriorDeOperaciones(entorno);
    return null;
  } catch (error) {
    return `${(error as Error).message}. Consulte ${DOCUMENTO_CLAVE}`;
  }
}
