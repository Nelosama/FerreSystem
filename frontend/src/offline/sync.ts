import type { AxiosInstance } from 'axios';
import { empresaDeOperacion, puedeVerOperacion } from './acceso';
import { sessionIdentity } from '../utils/authInterceptors';
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
    case 'RESUELTA_MANUAL':
      // H-B (CENTINELA): si la respuesta original se perdió y la administración cerró la operación sin aplicarla, el reenvío devuelve
      // este estado. Es definitivo: sin tratarlo, la operación quedaba PENDIENTE en bucle y el contador de pendientes nunca bajaba.
      return { estado: 'SINCRONIZADA', requiereRevision: false, conflictos: r.conflictos ?? op.conflictos, ultimoError: 'Cerrada por administración sin aplicar' };
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

export interface UsuarioSincronizacion { id: string; rol: string; tenantId: string }

/** Mismo alcance que lectura/exportación: ADMIN de la empresa o CAJERO propietario. Sin empresa, denegado. */
export function puedeEnviar(op: OperacionLocal, usuario: UsuarioSincronizacion, ventana?: VentanaLocal): boolean {
  return puedeVerOperacion(op, { usuarioId: usuario.id, rol: usuario.rol, tenantId: usuario.tenantId }, ventana);
}

/** Congela las credenciales del envío: un cambio de sesión nunca presta el token del nuevo usuario al lote anterior. */
function credencialesDeEnvio(usuario: UsuarioSincronizacion): () => { Authorization?: string } {
  if (typeof window === 'undefined') return () => ({});
  const identidad = `${usuario.id}:${usuario.tenantId}`;
  const token = localStorage.getItem('ferre_token');
  return () => {
    if (!token || sessionIdentity() !== identidad) throw new Error('La sesión cambió durante la sincronización');
    return { Authorization: `Bearer ${token}` };
  };
}

export interface ResultadoSync { enviadas: number; aplicadas: number; enRevision: number; pendientes: number; sinSesion: boolean; error?: string }

export async function sincronizarPendientes(
  api: AxiosInstance,
  dispositivoId: string,
  usuario: UsuarioSincronizacion,
): Promise<ResultadoSync> {
  const credenciales = credencialesDeEnvio(usuario);
  credenciales();
  const ventana = await leerVentana();
  const sesion = { usuarioId: usuario.id, rol: usuario.rol, tenantId: usuario.tenantId };
  await recuperarEnvios(sesion, ventana);
  const almacenadas = await listarOperaciones();
  const todas = almacenadas.filter((o) => puedeEnviar(o, usuario, ventana));
  const candidatas = todas.filter((o) => debeEnviarse(o));
  const sinSesion = almacenadas.some((o) => o.estado === 'PENDIENTE' && empresaDeOperacion(o, ventana) === usuario.tenantId && !puedeEnviar(o, usuario, ventana));
  const resultado: ResultadoSync = { enviadas: 0, aplicadas: 0, enRevision: 0, pendientes: 0, sinSesion };

  for (let i = 0; i < candidatas.length; i += TAMANO_LOTE) {
    const lote = candidatas.slice(i, i + TAMANO_LOTE);
    for (const op of lote) await actualizarSincronizacion(op.operacionId, { estado: 'ENVIANDO' });
    let data: { resultados: RespuestaOperacion[] };
    try {
      ({ data } = await api.post('/contingencia/operaciones', {
        dispositivoId,
        pendientesRestantes: todas.filter((o) => o.estado === 'PENDIENTE' && !lote.some((l) => l.operacionId === o.operacionId)).length,
        operaciones: lote.map(aOperacionDto),
      }, { timeout: TIMEOUT_CONTINGENCIA_MS, headers: credenciales() }));
    } catch (error: any) {
      const status = error?.response?.status;
      if (esRechazoDeLote(status)) {
        // Una operación mal formada no puede bloquear la cola: se reenvían una por una para aislarla.
        for (const op of lote) await enviarUnaPorUna(api, dispositivoId, todas, op, resultado, credenciales);
        continue;
      }
      // Red caída o timeout: no sabemos si el servidor guardó. Volver a pendiente es seguro: el UUID evita duplicados.
      for (const op of lote) {
        const cambios: Partial<OperacionLocal> = status === 401
          ? { estado: 'PENDIENTE', ultimoError: 'Inicie sesión para enviar las ventas pendientes' }
          : status === 403
            ? { estado: 'PENDIENTE', ultimoError: 'Su usuario no tiene permiso para enviar estas ventas' }
            : { ...cambiosSegunRespuesta(op, { operacionId: op.operacionId, estado: 'ERROR_TEMPORAL', mensaje: error?.message ?? 'Sin conexión' }) };
        await actualizarSincronizacion(op.operacionId, cambios);
      }
      resultado.error = mensajeErrorSincronizacion(status);
      break;
    }
    // Fuera del catch HTTP: un fallo de persistencia conserva los estados ya confirmados.
    const porId = new Map<string, RespuestaOperacion>((data.resultados as RespuestaOperacion[]).map((r) => [r.operacionId, r]));
    for (const op of lote) {
      const r = porId.get(op.operacionId) ?? { operacionId: op.operacionId, estado: 'ERROR_TEMPORAL' as const, mensaje: 'Sin respuesta para esta operación' };
      const cambios = cambiosSegunRespuesta(op, r);
      await actualizarSincronizacion(op.operacionId, cambios);
      resultado.enviadas++;
      if (cambios.estado === 'SINCRONIZADA') resultado.aplicadas++;
      if (cambios.estado === 'REVISION') resultado.enRevision++;
    }
  }
  credenciales();
  try { await refrescarRevisiones(api, usuario); } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
  const restantes = await listarOperaciones();
  resultado.pendientes = restantes.filter((o) => puedeEnviar(o, usuario, ventana) && (o.estado === 'PENDIENTE' || o.estado === 'ENVIANDO')).length;
  return resultado;
}

/**
 * Texto para el cajero según el fallo del lote. Un 5xx no es un corte de red: el servidor recibió la petición y falló.
 * Decir «Sin conexión» llevaría a revisar el internet en lugar de esperar el reintento automático.
 */
export function mensajeErrorSincronizacion(status: number | undefined): string {
  if (status === 401 || status === 403) return 'Sesión no válida para enviar';
  if (status !== undefined && status >= 500) return 'El servidor no pudo procesar las ventas. Se reintentará automáticamente.';
  return 'Sin conexión con el servidor';
}

/** Un 4xx que no es de autenticación ni de permisos: el servidor rechazó la solicitud (no se reintenta igual). */
function esRechazoDeLote(status: number | undefined): boolean {
  // 400 es un rechazo definitivo de la operación. 413 (cuerpo demasiado grande) tampoco se resuelve reenviando el mismo lote: se
  // envía de una en una (H-E de CENTINELA). 404, 408, 409 o 429 no dicen nada de la venta: se reintentan.
  return status === 400 || status === 413;
}

/** Reenvío aislado de una operación. Un rechazo definitivo queda en revisión con el motivo; un fallo de red o 5xx se reintenta. */
async function enviarUnaPorUna(
  api: AxiosInstance,
  dispositivoId: string,
  todas: OperacionLocal[],
  op: OperacionLocal,
  resultado: ResultadoSync,
  credenciales: () => { Authorization?: string },
): Promise<void> {
  await actualizarSincronizacion(op.operacionId, { estado: 'ENVIANDO' });
  let data: { resultados: RespuestaOperacion[] };
  try {
    ({ data } = await api.post('/contingencia/operaciones', {
      dispositivoId,
      pendientesRestantes: todas.filter((o) => o.estado === 'PENDIENTE' && o.operacionId !== op.operacionId).length,
      operaciones: [aOperacionDto(op)],
    }, { timeout: TIMEOUT_CONTINGENCIA_MS, headers: credenciales() }));
  } catch (error: any) {
    const status = error?.response?.status;
    if (esRechazoDeLote(status)) {
      const datos = error?.response?.data?.message;
      const mensaje = Array.isArray(datos) ? datos.join('; ') : (datos ?? 'El servidor no aceptó la operación');
      await actualizarSincronizacion(op.operacionId, {
        estado: 'REVISION', requiereRevision: true, ultimoError: mensaje,
        conflictos: [{ codigo: 'RECHAZADA_TECNICA', severidad: 'DURO', detalle: { mensaje } }],
      });
      resultado.enviadas++;
      resultado.enRevision++;
      return;
    }
    const cambios: Partial<OperacionLocal> = status === 401
      ? { estado: 'PENDIENTE', ultimoError: 'Inicie sesión para enviar las ventas pendientes' }
      : status === 403
        ? { estado: 'PENDIENTE', ultimoError: 'Su usuario no tiene permiso para enviar estas ventas' }
        : { ...cambiosSegunRespuesta(op, { operacionId: op.operacionId, estado: 'ERROR_TEMPORAL', mensaje: error?.message ?? 'Sin conexión' }) };
    await actualizarSincronizacion(op.operacionId, cambios);
    return;
  }
  // La confirmación solo cuenta después del commit de IndexedDB. Si falla, queda ENVIANDO.
  const r = (data.resultados as RespuestaOperacion[]).find((x) => x.operacionId === op.operacionId)
    ?? { operacionId: op.operacionId, estado: 'ERROR_TEMPORAL' as const, mensaje: 'Sin respuesta para esta operación' };
  const cambios = cambiosSegunRespuesta(op, r);
  await actualizarSincronizacion(op.operacionId, cambios);
  resultado.enviadas++;
  if (cambios.estado === 'SINCRONIZADA') resultado.aplicadas++;
  if (cambios.estado === 'REVISION') resultado.enRevision++;
}

export interface EstadoServidor {
  operacionId: string;
  // RECHAZADA_TECNICA: rechazo definitivo (estado terminal RECHAZADA en servidor); el equipo lo muestra como REVISION con su motivo.
  estado: 'RECIBIDA' | 'APLICADA' | 'REVISION' | 'RECHAZADA_TECNICA' | 'RESUELTA_MANUAL' | 'NO_REGISTRADA';
  requiereRevision?: boolean;
  conflictos?: Conflicto[];
  mensaje?: string | null;
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
    case 'RECHAZADA_TECNICA':
      if (op.estado === 'REVISION' && op.requiereRevision) return null;
      return { estado: 'REVISION', requiereRevision: true, conflictos: s.conflictos ?? [], ultimoError: s.mensaje ?? undefined };
    default:
      return null;
  }
}

/** Consulta al servidor las operaciones que esperan revisión para que la caja vea la decisión del administrador. */
export async function refrescarRevisiones(api: AxiosInstance, usuario: UsuarioSincronizacion): Promise<number> {
  const credenciales = credencialesDeEnvio(usuario);
  credenciales();
  const ventana = await leerVentana();
  const todas = await listarOperaciones();
  const enRevision = todas.filter((o) => (o.estado === 'REVISION' || (o.estado === 'SINCRONIZADA' && o.requiereRevision)) && puedeEnviar(o, usuario, ventana));
  if (!enRevision.length) return 0;
  const { data } = await api.get('/contingencia/operaciones/estados', { params: { ids: enRevision.slice(0, 100).map((o) => o.operacionId).join(',') }, timeout: TIMEOUT_CONTINGENCIA_MS, headers: credenciales() });
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
    sincronizadaAt: new Date().toISOString(), limites: v.limites ?? {}, operacionesEmitidas: v.operacionesEmitidas ?? [],
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
