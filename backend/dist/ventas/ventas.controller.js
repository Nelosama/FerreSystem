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
exports.VentasController = void 0;
const common_1 = require("@nestjs/common");
const ventas_service_1 = require("./ventas.service");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../common/guards/tenant.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const tenant_id_decorator_1 = require("../common/decorators/tenant-id.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const required_module_decorator_1 = require("../common/decorators/required-module.decorator");
const create_venta_dto_1 = require("./dto/create-venta.dto");
let VentasController = class VentasController {
    constructor(ventasService) {
        this.ventasService = ventasService;
    }
    async findAll(tenantId, limit) {
        const take = limit ? parseInt(limit, 10) : 50;
        return this.ventasService.findAll(tenantId, take);
    }
    async findById(tenantId, id) {
        return this.ventasService.findById(tenantId, id);
    }
    async create(tenantId, usuarioId, dto) {
        return this.ventasService.create(tenantId, usuarioId, dto);
    }
};
exports.VentasController = VentasController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], VentasController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], VentasController.prototype, "findById", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('ADMIN', 'CAJERO', 'VENDEDOR'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_venta_dto_1.CreateVentaDto]),
    __metadata("design:returntype", Promise)
], VentasController.prototype, "create", null);
exports.VentasController = VentasController = __decorate([
    (0, common_1.Controller)('ventas'),
    (0, required_module_decorator_1.RequiredModule)('pos'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [ventas_service_1.VentasService])
], VentasController);
//# sourceMappingURL=ventas.controller.js.map