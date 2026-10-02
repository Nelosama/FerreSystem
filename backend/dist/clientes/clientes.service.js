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
exports.ClientesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ClientesService = class ClientesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(tenantId, search) {
        const where = { tenantId };
        if (search) {
            where.OR = [
                { nombre: { contains: search, mode: 'insensitive' } },
                { rtn: { contains: search, mode: 'insensitive' } },
                { telefono: { contains: search, mode: 'insensitive' } },
            ];
        }
        return this.prisma.cliente.findMany({
            where,
            orderBy: { nombre: 'asc' },
        });
    }
    async findById(tenantId, id) {
        const cliente = await this.prisma.cliente.findFirst({
            where: { id, tenantId },
        });
        if (!cliente) {
            throw new common_1.NotFoundException('Cliente no encontrado');
        }
        return cliente;
    }
    async create(tenantId, dto) {
        return this.prisma.cliente.create({
            data: {
                tenantId,
                nombre: dto.nombre.trim(),
                rtn: dto.rtn?.trim() || null,
                telefono: dto.telefono?.trim() || null,
                email: dto.email?.trim() || null,
                direccion: dto.direccion?.trim() || null,
                tipo: dto.tipo || 'CONSUMIDOR_FINAL',
            },
        });
    }
    async update(tenantId, id, dto) {
        await this.findById(tenantId, id);
        return this.prisma.cliente.update({
            where: { id },
            data: {
                ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
                ...(dto.rtn !== undefined ? { rtn: dto.rtn?.trim() || null } : {}),
                ...(dto.telefono !== undefined ? { telefono: dto.telefono?.trim() || null } : {}),
                ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
                ...(dto.direccion !== undefined ? { direccion: dto.direccion?.trim() || null } : {}),
                ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
            },
        });
    }
    async delete(tenantId, id) {
        const result = await this.prisma.cliente.deleteMany({
            where: {
                id,
                tenantId,
            },
        });
        if (result.count === 0) {
            throw new common_1.NotFoundException('Cliente no encontrado o no pertenece a la organización');
        }
        return { success: true, count: result.count };
    }
};
exports.ClientesService = ClientesService;
exports.ClientesService = ClientesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ClientesService);
//# sourceMappingURL=clientes.service.js.map