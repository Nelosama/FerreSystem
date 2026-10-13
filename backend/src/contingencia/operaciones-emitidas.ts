import { createHmac } from 'node:crypto';

/** Operaciones que el servidor reserva en cada ventana. El equipo solo puede usar esos identificadores, en orden. */
export const OPERACIONES_POR_VENTANA = 500;

/**
 * H-5 (CENTINELA, opción A aprobada): el identificador de una operación lo emite el servidor, no el equipo.
 * Es determinista (HMAC del identificador de la ventana y del índice) y se verifica sin tabla adicional. Un UUID ajeno,
 * aunque se conozca, nunca coincide con la derivación de la ventana de quien lo envía.
 */
export function operacionEmitida(clave: string, ventanaId: string, indice: number): string {
  const bytes = createHmac('sha256', clave).update(`contingencia-operacion:v1:${ventanaId}:${indice}`).digest().subarray(0, 16);
  // Formato UUID v4 (versión y variante) para que el resto de la aplicación lo trate como cualquier otro identificador.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const operacionesEmitidas = (clave: string, ventanaId: string) =>
  Array.from({ length: OPERACIONES_POR_VENTANA }, (_, indice) => operacionEmitida(clave, ventanaId, indice));
