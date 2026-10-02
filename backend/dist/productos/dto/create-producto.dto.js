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
exports.UpdateProductoDto = exports.CreateProductoDto = exports.UnidadMedidaEnum = void 0;
const class_validator_1 = require("class-validator");
var UnidadMedidaEnum;
(function (UnidadMedidaEnum) {
    UnidadMedidaEnum["UNIDAD"] = "UNIDAD";
    UnidadMedidaEnum["CAJA"] = "CAJA";
    UnidadMedidaEnum["METRO"] = "METRO";
    UnidadMedidaEnum["KG"] = "KG";
    UnidadMedidaEnum["GALON"] = "GALON";
    UnidadMedidaEnum["LIBRA"] = "LIBRA";
})(UnidadMedidaEnum || (exports.UnidadMedidaEnum = UnidadMedidaEnum = {}));
class CreateProductoDto {
}
exports.CreateProductoDto = CreateProductoDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'El código del producto es requerido' }),
    __metadata("design:type", String)
], CreateProductoDto.prototype, "codigo", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductoDto.prototype, "codigoBarras", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'El nombre del producto es requerido' }),
    __metadata("design:type", String)
], CreateProductoDto.prototype, "nombre", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductoDto.prototype, "descripcion", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductoDto.prototype, "categoriaId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'El precio de venta debe ser un número' }),
    (0, class_validator_1.Min)(0, { message: 'El precio de venta no puede ser negativo' }),
    __metadata("design:type", Number)
], CreateProductoDto.prototype, "precioVenta", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'El precio de costo debe ser un número' }),
    (0, class_validator_1.Min)(0, { message: 'El precio de costo no puede ser negativo' }),
    __metadata("design:type", Number)
], CreateProductoDto.prototype, "precioCosto", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateProductoDto.prototype, "stockActual", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateProductoDto.prototype, "stockMinimo", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(UnidadMedidaEnum, { message: 'Unidad de medida no válida' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductoDto.prototype, "unidadMedida", void 0);
class UpdateProductoDto {
}
exports.UpdateProductoDto = UpdateProductoDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProductoDto.prototype, "codigo", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProductoDto.prototype, "codigoBarras", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProductoDto.prototype, "nombre", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProductoDto.prototype, "descripcion", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProductoDto.prototype, "categoriaId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateProductoDto.prototype, "precioVenta", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateProductoDto.prototype, "precioCosto", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateProductoDto.prototype, "stockActual", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateProductoDto.prototype, "stockMinimo", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(UnidadMedidaEnum),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProductoDto.prototype, "unidadMedida", void 0);
//# sourceMappingURL=create-producto.dto.js.map