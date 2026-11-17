import { ValidationPipe, type ValidationError } from '@nestjs/common';

/**
 * T-06 (auditoría del 2026-11-11): los DTO sin mensaje propio respondían con el texto en inglés de class-validator
 * («motivo should not be empty»), que la pantalla muestra tal cual al cajero. Aquí se traducen esos textos por defecto.
 * Un mensaje propio de un DTO (ya en español) no coincide con ningún patrón y se devuelve sin cambios. No cambia qué se
 * valida, el código 400 ni la forma de la respuesta (`message: string[]`); solo el idioma del texto.
 */
const PATRONES: ReadonlyArray<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^property (.+) should not exist$/, (m) => `${m[1]}: este dato no se admite`],
  [/^(.+) should not be empty$/, (m) => `${m[1]}: este dato es obligatorio`],
  [/^(.+) should not be null or undefined$/, (m) => `${m[1]}: este dato es obligatorio`],
  [/^(.+) must be a string$/, (m) => `${m[1]}: debe ser texto`],
  [/^(.+) must be a number conforming to the specified constraints$/, (m) => `${m[1]}: debe ser un número válido`],
  [/^(.+) must be a number string$/, (m) => `${m[1]}: debe ser un número`],
  [/^(.+) must be an integer number$/, (m) => `${m[1]}: debe ser un número entero`],
  [/^(.+) must be a positive number$/, (m) => `${m[1]}: debe ser mayor que cero`],
  [/^(.+) must not be less than (.+)$/, (m) => `${m[1]}: no puede ser menor que ${m[2]}`],
  [/^(.+) must not be greater than (.+)$/, (m) => `${m[1]}: no puede ser mayor que ${m[2]}`],
  [/^(.+) must be shorter than or equal to (\d+) characters$/, (m) => `${m[1]}: admite hasta ${m[2]} caracteres`],
  [/^(.+) must be longer than or equal to (\d+) characters$/, (m) => `${m[1]}: necesita al menos ${m[2]} caracteres`],
  [/^(.+) must be longer than or equal to (\d+) and shorter than or equal to (\d+) characters$/, (m) => `${m[1]}: debe tener entre ${m[2]} y ${m[3]} caracteres`],
  [/^(.+) must be a UUID$/, (m) => `${m[1]}: identificador no válido`],
  [/^(.+) must be one of the following values: (.*)$/, (m) => `${m[1]}: valor no permitido (opciones: ${m[2]})`],
  [/^(.+) must be a valid enum value$/, (m) => `${m[1]}: valor no permitido`],
  [/^(.+) must be a boolean value$/, (m) => `${m[1]}: debe ser sí o no`],
  [/^(.+) must be an array$/, (m) => `${m[1]}: debe ser una lista`],
  [/^(.+) must contain at least (\d+) elements$/, (m) => `${m[1]}: necesita al menos ${m[2]} elemento(s)`],
  [/^(.+) must contain no more than (\d+) elements$/, (m) => `${m[1]}: admite hasta ${m[2]} elemento(s)`],
  [/^(.+) must be an email$/, (m) => `${m[1]}: correo electrónico no válido`],
  [/^(.+) must be a valid ISO 8601 date string$/, (m) => `${m[1]}: fecha no válida`],
  [/^(.+) must be a Date instance$/, (m) => `${m[1]}: fecha no válida`],
  [/^(.+) must be an object$/, (m) => `${m[1]}: formato no válido`],
  [/^(.+) must be either object or array$/, (m) => `${m[1]}: formato no válido`],
  [/^(.+) must match (.+) regular expression$/, (m) => `${m[1]}: formato no válido`],
];

export function traducirMensajeValidacion(mensaje: string): string {
  if (typeof mensaje !== 'string') return mensaje;
  // Nest antepone la ruta del elemento anidado («detalles.0.») al texto «each value in …»: se conserva tal cual.
  const cada = mensaje.match(/^((?:[\w$-]+\.)*)each value in (.+)$/);
  if (cada) {
    const resto = traducirMensajeValidacion(cada[1] + cada[2]);
    return resto === cada[1] + cada[2] ? mensaje : `${resto} (en cada valor)`;
  }
  for (const [patron, traducir] of PATRONES) {
    const coincidencia = mensaje.match(patron);
    if (coincidencia) return traducir(coincidencia);
  }
  return mensaje;
}

/** Mismo ValidationPipe de Nest; solo traduce los mensajes por defecto al aplanar los errores. */
export class ValidationPipeEnEspanol extends ValidationPipe {
  protected flattenValidationErrors(errores: ValidationError[]): string[] {
    return super.flattenValidationErrors(errores).map(traducirMensajeValidacion);
  }
}
