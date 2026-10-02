"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const prisma_module_1 = require("./prisma/prisma.module");
const tenant_module_guard_1 = require("./common/guards/tenant-module.guard");
const auth_module_1 = require("./auth/auth.module");
const super_admin_module_1 = require("./super-admin/super-admin.module");
const tenants_module_1 = require("./tenants/tenants.module");
const productos_module_1 = require("./productos/productos.module");
const clientes_module_1 = require("./clientes/clientes.module");
const ventas_module_1 = require("./ventas/ventas.module");
const cotizaciones_module_1 = require("./cotizaciones/cotizaciones.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
const usuarios_module_1 = require("./usuarios/usuarios.module");
const levantamientos_module_1 = require("./levantamientos/levantamientos.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', '.env.local'],
            }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            super_admin_module_1.SuperAdminModule,
            tenants_module_1.TenantsModule,
            productos_module_1.ProductosModule,
            clientes_module_1.ClientesModule,
            ventas_module_1.VentasModule,
            cotizaciones_module_1.CotizacionesModule,
            dashboard_module_1.DashboardModule,
            usuarios_module_1.UsuariosModule,
            levantamientos_module_1.LevantamientosModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: tenant_module_guard_1.TenantModuleGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map