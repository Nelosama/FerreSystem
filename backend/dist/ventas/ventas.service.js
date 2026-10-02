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
exports.VentasService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let VentasService = class VentasService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(tenantId, limit = 50) {
        const ventas = await this.prisma.venta.findMany({
            where: { tenantId },
            include: {
                cliente: { select: { id: true, nombre: true, rtn: true } },
                usuario: { select: { id: true, nombre: true } },
                detalles: {
                    include: {
                        producto: { select: { id: true, nombre: true, codigo: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return ventas.map((v) => ({
            ...v,
            subtotal: Number(v.subtotal),
            isv: Number(v.isv),
            descuento: Number(v.descuento),
            total: Number(v.total),
            detalles: v.detalles.map((d) => ({
                id: d.id,
                productoId: d.productoId,
                productoNombre: d.producto.nombre,
                productoCodigo: d.producto.codigo,
                cantidad: Number(d.cantidad),
                precioUnitario: Number(d.precioUnitario),
                subtotal: Number(d.subtotal),
            })),
        }));
    }
    async findById(tenantId, id) {
        const v = await this.prisma.venta.findFirst({
            where: { id, tenantId },
            include: {
                cliente: true,
                usuario: { select: { id: true, nombre: true, email: true } },
                tenant: true,
                detalles: {
                    include: {
                        producto: true,
                    },
                },
            },
        });
        if (!v) {
            throw new common_1.NotFoundException('Venta no encontrada');
        }
        return {
            ...v,
            subtotal: Number(v.subtotal),
            isv: Number(v.isv),
            descuento: Number(v.descuento),
            total: Number(v.total),
            detalles: v.detalles.map((d) => ({
                id: d.id,
                productoId: d.productoId,
                productoNombre: d.producto.nombre,
                productoCodigo: d.producto.codigo,
                cantidad: Number(d.cantidad),
                precioUnitario: Number(d.precioUnitario),
                subtotal: Number(d.subtotal),
            })),
        };
    }
    async create(tenantId, usuarioId, dto) {
        if (!dto.detalles || dto.detalles.length === 0) {
            throw new common_1.BadRequestException('La venta debe incluir al menos un producto');
        }
        const descuento = dto.descuento || 0;
        return this.prisma.$transaction(async (tx) => {
            if (dto.clienteId) {
                const cliente = await tx.cliente.findFirst({ where: { id: dto.clienteId, tenantId } });
                if (!cliente)
                    throw new common_1.NotFoundException('Cliente seleccionado no existe en este tenant');
            }
            const result = await tx.$queryRaw `
        INSERT INTO "secuencias_tenant" ("id", "tenant_id", "tipo", "ultimo_numero")
        VALUES (gen_random_uuid(), ${tenantId}, 'VENTA'::"TipoSecuencia", 1)
        ON CONFLICT ("tenant_id", "tipo")
        DO UPDATE SET "ultimo_numero" = "secuencias_tenant"."ultimo_numero" + 1
        RETURNING "ultimo_numero"
      `;
            const numeroVenta = result[0].ultimo_numero;
            let subtotalTotal = 0;
            const detallesParaCrear = [];
            for (const item of dto.detalles) {
                const prod = await tx.producto.findFirst({
                    where: { id: item.productoId, tenantId, activo: true },
                });
                if (!prod) {
                    throw new common_1.NotFoundException(`Producto con ID ${item.productoId} no encontrado o inactivo`);
                }
                const stockDisponible = Number(prod.stockActual);
                if (stockDisponible < item.cantidad) {
                    throw new common_1.BadRequestException(`Stock insuficiente para "${prod.nombre}". Disponible: ${stockDisponible}, Solicitado: ${item.cantidad}`);
                }
                const precioUnitario = item.precioUnitario !== undefined ? item.precioUnitario : Number(prod.precioVenta);
                const itemSubtotal = Math.round(precioUnitario * item.cantidad * 100) / 100;
                subtotalTotal += itemSubtotal;
                await tx.producto.update({
                    where: { id: prod.id, tenantId },
                    data: { stockActual: { decrement: item.cantidad } },
                });
                detallesParaCrear.push({
                    productoId: prod.id,
                    cantidad: item.cantidad,
                    precioUnitario,
                    subtotal: itemSubtotal,
                });
            }
            const baseGravable = Math.max(0, subtotalTotal - descuento);
            const isv = Math.round(baseGravable * 0.15 * 100) / 100;
            const total = Math.round((baseGravable + isv) * 100) / 100;
            const venta = await tx.venta.create({
                data: {
                    tenantId,
                    numeroVenta,
                    clienteId: dto.clienteId || null,
                    usuarioId,
                    subtotal: subtotalTotal,
                    isv,
                    descuento,
                    total,
                    metodoPago: dto.metodoPago || 'EFECTIVO',
                    estado: 'COMPLETADA',
                    notas: dto.notas || null,
                    detalles: {
                        create: detallesParaCrear.map((d) => ({
                            productoId: d.productoId,
                            cantidad: d.cantidad,
                            precioUnitario: d.precioUnitario,
                            subtotal: d.subtotal,
                        })),
                    },
                },
                include: {
                    cliente: true,
                    detalles: {
                        include: { producto: true },
                    },
                },
            });
            return {
                ...venta,
                subtotal: Number(venta.subtotal),
                isv: Number(venta.isv),
                descuento: Number(venta.descuento),
                total: Number(venta.total),
                detalles: venta.detalles.map((d) => ({
                    id: d.id,
                    productoId: d.productoId,
                    productoNombre: d.producto.nombre,
                    productoCodigo: d.producto.codigo,
                    cantidad: Number(d.cantidad),
                    precioUnitario: Number(d.precioUnitario),
                    subtotal: Number(d.subtotal),
                })),
            };
        });
    }
};
exports.VentasService = VentasService;
exports.VentasService = VentasService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], VentasService);
//# sourceMappingURL=ventas.service.js.map