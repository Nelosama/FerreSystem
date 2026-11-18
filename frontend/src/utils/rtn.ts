/**
 * RTN de Honduras en pantalla (espejo de backend/src/common/rtn.ts; decisión del dueño del 2026-11-12, etapa 4):
 * vacío = el cliente no lo pidió y la operación sigue; con texto, exactamente 14 dígitos, con espacios o guiones como
 * separadores visuales. Mal escrito, se avisa y no se envía hasta corregirlo. Se valida el formato, no la existencia.
 * El servidor aplica la misma regla y guarda solo los dígitos.
 */
export const DIGITOS_RTN = 14;

export type EstadoRtn = { valido: true; digitos: string | null } | { valido: false; digitos: null };

export function revisarRtn(valor: string | null | undefined): EstadoRtn {
  if (valor === undefined || valor === null || !valor.trim()) return { valido: true, digitos: null };
  const limpio = valor.trim().replace(/[\s-]/g, '');
  return /^\d{14}$/.test(limpio) ? { valido: true, digitos: limpio } : { valido: false, digitos: null };
}

export const rtnValidoOVacio = (valor: string | null | undefined) => revisarRtn(valor).valido;
