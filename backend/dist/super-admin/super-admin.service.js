"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuperAdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
let SuperAdminService = class SuperAdminService {
    constructor(prisma, jwtService, configService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
    }
    async login(loginDto, res) {
        const { email, password } = loginDto;
        const admin = await this.prisma.superAdmin.findUnique({
            where: { email: email.toLowerCase().trim() },
        });
        if (!admin || !admin.activo) {
            throw new common_1.UnauthorizedException('Credenciales de Super Admin inválidas');
        }
        const passwordValido = await bcrypt.compare(password, admin.passwordHash);
        if (!passwordValido) {
            throw new common_1.UnauthorizedException('Credenciales de Super Admin inválidas');
        }
        const payload = {
            sub: admin.id,
            email: admin.email,
            rol: 'SUPER_ADMIN',
            type: 'super_admin',
        };
        const accessToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
        });
        const refreshToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        });
        const isProduction = this.configService.get('NODE_ENV') === 'production';
        res.cookie('superAdminRefreshToken', refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/admin',
        });
        return {
            accessToken,
            superAdmin: {
                id: admin.id,
                nombre: admin.nombre,
                email: admin.email,
            },
        };
    }
    async listTenants() {
        const tenants = await this.prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                modulos: true,
                _count: {
                    select: {
                        usuarios: true,
                        productos: true,
                        ventas: true,
                    },
                },
            },
        });
        return tenants.map((t) => ({
            id: t.id,
            nombreComercial: t.nombreComercial,
            direccion: t.direccion,
            telefono: t.telefono,
            email: t.email,
            logoUrl: t.logoUrl,
            colorPrimario: t.colorPrimario,
            modoNavegacion: t.modoNavegacion,
            plan: t.plan,
            estado: t.estado,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            cantidadUsuarios: t._count.usuarios,
            cantidadProductos: t._count.productos,
            cantidadVentas: t._count.ventas,
            modulosHabilitados: t.modulos.filter((m) => m.enabled).map((m) => m.moduleKey),
        }));
    }
    async getTenantModules(tenantId) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { modulos: true },
        });
        if (!tenant) {
            throw new common_1.NotFoundException('Ferretería no encontrada');
        }
        return tenant.modulos;
    }
    async updateTenantModules(tenantId, modules) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            throw new common_1.NotFoundException('Ferretería no encontrada');
        }
        return this.prisma.$transaction(async (tx) => {
            for (const item of modules) {
                await tx.tenantModule.upsert({
                    where: {
                        tenantId_moduleKey: {
                            tenantId,
                            moduleKey: item.moduleKey,
                        },
                    },
                    update: { enabled: item.enabled },
                    create: {
                        tenantId,
                        moduleKey: item.moduleKey,
                        enabled: item.enabled,
                    },
                });
            }
            const updatedModules = await tx.tenantModule.findMany({
                where: { tenantId },
            });
            return updatedModules;
        });
    }
    async updateTenantConfig(tenantId, dto) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            throw new common_1.NotFoundException('Ferretería no encontrada');
        }
        return this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                ...(dto.nombreComercial ? { nombreComercial: dto.nombreComercial } : {}),
                ...(dto.direccion !== undefined ? { direccion: dto.direccion } : {}),
                ...(dto.telefono !== undefined ? { telefono: dto.telefono } : {}),
                ...(dto.email !== undefined ? { email: dto.email } : {}),
                ...(dto.colorPrimario ? { colorPrimario: dto.colorPrimario } : {}),
                ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
                ...(dto.modoNavegacion ? { modoNavegacion: dto.modoNavegacion } : {}),
                ...(dto.plan ? { plan: dto.plan } : {}),
            },
        });
    }
    async createTenant(dto) {
        const emailNormalizado = dto.adminEmail.toLowerCase().trim();
        return this.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    nombreComercial: dto.nombreComercial,
                    direccion: dto.direccion,
                    telefono: dto.telefono,
                    email: dto.email,
                    colorPrimario: dto.colorPrimario || '#EA580C',
                },
            });
            await tx.secuenciaTenant.createMany({
                data: [
                    { tenantId: tenant.id, tipo: 'VENTA', ultimoNumero: 0 },
                    { tenantId: tenant.id, tipo: 'COTIZACION', ultimoNumero: 0 },
                ],
            });
            const defaultModules = [
                'pos',
                'cotizaciones',
                'pedidos_especiales',
                'apartados',
                'inventario',
                'ordenes_compra',
                'transferencias_sucursal',
                'garantias',
                'listas_precio',
                'usuarios',
                'comisiones_venta',
                'arqueo_caja',
                'reportes',
                'configuracion',
            ];
            await tx.tenantModule.createMany({
                data: defaultModules.map((moduleKey) => ({
                    tenantId: tenant.id,
                    moduleKey,
                    enabled: true,
                })),
            });
            const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
            const adminUsuario = await tx.usuario.create({
                data: {
                    tenantId: tenant.id,
                    nombre: dto.adminNombre,
                    email: emailNormalizado,
                    passwordHash,
                    rol: 'ADMIN',
                    activo: true,
                },
            });
            return {
                tenant,
                adminUsuario: {
                    id: adminUsuario.id,
                    nombre: adminUsuario.nombre,
                    email: adminUsuario.email,
                    rol: adminUsuario.rol,
                },
            };
        });
    }
    async toggleTenantStatus(tenantId, estado) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            throw new common_1.NotFoundException('Ferretería no encontrada');
        }
        return this.prisma.tenant.update({
            where: { id: tenantId },
            data: { estado },
        });
    }
};
exports.SuperAdminService = SuperAdminService;
exports.SuperAdminService = SuperAdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, typeof (_a = typeof jwt_1.JwtService !== "undefined" && jwt_1.JwtService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object])
], SuperAdminService);
//# sourceMappingURL=super-admin.service.js.map