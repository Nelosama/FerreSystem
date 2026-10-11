import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { actor, lockTenant, query } from '../operaciones/ledger';
import { contadores, entregarLineas, liberarLineas, prepararLineas, ROLES_CONSULTA, type LineaVentaFila } from './entregas-core';
import type { EntregarLineasDto, LiberarLineasDto, PrepararLineasDto } from './dto/entregas.dto';

// Umbrales de alerta de pedidos pendientes. Configurables por empresa en configuracion.entregas.
// Las alertas solo informan: ninguna venta pagada se cancela ni se libera por tiempo.
const UMBRALES = { alertaInformativaHoras: 2, alertaAvisoHoras: 24, alertaEscalamientoDias: 3 };

export type EstadoLinea = 'PENDIENTE' | 'PARCIAL' | 'ENTREGADA' | 'DEVUELTA_PARCIAL' | 'DEVUELTA' | 'CANCELADA';

/** Estado derivado de los contadores (nunca se guarda). */
export function estadoDeLinea(l: Pick<LineaVentaFila, 'cantidad' | 'cantidad_preparada' | 'cantidad_entregada' | 'cantidad_devuelta_reingresada' | 'cantidad_devuelta_sin_reingreso' | 'cantidad_cancelada'>): EstadoLinea {
  const c = contadores(l as LineaVentaFila);
  const rr = c.C - c.E - c.N;
  if (c.R + c.S > 0) return c.R + c.S >= c.E && c.E > 0 ? 'DEVUELTA' : 'DEVUELTA_PARCIAL';
  if (c.N === c.C && c.E === 0) return 'CANCELADA';
  if (rr === 0 && c.E === c.C) return 'ENTREGADA';
  if (c.E === 0 && c.N === 0) return 'PENDIENTE';
  return rr > 0 ? 'PARCIAL' : 'ENTREGADA';
}

export function nivelDeAlerta(horas: number, umbrales = UMBRALES): 'NINGUNA' | 'INFORMATIVA' | 'AVISO' | 'ESCALAMIENTO' {
  if (horas >= umbrales.alertaEscalamientoDias * 24) return 'ESCALAMIENTO';
  if (horas >= umbrales.alertaAvisoHoras) return 'AVISO';
  if (horas >= umbrales.alertaInformativaHoras) return 'INFORMATIVA';
  return 'NINGUNA';
}

@Injectable()
export class EntregasService {
  constructor(private readonly prisma: PrismaService) {}

  private async umbrales(tenantId: string) {
    const [t] = await query(this.prisma as any, 'SELECT configuracion FROM tenants WHERE id=$1', tenantId);
    const c = (t?.configuracion ?? {}).entregas ?? {};
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
    return {
      alertaInformativaHoras: num(c.alertaInformativaHoras, UMBRALES.alertaInformativaHoras),
      alertaAvisoHoras: num(c.alertaAvisoHoras, UMBRALES.alertaAvisoHoras),
      alertaEscalamientoDias: num(c.alertaEscalamientoDias, UMBRALES.alertaEscalamientoDias),
    };
  }

  private async consultante(tenantId: string, usuarioId: string) {
    const u = await actor(this.prisma as any, tenantId, usuarioId);
    if (!(ROLES_CONSULTA as readonly string[]).includes(u.rol)) throw new ForbiddenException('No puede consultar entregas');
    return u;
  }

  /** Ventas con mercancía pendiente de entrega. ADMIN y BODEGUERO ven todas; CAJERO y VENDEDOR, las suyas. */
  async pendientes(tenantId: string, usuarioId: string) {
    const u = await this.consultante(tenantId, usuarioId);
    const umbrales = await this.umbrales(tenantId);
    const veTodo = u.rol === 'ADMIN' || u.rol === 'BODEGUERO';
    const ventas = await query(this.prisma as any,
      `SELECT v.id, v.numero_venta, v.created_at, v.total, v.usuario_id, u.nombre AS cajero,
              COALESCE(c.nombre, v.cliente_nombre) AS cliente
         FROM ventas v JOIN usuarios u ON u.id = v.usuario_id AND u.tenant_id = v.tenant_id
         LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE v.tenant_id=$1 AND v.estado='COMPLETADA' AND v.reserva_pendiente=true AND ($2::boolean OR v.usuario_id=$3)
        ORDER BY v.created_at, v.id`,
      tenantId, veTodo, usuarioId);
    const ahora = Date.now();
    const resultado: any[] = [];
    for (const v of ventas) {
      const lineas = await this.lineasDeVenta(tenantId, v.id);
      const pendientes = lineas.filter((l) => l.modoEntrega === 'BODEGA' && l.pendiente > 0);
      if (pendientes.length === 0) continue;
      const horas = (ahora - new Date(v.created_at).getTime()) / 3_600_000;
      resultado.push({
        ventaId: v.id, numeroVenta: v.numero_venta, creadaAt: v.created_at, total: Number(v.total),
        cajero: v.cajero, cajeroId: v.usuario_id, cliente: v.cliente,
        antiguedadHoras: Math.round(horas * 10) / 10, alerta: nivelDeAlerta(horas, umbrales),
        lineas,
      });
    }
    return { umbrales, pendientes: resultado };
  }

  private async lineasDeVenta(tenantId: string, ventaId: string) {
    const filas = await query<LineaVentaFila>(this.prisma as any,
      `SELECT d.id, d.modo_entrega, d.sin_inventario, p.nombre, p.codigo, p.stock_actual, p.stock_reservado,
              d.cantidad, d.cantidad_preparada, d.cantidad_entregada, d.cantidad_devuelta_reingresada,
              d.cantidad_devuelta_sin_reingreso, d.cantidad_cancelada, d.tenant_id, d.venta_id, d.producto_id
         FROM detalles_venta d JOIN productos p ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
        WHERE d.tenant_id=$1 AND d.venta_id=$2 ORDER BY p.nombre, d.id`,
      tenantId, ventaId);
    return filas.map((l) => {
      const c = contadores(l);
      return {
        detalleId: l.id, codigo: l.codigo, nombre: l.nombre, modoEntrega: l.modo_entrega,
        cantidad: c.C / 100, entregada: c.E / 100, preparada: c.P / 100, cancelada: c.N / 100,
        devueltaReingresada: c.R / 100, devueltaSinReingreso: c.S / 100,
        pendiente: l.modo_entrega === 'BODEGA' ? (c.C - c.E - c.N) / 100 : 0,
        enPoderDelCliente: (c.E - c.R - c.S) / 100,
        estado: l.modo_entrega === 'SIN_INVENTARIO' ? null : estadoDeLinea(l),
      };
    });
  }

  async detalle(tenantId: string, usuarioId: string, ventaId: string) {
    const u = await this.consultante(tenantId, usuarioId);
    const veTodo = u.rol === 'ADMIN' || u.rol === 'BODEGUERO';
    const [venta] = await query(this.prisma as any,
      `SELECT v.id, v.numero_venta, v.created_at, v.total, v.usuario_id, v.reserva_pendiente, v.entregado_at, u.nombre AS cajero
         FROM ventas v JOIN usuarios u ON u.id=v.usuario_id AND u.tenant_id=v.tenant_id
        WHERE v.id=$1 AND v.tenant_id=$2 AND v.estado='COMPLETADA' AND ($3::boolean OR v.usuario_id=$4)`,
      ventaId, tenantId, veTodo, usuarioId);
    if (!venta) throw new NotFoundException('Venta no encontrada');
    const eventos = await query(this.prisma as any,
      `SELECT e.id, e.tipo, e.created_at, e.receptor_nombre, e.motivo, e.origen, u.nombre AS responsable,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object('detalleId', l.detalle_venta_id, 'cantidad', l.cantidad) ORDER BY l.detalle_venta_id), '[]'::jsonb)
                 FROM entregas_eventos_lineas l WHERE l.tenant_id=e.tenant_id AND l.evento_id=e.id) AS lineas
         FROM entregas_eventos e JOIN usuarios u ON u.id=e.usuario_id AND u.tenant_id=e.tenant_id
        WHERE e.tenant_id=$1 AND e.venta_id=$2 ORDER BY e.created_at, e.id`,
      tenantId, ventaId);
    return { venta: { ...venta, total: Number(venta.total) }, lineas: await this.lineasDeVenta(tenantId, ventaId), eventos };
  }

  entregar(tenantId: string, usuarioId: string, ventaId: string, dto: EntregarLineasDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      return entregarLineas(tx, { tenantId, usuarioId, ventaId, solicitudId: dto.solicitudId, receptorNombre: dto.receptorNombre, lineas: dto.lineas });
    }, { timeout: 60000 });
  }

  preparar(tenantId: string, usuarioId: string, ventaId: string, dto: PrepararLineasDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      return prepararLineas(tx, { tenantId, usuarioId, ventaId, solicitudId: dto.solicitudId, lineas: dto.lineas });
    }, { timeout: 60000 });
  }

  liberar(tenantId: string, usuarioId: string, ventaId: string, dto: LiberarLineasDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      return liberarLineas(tx, { tenantId, usuarioId, ventaId, solicitudId: dto.solicitudId, motivo: dto.motivo, lineas: dto.lineas });
    }, { timeout: 60000 });
  }
}

