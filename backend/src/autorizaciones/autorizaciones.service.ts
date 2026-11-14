import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { actor, audit, authorizedActor, query, type Tx } from '../operaciones/ledger';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { TIPO_DESCUENTO_COTIZACION, huellaDescuento, tieneDescuento } from '../cotizaciones/autorizacion-descuento';

const POR_PAGINA = 50;
const TIPOS_CAJA = ['APERTURA_CAJA', 'CIERRE_CAJA'];

interface Fila {
  id: string; tipo: string; estado: string; entidad_id: string; operacion_hash: string; resumen: unknown;
  solicitante_id: string; solicitante_nombre: string | null; solicitada_at: Date;
  decisor_id: string | null; decisor_nombre: string | null; decidida_at: Date | null; motivo_decision: string | null;
}

const SELECT = `SELECT s.id, s.tipo::text AS tipo, s.estado::text AS estado, s.entidad_id, s.operacion_hash, s.resumen,
  s.solicitante_id, us.nombre AS solicitante_nombre, s.solicitada_at,
  s.decisor_id, ud.nombre AS decisor_nombre, s.decidida_at, s.motivo_decision
  FROM solicitudes_autorizacion s
  LEFT JOIN usuarios us ON us.id = s.solicitante_id AND us.tenant_id = s.tenant_id
  LEFT JOIN usuarios ud ON ud.id = s.decisor_id AND ud.tenant_id = s.tenant_id`;

const vista = (f: Fila) => ({
  id: f.id,
  tipo: f.tipo,
  estado: f.estado,
  entidadId: f.entidad_id,
  resumen: f.resumen,
  solicitanteId: f.solicitante_id,
  solicitante: f.solicitante_nombre,
  solicitadaAt: f.solicitada_at,
  decisorId: f.decisor_id,
  decisor: f.decisor_nombre,
  decididaAt: f.decidida_at,
  motivoDecision: f.motivo_decision,
});

const VERBO: Record<string, string> = { APROBADA: 'aprobada', RECHAZADA: 'rechazada', CANCELADA: 'cancelada', INVALIDADA: 'invalidada porque la cotización cambió' };

/**
 * Solicitudes de autorización: lo que un ADMIN aprueba o rechaza y lo que el solicitante puede cancelar.
 * Cada decisión queda con la cuenta exacta y la hora. La primera decisión gana: la segunda recibe 409.
 * Abrir o consultar una solicitud nunca la decide.
 */
@Injectable()
export class AutorizacionesService {
  constructor(private readonly prisma: PrismaService, private readonly cotizaciones: CotizacionesService) {}

  /** ADMIN ve todas las de su empresa; los demás, solo las que pidieron. */
  async listar(tenantId: string, usuarioId: string, estado?: string, page = 1, tipos?: string[]) {
    const usuario = await actor(this.prisma as unknown as Tx, tenantId, usuarioId);
    const pagina = Number.isInteger(page) && page > 0 ? page : 1;
    const soloPropias = usuario.rol !== 'ADMIN';
    const filas = await query<Fila>(this.prisma as unknown as Tx, `${SELECT}
      WHERE s.tenant_id = $1 AND ($2::text IS NULL OR s.estado::text = $2) AND ($3::text IS NULL OR s.solicitante_id = $3)
        AND ($5::text[] IS NULL OR s.tipo::text = ANY($5::text[]))
      ORDER BY (s.estado = 'PENDIENTE') DESC, s.solicitada_at DESC, s.id DESC
      LIMIT ${POR_PAGINA + 1} OFFSET $4`, tenantId, estado ?? null, soloPropias ? usuarioId : null, (pagina - 1) * POR_PAGINA, tipos?.length ? tipos : null);
    const [{ total }] = await query<{ total: number }>(this.prisma as unknown as Tx, `SELECT COUNT(*)::int AS total FROM solicitudes_autorizacion s
      WHERE s.tenant_id = $1 AND s.estado = 'PENDIENTE' AND ($2::text IS NULL OR s.solicitante_id = $2)
        AND ($3::text[] IS NULL OR s.tipo::text = ANY($3::text[]))`, tenantId, soloPropias ? usuarioId : null, tipos?.length ? tipos : null);
    return { solicitudes: filas.slice(0, POR_PAGINA).map(vista), pendientes: total, page: pagina, hayMas: filas.length > POR_PAGINA };
  }

  async consultar(tenantId: string, usuarioId: string, id: string) {
    const usuario = await actor(this.prisma as unknown as Tx, tenantId, usuarioId);
    const fila = await this.fila(this.prisma as unknown as Tx, tenantId, id);
    // Misma respuesta que «no existe» para no revelar solicitudes de otras personas.
    if (usuario.rol !== 'ADMIN' && fila.solicitante_id !== usuarioId) throw new NotFoundException('Solicitud de autorización no encontrada');
    return vista(fila);
  }

  aprobar(tenantId: string, usuarioId: string, id: string, motivo?: string) {
    return this.decidir(tenantId, usuarioId, id, 'APROBADA', motivo);
  }

  rechazar(tenantId: string, usuarioId: string, id: string, motivo?: string) {
    return this.decidir(tenantId, usuarioId, id, 'RECHAZADA', motivo);
  }

  /**
   * Quien pidió la autorización la retira. En un descuento de cotización, cancelar deja la cotización al precio
   * original (sin descuentos), lista para enviarse.
   */
  async cancelar(tenantId: string, usuarioId: string, id: string) {
    const usuario = await actor(this.prisma as unknown as Tx, tenantId, usuarioId);
    const fila = await this.fila(this.prisma as unknown as Tx, tenantId, id);
    if (usuario.rol !== 'ADMIN' && fila.solicitante_id !== usuarioId) throw new NotFoundException('Solicitud de autorización no encontrada');
    if (fila.estado !== 'PENDIENTE') throw new ConflictException(this.yaResuelta(fila));
    if (TIPOS_CAJA.includes(fila.tipo)) return this.prisma.$transaction((tx) => this.cancelarCaja(tx, tenantId, usuarioId, id));
    if (fila.tipo !== TIPO_DESCUENTO_COTIZACION) throw new ConflictException('Este tipo de solicitud no se puede cancelar desde aquí');
    await this.cotizaciones.quitarDescuento(tenantId, usuarioId, fila.entidad_id, usuario.rol);
    return vista(await this.fila(this.prisma as unknown as Tx, tenantId, id));
  }

  /**
   * Apertura o cierre de caja: retirar la solicitud no cambia la caja; queda registrado quién y cuándo. Cambio de estado,
   * auditoría y lectura final en una sola transacción: si la auditoría falla, la solicitud sigue PENDIENTE. La fila se
   * bloquea (`FOR UPDATE`) y se vuelven a validar empresa, solicitante y estado, así que una aprobación o un rechazo
   * concurrente y la cancelación se ordenan: la segunda en llegar recibe 409 y no deja estado ni auditoría propios.
   */
  private async cancelarCaja(tx: Tx, tenantId: string, usuarioId: string, id: string) {
    const usuario = await actor(tx, tenantId, usuarioId);
    const [actual] = await query<{ estado: string; solicitante_id: string }>(tx,
      'SELECT estado::text AS estado, solicitante_id FROM solicitudes_autorizacion WHERE id = $1 AND tenant_id = $2 FOR UPDATE', id, tenantId);
    if (!actual || (usuario.rol !== 'ADMIN' && actual.solicitante_id !== usuarioId)) throw new NotFoundException('Solicitud de autorización no encontrada');
    if (actual.estado !== 'PENDIENTE') throw new ConflictException(this.yaResuelta(await this.fila(tx, tenantId, id)));
    const cambiadas = await query<{ id: string; tipo: string; entidad_id: string }>(tx, `UPDATE solicitudes_autorizacion
      SET estado = 'CANCELADA', decisor_id = $3, decidida_at = now(), motivo_decision = 'Solicitud de caja retirada por quien la pidió'
      WHERE id = $1 AND tenant_id = $2 AND estado = 'PENDIENTE' RETURNING id, tipo::text AS tipo, entidad_id`, id, tenantId, usuarioId);
    if (cambiadas.length !== 1) throw new ConflictException('La solicitud ya fue resuelta');
    await audit(tx, tenantId, usuarioId, 'AUTORIZACION_CANCELADA', id, { tipo: cambiadas[0].tipo, entidadId: cambiadas[0].entidad_id });
    return vista(await this.fila(tx, tenantId, id));
  }

  private async decidir(tenantId: string, usuarioId: string, id: string, decision: 'APROBADA' | 'RECHAZADA', motivoCrudo?: string) {
    const motivo = typeof motivoCrudo === 'string' && motivoCrudo.trim() ? motivoCrudo.trim() : null;
    return this.prisma.$transaction(async (tx) => {
      // El rol se lee de la base en esta transacción: un token antiguo de un usuario que dejó de ser ADMIN no decide.
      const decisor = await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
      if (decisor.rol !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede decidir una solicitud de autorización');
      const previa = await this.fila(tx, tenantId, id);
      if (TIPOS_CAJA.includes(previa.tipo)) return this.decidirCaja(tx, tenantId, usuarioId, previa, decision, motivo);
      if (previa.tipo !== TIPO_DESCUENTO_COTIZACION) throw new ConflictException('Tipo de solicitud no admitido');
      // Mismo orden de bloqueo que las ediciones de la cotización: primero la cotización, después la solicitud.
      await query(tx, 'SELECT id FROM cotizaciones WHERE id = $1 AND tenant_id = $2 FOR UPDATE', previa.entidad_id, tenantId);
      const [actual] = await query<{ estado: string }>(tx, 'SELECT estado::text AS estado FROM solicitudes_autorizacion WHERE id = $1 AND tenant_id = $2 FOR UPDATE', id, tenantId);
      if (!actual || actual.estado !== 'PENDIENTE') throw new ConflictException(this.yaResuelta(await this.fila(tx, tenantId, id)));

      const cotizacion = await tx.cotizacion.findFirst({ where: { id: previa.entidad_id, tenantId }, include: { detalles: true } });
      if (!cotizacion) throw new NotFoundException('La cotización de esta solicitud ya no existe');
      if (decision === 'APROBADA') {
        if (cotizacion.estado === 'CONVERTIDA' || cotizacion.ventaId) throw new ConflictException('La cotización ya se convirtió en venta: no hay descuento que autorizar');
        // Se aprueba exactamente lo que se pidió: si la cotización ya no coincide, hace falta una solicitud nueva.
        if (!tieneDescuento(cotizacion) || huellaDescuento(cotizacion) !== previa.operacion_hash) {
          throw new ConflictException('La cotización cambió después de la solicitud. Pida una autorización nueva con el contenido actual');
        }
      }
      const cambiadas = await query<{ id: string }>(tx, `UPDATE solicitudes_autorizacion
        SET estado = $3::"EstadoSolicitudAutorizacion", decisor_id = $4, decidida_at = now(), motivo_decision = $5
        WHERE id = $1 AND tenant_id = $2 AND estado = 'PENDIENTE' RETURNING id`, id, tenantId, decision, usuarioId, motivo);
      if (cambiadas.length !== 1) throw new ConflictException('La solicitud ya fue resuelta');
      await audit(tx, tenantId, usuarioId, `AUTORIZACION_${decision}`, id, {
        tipo: previa.tipo, cotizacionId: previa.entidad_id, solicitanteId: previa.solicitante_id, motivo,
        descuento: Number(cotizacion.descuento), total: Number(cotizacion.total),
      });
      return vista(await this.fila(tx, tenantId, id));
    });
  }

  /**
   * Apertura o cierre de caja (etapa 3). Un cierre solo se aprueba si la caja sigue abierta y su último conteo es el que se
   * pidió autorizar: si el cajero volvió a contar, hace falta una solicitud nueva. Aprobar no abre ni cierra la caja: lo
   * completa el cajero con la autorización vigente.
   */
  private async decidirCaja(tx: Tx, tenantId: string, usuarioId: string, previa: Fila, decision: 'APROBADA' | 'RECHAZADA', motivo: string | null) {
    if (previa.tipo === 'CIERRE_CAJA') {
      const [caja] = await query(tx, 'SELECT id, estado::text AS estado FROM cajas WHERE id = $1 AND tenant_id = $2 FOR UPDATE', previa.entidad_id, tenantId);
      if (!caja) throw new NotFoundException('La caja de esta solicitud ya no existe');
      if (decision === 'APROBADA') {
        if (caja.estado !== 'ABIERTA') throw new ConflictException('La caja ya está cerrada');
        const [ultimo] = await query(tx, 'SELECT id FROM conteos_caja WHERE caja_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', caja.id);
        const pedido = (previa.resumen as any)?.conteoId;
        if (!ultimo || ultimo.id !== pedido) throw new ConflictException('El cajero volvió a contar después de la solicitud. Debe pedir una autorización nueva con el conteo actual');
      }
    }
    const [actual] = await query<{ estado: string }>(tx, 'SELECT estado::text AS estado FROM solicitudes_autorizacion WHERE id = $1 AND tenant_id = $2 FOR UPDATE', previa.id, tenantId);
    if (!actual || actual.estado !== 'PENDIENTE') throw new ConflictException(this.yaResuelta(await this.fila(tx, tenantId, previa.id)));
    const cambiadas = await query<{ id: string }>(tx, `UPDATE solicitudes_autorizacion
      SET estado = $3::"EstadoSolicitudAutorizacion", decisor_id = $4, decidida_at = now(), motivo_decision = $5
      WHERE id = $1 AND tenant_id = $2 AND estado = 'PENDIENTE' RETURNING id`, previa.id, tenantId, decision, usuarioId, motivo);
    if (cambiadas.length !== 1) throw new ConflictException('La solicitud ya fue resuelta');
    await audit(tx, tenantId, usuarioId, `AUTORIZACION_${decision}`, previa.id, { tipo: previa.tipo, entidadId: previa.entidad_id, solicitanteId: previa.solicitante_id, motivo, resumen: previa.resumen });
    return vista(await this.fila(tx, tenantId, previa.id));
  }

  private yaResuelta(f: Fila) {
    const quien = f.decisor_nombre ? ` por ${f.decisor_nombre}` : '';
    return `La solicitud ya fue ${VERBO[f.estado] ?? 'resuelta'}${quien}`;
  }

  private async fila(tx: Tx, tenantId: string, id: string): Promise<Fila> {
    const [fila] = await query<Fila>(tx, `${SELECT} WHERE s.id = $1 AND s.tenant_id = $2`, id, tenantId);
    if (!fila) throw new NotFoundException('Solicitud de autorización no encontrada');
    return fila;
  }
}
