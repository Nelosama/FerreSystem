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
exports.TenantsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let TenantsService = class TenantsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getTenantSettings(tenantId) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
                modulos: true,
            },
        });
        if (!tenant) {
            throw new common_1.NotFoundException('Ferretería no encontrada');
        }
        return {
            ...tenant,
            modulosHabilitados: tenant.modulos.filter((m) => m.enabled).map((m) => m.moduleKey),
        };
    }
    async updateTenantBranding(tenantId, data) {
        return this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                ...(data.nombreComercial && { nombreComercial: data.nombreComercial }),
                ...(data.direccion !== undefined && { direccion: data.direccion }),
                ...(data.telefono !== undefined && { telefono: data.telefono }),
                ...(data.email !== undefined && { email: data.email }),
                ...(data.colorPrimario && { colorPrimario: data.colorPrimario }),
                ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
            },
        });
    }
};
exports.TenantsService = TenantsService;
exports.TenantsService = TenantsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TenantsService);
//# sourceMappingURL=tenants.service.js.map