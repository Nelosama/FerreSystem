import type { OperacionLocal } from './journal';

export function aOperacionDto(op: OperacionLocal) {
  return {
    operacionId: op.operacionId,
    // H-5: el servidor verifica que el identificador sea el emitido para la ventana en esta posición. Sin el índice, toda venta se rechaza.
    indiceOperacion: op.indiceOperacion,
    dispositivoId: op.dispositivoId,
    ventanaId: op.ventanaId,
    secuenciaLocal: op.secuenciaLocal,
    correlativoLocal: op.correlativoLocal,
    ocurridoAtLocal: op.ocurridoAtLocal,
    cajeroId: op.cajeroId,
    lineas: op.lineas.map((l) => ({ productoId: l.productoId, cantidadCentesimas: l.cantidadCentesimas, precioCentavos: l.precioCentavos })),
    subtotalCentavos: op.subtotalCentavos,
    isvCentavos: op.isvCentavos,
    totalCentavos: op.totalCentavos,
    efectivoRecibidoCentavos: op.efectivoRecibidoCentavos,
    cambioCentavos: op.cambioCentavos,
    metodoPago: 'EFECTIVO' as const,
    clienteNombre: op.clienteNombre || undefined,
    clienteRtn: op.clienteRtn || undefined,
    esquemaVersion: op.esquemaVersion,
  };
}

/** Contrato persistido v1: SHA-256 de JSON.stringify(JSON canónico del DTO completo).
 * Conserva el formato histórico de PostgreSQL, incluida la segunda serialización.
 * Nunca incluye cajaId: no forma parte del DTO; se verifica por evidencia separada.
 */
export function payloadCanonico(op: OperacionLocal): string {
  const dto = aOperacionDto(op);
  return JSON.stringify(JSON.stringify(dto, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}
