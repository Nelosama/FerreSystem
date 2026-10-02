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
exports.LevantamientosController = void 0;
const common_1 = require("@nestjs/common");
const levantamientos_service_1 = require("./levantamientos.service");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../common/guards/tenant.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const tenant_id_decorator_1 = require("../common/decorators/tenant-id.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const required_module_decorator_1 = require("../common/decorators/required-module.decorator");
const create_levantamiento_dto_1 = require("./dto/create-levantamiento.dto");
const create_levantamiento_item_dto_1 = require("./dto/create-levantamiento-item.dto");
let LevantamientosController = class LevantamientosController {
    constructor(levantamientosService) {
        this.levantamientosService = levantamientosService;
    }
    async findAll(tenantId) {
        return this.levantamientosService.findAll(tenantId);
    }
    async findOne(tenantId, id) {
        return this.levantamientosService.findOne(tenantId, id);
    }
    async create(tenantId, userId, dto) {
        return this.levantamientosService.create(tenantId, userId, dto);
    }
    async update(tenantId, id, dto) {
        return this.levantamientosService.update(tenantId, id, dto);
    }
    async remove(tenantId, id) {
        return this.levantamientosService.remove(tenantId, id);
    }
    async findItems(tenantId, levantamientoId) {
        return this.levantamientosService.findItems(tenantId, levantamientoId);
    }
    async createItem(tenantId, levantamientoId, dto) {
        return this.levantamientosService.createItem(tenantId, levantamientoId, dto);
    }
    async updateItem(tenantId, levantamientoId, itemId, dto) {
        return this.levantamientosService.updateItem(tenantId, levantamientoId, itemId, dto);
    }
    async removeItem(tenantId, levantamientoId, itemId) {
        return this.levantamientosService.removeItem(tenantId, levantamientoId, itemId);
    }
};
exports.LevantamientosController = LevantamientosController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_levantamiento_dto_1.CreateLevantamientoDto]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_levantamiento_dto_1.UpdateLevantamientoDto]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/items'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "findItems", null);
__decorate([
    (0, common_1.Post)(':id/items'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_levantamiento_item_dto_1.CreateLevantamientoItemDto]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "createItem", null);
__decorate([
    (0, common_1.Patch)(':id/items/:itemId'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('itemId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, create_levantamiento_item_dto_1.UpdateLevantamientoItemDto]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Delete)(':id/items/:itemId'),
    __param(0, (0, tenant_id_decorator_1.TenantId)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], LevantamientosController.prototype, "removeItem", null);
exports.LevantamientosController = LevantamientosController = __decorate([
    (0, common_1.Controller)('levantamientos'),
    (0, required_module_decorator_1.RequiredModule)('levantamiento'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [levantamientos_service_1.LevantamientosService])
], LevantamientosController);
//# sourceMappingURL=levantamientos.controller.js.map