import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { audit, id, query, type Tx } from '../operaciones/ledger';

/**
 * Autorización de descuentos en cotizaciones (decisión del dueño del 2026-11-12).
 *
 * Todo descuento de una cotización lo autoriza un ADMIN. La autorización corresponde a un contenido exacto: la huella
 * cubre líneas, precios, descuentos, cliente y totales. Si algo de eso cambia, la aprobación deja de servir.
 * Mientras no haya una aprobación vigente, la cotización no se envía ni se convierte en venta.
 *
 * Alcance: solo cotizaciones. Los descuentos directos del POS no pasan por aquí.
 */
export const TIPO_DESCUENTO_COTIZACION = 'DESCUENTO_COTIZACION';

export type EstadoAutorizacionDescuento = 'NO_REQUERIDA' | 'SIN_SOLICITUD' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

interface LineaCotizacion {
  productoId: string;
  totalMedida: unknown;
  precioUnitario: unknown;
  descuento: unknown;
  subtotal: unknown;
  exento?: unknown;
  descripcionProducto?: string | null;
}
export interface CotizacionConDescuento {
  id: string;
  numeroCotizacion: number;
  clienteId?: string | null;
  clienteNombre?: string | null;
  subtotal: unknown;
  porcentajeIsv: unknown;
  isv: unknown;
  descuento: unknown;
  descuentoGeneral: unknown;
  total: unknown;
  detalles: LineaCotizacion[];
}

const centavos = (valor: unknown) => Math.round(Number(valor ?? 0) * 100);

export function tieneDescuento(c: Pick<CotizacionConDescuento, 'descuento' | 'descuentoGeneral' | 'detalles'>): boolean {
  return centavos(c.descuento) > 0 || centavos(c.descuentoGeneral) > 0 || c.detalles.some((d) => centavos(d.descuento) > 0);
}

/** Huella del contenido que el ADMIN autoriza. No depende del orden de las líneas ni de notas, vigencia o estado. */
export function huellaDescuento(c: CotizacionConDescuento): string {
  const lineas = c.detalles
    .map((d) => [d.productoId, centavos(d.totalMedida), centavos(d.precioUnitario), centavos(d.descuento), centavos(d.subtotal), Boolean(d.exento)].join('|'))
    .sort();
  const cabecera = [c.id, c.clienteId ?? '', centavos(c.subtotal), centavos(c.descuentoGeneral), centavos(c.descuento), centavos(c.porcentajeIsv), centavos(c.isv), centavos(c.total)].join('|');
  return createHash('sha256').update(`ferresystem:descuento-cotizacion:v1:${cabecera}\n${lineas.join('\n')}`).digest('hex');
}

/** Lo que el ADMIN ve al decidir: una fotografía del descuento solicitado, guardada con la solicitud. */
export function resumenDescuento(c: CotizacionConDescuento) {
  return {
    numeroCotizacion: c.numeroCotizacion,
    clienteNombre: c.clienteNombre || 'Consumidor Final',
    subtotal: Number(c.subtotal),
    descuento: Number(c.descuento),
    descuentoGeneral: Number(c.descuentoGeneral),
    isv: Number(c.isv),
    total: Number(c.total),
    lineasConDescuento: c.detalles
      .filter((d) => centavos(d.descuento) > 0)
      .map((d) => ({ producto: d.descripcionProducto || d.productoId, precioUnitario: Number(d.precioUnitario), cantidad: Number(d.totalMedida), descuento: Number(d.descuento) })),
  };
}

export interface SolicitudFila {
  id: string;
  estado: string;
  entidad_id: string;
  operacion_hash: string;
  solicitante_id: string;
  solicitante_nombre: string | null;
  solicitada_at: Date;
  decisor_id: string | null;
  decisor_nombre: string | null;
  decidida_at: Date | null;
  motivo_decision: string | null;
}

const SELECT_SOLICITUD = `SELECT s.id, s.estado::text AS estado, s.entidad_id, s.operacion_hash, s.solicitante_id, us.nombre AS solicitante_nombre,
  s.solicitada_at, s.decisor_id, ud.nombre AS decisor_nombre, s.decidida_at, s.motivo_decision
  FROM solicitudes_autorizacion s
  LEFT JOIN usuarios us ON us.id = s.solicitante_id AND us.tenant_id = s.tenant_id
  LEFT JOIN usuarios ud ON ud.id = s.decisor_id AND ud.tenant_id = s.tenant_id`;

/** Solicitudes de descuento de un grupo de cotizaciones, de la más reciente a la más antigua. */
export async function solicitudesDeCotizaciones(tx: Tx, tenantId: string, cotizacionIds: string[]): Promise<SolicitudFila[]> {
  if (cotizacionIds.length === 0) return [];
  return query<SolicitudFila>(tx, `${SELECT_SOLICITUD}
    WHERE s.tenant_id = $1 AND s.tipo = '${TIPO_DESCUENTO_COTIZACION}'::"TipoSolicitudAutorizacion" AND s.entidad_id = ANY($2::text[])
    ORDER BY s.solicitada_at DESC, s.id DESC`, tenantId, cotizacionIds);
}

export interface AutorizacionDescuentoVista {
  requerida: boolean;
  estado: EstadoAutorizacionDescuento;
  solicitudId: string | null;
  solicitanteId: string | null;
  solicitante: string | null;
  solicitadaAt: Date | null;
  decisor: string | null;
  decididaAt: Date | null;
  motivoDecision: string | null;
}

const SIN_AUTORIZACION: Omit<AutorizacionDescuentoVista, 'requerida' | 'estado'> = {
  solicitudId: null, solicitanteId: null, solicitante: null, solicitadaAt: null, decisor: null, decididaAt: null, motivoDecision: null,
};

/**
 * Estado de la autorización según las solicitudes de la cotización (más reciente primero).
 * Solo cuentan las que corresponden al contenido actual: una aprobación de un contenido anterior no autoriza el nuevo.
 */
export function evaluarAutorizacion(c: CotizacionConDescuento, solicitudes: SolicitudFila[]): AutorizacionDescuentoVista {
  if (!tieneDescuento(c)) return { requerida: false, estado: 'NO_REQUERIDA', ...SIN_AUTORIZACION };
  const huella = huellaDescuento(c);
  const vigentes = solicitudes.filter((s) => s.entidad_id === c.id && s.operacion_hash === huella);
  const elegida = vigentes.find((s) => s.estado === 'APROBADA') ?? vigentes.find((s) => s.estado === 'PENDIENTE') ?? vigentes.find((s) => s.estado === 'RECHAZADA');
  if (!elegida) return { requerida: true, estado: 'SIN_SOLICITUD', ...SIN_AUTORIZACION };
  return {
    requerida: true,
    estado: elegida.estado as EstadoAutorizacionDescuento,
    solicitudId: elegida.id,
    solicitanteId: elegida.solicitante_id,
    solicitante: elegida.solicitante_nombre,
    solicitadaAt: elegida.solicitada_at,
    decisor: elegida.decisor_nombre,
    decididaAt: elegida.decidida_at,
    motivoDecision: elegida.motivo_decision,
  };
}

const referencia = (c: Pick<CotizacionConDescuento, 'numeroCotizacion'>) => `COT-${c.numeroCotizacion.toString().padStart(4, '0')}`;

const MENSAJES_BLOQUEO: Record<Exclude<EstadoAutorizacionDescuento, 'NO_REQUERIDA' | 'APROBADA'>, string> = {
  PENDIENTE: 'tiene un descuento pendiente de autorización del administrador',
  RECHAZADA: 'tiene un descuento que el administrador rechazó',
  SIN_SOLICITUD: 'tiene un descuento sin autorización del administrador',
};

/** Rechaza con 409 si la cotización lleva un descuento sin aprobación vigente. Llamar con la fila de la cotización bloqueada. */
export async function exigirDescuentoAutorizado(tx: Tx, tenantId: string, c: CotizacionConDescuento, accion: 'enviar' | 'convertir') {
  if (!tieneDescuento(c)) return;
  const vista = evaluarAutorizacion(c, await solicitudesDeCotizaciones(tx, tenantId, [c.id]));
  if (vista.estado === 'APROBADA') return;
  const estado = vista.estado as keyof typeof MENSAJES_BLOQUEO;
  const queHacer = accion === 'enviar' ? 'No se puede enviar' : 'No se puede convertir en venta';
  throw new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    codigo: 'DESCUENTO_SIN_AUTORIZACION',
    estadoAutorizacion: vista.estado,
    message: `La cotización ${referencia(c)} ${MENSAJES_BLOQUEO[estado]}. ${queHacer} hasta que se apruebe; también puede quitar el descuento y continuar al precio original`,
  });
}

async function cerrarPendientes(tx: Tx, tenantId: string, usuarioId: string, cotizacionId: string, estado: 'CANCELADA' | 'INVALIDADA', motivo: string, conservarHuella?: string) {
  const cerradas = await query<{ id: string }>(tx, `UPDATE solicitudes_autorizacion
    SET estado = $4::"EstadoSolicitudAutorizacion", decisor_id = $3, decidida_at = now(), motivo_decision = $5
    WHERE tenant_id = $1 AND tipo = '${TIPO_DESCUENTO_COTIZACION}'::"TipoSolicitudAutorizacion" AND entidad_id = $2 AND estado = 'PENDIENTE'
      AND ($6::text IS NULL OR operacion_hash <> $6)
    RETURNING id`, tenantId, cotizacionId, usuarioId, estado, motivo, conservarHuella ?? null);
  for (const s of cerradas) {
    await audit(tx, tenantId, usuarioId, `AUTORIZACION_${estado}`, s.id, { tipo: TIPO_DESCUENTO_COTIZACION, cotizacionId, motivo });
  }
  return cerradas.length;
}

/** El solicitante (o quien edite la cotización) retira la solicitud pendiente. Queda registrado quién y cuándo. */
export const cancelarPendientes = (tx: Tx, tenantId: string, usuarioId: string, cotizacionId: string) =>
  cerrarPendientes(tx, tenantId, usuarioId, cotizacionId, 'CANCELADA', 'Solicitud cancelada: la cotización continúa al precio original');

/**
 * Deja la autorización acorde al contenido actual de la cotización. Llamar dentro de la transacción que la creó o cambió,
 * con la fila bloqueada.
 * - Una solicitud pendiente de un contenido anterior se invalida (quien editó queda registrado).
 * - Sin descuento no se requiere nada.
 * - Si quien guarda es ADMIN, el descuento queda autorizado por su cuenta y registrado.
 * - Si no, se crea la solicitud pendiente a nombre de quien guarda (o se conserva la que ya había para ese contenido).
 * - Un descuento ya rechazado con ese mismo contenido solo se vuelve a solicitar con `volverASolicitar`.
 */
export async function sincronizarAutorizacion(tx: Tx, tenantId: string, usuario: { id: string; rol: string }, c: CotizacionConDescuento, opciones: { volverASolicitar?: boolean } = {}): Promise<AutorizacionDescuentoVista> {
  const requiere = tieneDescuento(c);
  const huella = huellaDescuento(c);
  await cerrarPendientes(tx, tenantId, usuario.id, c.id, 'INVALIDADA', 'La cotización cambió después de solicitar la autorización', requiere ? huella : undefined);
  if (!requiere) return evaluarAutorizacion(c, []);

  const existentes = await solicitudesDeCotizaciones(tx, tenantId, [c.id]);
  const actual = evaluarAutorizacion(c, existentes);
  if (actual.estado === 'APROBADA') return actual;
  const esAdmin = usuario.rol === 'ADMIN';
  if (actual.estado === 'PENDIENTE' && !esAdmin) return actual;
  // Un descuento rechazado no se vuelve a pedir solo por guardar otra vez: hace falta pedirlo de forma expresa.
  if (actual.estado === 'RECHAZADA' && !esAdmin && !opciones.volverASolicitar) return actual;

  const resumen = JSON.stringify(resumenDescuento(c));
  if (esAdmin) {
    if (actual.estado === 'PENDIENTE') {
      // El ADMIN guardó el mismo contenido que estaba pendiente: lo aprueba con su cuenta, conservando al solicitante.
      await query(tx, `UPDATE solicitudes_autorizacion SET estado = 'APROBADA', decisor_id = $3, decidida_at = now()
        WHERE id = $1 AND tenant_id = $2 AND estado = 'PENDIENTE' RETURNING id`, actual.solicitudId, tenantId, usuario.id);
      await audit(tx, tenantId, usuario.id, 'AUTORIZACION_APROBADA', actual.solicitudId!, { tipo: TIPO_DESCUENTO_COTIZACION, cotizacionId: c.id, cotizacion: referencia(c), alGuardar: true });
    } else {
      const solicitudId = id();
      await query(tx, `INSERT INTO solicitudes_autorizacion (id, tenant_id, tipo, estado, entidad_id, operacion_hash, resumen, solicitante_id, decisor_id, decidida_at)
        VALUES ($1, $2, '${TIPO_DESCUENTO_COTIZACION}', 'APROBADA', $3, $4, $5::jsonb, $6, $6, now()) RETURNING id`, solicitudId, tenantId, c.id, huella, resumen, usuario.id);
      await audit(tx, tenantId, usuario.id, 'AUTORIZACION_APROBADA', solicitudId, { tipo: TIPO_DESCUENTO_COTIZACION, cotizacionId: c.id, cotizacion: referencia(c), descuento: Number(c.descuento), total: Number(c.total), aplicadaPorAdministrador: true });
    }
  } else {
    const solicitudId = id();
    await query(tx, `INSERT INTO solicitudes_autorizacion (id, tenant_id, tipo, estado, entidad_id, operacion_hash, resumen, solicitante_id)
      VALUES ($1, $2, '${TIPO_DESCUENTO_COTIZACION}', 'PENDIENTE', $3, $4, $5::jsonb, $6) RETURNING id`, solicitudId, tenantId, c.id, huella, resumen, usuario.id);
    await audit(tx, tenantId, usuario.id, 'AUTORIZACION_SOLICITADA', solicitudId, { tipo: TIPO_DESCUENTO_COTIZACION, cotizacionId: c.id, cotizacion: referencia(c), descuento: Number(c.descuento), total: Number(c.total) });
  }
  return evaluarAutorizacion(c, await solicitudesDeCotizaciones(tx, tenantId, [c.id]));
}
