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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CotizacionesController = void 0;
const common_1 = require("@nestjs/common");
const cotizaciones_service_1 = require("./cotizaciones.service");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../common/guards/tenant.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const tenant_id_decorator_1 = require("../common/decorators/tenant-id.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const required_module_decorator_1 = require("../common/decorators/required-module.decorator");
const create_cotizacion_dto_1 = require("./dto/create-cotizacion.dto");
let CotizacionesController = class CotizacionesController {
    constructor(cotizacionesService) {
        this.cotizacionesService = cotizacionesService;
    }
    async findAll(tenantId) {
        return this.cotizacionesService.findAll(tenantId);
    }
    async findById(tenantId, id) {
        return this.cotizacionesService.findById(tenantId, id);
    }
    async create(tenantId, usuarioId, dto) {
        return this.cotizacionesService.create(tenantId, usuarioId, dto);
    }
    async update(tenantId, id, dto) {
        return this.cotizacionesService.update(tenantId, id, dto);
    }
    async duplicate(tenantId, usuarioId, id) {
        return this.cotizacionesService.duplicate(tenantId, usuarioId, id);
    }
    async updateEstado(tenantId, id, estado) {
        return this.cotizacionesService.updateEstado(tenantId, id, estado);
    }
    async convertirAVenta(tenantId, usuarioId, cotizacionId, metodoPago) {
        return this.cotizacionesService.convertirAVenta(tenantId, usuarioId, cotizacionId, metodoPago);
    }
};
exports.CotizacionesController = CotizacionesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "findById", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('ADMIN', 'VENDEDOR', 'CAJERO'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_cotizacion_dto_1.CreateCotizacionDto]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, roles_decorator_1.Roles)('ADMIN', 'VENDEDOR', 'CAJERO'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_cotizacion_dto_1.CreateCotizacionDto]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/duplicar'),
    (0, roles_decorator_1.Roles)('ADMIN', 'VENDEDOR', 'CAJERO'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "duplicate", null);
__decorate([
    (0, common_1.Patch)(':id/estado'),
    (0, roles_decorator_1.Roles)('ADMIN', 'VENDEDOR', 'CAJERO'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('estado')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "updateEstado", null);
__decorate([
    (0, common_1.Post)(':id/convertir'),
    (0, roles_decorator_1.Roles)('ADMIN', 'CAJERO'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)('metodoPago')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "convertirAVenta", null);
exports.CotizacionesController = CotizacionesController = __decorate([
    (0, common_1.Controller)('cotizaciones'),
    (0, required_module_decorator_1.RequiredModule)('cotizaciones'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [cotizaciones_service_1.CotizacionesService])
], CotizacionesController);
//# sourceMappingURL=cotizaciones.controller.js.map