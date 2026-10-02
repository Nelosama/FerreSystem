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
exports.UpdateLevantamientoItemDto = exports.CreateLevantamientoItemDto = void 0;
const class_validator_1 = require("class-validator");
class CreateLevantamientoItemDto {
}
exports.CreateLevantamientoItemDto = CreateLevantamientoItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'La descripción del item es requerida' }),
    __metadata("design:type", String)
], CreateLevantamientoItemDto.prototype, "descripcion", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'La cantidad debe ser un número válido' }),
    (0, class_validator_1.Min)(0, { message: 'La cantidad no puede ser negativa' }),
    __metadata("design:type", Number)
], CreateLevantamientoItemDto.prototype, "cantidad", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLevantamientoItemDto.prototype, "unidad", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLevantamientoItemDto.prototype, "codigo", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLevantamientoItemDto.prototype, "marca", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLevantamientoItemDto.prototype, "categoria", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLevantamientoItemDto.prototype, "notas", void 0);
class UpdateLevantamientoItemDto {
}
exports.UpdateLevantamientoItemDto = UpdateLevantamientoItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoItemDto.prototype, "descripcion", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'La cantidad debe ser un número válido' }),
    (0, class_validator_1.Min)(0, { message: 'La cantidad no puede ser negativa' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateLevantamientoItemDto.prototype, "cantidad", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoItemDto.prototype, "unidad", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoItemDto.prototype, "codigo", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoItemDto.prototype, "marca", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoItemDto.prototype, "categoria", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoItemDto.prototype, "notas", void 0);
//# sourceMappingURL=create-levantamiento-item.dto.js.map