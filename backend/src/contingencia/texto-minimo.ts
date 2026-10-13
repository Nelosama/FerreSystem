/**
 * Regla de texto libre mínimo (nota de la decisión, motivo de regularización). IDÉNTICA en backend y frontend:
 * este archivo es el mismo en `backend/src/contingencia/texto-minimo.ts` y `frontend/src/utils/textoMinimo.ts`
 * (una prueba del backend falla si difieren). No importa nada, para poder copiarse tal cual.
 *
 * Política (decisión del propietario):
 *  1. El mínimo de longitud de negocio cuenta caracteres del texto ya limpio, ESPACIOS INCLUIDOS.
 *  2. Además debe haber al menos 3 caracteres visibles no blancos: letras, números, puntuación o símbolos.
 *  3. Unicode: las marcas de combinación (acentos, signos del hindi, etc.) cuentan para la longitud, pero no como visibles por sí
 *     solas; los invisibles (formato, ignorables, control, uso privado, sin asignar, sustitutos) no cuentan en ninguna de las dos.
 */

export const VISIBLES_MINIMOS = 3;

/** Texto libre normalizado para guardar y medir: sin caracteres de formato ni rellenos invisibles, y sin espacios en los extremos. */
export const limpiarTextoLibre = (valor: string): string =>
  valor.replace(/[\p{Cf}ㅤ⠀ᅟᅠﾠ᠎͏]/gu, '').trim();

// No aportan longitud: ignorables por defecto (selectores de variación, etiquetas, rellenos), controles salvo tabulación y saltos de línea,
// uso privado (Co), sin asignar (Cn) y sustitutos (Cs).
const NO_CUENTA = /[\p{Default_Ignorable_Code_Point}\p{Co}\p{Cn}\p{Cs}]|(?![\t\n\r])\p{Cc}/gu;
// Caracteres visibles no blancos: letras, números, puntuación y símbolos, salvo el objeto de reemplazo y el carácter de sustitución.
const VISIBLE = /(?![￼�])[\p{L}\p{N}\p{P}\p{S}]/gu;

export function longitudDeNegocio(valor: unknown): number {
  if (typeof valor !== 'string') return 0;
  return Array.from(limpiarTextoLibre(valor).replace(NO_CUENTA, '')).length;
}

export function caracteresVisibles(valor: unknown): number {
  if (typeof valor !== 'string') return 0;
  return (limpiarTextoLibre(valor).match(VISIBLE) ?? []).length;
}

export interface ResultadoTextoMinimo { ok: boolean; longitud: number; visibles: number; minimo: number }

export function validarTextoMinimo(valor: unknown, minimo: number): ResultadoTextoMinimo {
  const longitud = longitudDeNegocio(valor);
  const visibles = caracteresVisibles(valor);
  return { ok: longitud >= minimo && visibles >= VISIBLES_MINIMOS, longitud, visibles, minimo };
}

/** Mensaje único: el mismo texto lo muestra la interfaz y lo devuelve el servidor. */
export const mensajeTextoMinimo = (minimo: number): string =>
  `Escriba al menos ${minimo} caracteres (los espacios cuentan) y al menos ${VISIBLES_MINIMOS} letras, números o símbolos visibles.`;
