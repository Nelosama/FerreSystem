import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { actor, audit, authorizedActor, query, type Tx } from '../operaciones/ledger';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { TIPO_DESCUENTO_COTIZACION, huellaDescuento, tieneDescuento } from '../cotizaciones/autorizacion-descuento';

const POR_PAGINA = 50;

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
  async listar(tenantId: string, usuarioId: string, estado?: string, page = 1) {
    const usuario = await actor(this.prisma as unknown as Tx, tenantId, usuarioId);
    const pagina = Number.isInteger(page) && page > 0 ? page : 1;
    const soloPropias = usuario.rol !== 'ADMIN';
    const filas = await query<Fila>(this.prisma as unknown as Tx, `${SELECT}
      WHERE s.tenant_id = $1 AND ($2::text IS NULL OR s.estado::text = $2) AND ($3::text IS NULL OR s.solicitante_id = $3)
      ORDER BY (s.estado = 'PENDIENTE') DESC, s.solicitada_at DESC, s.id DESC
      LIMIT ${POR_PAGINA + 1} OFFSET $4`, tenantId, estado ?? null, soloPropias ? usuarioId : null, (pagina - 1) * POR_PAGINA);
    const [{ total }] = await query<{ total: number }>(this.prisma as unknown as Tx, `SELECT COUNT(*)::int AS total FROM solicitudes_autorizacion s
      WHERE s.tenant_id = $1 AND s.estado = 'PENDIENTE' AND ($2::text IS NULL OR s.solicitante_id = $2)`, tenantId, soloPropias ? usuarioId : null);
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
    if (fila.tipo !== TIPO_DESCUENTO_COTIZACION) throw new ConflictException('Este tipo de solicitud no se puede cancelar desde aquí');
    await this.cotizaciones.quitarDescuento(tenantId, usuarioId, fila.entidad_id, usuario.rol);
    return vista(await this.fila(this.prisma as unknown as Tx, tenantId, id));
  }

  private async decidir(tenantId: string, usuarioId: string, id: string, decision: 'APROBADA' | 'RECHAZADA', motivoCrudo?: string) {
    const motivo = typeof motivoCrudo === 'string' && motivoCrudo.trim() ? motivoCrudo.trim() : null;
    return this.prisma.$transaction(async (tx) => {
      // El rol se lee de la base en esta transacción: un token antiguo de un usuario que dejó de ser ADMIN no decide.
      const decisor = await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
      if (decisor.rol !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede decidir una solicitud de autorización');
      const previa = await this.fila(tx, tenantId, id);
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
