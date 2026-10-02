"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DashboardService = class DashboardService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getDashboardData(tenantId) {
        const ahora = new Date();
        const inicioHoy = new Date(ahora);
        inicioHoy.setHours(0, 0, 0, 0);
        const finHoy = new Date(ahora);
        finHoy.setHours(23, 59, 59, 999);
        const inicioAyer = new Date(inicioHoy);
        inicioAyer.setDate(inicioAyer.getDate() - 1);
        const finAyer = new Date(finHoy);
        finAyer.setDate(finAyer.getDate() - 1);
        const ventasHoy = await this.prisma.venta.findMany({
            where: {
                tenantId,
                estado: 'COMPLETADA',
                createdAt: { gte: inicioHoy, lte: finHoy },
            },
        });
        const totalVentasHoy = ventasHoy.reduce((acc, v) => acc + Number(v.total), 0);
        const ventasAyer = await this.prisma.venta.findMany({
            where: {
                tenantId,
                estado: 'COMPLETADA',
                createdAt: { gte: inicioAyer, lte: finAyer },
            },
        });
        const totalVentasAyer = ventasAyer.reduce((acc, v) => acc + Number(v.total), 0);
        let variacionPorcentaje = null;
        if (totalVentasAyer > 0) {
            variacionPorcentaje = Math.round(((totalVentasHoy - totalVentasAyer) / totalVentasAyer) * 100);
        }
        else if (totalVentasHoy > 0) {
            variacionPorcentaje = 100;
        }
        const productos = await this.prisma.producto.findMany({
            where: { tenantId, activo: true },
            include: { categoria: { select: { nombre: true } } },
            orderBy: { stockActual: 'asc' },
        });
        const productosBajoStock = productos.filter((p) => p.stockActual <= p.stockMinimo);
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
        const diasSemana = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
        const tendenciaSemanal = [];
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
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map