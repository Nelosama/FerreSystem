// H-5: las pruebas usan el conjunto de identificadores que devuelve la propia emisión de la ventana (la respuesta real del
// servidor), igual que el equipo. No se deriva ningún UUID en la prueba.
const emitidas = new Map<string, string[]>();
const siguientes = new Map<string, number>();

/** Llama a `emitirVentana` y guarda el conjunto de operaciones emitidas para usarlo al construir ventas. */
export async function emitirRegistrada(svc: { emitirVentana: (...args: any[]) => Promise<any> }, ...args: any[]) {
  const resultado = await svc.emitirVentana(...args);
  emitidas.set(resultado.ventana.id, resultado.ventana.operacionesEmitidas ?? []);
  return resultado;
}

/** Siguiente operación emitida por el servidor para esta ventana, con su índice (lo que envía el equipo). */
export function siguienteOperacion(ventanaId: string) {
  const indice = siguientes.get(ventanaId) ?? 0;
  const conjunto = emitidas.get(ventanaId);
  if (!conjunto || indice >= conjunto.length) throw new Error(`Sin operaciones emitidas para la ventana ${ventanaId}`);
  siguientes.set(ventanaId, indice + 1);
  return { operacionId: conjunto[indice], indiceOperacion: indice };
}
