import { transaccion } from './db';

// Retención del diario de contingencia (P1-5 de AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104).
// Diseño por evidencia, no por antigüedad. Puertas cerradas por defecto: una operación solo es eliminable si
//   1) está SINCRONIZADA, sin revisión, y
//   2) el servidor la reconfirma en esta misma sesión como APLICADA, con el mismo número, correlativo y hash del payload, y
//   3) el servidor confirma que su caja está cerrada.
// PENDIENTE, ENVIANDO y REVISION nunca son eliminables. Este módulo NO tiene llamadores: no borra nada hasta que el
// contrato del servidor (hash y cierre de caja en /contingencia/operaciones/estados) exista y se active por coordinación.

export const ESTADOS_INTOCABLES = ['PENDIENTE', 'ENVIANDO', 'REVISION'] as const;
/** Una reconfirmación solo vale durante este tiempo: evita borrar con una respuesta antigua. */
export const VIGENCIA_EVIDENCIA_MS = 5 * 60_000;

/** Campos del diario que la retención necesita. Declarado aquí para no depender de journal.ts (propiedad de otro agente). */
export interface OperacionRetenible {
  operacionId: string;
  estado: string;
  requiereRevision?: boolean;
  numeroVenta?: number;
  correlativoDefinitivo?: string;
  sincronizadaAt?: string;
  ventanaId: string;
  cajaId: string;
  cajeroId: string;
  correlativoLocal: string;
  ocurridoAtLocal: string;
  totalCentavos: number;
  subtotalCentavos: number;
  isvCentavos: number;
  efectivoRecibidoCentavos: number;
  cambioCentavos: number;
  lineas: { productoId: string; cantidadCentesimas: number; precioCentavos: number }[];
  [campo: string]: unknown;
}

/** Respuesta del servidor para una operación. `payloadHash` y `cajaCerrada` son el contrato pendiente. */
export interface EvidenciaServidor {
  operacionId: string;
  estado: string;
  numeroVenta?: number | null;
  correlativoDefinitivo?: string | null;
  payloadHash?: string | null;
  cajaCerrada?: boolean | null;
  reconfirmadaAt: string;
}

export type MotivoRetencion =
  | 'estado-intocable'
  | 'con-revision'
  | 'sin-evidencia'
  | 'evidencia-caducada'
  | 'estado-servidor'
  | 'datos-no-coinciden'
  | 'hash-no-disponible'
  | 'caja-abierta'
  | 'caja-desconocida';

export type DecisionRetencion = { eliminable: true } | { eliminable: false; motivo: MotivoRetencion };

/** Forma canónica y estable de lo que se confirmó. Síncrona: se compara dentro de la transacción. */
export function payloadCanonico(op: OperacionRetenible): string {
  return JSON.stringify({
    operacionId: op.operacionId, ventanaId: op.ventanaId, cajaId: op.cajaId, cajeroId: op.cajeroId,
    correlativoLocal: op.correlativoLocal, ocurridoAtLocal: op.ocurridoAtLocal,
    lineas: op.lineas.map((l) => [l.productoId, l.cantidadCentesimas, l.precioCentavos]),
    subtotalCentavos: op.subtotalCentavos, isvCentavos: op.isvCentavos, totalCentavos: op.totalCentavos,
    efectivoRecibidoCentavos: op.efectivoRecibidoCentavos, cambioCentavos: op.cambioCentavos,
  });
}

/** SHA-256 hexadecimal del payload canónico. Requiere `crypto.subtle` (contexto seguro o Node). */
export async function hashPayload(op: OperacionRetenible): Promise<string> {
  const bytes = new TextEncoder().encode(payloadCanonico(op));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Decisión pura. Falla cerrado: cualquier dato ausente, distinto o caducado impide eliminar. */
export function evaluarRetencion(
  op: OperacionRetenible,
  evidencia: EvidenciaServidor | undefined,
  hashLocal: string | undefined,
  ahora = Date.now(),
): DecisionRetencion {
  if ((ESTADOS_INTOCABLES as readonly string[]).includes(op.estado)) return { eliminable: false, motivo: 'estado-intocable' };
  if (op.requiereRevision) return { eliminable: false, motivo: 'con-revision' };
  if (op.estado !== 'SINCRONIZADA') return { eliminable: false, motivo: 'estado-intocable' };
  if (!evidencia || evidencia.operacionId !== op.operacionId) return { eliminable: false, motivo: 'sin-evidencia' };
  const reconfirmada = Date.parse(evidencia.reconfirmadaAt);
  if (!Number.isFinite(reconfirmada) || ahora - reconfirmada > VIGENCIA_EVIDENCIA_MS || reconfirmada > ahora + 60_000) {
    return { eliminable: false, motivo: 'evidencia-caducada' };
  }
  // Solo APLICADA cuenta. RESUELTA_MANUAL significa que la administración cerró la operación sin aplicarla.
  if (evidencia.estado !== 'APLICADA') return { eliminable: false, motivo: 'estado-servidor' };
  if (op.numeroVenta === undefined || evidencia.numeroVenta !== op.numeroVenta
    || op.correlativoDefinitivo === undefined || evidencia.correlativoDefinitivo !== op.correlativoDefinitivo) {
    return { eliminable: false, motivo: 'datos-no-coinciden' };
  }
  if (!evidencia.payloadHash || !hashLocal) return { eliminable: false, motivo: 'hash-no-disponible' };
  if (evidencia.payloadHash !== hashLocal) return { eliminable: false, motivo: 'datos-no-coinciden' };
  if (evidencia.cajaCerrada === undefined || evidencia.cajaCerrada === null) return { eliminable: false, motivo: 'caja-desconocida' };
  if (evidencia.cajaCerrada !== true) return { eliminable: false, motivo: 'caja-abierta' };
  return { eliminable: true };
}

/**
 * Resumen de auditoría sin datos personales innecesarios: sin nombre, RTN, cliente, cajero ni líneas de producto.
 * Conserva lo necesario para conciliar: identificadores, correlativos, importes totales y el hash del payload.
 */
export function resumenAuditoria(op: OperacionRetenible, hash: string, ahora = new Date()) {
  return {
    version: 1,
    operacionId: op.operacionId,
    ventanaId: op.ventanaId,
    cajaId: op.cajaId,
    correlativoLocal: op.correlativoLocal,
    correlativoDefinitivo: op.correlativoDefinitivo,
    numeroVenta: op.numeroVenta,
    totalCentavos: op.totalCentavos,
    ocurridoAtLocal: op.ocurridoAtLocal,
    sincronizadaAt: op.sincronizadaAt,
    payloadHash: hash,
    eliminadaAt: ahora.toISOString(),
    motivo: 'retencion-reconfirmada',
  };
}

/** Reconfirma con el servidor las operaciones indicadas. Sin contrato completo, las evidencias no cerrarán ninguna puerta. */
export async function reconfirmarConServidor(
  api: { get: (url: string, config: { params: Record<string, string>; timeout: number }) => Promise<{ data: unknown }> },
  operacionIds: string[],
  ahora = new Date(),
): Promise<EvidenciaServidor[]> {
  if (!operacionIds.length) return [];
  const { data } = await api.get('/contingencia/operaciones/estados', { params: { ids: operacionIds.slice(0, 100).join(',') }, timeout: 20_000 });
  return (data as Omit<EvidenciaServidor, 'reconfirmadaAt'>[]).map((s) => ({ ...s, reconfirmadaAt: ahora.toISOString() }));
}

export interface CandidataRetencion { op: OperacionRetenible; evidencia: EvidenciaServidor; hash: string; canonico: string }

/**
 * Ejecutor atómico. Una sola transacción: relee cada operación, repite la decisión sobre el registro guardado y solo
 * entonces elimina y escribe su resumen. Si el estado o la carga cambió, la operación se omite y se conserva.
 * Sin llamadores en esta versión.
 */
export async function eliminarConfirmadas(candidatas: CandidataRetencion[], ahora = Date.now()) {
  return transaccion<{ eliminadas: string[]; omitidas: string[] }>(['operaciones', 'meta'], 'readwrite', (tx, salida) => {
    const ops = tx.objectStore('operaciones');
    const meta = tx.objectStore('meta');
    const eliminadas: string[] = [];
    const omitidas: string[] = [];
    salida.valor = { eliminadas, omitidas };
    for (const c of candidatas) {
      const peticion = ops.get(c.op.operacionId);
      peticion.onsuccess = () => {
        const guardada = peticion.result as OperacionRetenible | undefined;
        const coincide = !!guardada && payloadCanonico(guardada) === c.canonico;
        const decision = guardada && coincide ? evaluarRetencion(guardada, c.evidencia, c.hash, ahora) : undefined;
        if (!guardada || !decision || decision.eliminable !== true) { omitidas.push(c.op.operacionId); return; }
        ops.delete(c.op.operacionId);
        meta.put(resumenAuditoria(guardada, c.hash, new Date(ahora)), `auditoria:${c.op.operacionId}`);
        eliminadas.push(c.op.operacionId);
      };
    }
  });
}
