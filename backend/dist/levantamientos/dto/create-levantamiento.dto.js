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
exports.UpdateLevantamientoDto = exports.CreateLevantamientoDto = exports.EstadoLevantamientoEnum = void 0;
const class_validator_1 = require("class-validator");
var EstadoLevantamientoEnum;
(function (EstadoLevantamientoEnum) {
    EstadoLevantamientoEnum["BORRADOR"] = "BORRADOR";
    EstadoLevantamientoEnum["EN_PROGRESO"] = "EN_PROGRESO";
    EstadoLevantamientoEnum["REVISION"] = "REVISION";
    EstadoLevantamientoEnum["FINALIZADO"] = "FINALIZADO";
})(EstadoLevantamientoEnum || (exports.EstadoLevantamientoEnum = EstadoLevantamientoEnum = {}));
class CreateLevantamientoDto {
}
exports.CreateLevantamientoDto = CreateLevantamientoDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'El nombre del levantamiento es requerido' }),
    __metadata("design:type", String)
], CreateLevantamientoDto.prototype, "nombre", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLevantamientoDto.prototype, "descripcion", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(EstadoLevantamientoEnum, { message: 'Estado de levantamiento no válido' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLevantamientoDto.prototype, "estado", void 0);
class UpdateLevantamientoDto {
}
exports.UpdateLevantamientoDto = UpdateLevantamientoDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoDto.prototype, "nombre", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoDto.prototype, "descripcion", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(EstadoLevantamientoEnum, { message: 'Estado de levantamiento no válido' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLevantamientoDto.prototype, "estado", void 0);
//# sourceMappingURL=create-levantamiento.dto.js.map