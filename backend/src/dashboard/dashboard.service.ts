import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZONA_HORARIA_NEGOCIO, diaCalendario, rangoDiasEnZona, sumarDias } from '../common/zona-horaria';

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
