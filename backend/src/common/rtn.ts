import { BadRequestException } from '@nestjs/common';

/**
 * RTN de Honduras (decisión del dueño del 2026-11-12, etapa 4 de #245):
 * - si el cliente no lo pide, el campo queda vacío y la operación sigue;
 * - si se escribe, son exactamente 14 dígitos; se aceptan espacios y guiones como separadores visuales y se guardan
 *   solo los dígitos; si no cumple, la operación se rechaza hasta corregirlo.
 * Se valida el formato, no la existencia del RTN: no hay consulta al SAR ni dígito verificador oficial publicado.
 */
export const DIGITOS_RTN = 14;

/** RTN obligatorio: devuelve los 14 dígitos o rechaza con 400. */
export function normalizarRtn(valor: unknown, etiqueta = 'RTN'): string {
  if (typeof valor !== 'string') throw new BadRequestException(`${etiqueta}: valor requerido`);
  const limpio = valor.trim().replace(/[\s-]/g, '');
  if (!/^\d{14}$/.test(limpio)) {
    throw new BadRequestException(`${etiqueta}: debe tener exactamente ${DIGITOS_RTN} dígitos (puede escribirlo con espacios o guiones)`);
  }
  return limpio;
}

/** RTN opcional: ausente, nulo o en blanco → null; con texto, los 14 dígitos o 400. */
export function rtnOpcional(valor: unknown, etiqueta = 'RTN'): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw new BadRequestException(`${etiqueta}: valor no válido`);
  if (!valor.trim()) return null;
  return normalizarRtn(valor, etiqueta);
}
