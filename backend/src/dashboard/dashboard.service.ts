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

    // 1. Ventas del día (HNL)
    const ventasHoy = await this.prisma.venta.findMany({
      where: {
        tenantId,
        estado: 'COMPLETADA',
        createdAt: { gte: inicioHoy, lte: finHoy },
      },
    });

    const returnsToday=await this.prisma.devolucion.aggregate({where:{tenantId,createdAt:{gte:inicioHoy,lte:finHoy}},_sum:{monto:true}});
    const totalVentasHoy = ventasHoy.reduce((acc, v) => acc + Number(v.total), 0)-Number(returnsToday._sum.monto||0);

    // Ventas de ayer para variación porcentual
    const ventasAyer = await this.prisma.venta.findMany({
      where: {
        tenantId,
        estado: 'COMPLETADA',
        createdAt: { gte: inicioAyer, lte: finAyer },
      },
    });

    const returnsYesterday=await this.prisma.devolucion.aggregate({where:{tenantId,createdAt:{gte:inicioAyer,lte:finAyer}},_sum:{monto:true}});
    const totalVentasAyer = ventasAyer.reduce((acc, v) => acc + Number(v.total), 0)-Number(returnsYesterday._sum.monto||0);

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

    const productosBajoStock = productos.filter((p) => p.stockActual.minus(p.stockReservado).lte(p.stockMinimo));

    // 3. Cotizaciones pendientes y por vencer hoy
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: {
        tenantId,
        estado: { in: ['BORRADOR', 'ENVIADA', 'APROBADA'] },
      },
    });

    // fechaValidez es DATE (sin hora): su día calendario se lee tal cual, en UTC.
    let porVencerHoy = 0;
    for (const c of cotizaciones) {
      if (c.fechaValidez.toISOString().slice(0, 10) === diaHoy) {
        porVencerHoy++;
      }
    }

    // 4. Tendencia semanal (últimos 7 días)
    const diasSemana = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const tendenciaSemanal: { dia: string; fecha: string; total: number; esHoy: boolean }[] = [];

    for (let i = 6; i >= 0; i--) {
      const dia = sumarDias(diaHoy, -i);
      const { inicio, fin } = rangoDiasEnZona(dia, dia, zona);

      const ventasDia = await this.prisma.venta.findMany({
        where: {
          tenantId,
          estado: 'COMPLETADA',
          createdAt: { gte: inicio, lt: fin },
        },
      });

      const totalDia = ventasDia.reduce((acc, v) => acc + Number(v.total), 0);
      const diaSemana = new Date(`${dia}T00:00:00.000Z`).getUTCDay();
      const diaTexto = i === 0 ? 'HOY' : diasSemana[diaSemana];

      tendenciaSemanal.push({
        dia: diaTexto,
        fecha: dia,
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
        hora: new Date(v.createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', timeZone: zona }),
      })),
    };
  }
}

