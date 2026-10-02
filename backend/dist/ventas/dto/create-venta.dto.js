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
exports.CreateVentaDto = exports.DetalleVentaItemDto = exports.MetodoPagoEnum = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var MetodoPagoEnum;
(function (MetodoPagoEnum) {
    MetodoPagoEnum["EFECTIVO"] = "EFECTIVO";
    MetodoPagoEnum["TARJETA"] = "TARJETA";
    MetodoPagoEnum["CREDITO"] = "CREDITO";
})(MetodoPagoEnum || (exports.MetodoPagoEnum = MetodoPagoEnum = {}));
class DetalleVentaItemDto {
}
exports.DetalleVentaItemDto = DetalleVentaItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], DetalleVentaItemDto.prototype, "productoId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01, { message: 'La cantidad debe ser mayor a cero' }),
    __metadata("design:type", Number)
], DetalleVentaItemDto.prototype, "cantidad", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], DetalleVentaItemDto.prototype, "precioUnitario", void 0);
class CreateVentaDto {
}
exports.CreateVentaDto = CreateVentaDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateVentaDto.prototype, "clienteId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(MetodoPagoEnum),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateVentaDto.prototype, "metodoPago", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateVentaDto.prototype, "descuento", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateVentaDto.prototype, "notas", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => DetalleVentaItemDto),
    __metadata("design:type", Array)
], CreateVentaDto.prototype, "detalles", void 0);
//# sourceMappingURL=create-venta.dto.js.map