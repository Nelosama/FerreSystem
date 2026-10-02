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
exports.ProductosService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ProductosService = class ProductosService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(tenantId, search, categoriaId) {
        const where = {
            tenantId,
            activo: true,
        };
        if (categoriaId) {
            where.categoriaId = categoriaId;
        }
        if (search) {
            where.OR = [
                { nombre: { contains: search, mode: 'insensitive' } },
                { codigo: { contains: search, mode: 'insensitive' } },
                { codigoBarras: { contains: search, mode: 'insensitive' } },
            ];
        }
        const productos = await this.prisma.producto.findMany({
            where,
            include: {
                categoria: {
                    select: { id: true, nombre: true },
                },
            },
            orderBy: { nombre: 'asc' },
        });
        return productos.map((p) => ({
            ...p,
            precioVenta: Number(p.precioVenta),
            precioCosto: Number(p.precioCosto),
            stockBajo: p.stockActual <= p.stockMinimo,
        }));
    }
    async findById(tenantId, id) {
        const p = await this.prisma.producto.findFirst({
            where: { id, tenantId },
            include: {
                categoria: true,
            },
        });
        if (!p) {
            throw new common_1.NotFoundException('Producto no encontrado');
        }
        return {
            ...p,
            precioVenta: Number(p.precioVenta),
            precioCosto: Number(p.precioCosto),
            stockBajo: p.stockActual <= p.stockMinimo,
        };
    }
    async getLowStock(tenantId) {
        const productos = await this.prisma.producto.findMany({
            where: {
                tenantId,
                activo: true,
            },
            include: {
                categoria: { select: { id: true, nombre: true } },
            },
            orderBy: { stockActual: 'asc' },
        });
        const lowStock = productos
            .filter((p) => p.stockActual <= p.stockMinimo)
            .map((p) => ({
            ...p,
            precioVenta: Number(p.precioVenta),
            precioCosto: Number(p.precioCosto),
            stockBajo: true,
        }));
        return lowStock;
    }
    async create(tenantId, dto) {
        const existeCodigo = await this.prisma.producto.findUnique({
            where: {
                tenantId_codigo: {
                    tenantId,
                    codigo: dto.codigo.trim(),
                },
            },
        });
        if (existeCodigo) {
            throw new common_1.ConflictException(`Ya existe un producto con el código ${dto.codigo}`);
        }
        const p = await this.prisma.producto.create({
            data: {
                tenantId,
                codigo: dto.codigo.trim(),
                codigoBarras: dto.codigoBarras?.trim() || null,
                nombre: dto.nombre.trim(),
                descripcion: dto.descripcion,
                categoriaId: dto.categoriaId || null,
                precioVenta: dto.precioVenta,
                precioCosto: dto.precioCosto,
                stockActual: dto.stockActual,
                stockMinimo: dto.stockMinimo,
                unidadMedida: dto.unidadMedida || 'UNIDAD',
            },
            include: {
                categoria: { select: { id: true, nombre: true } },
            },
        });
        return {
            ...p,
            precioVenta: Number(p.precioVenta),
            precioCosto: Number(p.precioCosto),
            stockBajo: p.stockActual <= p.stockMinimo,
        };
    }
    async update(tenantId, id, dto) {
        await this.findById(tenantId, id);
        const p = await this.prisma.producto.update({
            where: { id },
            data: {
                ...(dto.codigo && { codigo: dto.codigo.trim() }),
                ...(dto.codigoBarras !== undefined && { codigoBarras: dto.codigoBarras?.trim() || null }),
                ...(dto.nombre && { nombre: dto.nombre.trim() }),
                ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
                ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId || null }),
                ...(dto.precioVenta !== undefined && { precioVenta: dto.precioVenta }),
                ...(dto.precioCosto !== undefined && { precioCosto: dto.precioCosto }),
                ...(dto.stockActual !== undefined && { stockActual: dto.stockActual }),
                ...(dto.stockMinimo !== undefined && { stockMinimo: dto.stockMinimo }),
                ...(dto.unidadMedida && { unidadMedida: dto.unidadMedida }),
            },
            include: {
                categoria: { select: { id: true, nombre: true } },
            },
        });
        return {
            ...p,
            precioVenta: Number(p.precioVenta),
            precioCosto: Number(p.precioCosto),
            stockBajo: p.stockActual <= p.stockMinimo,
        };
    }
    async delete(tenantId, id) {
        await this.findById(tenantId, id);
        return this.prisma.producto.update({
            where: { id },
            data: { activo: false },
        });
    }
};
exports.ProductosService = ProductosService;
exports.ProductosService = ProductosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductosService);
//# sourceMappingURL=productos.service.js.map