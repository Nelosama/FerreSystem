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
exports.LevantamientosService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let LevantamientosService = class LevantamientosService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(tenantId) {
        const levantamientos = await this.prisma.levantamiento.findMany({
            where: { tenantId },
            include: {
                _count: {
                    select: { items: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return levantamientos.map((l) => ({
            id: l.id,
            nombre: l.nombre,
            descripcion: l.descripcion,
            estado: l.estado,
            createdBy: l.createdBy,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
            totalItems: l._count.items,
        }));
    }
    async findOne(tenantId, id) {
        const levantamiento = await this.prisma.levantamiento.findFirst({
            where: { id, tenantId },
            include: {
                items: {
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        if (!levantamiento) {
            throw new common_1.NotFoundException(`Levantamiento con ID "${id}" no encontrado`);
        }
        return {
            id: levantamiento.id,
            nombre: levantamiento.nombre,
            descripcion: levantamiento.descripcion,
            estado: levantamiento.estado,
            createdBy: levantamiento.createdBy,
            createdAt: levantamiento.createdAt,
            updatedAt: levantamiento.updatedAt,
            items: levantamiento.items.map((item) => ({
                id: item.id,
                levantamientoId: item.levantamientoId,
                descripcion: item.descripcion,
                cantidad: Number(item.cantidad),
                unidad: item.unidad,
                codigo: item.codigo,
                marca: item.marca,
                categoria: item.categoria,
                notas: item.notas,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            })),
        };
    }
    async create(tenantId, userId, dto) {
        return this.prisma.levantamiento.create({
            data: {
                tenantId,
                nombre: dto.nombre,
                descripcion: dto.descripcion,
                estado: dto.estado ?? 'BORRADOR',
                createdBy: userId,
            },
        });
    }
    async update(tenantId, id, dto) {
        const exists = await this.prisma.levantamiento.findFirst({
            where: { id, tenantId },
        });
        if (!exists) {
            throw new common_1.NotFoundException(`Levantamiento con ID "${id}" no encontrado`);
        }
        return this.prisma.levantamiento.update({
            where: { id },
            data: {
                ...(dto.nombre !== undefined && { nombre: dto.nombre }),
                ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
                ...(dto.estado !== undefined && { estado: dto.estado }),
            },
        });
    }
    async remove(tenantId, id) {
        const exists = await this.prisma.levantamiento.findFirst({
            where: { id, tenantId },
        });
        if (!exists) {
            throw new common_1.NotFoundException(`Levantamiento con ID "${id}" no encontrado`);
        }
        await this.prisma.levantamiento.delete({
            where: { id },
        });
        return { success: true, message: 'Levantamiento eliminado correctamente' };
    }
    async findItems(tenantId, levantamientoId) {
        await this.findOne(tenantId, levantamientoId);
        const items = await this.prisma.levantamientoItem.findMany({
            where: { levantamientoId },
            orderBy: { createdAt: 'desc' },
        });
        return items.map((item) => ({
            id: item.id,
            levantamientoId: item.levantamientoId,
            descripcion: item.descripcion,
            cantidad: Number(item.cantidad),
            unidad: item.unidad,
            codigo: item.codigo,
            marca: item.marca,
            categoria: item.categoria,
            notas: item.notas,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        }));
    }
    async createItem(tenantId, levantamientoId, dto) {
        await this.findOne(tenantId, levantamientoId);
        const item = await this.prisma.levantamientoItem.create({
            data: {
                levantamientoId,
                descripcion: dto.descripcion,
                cantidad: dto.cantidad,
                unidad: dto.unidad ?? 'unidad',
                codigo: dto.codigo,
                marca: dto.marca,
                categoria: dto.categoria,
                notas: dto.notas,
            },
        });
        return {
            id: item.id,
            levantamientoId: item.levantamientoId,
            descripcion: item.descripcion,
            cantidad: Number(item.cantidad),
            unidad: item.unidad,
            codigo: item.codigo,
            marca: item.marca,
            categoria: item.categoria,
            notas: item.notas,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
    async updateItem(tenantId, levantamientoId, itemId, dto) {
        await this.findOne(tenantId, levantamientoId);
        const itemExists = await this.prisma.levantamientoItem.findFirst({
            where: { id: itemId, levantamientoId },
        });
        if (!itemExists) {
            throw new common_1.NotFoundException(`Item con ID "${itemId}" no encontrado en este levantamiento`);
        }
        const item = await this.prisma.levantamientoItem.update({
            where: { id: itemId },
            data: {
                ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
                ...(dto.cantidad !== undefined && { cantidad: dto.cantidad }),
                ...(dto.unidad !== undefined && { unidad: dto.unidad }),
                ...(dto.codigo !== undefined && { codigo: dto.codigo }),
                ...(dto.marca !== undefined && { marca: dto.marca }),
                ...(dto.categoria !== undefined && { categoria: dto.categoria }),
                ...(dto.notas !== undefined && { notas: dto.notas }),
            },
        });
        return {
            id: item.id,
            levantamientoId: item.levantamientoId,
            descripcion: item.descripcion,
            cantidad: Number(item.cantidad),
            unidad: item.unidad,
            codigo: item.codigo,
            marca: item.marca,
            categoria: item.categoria,
            notas: item.notas,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
    async removeItem(tenantId, levantamientoId, itemId) {
        await this.findOne(tenantId, levantamientoId);
        const itemExists = await this.prisma.levantamientoItem.findFirst({
            where: { id: itemId, levantamientoId },
        });
        if (!itemExists) {
            throw new common_1.NotFoundException(`Item con ID "${itemId}" no encontrado en este levantamiento`);
        }
        await this.prisma.levantamientoItem.delete({
            where: { id: itemId },
        });
        return { success: true, message: 'Item eliminado correctamente' };
    }
};
exports.LevantamientosService = LevantamientosService;
exports.LevantamientosService = LevantamientosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LevantamientosService);
//# sourceMappingURL=levantamientos.service.js.map