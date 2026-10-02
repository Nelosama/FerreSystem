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
exports.TenantModuleGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const required_module_decorator_1 = require("../decorators/required-module.decorator");
const prisma_service_1 = require("../../prisma/prisma.service");
let TenantModuleGuard = class TenantModuleGuard {
    constructor(reflector, prisma) {
        this.reflector = reflector;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const requiredModule = this.reflector.getAllAndOverride(required_module_decorator_1.REQUIRED_MODULE_KEY, [context.getHandler(), context.getClass()]);
        if (!requiredModule) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user?.rol === 'SUPER_ADMIN' || user?.rol === 'SUPERADMIN' || user?.type === 'super_admin') {
            return true;
        }
        const tenantId = user?.tenantId;
        if (!tenantId) {
            throw new common_1.ForbiddenException('Tenant ID no encontrado en la petición');
        }
        const tenantModule = await this.prisma.tenantModule.findUnique({
            where: {
                tenantId_moduleKey: {
                    tenantId,
                    moduleKey: requiredModule,
                },
            },
        });
        if (tenantModule && !tenantModule.enabled) {
            throw new common_1.ForbiddenException(`El módulo "${requiredModule}" no está habilitado para su suscripción.`);
        }
        return true;
    }
};
exports.TenantModuleGuard = TenantModuleGuard;
exports.TenantModuleGuard = TenantModuleGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        prisma_service_1.PrismaService])
], TenantModuleGuard);
//# sourceMappingURL=tenant-module.guard.js.map