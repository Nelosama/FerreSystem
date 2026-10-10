import type { AxiosInstance } from 'axios';
import { actualizarSincronizacion, listarOperaciones, recuperarEnvios, type Conflicto, type OperacionLocal } from './journal';

// Sincronización del diario con el servidor. Idempotente por UUID: reenviar la misma operación no duplica nada.

export const TAMANO_LOTE = 20;
/** Límite de espera por petición de contingencia. Sin él, una conexión colgada deja operaciones en "enviando". */
export const TIMEOUT_CONTINGENCIA_MS = 20_000;

export interface RespuestaOperacion {
  operacionId: string;
  estado: 'PENDIENTE' | 'APLICADA' | 'REVISION' | 'RECHAZADA_TECNICA' | 'ERROR_TEMPORAL' | 'RESUELTA_MANUAL';
  requiereRevision?: boolean;
  conflictos?: Conflicto[];
  numeroVenta?: number;
  correlativoDefinitivo?: string | null;
  ventaId?: string | null;
  mensaje?: string;
  codigo?: string | null;
}

/** Cambios que se aplican al diario según la respuesta del servidor. Función pura: fácil de probar. */
export function cambiosSegunRespuesta(op: OperacionLocal, r: RespuestaOperacion, ahora = new Date()): Partial<OperacionLocal> {
  switch (r.estado) {
    case 'APLICADA':
      return {
        estado: 'SINCRONIZADA', sincronizadaAt: ahora.toISOString(), numeroVenta: r.numeroVenta,
        correlativoDefinitivo: r.correlativoDefinitivo ?? undefined, ventaId: r.ventaId ?? undefined,
        conflictos: r.conflictos ?? [], requiereRevision: Boolean(r.requiereRevision), ultimoError: undefined,
      };
    case 'REVISION':
      return { estado: 'REVISION', conflictos: r.conflictos ?? [], requiereRevision: true, ultimoError: undefined };
    case 'RECHAZADA_TECNICA':
      // Un rechazo técnico no descarta la venta: queda en revisión con el motivo visible.
      return {
        estado: 'REVISION', requiereRevision: true,
        conflictos: [{ codigo: r.codigo ?? 'RECHAZADA_TECNICA', severidad: 'DURO', detalle: { mensaje: r.mensaje ?? 'El servidor no aceptó la operación' } }],
      };
    case 'ERROR_TEMPORAL':
    default:
      return {
        estado: 'PENDIENTE', intentos: op.intentos + 1, ultimoError: r.mensaje ?? 'Error temporal del servidor',
        proximoIntentoAt: new Date(ahora.getTime() + espera(op.intentos + 1)).toISOString(),
      };
  }
}

/** Espera exponencial con tope: 2 s, 4 s, 8 s … 60 s. */
export function espera(intentos: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, intentos - 1));
}

export function debeEnviarse(op: OperacionLocal, ahora = Date.now()): boolean {
  if (op.estado !== 'PENDIENTE') return false;
  return !op.proximoIntentoAt || new Date(op.proximoIntentoAt).getTime() <= ahora;
}

/** Solo el cajero de la operación o un administrador la envían; otros usuarios no tocan operaciones ajenas. */
export function puedeEnviar(op: OperacionLocal, usuario: { id: string; rol: string }): boolean {
  return usuario.rol === 'ADMIN' || usuario.id === op.cajeroId;
}

export interface ResultadoSync { enviadas: number; aplicadas: number; enRevision: number; pendientes: number; sinSesion: boolean; error?: string }

export async function sincronizarPendientes(
  api: AxiosInstance,
  dispositivoId: string,
  usuario: { id: string; rol: string },
): Promise<ResultadoSync> {
  await recuperarEnvios();
  const todas = await listarOperaciones();
  const candidatas = todas.filter((o) => debeEnviarse(o) && puedeEnviar(o, usuario));
  const sinSesion = todas.some((o) => o.estado === 'PENDIENTE' && !puedeEnviar(o, usuario));
  const resultado: ResultadoSync = { enviadas: 0, aplicadas: 0, enRevision: 0, pendientes: 0, sinSesion };

  for (let i = 0; i < candidatas.length; i += TAMANO_LOTE) {
    const lote = candidatas.slice(i, i + TAMANO_LOTE);
    for (const op of lote) await actualizarSincronizacion(op.operacionId, { estado: 'ENVIANDO' });
    try {
      const { data } = await api.post('/contingencia/operaciones', {
        dispositivoId,
        pendientesRestantes: todas.filter((o) => o.estado === 'PENDIENTE' && !lote.some((l) => l.operacionId === o.operacionId)).length,
        operaciones: lote.map(aOperacionDto),
      }, { timeout: TIMEOUT_CONTINGENCIA_MS });
      const porId = new Map<string, RespuestaOperacion>((data.resultados as RespuestaOperacion[]).map((r) => [r.operacionId, r]));
      for (const op of lote) {
        const r = porId.get(op.operacionId) ?? { operacionId: op.operacionId, estado: 'ERROR_TEMPORAL' as const, mensaje: 'Sin respuesta para esta operación' };
        const cambios = cambiosSegunRespuesta(op, r);
        await actualizarSincronizacion(op.operacionId, cambios);
        resultado.enviadas++;
        if (cambios.estado === 'SINCRONIZADA') resultado.aplicadas++;
        if (cambios.estado === 'REVISION') resultado.enRevision++;
      }
    } catch (error: any) {
      // Red caída o timeout: no sabemos si el servidor guardó. Volver a pendiente es seguro: el UUID evita duplicados.
      const status = error?.response?.status;
      for (const op of lote) {
        const cambios: Partial<OperacionLocal> = status === 401 || status === 403
          ? { estado: 'PENDIENTE', ultimoError: 'Inicie sesión para enviar las ventas pendientes' }
          : { ...cambiosSegunRespuesta(op, { operacionId: op.operacionId, estado: 'ERROR_TEMPORAL', mensaje: error?.message ?? 'Sin conexión' }) };
        await actualizarSincronizacion(op.operacionId, cambios);
      }
      resultado.error = status === 401 || status === 403 ? 'Sesión no válida para enviar' : 'Sin conexión con el servidor';
      break;
    }
  }
  try { await refrescarRevisiones(api, usuario); } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
  const restantes = await listarOperaciones();
  resultado.pendientes = restantes.filter((o) => o.estado === 'PENDIENTE' || o.estado === 'ENVIANDO').length;
  return resultado;
}

export interface EstadoServidor {
  operacionId: string;
  estado: 'RECIBIDA' | 'APLICADA' | 'REVISION' | 'RESUELTA_MANUAL' | 'NO_REGISTRADA';
  requiereRevision?: boolean;
  conflictos?: Conflicto[];
  numeroVenta?: number | null;
  correlativoDefinitivo?: string | null;
  ventaId?: string | null;
}

/** Lo que el servidor decidió después de una revisión del administrador. Null si nada cambió. */
export function cambiosDesdeServidor(op: OperacionLocal, s: EstadoServidor, ahora = new Date()): Partial<OperacionLocal> | null {
  switch (s.estado) {
    case 'APLICADA':
      if (op.estado === 'SINCRONIZADA' && op.correlativoDefinitivo === (s.correlativoDefinitivo ?? undefined) && op.requiereRevision === Boolean(s.requiereRevision)) return null;
      return {
        estado: 'SINCRONIZADA', sincronizadaAt: op.sincronizadaAt ?? ahora.toISOString(), numeroVenta: s.numeroVenta ?? undefined,
        correlativoDefinitivo: s.correlativoDefinitivo ?? undefined, ventaId: s.ventaId ?? undefined,
        conflictos: s.conflictos ?? [], requiereRevision: Boolean(s.requiereRevision), ultimoError: undefined,
      };
    case 'RESUELTA_MANUAL':
      if (op.estado === 'SINCRONIZADA' && !op.requiereRevision) return null;
      return { estado: 'SINCRONIZADA', requiereRevision: false, conflictos: s.conflictos ?? op.conflictos, ultimoError: 'Cerrada por administración sin aplicar' };
    case 'REVISION':
      if (op.estado === 'REVISION') return null;
      return { estado: 'REVISION', requiereRevision: true, conflictos: s.conflictos ?? [] };
    default:
      return null;
  }
}

/** Consulta al servidor las operaciones que esperan revisión para que la caja vea la decisión del administrador. */
export async function refrescarRevisiones(api: AxiosInstance, usuario: { id: string; rol: string }): Promise<number> {
  const todas = await listarOperaciones();
  const enRevision = todas.filter((o) => (o.estado === 'REVISION' || (o.estado === 'SINCRONIZADA' && o.requiereRevision)) && puedeEnviar(o, usuario));
  if (!enRevision.length) return 0;
  const { data } = await api.get('/contingencia/operaciones/estados', { params: { ids: enRevision.slice(0, 100).map((o) => o.operacionId).join(',') }, timeout: TIMEOUT_CONTINGENCIA_MS });
  let cambios = 0;
  for (const s of data as EstadoServidor[]) {
    const op = enRevision.find((o) => o.operacionId === s.operacionId);
    const delta = op && cambiosDesdeServidor(op, s);
    if (op && delta) { await actualizarSincronizacion(op.operacionId, delta); cambios++; }
  }
  return cambios;
}

export function aOperacionDto(op: OperacionLocal) {
  return {
    operacionId: op.operacionId,
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

// ───────────── ventana y registro del equipo (requieren conexión) ─────────────

import { guardarVentana, leerVentana, guardarDispositivo, type DispositivoLocal, type VentanaLocal } from './ventana';

/** Pide una ventana nueva al servidor; conserva el catálogo anterior si el hash no cambió. Requiere caja abierta del cajero. */
export async function renovarVentana(api: AxiosInstance, dispositivo: DispositivoLocal, usuario: { id: string; tenantId?: string }): Promise<VentanaLocal> {
  const previa = await leerVentana();
  const { data } = await api.post('/contingencia/ventanas', {
    dispositivoId: dispositivo.id,
    catalogoHashActual: previa?.catalogoHash,
    relojLocal: new Date().toISOString(),
  }, { timeout: TIMEOUT_CONTINGENCIA_MS });
  const v = data.ventana;
  const productos = data.catalogo ? data.catalogo.productos : previa?.productos ?? [];
  const nueva: VentanaLocal = {
    ventanaId: v.id, tenantId: usuario.tenantId ?? previa?.tenantId ?? '', dispositivoId: dispositivo.id, cajaId: v.cajaId,
    cajeroId: v.usuarioId, vigenteHasta: v.vigenteHasta, catalogoHash: v.catalogoHash, productos,
    sincronizadaAt: new Date().toISOString(), limites: v.limites ?? {},
  };
  await guardarVentana(nueva);
  return nueva;
}

/** Registra el equipo en el servidor. Un 409 por límite de cajas no impide el uso del equipo ya registrado. */
export async function registrarDispositivoEnServidor(api: AxiosInstance, dispositivo: DispositivoLocal): Promise<DispositivoLocal> {
  const { data } = await api.post('/contingencia/dispositivos', { dispositivoId: dispositivo.id, nombre: dispositivo.nombre }, { timeout: TIMEOUT_CONTINGENCIA_MS });
  const actualizado = { ...dispositivo, codigo: data.codigo, nombre: data.nombre, registrado: true };
  await guardarDispositivo(actualizado);
  return actualizado;
}
