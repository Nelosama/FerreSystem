import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(tenantId: string) {
    const ahora = new Date();

    // Rango de hoy (00:00:00 a 23:59:59)
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(0, 0, 0, 0);

    const finHoy = new Date(ahora);
    finHoy.setHours(23, 59, 59, 999);

    // Rango de ayer
    const inicioAyer = new Date(inicioHoy);
    inicioAyer.setDate(inicioAyer.getDate() - 1);

    const finAyer = new Date(finHoy);
    finAyer.setDate(finAyer.getDate() - 1);

    // 1. Ventas del día (HNL)
    const ventasHoy = await this.prisma.venta.findMany({
      where: {
        tenantId,
        estado: 'COMPLETADA',
        createdAt: { gte: inicioHoy, lte: finHoy },
      },
    });

    const totalVentasHoy = ventasHoy.reduce((acc, v) => acc + Number(v.total), 0);

    // Ventas de ayer para variación porcentual
    const ventasAyer = await this.prisma.venta.findMany({
      where: {
        tenantId,
        estado: 'COMPLETADA',
        createdAt: { gte: inicioAyer, lte: finAyer },
      },
    });

    const totalVentasAyer = ventasAyer.reduce((acc, v) => acc + Number(v.total), 0);

    let variacionPorcentaje: number | null = null;
    if (totalVentasAyer > 0) {
      variacionPorcentaje = Math.round(((totalVentasHoy - totalVentasAyer) / totalVentasAyer) * 100);
    } else if (totalVentasHoy > 0) {
      variacionPorcentaje = 100;
    }

    // 2. Alertas de stock bajo
    const productos = await this.prisma.producto.findMany({
      where: { tenantId, activo: true },
      include: { categoria: { select: { nombre: true } } },
      orderBy: { stockActual: 'asc' },
    });

    const productosBajoStock = productos.filter((p) => p.stockActual <= p.stockMinimo);

    // 3. Cotizaciones pendientes y por vencer hoy
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: {
        tenantId,
        estado: { in: ['BORRADOR', 'ENVIADA', 'APROBADA'] },
      },
    });

    let porVencerHoy = 0;
    for (const c of cotizaciones) {
      const fechaVal = new Date(c.fechaValidez);
      fechaVal.setHours(0, 0, 0, 0);
      if (fechaVal.getTime() === inicioHoy.getTime()) {
        porVencerHoy++;
      }
    }

    // 4. Tendencia semanal (últimos 7 días)
    const diasSemana = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const tendenciaSemanal: { dia: string; fecha: string; total: number; esHoy: boolean }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(inicioHoy);
      d.setDate(d.getDate() - i);
      const finD = new Date(d);
      finD.setHours(23, 59, 59, 999);

      const ventasDia = await this.prisma.venta.findMany({
        where: {
          tenantId,
          estado: 'COMPLETADA',
          createdAt: { gte: d, lte: finD },
        },
      });

      const totalDia = ventasDia.reduce((acc, v) => acc + Number(v.total), 0);
      const diaTexto = i === 0 ? 'HOY' : diasSemana[d.getDay()];

      tendenciaSemanal.push({
        dia: diaTexto,
        fecha: d.toISOString().split('T')[0],
        total: totalDia,
        esHoy: i === 0,
      });
    }

    // 5. Últimas ventas
    const ultimasVentas = await this.prisma.venta.findMany({
      where: { tenantId },
      include: {
        cliente: { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      ventasDelDia: {
        total: totalVentasHoy,
        cantidad: ventasHoy.length,
        variacionPorcentaje,
      },
      alertasStock: {
        cantidad: productosBajoStock.length,
        items: productosBajoStock.slice(0, 10).map((p) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          stockActual: p.stockActual,
          stockMinimo: p.stockMinimo,
          unidadMedida: p.unidadMedida,
        })),
      },
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
        hora: new Date(v.createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }),
      })),
    };
  }
}
