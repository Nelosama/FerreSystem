import { transaccion, leerClave, escribirClave } from './db';

// Diario local de operaciones. Una venta offline se confirma solo cuando su registro está guardado en IndexedDB.
// Nunca se borra ni se reescribe la carga de una operación: solo cambia su estado de sincronización.

export type EstadoLocal = 'PENDIENTE' | 'ENVIANDO' | 'SINCRONIZADA' | 'REVISION';

export interface LineaLocal {
  productoId: string;
  codigo: string;
  nombre: string;
  cantidadCentesimas: number;
  precioCentavos: number;
}

export interface Conflicto { codigo: string; severidad?: string; detalle?: Record<string, unknown> }

export interface OperacionLocal {
  operacionId: string;
  /** H-5: posición de `operacionId` dentro de las operaciones emitidas por la ventana. */
  indiceOperacion?: number;
  dispositivoId: string;
  ventanaId: string;
  cajeroId: string;
  cajeroNombre: string;
  cajaId: string;
  secuenciaLocal: number;
  correlativoLocal: string;
  creadaAt: string;
  ocurridoAtLocal: string;
  lineas: LineaLocal[];
  subtotalCentavos: number;
  isvCentavos: number;
  totalCentavos: number;
  efectivoRecibidoCentavos: number;
  cambioCentavos: number;
  clienteNombre: string;
  clienteRtn: string;
  /** Nombre comercial de la empresa al cobrar. Solo para el comprobante impreso; no se envía al servidor. */
  ferreteria?: string;
  esquemaVersion: number;
  estado: EstadoLocal;
  intentos: number;
  proximoIntentoAt?: string;
  ultimoError?: string;
  sincronizadaAt?: string;
  numeroVenta?: number;
  correlativoDefinitivo?: string;
  ventaId?: string;
  conflictos: Conflicto[];
  requiereRevision?: boolean;
}

export type NuevaOperacion = Omit<OperacionLocal, 'operacionId' | 'indiceOperacion' | 'secuenciaLocal' | 'correlativoLocal' | 'estado' | 'intentos' | 'creadaAt' | 'conflictos'>;

export const correlativoLocal = (codigoDispositivo: string, secuencia: number) =>
  `CT-${codigoDispositivo.padStart(2, '0')}-${String(secuencia).padStart(4, '0')}`;

/**
 * Registra la operación con su secuencia local en la misma transacción que el contador. Resuelve al quedar guardada.
 * H-5: el identificador lo asigna el servidor (`emitidas`, en orden). El índice se calcula dentro de la transacción, así dos
 * pestañas no reutilizan un identificador. Sin identificadores disponibles la transacción se aborta: no hay venta.
 */
export function registrarOperacion(nueva: NuevaOperacion, codigoDispositivo: string, emitidas: string[]): Promise<OperacionLocal> {
  if (nueva.totalCentavos <= 0) return Promise.reject(new Error('La venta debe tener un importe mayor que cero'));
  return transaccion<OperacionLocal>(['operaciones', 'meta'], 'readwrite', (tx, salida) => {
    const meta = tx.objectStore('meta');
    const ops = tx.objectStore('operaciones');
    const todas = ops.getAll();
    const contador = meta.get('secuencia');
    todas.onsuccess = () => {
      const usados = (todas.result as OperacionLocal[]).filter((o) => o.ventanaId === nueva.ventanaId && typeof o.indiceOperacion === 'number');
      const indice = usados.reduce((maximo, o) => Math.max(maximo, o.indiceOperacion ?? -1), -1) + 1;
      if (indice >= emitidas.length) tx.abort();
    };
    contador.onsuccess = () => {
      const siguiente = (Number(contador.result) || 0) + 1;
      const usados = (todas.result as OperacionLocal[]).filter((o) => o.ventanaId === nueva.ventanaId && typeof o.indiceOperacion === 'number');
      const indice = usados.reduce((maximo, o) => Math.max(maximo, o.indiceOperacion ?? -1), -1) + 1;
      const operacion: OperacionLocal = {
        ...nueva,
        operacionId: emitidas[indice],
        indiceOperacion: indice,
        secuenciaLocal: siguiente,
        correlativoLocal: correlativoLocal(codigoDispositivo, siguiente),
        estado: 'PENDIENTE',
        intentos: 0,
        creadaAt: new Date().toISOString(),
        conflictos: [],
      };
      meta.put(siguiente, 'secuencia');
      ops.add(operacion);
      salida.valor = operacion;
    };
  });
}

export function listarOperaciones(): Promise<OperacionLocal[]> {
  return transaccion<OperacionLocal[]>(['operaciones'], 'readonly', (tx, salida) => {
    const peticion = tx.objectStore('operaciones').getAll();
    peticion.onsuccess = () => {
      salida.valor = (peticion.result as OperacionLocal[]).sort((a, b) => a.secuenciaLocal - b.secuenciaLocal);
    };
  });
}

/** Actualiza campos de sincronización. Nunca altera la carga (líneas, importes, cajero, UUID, correlativo). */
const CAMPOS_DE_SINCRONIZACION = new Set<keyof OperacionLocal>([
  'estado', 'intentos', 'proximoIntentoAt', 'ultimoError', 'sincronizadaAt', 'numeroVenta', 'correlativoDefinitivo', 'ventaId', 'conflictos', 'requiereRevision',
]);

export async function actualizarSincronizacion(operacionId: string, cambios: Partial<OperacionLocal>): Promise<OperacionLocal> {
  const invalidos = Object.keys(cambios).filter((k) => !CAMPOS_DE_SINCRONIZACION.has(k as keyof OperacionLocal));
  if (invalidos.length) throw new Error(`Campo no modificable del diario: ${invalidos.join(', ')}`);
  return transaccion<OperacionLocal>(['operaciones'], 'readwrite', (tx, salida) => {
    const ops = tx.objectStore('operaciones');
    const peticion = ops.get(operacionId);
    peticion.onsuccess = () => {
      const actual = peticion.result as OperacionLocal | undefined;
      if (!actual) throw new Error(`Operación ${operacionId} no encontrada`);
      const siguiente = { ...actual, ...cambios };
      ops.put(siguiente);
      salida.valor = siguiente;
    };
  });
}

/** Tras reiniciar el navegador, los envíos a medias vuelven a pendientes: el servidor es idempotente por UUID. */
export async function recuperarEnvios(): Promise<number> {
  const ops = await listarOperaciones();
  const interrumpidas = ops.filter((o) => o.estado === 'ENVIANDO');
  for (const op of interrumpidas) await actualizarSincronizacion(op.operacionId, { estado: 'PENDIENTE' });
  return interrumpidas.length;
}

export const cuentaPorEstado = (ops: OperacionLocal[]) => ({
  pendientes: ops.filter((o) => o.estado === 'PENDIENTE' || o.estado === 'ENVIANDO').length,
  sincronizadas: ops.filter((o) => o.estado === 'SINCRONIZADA').length,
  revision: ops.filter((o) => o.estado === 'REVISION').length,
  totalPendienteCentavos: ops.filter((o) => o.estado === 'PENDIENTE' || o.estado === 'ENVIANDO').reduce((a, o) => a + o.totalCentavos, 0),
});

/** Cantidad ya vendida offline por producto dentro de una ventana (las no sincronizadas también cuentan). */
export function vendidoPorProducto(ops: OperacionLocal[], ventanaId: string): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const op of ops) {
    if (op.ventanaId !== ventanaId) continue;
    for (const linea of op.lineas) mapa.set(linea.productoId, (mapa.get(linea.productoId) ?? 0) + linea.cantidadCentesimas);
  }
  return mapa;
}

/** Exporta el diario para recuperación y auditoría. No incluye tokens ni credenciales. */
export async function exportarDiario(): Promise<string> {
  const ops = await listarOperaciones();
  const dispositivo = await leerClave<Record<string, unknown>>('meta', 'dispositivo');
  return JSON.stringify({ version: 1, exportadoAt: new Date().toISOString(), dispositivo: dispositivo ?? null, operaciones: ops }, null, 2);
}

export const guardarContador = (valor: number) => escribirClave('meta', 'secuencia', valor);
