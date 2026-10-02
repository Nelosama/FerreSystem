"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CotizacionesModule = void 0;
const common_1 = require("@nestjs/common");
const cotizaciones_service_1 = require("./cotizaciones.service");
const cotizaciones_controller_1 = require("./cotizaciones.controller");
let CotizacionesModule = class CotizacionesModule {
};
exports.CotizacionesModule = CotizacionesModule;
exports.CotizacionesModule = CotizacionesModule = __decorate([
    (0, common_1.Module)({
        controllers: [cotizaciones_controller_1.CotizacionesController],
        providers: [cotizaciones_service_1.CotizacionesService],
        exports: [cotizaciones_service_1.CotizacionesService],
    })
], CotizacionesModule);
//# sourceMappingURL=cotizaciones.module.js.map