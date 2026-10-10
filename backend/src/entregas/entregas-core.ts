import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { aCentesimas, huellaAccionVenta, normalizarTexto } from '../common/huella-solicitud';
import { audit, authorizedActor, id, query, type Tx } from '../operaciones/ledger';

// Núcleo de cobro y entrega (docs/POS_ENTREGA_DISENO_TECNICO.md revisión 3).
// Única implementación de las reglas de cantidades. Todas las funciones se ejecutan dentro de una transacción
// que ya tiene el bloqueo del tenant (lockTenant). Las cantidades se manejan en centésimas enteras; en SQL se
// pasan como texto con dos decimales para que NUMERIC no pase por coma flotante.

export const ROLES_CONSULTA = ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'] as const;
export const ROLES_ENTREGA = ['ADMIN', 'BODEGUERO'] as const;
export const ROLES_PREPARACION = ['ADMIN', 'BODEGUERO'] as const;
export const ROLES_LIBERACION = ['ADMIN'] as const;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MOTIVO_MINIMO = 10;

export const aTexto = (centesimas: number) => (centesimas / 100).toFixed(2);
export const cent = (valor: unknown) => Math.round(Number(valor) * 100);

export interface LineaPedido {
  detalleId: string;
  /** Unidades, con hasta dos decimales. */
  cantidad: number;
}

export interface LineaVentaFila {
  id: string;
  tenant_id: string;
  venta_id: string;
  producto_id: string;
  modo_entrega: 'MOSTRADOR' | 'BODEGA' | 'SIN_INVENTARIO';
  sin_inventario: boolean;
  nombre: string;
  codigo: string;
  stock_actual: unknown;
  stock_reservado: unknown;
  cantidad: unknown;
  cantidad_preparada: unknown;
  cantidad_entregada: unknown;
  cantidad_devuelta_reingresada: unknown;
  cantidad_devuelta_sin_reingreso: unknown;
  cantidad_cancelada: unknown;
}

/** Contadores de una línea en centésimas. */
export function contadores(l: LineaVentaFila) {
  return {
    C: cent(l.cantidad),
    P: cent(l.cantidad_preparada),
    E: cent(l.cantidad_entregada),
    R: cent(l.cantidad_devuelta_reingresada),
    S: cent(l.cantidad_devuelta_sin_reingreso),
    N: cent(l.cantidad_cancelada),
  };
}

/** Reserva restante: Rr = C − E − N (solo líneas BODEGA). */
export function reservaRestante(l: LineaVentaFila) {
  const c = contadores(l);
  return c.C - c.E - c.N;
}

/** Mercancía entregada que sigue en poder del cliente: Pc = E − R − S. */
export function enPoderDelCliente(l: LineaVentaFila) {
  const c = contadores(l);
  return c.E - c.R - c.S;
}

export function exigirSolicitud(solicitud: unknown): string {
  if (typeof solicitud !== 'string' || !UUID_V4.test(solicitud)) throw new BadRequestException('El identificador de la solicitud debe ser un UUID v4');
  return solicitud;
}

/** Convierte y ordena las líneas. El orden por id fija el orden de bloqueo y evita interbloqueos. */
export function normalizarLineas(lineas: LineaPedido[] | undefined, positiva = true) {
  if (!Array.isArray(lineas) || lineas.length === 0) throw new BadRequestException('Seleccione al menos una línea');
  const vistos = new Set<string>();
  return lineas
    .map((l) => {
      if (!l || typeof l.detalleId !== 'string') throw new BadRequestException('Línea inválida');
      if (vistos.has(l.detalleId)) throw new BadRequestException('Cada línea aparece una sola vez');
      vistos.add(l.detalleId);
      let cantidadCentesimas: number;
      try {
        cantidadCentesimas = aCentesimas(l.cantidad, 'La cantidad', positiva);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      return { detalleId: l.detalleId, cantidadCentesimas };
    })
    .sort((a, b) => (a.detalleId < b.detalleId ? -1 : a.detalleId > b.detalleId ? 1 : 0));
}

export function exigirMotivo(motivo: unknown): string {
  const limpio = normalizarTexto(typeof motivo === 'string' ? motivo : null);
  if (!limpio || limpio.length < MOTIVO_MINIMO) throw new BadRequestException(`El motivo debe tener al menos ${MOTIVO_MINIMO} caracteres`);
  return limpio;
}

export async function cargarVenta(tx: Tx, tenantId: string, ventaId: string) {
  const [venta] = await query(tx, "SELECT * FROM ventas WHERE id=$1 AND tenant_id=$2 AND estado='COMPLETADA' FOR UPDATE", ventaId, tenantId);
  if (!venta) throw new NotFoundException('Venta no encontrada');
  return venta;
}

/** Bloquea las líneas y sus productos en orden de id. Un id de otro tenant simplemente no aparece. */
export async function cargarLineas(tx: Tx, tenantId: string, ventaId: string): Promise<LineaVentaFila[]> {
  return query<LineaVentaFila>(tx,
    `SELECT d.id, d.tenant_id, d.venta_id, d.producto_id, d.modo_entrega, d.sin_inventario, p.nombre, p.codigo,
            p.stock_actual, p.stock_reservado, d.cantidad, d.cantidad_preparada, d.cantidad_entregada,
            d.cantidad_devuelta_reingresada, d.cantidad_devuelta_sin_reingreso, d.cantidad_cancelada
       FROM detalles_venta d JOIN productos p ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
      WHERE d.tenant_id = $1 AND d.venta_id = $2
      ORDER BY d.id
      FOR UPDATE OF d, p`,
    tenantId, ventaId);
}

/**
 * Idempotencia por solicitud (§3.6). Bloquea la clave de la solicitud dentro de la transacción.
 * Misma huella: devuelve el evento anterior. Huella distinta: conflicto explícito, sin efectos.
 */
export async function solicitudPrevia(tx: Tx, tenantId: string, solicitud: string, huella: string) {
  await query(tx, 'SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `ENT:${tenantId}:${solicitud}`);
  const [previo] = await query(tx, 'SELECT * FROM entregas_eventos WHERE tenant_id=$1 AND solicitud_id=$2', tenantId, solicitud);
  if (!previo) return null;
  if (previo.huella !== huella) {
    throw new ConflictException({ code: 'SOLICITUD_REUTILIZADA', message: 'Este identificador ya se usó con otro contenido. Recargue la pantalla e intente de nuevo.' });
  }
  return previo;
}

export async function repetirEvento(tx: Tx, tenantId: string, previo: any) {
  const lineas = await query(tx, 'SELECT detalle_venta_id, cantidad FROM entregas_eventos_lineas WHERE tenant_id=$1 AND evento_id=$2 ORDER BY detalle_venta_id', tenantId, previo.id);
  return { repetido: true, eventoId: previo.id, tipo: previo.tipo, ventaId: previo.venta_id, lineas };
}

interface EventoParams {
  tenantId: string;
  solicitud: string;
  huella: string;
  tipo: string;
  ventaId: string;
  usuarioId: string;
  origen: 'ONLINE' | 'OFFLINE';
  receptorNombre?: string | null;
  motivo?: string | null;
  lineas: { detalleId: string; cantidadCentesimas: number }[];
}

export async function registrarEvento(tx: Tx, p: EventoParams): Promise<string> {
  const eventoId = id();
  await query(tx,
    'INSERT INTO entregas_eventos (id,tenant_id,solicitud_id,huella,tipo,venta_id,usuario_id,receptor_nombre,motivo,origen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    eventoId, p.tenantId, p.solicitud, p.huella, p.tipo, p.ventaId, p.usuarioId, p.receptorNombre ?? null, p.motivo ?? null, p.origen);
  for (const l of p.lineas) {
    await query(tx,
      'INSERT INTO entregas_eventos_lineas (tenant_id,evento_id,detalle_venta_id,cantidad) VALUES ($1,$2,$3,$4::numeric) RETURNING detalle_venta_id',
      p.tenantId, eventoId, l.detalleId, aTexto(l.cantidadCentesimas));
  }
  return eventoId;
}

export function huellaDeLineas(tipo: string, ventaId: string, usuarioId: string, origen: 'ONLINE' | 'OFFLINE', lineas: { detalleId: string; cantidadCentesimas: number }[], receptor: string | null, motivo: string | null) {
  return huellaAccionVenta({
    tipo, ventaId, usuarioId, origen,
    lineas: lineas.map((l) => ({ detalleVentaId: l.detalleId, cantidadCentesimas: l.cantidadCentesimas })),
    receptorNombre: receptor, motivo,
  });
}

/** Movimiento de inventario con evento y línea (la base impide dos por línea y evento). */
export async function movimientoConEvento(tx: Tx, p: {
  tenantId: string; usuarioId: string; productoId: string; tipo: string;
  anterior: number; nuevo: number; documentoId: string; motivo: string; eventoId: string; detalleId: string;
}) {
  await query(tx,
    `INSERT INTO movimientos_inventario (id,tenant_id,usuario_id,producto_id,tipo,anterior,nuevo,cantidad,documento_id,motivo,evento_id,detalle_venta_id)
     VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,$9,$10,$11,$12) RETURNING id`,
    id(), p.tenantId, p.usuarioId, p.productoId, p.tipo, aTexto(p.anterior), aTexto(p.nuevo), aTexto(p.nuevo - p.anterior),
    p.documentoId, p.motivo, p.eventoId, p.detalleId);
}

/** Mantiene la marca de la venta a partir de los contadores: reserva pendiente y, si ya no queda nada, entrega completa. */
export async function sincronizarEstadoVenta(tx: Tx, tenantId: string, ventaId: string, usuarioId: string) {
  const [r] = await query(tx,
    `SELECT COUNT(*) FILTER (WHERE modo_entrega='BODEGA' AND cantidad - cantidad_entregada - cantidad_cancelada > 0)::int AS pendientes,
            COALESCE(SUM(cantidad_entregada),0) AS entregado
       FROM detalles_venta WHERE tenant_id=$1 AND venta_id=$2`,
    tenantId, ventaId);
  const pendiente = Number(r.pendientes) > 0;
  await query(tx,
    `UPDATE ventas SET reserva_pendiente=$3,
        entregado_at = CASE WHEN $3 THEN NULL WHEN $4 > 0 THEN COALESCE(entregado_at, NOW()) ELSE entregado_at END,
        entregado_por = CASE WHEN $3 THEN NULL WHEN $4 > 0 THEN COALESCE(entregado_por, $5) ELSE entregado_por END
      WHERE id=$1 AND tenant_id=$2 RETURNING id`,
    ventaId, tenantId, pendiente, Number(r.entregado), usuarioId);
}

function reglaLineaEntregable(l: LineaVentaFila) {
  if (l.modo_entrega === 'SIN_INVENTARIO') throw new BadRequestException(`«${l.nombre}» es una venta sin inventario; no tiene entrega pendiente`);
  if (l.modo_entrega !== 'BODEGA') throw new BadRequestException(`«${l.nombre}» se entregó al cobrar; no está pendiente de entrega`);
}

// ─── Entrega ───────────────────────────────────────────────────────────────

export interface EntregarParams {
  tenantId: string;
  usuarioId: string;
  ventaId: string;
  solicitudId: unknown;
  receptorNombre?: string | null;
  lineas: LineaPedido[];
  origen?: 'ONLINE' | 'OFFLINE';
}

/**
 * Entrega parcial o total de líneas de bodega. Descuenta existencias y reserva exactamente una vez por evento.
 * Reglas: q ≤ Rr; stock disponible ≥ q; nombre del receptor obligatorio; idempotencia por solicitud.
 */
export async function entregarLineas(tx: Tx, p: EntregarParams) {
  await authorizedActor(tx, p.tenantId, p.usuarioId, ROLES_ENTREGA);
  const solicitud = exigirSolicitud(p.solicitudId);
  const pedido = normalizarLineas(p.lineas);
  const origen = p.origen ?? 'ONLINE';
  const receptor = normalizarTexto(p.receptorNombre ?? null);
  const huella = huellaDeLineas('ENTREGA', p.ventaId, p.usuarioId, origen, pedido, receptor, null);
  const previo = await solicitudPrevia(tx, p.tenantId, solicitud, huella);
  if (previo) return repetirEvento(tx, p.tenantId, previo);

  const venta = await cargarVenta(tx, p.tenantId, p.ventaId);
  const filas = await cargarLineas(tx, p.tenantId, p.ventaId);
  const porId = new Map(filas.map((f) => [f.id, f]));
  const seleccion = pedido.map((x) => {
    const linea = porId.get(x.detalleId);
    if (!linea) throw new NotFoundException('Línea de venta no encontrada');
    return { linea, q: x.cantidadCentesimas };
  });
  for (const { linea, q } of seleccion) {
    reglaLineaEntregable(linea);
    const rr = reservaRestante(linea);
    if (q > rr) throw new ConflictException(`Solo quedan ${aTexto(rr)} de «${linea.nombre}» pendientes de entrega`);
    if (cent(linea.stock_actual) < q || cent(linea.stock_reservado) < q) {
      throw new ConflictException(`Existencias insuficientes o reserva inconsistente para «${linea.nombre}». Revise el inventario.`);
    }
  }
  if (!receptor) throw new BadRequestException('Indique el nombre de quien recibe la mercancía');

  const eventoId = await registrarEvento(tx, {
    tenantId: p.tenantId, solicitud, huella, tipo: 'ENTREGA', ventaId: venta.id, usuarioId: p.usuarioId,
    origen, receptorNombre: receptor, lineas: pedido,
  });
  for (const { linea, q } of seleccion) {
    const actualizado = await query(tx,
      `UPDATE detalles_venta
          SET cantidad_entregada = cantidad_entregada + $3::numeric,
              cantidad_preparada = LEAST(cantidad_preparada, cantidad - (cantidad_entregada + $3::numeric) - cantidad_cancelada)
        WHERE tenant_id=$1 AND id=$2 AND modo_entrega='BODEGA'
          AND cantidad_entregada + cantidad_cancelada + $3::numeric <= cantidad
        RETURNING id`,
      p.tenantId, linea.id, aTexto(q));
    if (actualizado.length !== 1) throw new ConflictException(`La cantidad de «${linea.nombre}» ya no está pendiente. Recargue la pantalla.`);
    const stockAntes = cent(linea.stock_actual);
    const stock = await query(tx,
      `UPDATE productos SET stock_actual = stock_actual - $3::numeric, stock_reservado = stock_reservado - $3::numeric, updated_at=NOW()
        WHERE tenant_id=$1 AND id=$2 AND stock_actual >= $3::numeric AND stock_reservado >= $3::numeric
        RETURNING stock_actual`,
      p.tenantId, linea.producto_id, aTexto(q));
    if (stock.length !== 1) throw new ConflictException(`Existencias insuficientes para «${linea.nombre}»`);
    await movimientoConEvento(tx, {
      tenantId: p.tenantId, usuarioId: p.usuarioId, productoId: linea.producto_id, tipo: 'ENTREGA',
      anterior: stockAntes, nuevo: stockAntes - q, documentoId: venta.id, motivo: 'Entrega de pedido',
      eventoId, detalleId: linea.id,
    });
  }
  await sincronizarEstadoVenta(tx, p.tenantId, venta.id, p.usuarioId);
  await audit(tx, p.tenantId, p.usuarioId, 'VENTA_ENTREGAR', eventoId, {
    ventaId: venta.id, receptor, lineas: pedido.map((x) => ({ detalleId: x.detalleId, cantidad: aTexto(x.cantidadCentesimas) })),
  });
  return { repetido: false, eventoId, tipo: 'ENTREGA', ventaId: venta.id, lineas: pedido };
}

// ─── Preparación ───────────────────────────────────────────────────────────

export async function prepararLineas(tx: Tx, p: { tenantId: string; usuarioId: string; ventaId: string; solicitudId: unknown; lineas: LineaPedido[] }) {
  await authorizedActor(tx, p.tenantId, p.usuarioId, ROLES_PREPARACION);
  const solicitud = exigirSolicitud(p.solicitudId);
  const pedido = normalizarLineas(p.lineas);
  const huella = huellaDeLineas('PREPARACION', p.ventaId, p.usuarioId, 'ONLINE', pedido, null, null);
  const previo = await solicitudPrevia(tx, p.tenantId, solicitud, huella);
  if (previo) return repetirEvento(tx, p.tenantId, previo);
  const venta = await cargarVenta(tx, p.tenantId, p.ventaId);
  const filas = await cargarLineas(tx, p.tenantId, p.ventaId);
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const x of pedido) {
    const linea = porId.get(x.detalleId);
    if (!linea) throw new NotFoundException('Línea de venta no encontrada');
    reglaLineaEntregable(linea);
    const pendientePreparar = reservaRestante(linea) - contadores(linea).P;
    if (x.cantidadCentesimas > pendientePreparar) throw new ConflictException(`Solo quedan ${aTexto(pendientePreparar)} de «${linea.nombre}» por preparar`);
  }
  const eventoId = await registrarEvento(tx, { tenantId: p.tenantId, solicitud, huella, tipo: 'PREPARACION', ventaId: venta.id, usuarioId: p.usuarioId, origen: 'ONLINE', lineas: pedido });
  for (const x of pedido) {
    const actualizado = await query(tx,
      `UPDATE detalles_venta SET cantidad_preparada = cantidad_preparada + $3::numeric
        WHERE tenant_id=$1 AND id=$2 AND modo_entrega='BODEGA'
          AND cantidad_preparada + $3::numeric <= cantidad - cantidad_entregada - cantidad_cancelada
        RETURNING id`,
      p.tenantId, x.detalleId, aTexto(x.cantidadCentesimas));
    if (actualizado.length !== 1) throw new ConflictException('La cantidad ya no admite preparación. Recargue la pantalla.');
  }
  await audit(tx, p.tenantId, p.usuarioId, 'VENTA_PREPARAR', eventoId, { ventaId: venta.id });
  return { repetido: false, eventoId, tipo: 'PREPARACION', ventaId: venta.id, lineas: pedido };
}

// ─── Liberación de reserva (solo ADMIN, sin movimiento de dinero) ─────────

export async function liberarLineas(tx: Tx, p: { tenantId: string; usuarioId: string; ventaId: string; solicitudId: unknown; motivo: unknown; lineas: LineaPedido[] }) {
  await authorizedActor(tx, p.tenantId, p.usuarioId, ROLES_LIBERACION);
  const solicitud = exigirSolicitud(p.solicitudId);
  const motivo = exigirMotivo(p.motivo);
  const pedido = normalizarLineas(p.lineas);
  const huella = huellaDeLineas('LIBERACION', p.ventaId, p.usuarioId, 'ONLINE', pedido, null, motivo);
  const previo = await solicitudPrevia(tx, p.tenantId, solicitud, huella);
  if (previo) return repetirEvento(tx, p.tenantId, previo);
  return aplicarLiberacion(tx, { tenantId: p.tenantId, usuarioId: p.usuarioId, ventaId: p.ventaId, solicitud, motivo, lineas: pedido, origen: 'ONLINE', huella });
}

async function aplicarLiberacion(tx: Tx, p: {
  tenantId: string; usuarioId: string; ventaId: string; solicitud: string; motivo: string;
  lineas: { detalleId: string; cantidadCentesimas: number }[]; origen: 'ONLINE' | 'OFFLINE'; huella: string;
}) {
  const venta = await cargarVenta(tx, p.tenantId, p.ventaId);
  const filas = await cargarLineas(tx, p.tenantId, p.ventaId);
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const x of p.lineas) {
    const linea = porId.get(x.detalleId);
    if (!linea) throw new NotFoundException('Línea de venta no encontrada');
    reglaLineaEntregable(linea);
    if (x.cantidadCentesimas > reservaRestante(linea)) throw new ConflictException(`Solo quedan ${aTexto(reservaRestante(linea))} de «${linea.nombre}» pendientes`);
    if (cent(linea.stock_reservado) < x.cantidadCentesimas) throw new ConflictException(`Reserva inconsistente para «${linea.nombre}». Revise el inventario.`);
  }
  const eventoId = await registrarEvento(tx, { tenantId: p.tenantId, solicitud: p.solicitud, huella: p.huella, tipo: 'LIBERACION', ventaId: venta.id, usuarioId: p.usuarioId, origen: p.origen, motivo: p.motivo, lineas: p.lineas });
  for (const x of p.lineas) {
    const linea = porId.get(x.detalleId)!;
    const actualizado = await query(tx,
      `UPDATE detalles_venta
          SET cantidad_cancelada = cantidad_cancelada + $3::numeric,
              cantidad_preparada = LEAST(cantidad_preparada, cantidad - cantidad_entregada - (cantidad_cancelada + $3::numeric))
        WHERE tenant_id=$1 AND id=$2 AND modo_entrega='BODEGA'
          AND cantidad_entregada + cantidad_cancelada + $3::numeric <= cantidad
        RETURNING id`,
      p.tenantId, linea.id, aTexto(x.cantidadCentesimas));
    if (actualizado.length !== 1) throw new ConflictException(`La cantidad de «${linea.nombre}» ya no está pendiente. Recargue la pantalla.`);
    const reserva = await query(tx,
      `UPDATE productos SET stock_reservado = stock_reservado - $3::numeric, updated_at=NOW()
        WHERE tenant_id=$1 AND id=$2 AND stock_reservado >= $3::numeric RETURNING id`,
      p.tenantId, linea.producto_id, aTexto(x.cantidadCentesimas));
    if (reserva.length !== 1) throw new ConflictException(`Reserva inconsistente para «${linea.nombre}»`);
  }
  await sincronizarEstadoVenta(tx, p.tenantId, venta.id, p.usuarioId);
  await audit(tx, p.tenantId, p.usuarioId, 'VENTA_LIBERAR_RESERVA', eventoId, { ventaId: venta.id, motivo: p.motivo });
  return { repetido: false, eventoId, tipo: 'LIBERACION', ventaId: venta.id, lineas: p.lineas, requiereDevolucionFormal: true };
}

// ─── Devoluciones: reingreso, sin reingreso y liberación (llamado por la devolución formal) ──

export type DestinoDevolucion = 'INVENTARIO' | 'DAÑADO' | 'PROVEEDOR' | 'NO_ENTREGADO';

/**
 * Aplica los destinos de una devolución a los contadores y existencias.
 * INVENTARIO: reingreso (R, mueve existencias). DAÑADO o PROVEEDOR: sin reingreso (S, no mueve existencias).
 * NO_ENTREGADO: libera reserva pendiente (N). Tope: R + S + q ≤ E para las dos primeras; q ≤ Rr para la última.
 * Las líneas sin inventario no participan (su devolución se trata en la devolución formal).
 */
export async function aplicarDestinosDevolucion(tx: Tx, p: {
  tenantId: string; usuarioId: string; ventaId: string; solicitudBase: string; motivo: string;
  items: { detalleId: string; cantidad: number; destino: DestinoDevolucion }[];
}) {
  const filas = await cargarLineas(tx, p.tenantId, p.ventaId);
  const porId = new Map(filas.map((f) => [f.id, f]));
  const grupos: Record<'REINGRESO' | 'SIN_REINGRESO' | 'LIBERACION', { detalleId: string; cantidadCentesimas: number }[]> = { REINGRESO: [], SIN_REINGRESO: [], LIBERACION: [] };
  for (const item of p.items) {
    const linea = porId.get(item.detalleId);
    if (!linea) throw new NotFoundException('Línea de venta no encontrada');
    if (linea.sin_inventario || linea.modo_entrega === 'SIN_INVENTARIO') continue;
    const cantidadCentesimas = aCentesimas(item.cantidad, 'La cantidad', true);
    if (item.destino === 'NO_ENTREGADO') grupos.LIBERACION.push({ detalleId: item.detalleId, cantidadCentesimas });
    else if (item.destino === 'INVENTARIO') grupos.REINGRESO.push({ detalleId: item.detalleId, cantidadCentesimas });
    else grupos.SIN_REINGRESO.push({ detalleId: item.detalleId, cantidadCentesimas });
  }
  const resultado: Record<string, string> = {};
  if (grupos.LIBERACION.length) {
    const r = await aplicarLiberacion(tx, { tenantId: p.tenantId, usuarioId: p.usuarioId, ventaId: p.ventaId, solicitud: `${p.solicitudBase}:LIBERACION`, motivo: p.motivo, lineas: grupos.LIBERACION, origen: 'ONLINE', huella: huellaDeLineas('LIBERACION', p.ventaId, p.usuarioId, 'ONLINE', grupos.LIBERACION, null, p.motivo) });
    resultado.LIBERACION = r.eventoId;
  }
  if (grupos.REINGRESO.length) {
    const eventoId = await registrarEvento(tx, { tenantId: p.tenantId, solicitud: `${p.solicitudBase}:REINGRESO`, huella: huellaDeLineas('DEVOLUCION_REINGRESO', p.ventaId, p.usuarioId, 'ONLINE', grupos.REINGRESO, null, p.motivo), tipo: 'DEVOLUCION_REINGRESO', ventaId: p.ventaId, usuarioId: p.usuarioId, origen: 'ONLINE', motivo: p.motivo, lineas: grupos.REINGRESO });
    for (const x of grupos.REINGRESO) {
      const linea = porId.get(x.detalleId)!;
      const ok = await query(tx,
        `UPDATE detalles_venta SET cantidad_devuelta_reingresada = cantidad_devuelta_reingresada + $3::numeric
          WHERE tenant_id=$1 AND id=$2 AND cantidad_devuelta_reingresada + cantidad_devuelta_sin_reingreso + $3::numeric <= cantidad_entregada
          RETURNING id`,
        p.tenantId, linea.id, aTexto(x.cantidadCentesimas));
      if (ok.length !== 1) throw new ConflictException(`La devolución de «${linea.nombre}» supera lo entregado pendiente de devolver`);
      const stockAntes = cent(linea.stock_actual);
      await query(tx, 'UPDATE productos SET stock_actual = stock_actual + $3::numeric, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING id', p.tenantId, linea.producto_id, aTexto(x.cantidadCentesimas));
      await movimientoConEvento(tx, { tenantId: p.tenantId, usuarioId: p.usuarioId, productoId: linea.producto_id, tipo: 'DEVOLUCION', anterior: stockAntes, nuevo: stockAntes + x.cantidadCentesimas, documentoId: p.ventaId, motivo: p.motivo, eventoId, detalleId: linea.id });
    }
    resultado.REINGRESO = eventoId;
  }
  if (grupos.SIN_REINGRESO.length) {
    const eventoId = await registrarEvento(tx, { tenantId: p.tenantId, solicitud: `${p.solicitudBase}:SIN_REINGRESO`, huella: huellaDeLineas('DEVOLUCION_SIN_REINGRESO', p.ventaId, p.usuarioId, 'ONLINE', grupos.SIN_REINGRESO, null, p.motivo), tipo: 'DEVOLUCION_SIN_REINGRESO', ventaId: p.ventaId, usuarioId: p.usuarioId, origen: 'ONLINE', motivo: p.motivo, lineas: grupos.SIN_REINGRESO });
    for (const x of grupos.SIN_REINGRESO) {
      const linea = porId.get(x.detalleId)!;
      const ok = await query(tx,
        `UPDATE detalles_venta SET cantidad_devuelta_sin_reingreso = cantidad_devuelta_sin_reingreso + $3::numeric
          WHERE tenant_id=$1 AND id=$2 AND cantidad_devuelta_reingresada + cantidad_devuelta_sin_reingreso + $3::numeric <= cantidad_entregada
          RETURNING id`,
        p.tenantId, linea.id, aTexto(x.cantidadCentesimas));
      if (ok.length !== 1) throw new ConflictException(`La devolución de «${linea.nombre}» supera lo entregado pendiente de devolver`);
    }
    resultado.SIN_REINGRESO = eventoId;
  }
  await sincronizarEstadoVenta(tx, p.tenantId, p.ventaId, p.usuarioId);
  return resultado;
}

// ─── Cobro: crea la venta con su modo y los eventos iniciales ─────────────

/** Eventos del cobro: COBRO siempre; ENTREGA si alguna línea es de mostrador (entrega inmediata). */
export async function registrarEventosCobro(tx: Tx, p: {
  tenantId: string; usuarioId: string; ventaId: string; origen: 'ONLINE' | 'OFFLINE'; solicitud: string;
  lineas: { detalleId: string; productoId: string; cantidadCentesimas: number; modo: 'MOSTRADOR' | 'BODEGA' | 'SIN_INVENTARIO'; stockAntes: number }[];
}) {
  const conInventario = p.lineas.filter((l) => l.modo !== 'SIN_INVENTARIO');
  const lineasCobro = conInventario.map((l) => ({ detalleId: l.detalleId, cantidadCentesimas: l.cantidadCentesimas }));
  if (lineasCobro.length === 0) return;
  await registrarEvento(tx, { tenantId: p.tenantId, solicitud: p.solicitud, huella: huellaDeLineas('COBRO', p.ventaId, p.usuarioId, p.origen, lineasCobro, null, null), tipo: 'COBRO', ventaId: p.ventaId, usuarioId: p.usuarioId, origen: p.origen, lineas: lineasCobro });
  const mostrador = conInventario.filter((l) => l.modo === 'MOSTRADOR');
  if (mostrador.length === 0) return;
  const solicitudEntrega = id();
  const lineasEntrega = mostrador.map((l) => ({ detalleId: l.detalleId, cantidadCentesimas: l.cantidadCentesimas }));
  const eventoId = await registrarEvento(tx, { tenantId: p.tenantId, solicitud: solicitudEntrega, huella: huellaDeLineas('ENTREGA', p.ventaId, p.usuarioId, p.origen, lineasEntrega, null, null), tipo: 'ENTREGA', ventaId: p.ventaId, usuarioId: p.usuarioId, origen: p.origen, receptorNombre: null, lineas: lineasEntrega });
  for (const l of mostrador) {
    await movimientoConEvento(tx, { tenantId: p.tenantId, usuarioId: p.usuarioId, productoId: l.productoId, tipo: 'ENTREGA', anterior: l.stockAntes, nuevo: l.stockAntes - l.cantidadCentesimas, documentoId: p.ventaId, motivo: 'Entrega en el cobro', eventoId, detalleId: l.detalleId });
  }
}
