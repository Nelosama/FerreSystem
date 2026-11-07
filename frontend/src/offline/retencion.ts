import { transaccion } from './db';
import { listarOperaciones, type OperacionLocal } from './journal';
import { payloadCanonico } from './payload';
import { sessionIdentity, tokenClaims } from '../utils/authInterceptors';
export { payloadCanonico } from './payload';

// Retención del diario de contingencia (P1-5 de AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104).
// Diseño por evidencia, no por antigüedad. Puertas cerradas por defecto: una operación solo es eliminable si
//   1) está SINCRONIZADA, sin revisión, y
//   2) el servidor la reconfirma en esta misma sesión como APLICADA, con el mismo número, correlativo y hash del payload, y
//   3) el servidor confirma que su caja está cerrada.
// PENDIENTE, ENVIANDO y REVISION nunca son eliminables. Se ejecuta tras sincronización online autenticada.

export const ESTADOS_INTOCABLES = ['PENDIENTE', 'ENVIANDO', 'REVISION'] as const;
/** Una reconfirmación solo vale durante este tiempo: evita borrar con una respuesta antigua. */
export const VIGENCIA_EVIDENCIA_MS = 5 * 60_000;
/** Ventanas cerradas con testigos detallados que se conservan localmente por empresa. */
export const MAX_VENTANAS_TESTIGOS = 30;

export type OperacionRetenible = OperacionLocal;

/** Respuesta del servidor para una operación. Campos opcionales para rechazar de forma segura servidores antiguos o respuestas incompletas. */
export interface EvidenciaServidor {
  operacionId: string;
  tenantId?: string;
  cajaId?: string;
  requiereRevision?: boolean;
  payloadHashVersion?: string;
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
  if (!op.tenantId || evidencia.tenantId !== op.tenantId || evidencia.cajaId !== op.cajaId
    || evidencia.payloadHashVersion !== 'dto-json-v1') return { eliminable: false, motivo: 'datos-no-coinciden' };
  const reconfirmada = Date.parse(evidencia.reconfirmadaAt);
  if (!Number.isFinite(reconfirmada) || ahora - reconfirmada > VIGENCIA_EVIDENCIA_MS || reconfirmada > ahora + 60_000) {
    return { eliminable: false, motivo: 'evidencia-caducada' };
  }
  // Solo APLICADA cuenta. RESUELTA_MANUAL significa que la administración cerró la operación sin aplicarla.
  if (evidencia.estado !== 'APLICADA' || evidencia.requiereRevision !== false) return { eliminable: false, motivo: 'estado-servidor' };
  if (!Number.isSafeInteger(op.numeroVenta) || (op.numeroVenta ?? 0) <= 0 || evidencia.numeroVenta !== op.numeroVenta
    || !op.correlativoDefinitivo || op.correlativoDefinitivo !== `V-${String(op.numeroVenta).padStart(8, '0')}` || evidencia.correlativoDefinitivo !== op.correlativoDefinitivo) {
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
export function resumenAuditoria(op: OperacionRetenible, hash: string, ahora = new Date(), evidencia?: EvidenciaServidor) {
  return {
    version: 1,
    tenantId: op.tenantId,
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
    payloadHashVersion: 'dto-json-v1',
    eliminadaAt: ahora.toISOString(),
    motivo: 'retencion-reconfirmada',
    reconfirmadaAt: evidencia?.reconfirmadaAt,
    estadoServidor: evidencia?.estado,
    cajaCerrada: evidencia?.cajaCerrada,
  };
}

/** Reconfirma con el servidor las operaciones indicadas. Sin contrato completo, las evidencias no cerrarán ninguna puerta. */
export async function reconfirmarConServidor(
  api: { get: (url: string, config: { params: Record<string, string>; timeout: number; headers?: Record<string, string> }) => Promise<{ data: unknown }> },
  operacionIds: string[],
  headers?: Record<string, string>,
): Promise<EvidenciaServidor[]> {
  if (!operacionIds.length) return [];
  try {
    const { data } = await api.get('/contingencia/operaciones/estados', {
      params: { ids: operacionIds.slice(0, 100).join(',') }, timeout: 20_000, headers,
    });
    if (!Array.isArray(data)) return [];
    const ids = new Set(operacionIds);
    const repetidos = new Set(data.filter((s, i) => data.findIndex((t) => t?.operacionId === s?.operacionId) !== i).map(s => s?.operacionId));
    return data.filter((s): s is EvidenciaServidor => !!s && typeof s === 'object'
      && ids.has(s.operacionId) && !repetidos.has(s.operacionId));
  } catch { return []; } // HTTP, timeout o formato desconocido: conservar, reintentar en otro ciclo.
}

export interface SesionRetencion {
  tenantId: string; usuarioId: string; rol: string;
  vigente: () => boolean;
}
const mismaEmpresa = (op: OperacionRetenible, sesion: SesionRetencion) =>
  op.tenantId === sesion.tenantId && (sesion.rol === 'ADMIN' || (sesion.rol === 'CAJERO' && op.cajeroId === sesion.usuarioId));

/** Solo después de sincronizar correctamente; el GET autenticado confirma la sesión en servidor. */
export async function retenerTrasSincronizar(api: Parameters<typeof reconfirmarConServidor>[0],
  usuario: { id: string; tenantId: string; rol: string }) {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  const token = localStorage.getItem('ferre_token');
  const claims = tokenClaims(token);
  const identidad = `${usuario.id}:${usuario.tenantId}`;
  const vigente = () => !!token && localStorage.getItem('ferre_token') === token
    && sessionIdentity() === identidad && navigator.onLine
    && JSON.parse(localStorage.getItem('ferre_user') || 'null')?.rol === usuario.rol;
  if (!claims?.sid || claims.sub !== usuario.id || claims.tenantId !== usuario.tenantId || !vigente()) return;
  const sesion = { tenantId: usuario.tenantId, usuarioId: usuario.id, rol: usuario.rol, vigente };
  const ops = (await listarOperaciones()).filter(o => mismaEmpresa(o, sesion) && o.estado === 'SINCRONIZADA' && !o.requiereRevision);
  let eliminadasTotal = 0;
  for (let i = 0; i < ops.length; i += 100) {
    if (!vigente()) return;
    const lote = ops.slice(i, i + 100);
    const evidencias = await reconfirmarConServidor(api, lote.map(o => o.operacionId), { Authorization: `Bearer ${token}` });
    if (!vigente()) return;
    const candidatas: CandidataRetencion[] = [];
    for (const op of lote) {
      const evidencia = evidencias.find(e => e.operacionId === op.operacionId);
      if (!evidencia) continue;
      const hash = await hashPayload(op);
      if (evaluarRetencion(op, evidencia, hash).eliminable) candidatas.push({ op, evidencia, hash, canonico: payloadCanonico(op) });
    }
    if (candidatas.length && vigente()) {
      const resultado = await eliminarConfirmadas(candidatas, Date.now(), sesion);
      eliminadasTotal += resultado.eliminadas.length;
    }
  }
  if (eliminadasTotal > 0 && vigente()) await depurarTestigosLocales();
}

/**
 * Conserva los testigos de las 30 ventanas cerradas más recientes por empresa.
 * Falla cerrado: testigos incompletos, ventanas activas y ventanas con operaciones
 * locales se conservan. Los marcadores de índice nunca se eliminan aquí.
 */
export async function depurarTestigosLocales(maxVentanas = MAX_VENTANAS_TESTIGOS) {
  const limite = Number.isSafeInteger(maxVentanas) && maxVentanas > 0 ? maxVentanas : MAX_VENTANAS_TESTIGOS;
  return transaccion<number>(['operaciones', 'meta', 'ventana'], 'readwrite', (tx, salida) => {
    const meta = tx.objectStore('meta');
    const operaciones = tx.objectStore('operaciones');
    const activa = tx.objectStore('ventana').get('activa');
    const filas: Array<{ clave: IDBValidKey; valor: unknown }> = [];
    let cursorListo = false;
    let operacionesListas = false;
    let ventanaLista = false;
    let listaOps: OperacionLocal[] = [];
    let ventanaActiva: { ventanaId?: string } | undefined;
    let terminado = false;
    salida.valor = 0;

    const podar = () => {
      if (terminado || !cursorListo || !operacionesListas || !ventanaLista) return;
      terminado = true;
      const conOperaciones = new Set(listaOps.map(o => o.ventanaId).filter(Boolean));
      const porEmpresa = new Map<string, Map<string, { fecha: number }>>();
      const conservarSiempre = new Set<string>();
      for (const fila of filas) {
        if (typeof fila.clave !== 'string' || !fila.clave.startsWith('auditoria:')) continue;
        const testigo = fila.valor as { tenantId?: unknown; ventanaId?: unknown; eliminadaAt?: unknown; cajaCerrada?: unknown } | null;
        if (!testigo || typeof testigo.tenantId !== 'string' || !testigo.tenantId
          || typeof testigo.ventanaId !== 'string' || !testigo.ventanaId
          || typeof testigo.eliminadaAt !== 'string') continue;
        if (testigo.cajaCerrada !== true) { conservarSiempre.add(`${testigo.tenantId}\u0000${testigo.ventanaId}`); continue; }
        const fecha = Date.parse(testigo.eliminadaAt);
        // Un dato temporal inválido no se usa para inferir antigüedad ni borrar.
        if (!Number.isFinite(fecha)) { conservarSiempre.add(`${testigo.tenantId}\u0000${testigo.ventanaId}`); continue; }
        let ventanas = porEmpresa.get(testigo.tenantId);
        if (!ventanas) { ventanas = new Map(); porEmpresa.set(testigo.tenantId, ventanas); }
        let grupo = ventanas.get(testigo.ventanaId);
        if (!grupo) { grupo = { fecha }; ventanas.set(testigo.ventanaId, grupo); }
        grupo.fecha = Math.max(grupo.fecha, fecha);
      }

      const conservar = new Set<string>();
      for (const [tenantId, ventanas] of porEmpresa) {
        const ordenadas = [...ventanas.entries()].sort((a, b) => b[1].fecha - a[1].fecha);
        for (const [ventanaId] of ordenadas.slice(0, limite)) conservar.add(`${tenantId}\u0000${ventanaId}`);
      }
      for (const llave of conservarSiempre) conservar.add(llave);
      for (const fila of filas) {
        if (typeof fila.clave !== 'string' || !fila.clave.startsWith('auditoria:')) continue;
        const testigo = fila.valor as { tenantId?: unknown; ventanaId?: unknown } | null;
        if (!testigo || typeof testigo.tenantId !== 'string' || typeof testigo.ventanaId !== 'string') continue;
        const llave = `${testigo.tenantId}\u0000${testigo.ventanaId}`;
        if (conservar.has(llave) || conOperaciones.has(testigo.ventanaId) || ventanaActiva?.ventanaId === testigo.ventanaId) continue;
        meta.delete(fila.clave);
        salida.valor = (salida.valor ?? 0) + 1;
      }
    };

    const cursor = meta.openCursor();
    cursor.onsuccess = () => {
      const actual = cursor.result;
      if (actual) {
        filas.push({ clave: actual.key, valor: actual.value });
        actual.continue();
      } else { cursorListo = true; podar(); }
    };
    const peticionOps = operaciones.getAll();
    peticionOps.onsuccess = () => { listaOps = peticionOps.result as OperacionLocal[]; operacionesListas = true; podar(); };
    activa.onsuccess = () => { ventanaActiva = activa.result as { ventanaId?: string } | undefined; ventanaLista = true; podar(); };
  });
}

export interface CandidataRetencion { op: OperacionRetenible; evidencia: EvidenciaServidor; hash: string; canonico: string }

/**
 * Ejecutor atómico. Una sola transacción: relee cada operación, repite la decisión sobre el registro guardado y solo
 * entonces elimina y escribe su resumen. Si el estado o la carga cambió, la operación se omite y se conserva.
 * La sesión y la empresa se revalidan antes de cada eliminación.
 */
export async function eliminarConfirmadas(candidatas: CandidataRetencion[], ahora: number, sesion: SesionRetencion) {
  return transaccion<{ eliminadas: string[]; omitidas: string[] }>(['operaciones', 'meta', 'ventana'], 'readwrite', (tx, salida) => {
    const ventana = tx.objectStore('ventana').get('activa');
    const ops = tx.objectStore('operaciones');
    const meta = tx.objectStore('meta');
    const eliminadas: string[] = [];
    const omitidas: string[] = [];
    const indices = new Map<string, number>();
    salida.valor = { eliminadas, omitidas };
    for (const c of candidatas) {
      const peticion = ops.get(c.op.operacionId);
      peticion.onsuccess = () => {
        const guardada = peticion.result as OperacionRetenible | undefined;
        const coincide = !!guardada && ventana.result?.ventanaId !== guardada.ventanaId && sesion.vigente() && mismaEmpresa(guardada, sesion) && payloadCanonico(guardada) === c.canonico;
        const decision = guardada && coincide ? evaluarRetencion(guardada, c.evidencia, c.hash, Math.max(ahora, Date.now())) : undefined;
        if (!guardada || !decision || decision.eliminable !== true) { omitidas.push(c.op.operacionId); return; }
        // El índice emitido no se puede reutilizar tras purgar el último registro de una ventana.
        const claveIndice = `indice-retenido:${guardada.ventanaId}`;
        const indice = meta.get(claveIndice);
        indice.onsuccess = () => {
          if (!sesion.vigente()) { tx.abort(); return; }
          const maximo = Math.max(indices.get(claveIndice) ?? 0, Number(indice.result) || 0, (guardada.indiceOperacion ?? -1) + 1);
          indices.set(claveIndice, maximo);
          meta.put(maximo, claveIndice);
        };
        ops.delete(c.op.operacionId);
        meta.put(resumenAuditoria(guardada, c.hash, new Date(ahora), c.evidencia), `auditoria:${c.op.operacionId}`);
        eliminadas.push(c.op.operacionId);
      };
    }
  });
}
