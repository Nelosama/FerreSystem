// Convierte el identificador visible de una venta («V-3», «V-00000003», «v3» o «3») al número que espera el backend.
// Si el texto no tiene ese formato se devuelve tal cual, para que el backend responda con su propio mensaje.
export function numeroVentaDesdeIdentificador(texto: string): string {
  const limpio = texto.trim().toUpperCase();
  const coincide = /^(?:V-?)?0*(\d+)$/.exec(limpio);
  return coincide && Number(coincide[1]) > 0 ? String(Number(coincide[1])) : limpio;
}
