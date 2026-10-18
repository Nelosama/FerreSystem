import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZONA_HORARIA_NEGOCIO, diaCalendario, rangoDiasEnZona, sumarDias } from '../common/zona-horaria';
import { MODULOS_PENDIENTES, reglasAutorizadas, type ClavePendiente, type UsuarioPendientes } from './pendientes';

// Estados de cotización que siguen vigentes (mismo criterio que el resumen).
const COTIZACION_VIGENTE = ['BORRADOR', 'ENVIADA', 'APROBADA'] as const;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(tenantId: string, zona = ZONA_HORARIA_NEGOCIO) {
    const ahora = new Date();
    // "Hoy" y "ayer" son días calendario de la zona del negocio, no del servidor (UTC en producción).
    const diaHoy = diaCalendario(ahora, zona);
    const diaAyer = sumarDias(diaHoy, -1);

    // Rango de hoy (00:00:00 a 23:59:59.999 hora local)
    const { inicio: inicioHoy, fin: finExclusivoHoy } = rangoDiasEnZona(diaHoy, diaHoy, zona);
    const finHoy = new Date(finExclusivoHoy.getTime() - 1);

    // Rango de ayer
    const { inicio: inicioAyer, fin: finExclusivoAyer } = rangoDiasEnZona(diaAyer, diaAyer, zona);
    const finAyer = new Date(finExclusivoAyer.getTime() - 1);

    // Las consultas son independientes entre sí: se lanzan juntas en lugar de una tras otra
    // (el panel se consulta cada 30 s). Los rangos y filtros son los de siempre; la suma la hace PostgreSQL
    // sobre NUMERIC (exacta y sin depender del orden de las filas) en vez de traer cada venta y sumar en coma flotante.
    const ventasEntre = (createdAt: { gte: Date; lte?: Date; lt?: Date }) => this.prisma.venta.aggregate({
      where: { tenantId, estado: 'COMPLETADA', createdAt },
      _sum: { total: true },
      _count: true,
    });
    const totalDe = (r: { _sum: { total: unknown } }) => Number(r._sum.total || 0);
    const devolucionesEntre = (gte: Date, lte: Date) =>
      this.prisma.devolucion.aggregate({ where: { tenantId, createdAt: { gte, lte } }, _sum: { monto: true } });

    // 4. Tendencia semanal (últimos 7 días)
    const diasSemana = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const diasTendencia = [6, 5, 4, 3, 2, 1, 0].map((i) => ({ i, dia: sumarDias(diaHoy, -i) }));

    const [ventasHoy, ventasAyer, returnsToday, returnsYesterday, existencias, ventasPorDia, ultimasVentas] = await Promise.all([
      // 1. Ventas del día (HNL) y de ayer para la variación porcentual
      ventasEntre({ gte: inicioHoy, lte: finHoy }),
      ventasEntre({ gte: inicioAyer, lte: finAyer }),
      devolucionesEntre(inicioHoy, finHoy),
      devolucionesEntre(inicioAyer, finAyer),
      // 2 y 3. Alertas de stock bajo y cotizaciones pendientes
      this.existenciasYCotizaciones(tenantId, diaHoy),
      Promise.all(diasTendencia.map(({ dia }) => {
        const { inicio, fin } = rangoDiasEnZona(dia, dia, zona);
        return ventasEntre({ gte: inicio, lt: fin });
      })),
      // 5. Últimas ventas
      this.prisma.venta.findMany({
        where: { tenantId },
        select: {
          id: true, numeroVenta: true, total: true, metodoPago: true, createdAt: true,
          cliente: { select: { nombre: true } },
          usuario: { select: { nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const totalVentasHoy = totalDe(ventasHoy)-Number(returnsToday._sum.monto||0);
    const totalVentasAyer = totalDe(ventasAyer)-Number(returnsYesterday._sum.monto||0);

    let variacionPorcentaje: number | null = null;
    if (totalVentasAyer > 0) {
      variacionPorcentaje = Math.round(((totalVentasHoy - totalVentasAyer) / totalVentasAyer) * 100);
    } else if (totalVentasHoy > 0) {
      variacionPorcentaje = 100;
    }

    const { productosBajoStock, cotizaciones, porVencerHoy } = existencias;

    const tendenciaSemanal = diasTendencia.map(({ i, dia }, n) => ({
      dia: i === 0 ? 'HOY' : diasSemana[new Date(`${dia}T00:00:00.000Z`).getUTCDay()],
      fecha: dia,
      total: totalDe(ventasPorDia[n]),
      esHoy: i === 0,
    }));

    return {
      ventasDelDia: {
        total: totalVentasHoy,
        cantidad: ventasHoy._count,
        variacionPorcentaje,
      },
      alertasStock: this.alertas(productosBajoStock),
      cotizacionesPendientes: {
        cantidad: cotizaciones.length,
        porVencerHoy,
      },
      tendenciaSemanal,
      ultimasVentas: ultimasVentas.map((v) => ({
        id: v.id,
        numeroVenta: v.numeroVenta,
        cliente: v.cliente?.nombre || 'Consumidor Final',
        cajero: v.usuario.nombre,
        total: Number(v.total),
        metodoPago: v.metodoPago,
        hora: new Date(v.createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', timeZone: zona }),
      })),
    };
  }

  /**
   * Pendientes del usuario autenticado: solo los indicadores que su rol, permisos y módulos permiten abrir.
   * Cada cifra es un COUNT en PostgreSQL filtrado por tenant; un indicador no autorizado no se consulta ni se devuelve.
   */
  async getPendientes(tenantId: string, usuario: UsuarioPendientes & { sub?: string }, zona = ZONA_HORARIA_NEGOCIO) {
    const registros = await this.prisma.tenantModule.findMany({
      where: { tenantId, moduleKey: { in: MODULOS_PENDIENTES } },
      select: { moduleKey: true, enabled: true },
    });
    const reglas = reglasAutorizadas(usuario, registros);
    const contar = (clave: ClavePendiente, propias: boolean): Promise<number> => {
      switch (clave) {
        case 'contingencia_revision':
          // Igual que el filtro «solo revisión» de /contingencia-admin.
          return this.prisma.operacionContingencia.count({ where: { tenantId, requiereRevision: true } });
        case 'precios_pendientes':
          // Igual que la pestaña «Pendientes» de /precios: productos activos sin precio aprobado.
          return this.prisma.producto.count({ where: { tenantId, activo: true, precioAprobado: false } });
        case 'entregas_pendientes':
          return this.contarEntregasPendientes(tenantId, propias ? String(usuario.sub ?? '') : null);
        case 'cotizaciones_vencen_hoy':
          // fechaValidez es DATE: se compara con el día calendario del negocio.
          return this.prisma.cotizacion.count({
            where: { tenantId, estado: { in: [...COTIZACION_VIGENTE] }, fechaValidez: new Date(`${diaCalendario(new Date(), zona)}T00:00:00.000Z`) },
          });
        case 'stock_bajo_minimo':
          return this.contarStockBajo(tenantId);
      }
    };
    const cantidades = await Promise.all(reglas.map((r) => contar(r.clave, r.alcance === 'PROPIAS')));
    return {
      generadoAt: new Date().toISOString(),
      indicadores: reglas.map((r, i) => ({ clave: r.clave, cantidad: cantidades[i], ruta: r.ruta, alcance: r.alcance })),
    };
  }

  /** Ventas con mercancía de bodega por entregar: misma condición que GET /entregas/pendientes, en un solo COUNT. */
  private async contarEntregasPendientes(tenantId: string, usuarioId: string | null) {
    const [fila] = await this.prisma.$queryRawUnsafe<{ cantidad: number }[]>(
      `SELECT COUNT(DISTINCT v.id)::int AS cantidad
         FROM ventas v JOIN detalles_venta d ON d.venta_id = v.id AND d.tenant_id = v.tenant_id
        WHERE v.tenant_id = $1 AND v.estado = 'COMPLETADA' AND v.reserva_pendiente = true
          AND ($2::text IS NULL OR v.usuario_id = $2::text)
          AND d.modo_entrega = 'BODEGA' AND d.cantidad - d.cantidad_entregada - d.cantidad_cancelada > 0`,
      tenantId, usuarioId);
    return Number(fila?.cantidad ?? 0);
  }

  /** Productos activos con disponible (existencia − reservado) en o bajo el mínimo: mismo criterio que el resumen. */
  private async contarStockBajo(tenantId: string) {
    const [fila] = await this.prisma.$queryRawUnsafe<{ cantidad: number }[]>(
      `SELECT COUNT(*)::int AS cantidad FROM productos
        WHERE tenant_id = $1 AND activo = true AND stock_actual - stock_reservado <= stock_minimo`,
      tenantId);
    return Number(fila?.cantidad ?? 0);
  }

  /**
   * Resumen operativo sin cifras de ventas, para BODEGUERO (no lee ventas: mismo criterio que GET /ventas).
   * Conserva la forma de la respuesta: las secciones de ventas van vacías.
   */
  async getResumenOperativo(tenantId: string, zona = ZONA_HORARIA_NEGOCIO) {
    const { productosBajoStock, cotizaciones, porVencerHoy } = await this.existenciasYCotizaciones(tenantId, diaCalendario(new Date(), zona));
    return {
      ventasDelDia: null,
      alertasStock: this.alertas(productosBajoStock),
      cotizacionesPendientes: { cantidad: cotizaciones.length, porVencerHoy },
      tendenciaSemanal: [],
      ultimasVentas: [],
    };
  }

  private alertas(productosBajoStock: { id: string; codigo: string; nombre: string; stockActual: unknown; stockMinimo: unknown; unidadMedida: unknown }[]) {
    return {
      cantidad: productosBajoStock.length,
      items: productosBajoStock.slice(0, 10).map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        stockActual: p.stockActual,
        stockMinimo: p.stockMinimo,
        unidadMedida: p.unidadMedida,
      })),
    };
  }

  private async existenciasYCotizaciones(tenantId: string, diaHoy: string) {
    // Alertas de stock bajo
    const [productos, cotizaciones] = await Promise.all([this.prisma.producto.findMany({
      where: { tenantId, activo: true },
      // Seleccionar únicamente datos del resumen evita depender de columnas de otros módulos.
      select: {
        id: true, codigo: true, nombre: true, stockActual: true,
        stockReservado: true, stockMinimo: true, unidadMedida: true,
      },
      orderBy: { stockActual: 'asc' },
    }),
    // Cotizaciones pendientes y por vencer hoy
    this.prisma.cotizacion.findMany({
      select: { fechaValidez: true },
      where: {
        tenantId,
        estado: { in: ['BORRADOR', 'ENVIADA', 'APROBADA'] },
      },
    })]);

    const productosBajoStock = productos.filter((p) => p.stockActual.minus(p.stockReservado).lte(p.stockMinimo));

    // fechaValidez es DATE (sin hora): su día calendario se lee tal cual, en UTC.
    let porVencerHoy = 0;
    for (const c of cotizaciones) {
      if (c.fechaValidez.toISOString().slice(0, 10) === diaHoy) {
        porVencerHoy++;
      }
    }

    return { productosBajoStock, cotizaciones, porVencerHoy };
  }
}
