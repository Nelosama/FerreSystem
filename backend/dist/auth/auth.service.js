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
var AuthService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwtService, configService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async login(loginDto, res, req) {
        const { email, password } = loginDto;
        const targetTenantId = loginDto.tenantId || req?.headers['x-tenant-id'] || undefined;
        const normalizedEmail = email?.toLowerCase().trim();
        let superAdmin = null;
        try {
            superAdmin = await this.prisma.superAdmin.findUnique({ where: { email: normalizedEmail } });
        }
        catch (error) {
            const errorCode = error?.code || error?.meta?.code || 'N/A';
            this.logger.error('[LOGIN_DIAGNOSTIC] Error consultando SuperAdmin.', error?.stack);
            throw new common_1.InternalServerErrorException({
                statusCode: 500,
                message: 'Error de conexión o consulta con la base de datos al autenticar',
                error: 'DatabaseQueryError',
                code: errorCode,
            });
        }
        if (superAdmin) {
            if (!superAdmin.activo || !(await bcrypt.compare(password, superAdmin.passwordHash))) {
                throw new common_1.UnauthorizedException('Credenciales inválidas');
            }
            const payload = {
                sub: superAdmin.id,
                email: superAdmin.email,
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
                sameSite: isProduction ? 'none' : 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/api/admin/auth',
            });
            return {
                type: 'super_admin',
                accessToken,
                superAdmin: {
                    id: superAdmin.id,
                    nombre: superAdmin.nombre,
                    email: superAdmin.email,
                },
            };
        }
        this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 1-2] Inicio de intento de login para email normalizado: "${normalizedEmail}" (TenantId objetivo: ${targetTenantId || 'autodetect'})`);
        let usuario = null;
        try {
            if (targetTenantId) {
                this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 3] Buscando usuario específico en tenant: "${targetTenantId}" para email: "${normalizedEmail}"`);
                usuario = await this.prisma.usuario.findFirst({
                    where: { tenantId: targetTenantId, email: normalizedEmail },
                    include: { tenant: true },
                });
            }
            else {
                this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 3] Consultando usuarios globales con email: "${normalizedEmail}"`);
                const matchingUsers = await this.prisma.usuario.findMany({
                    where: { email: normalizedEmail },
                    include: { tenant: true },
                });
                if (matchingUsers.length === 1) {
                    usuario = matchingUsers[0];
                }
                else if (matchingUsers.length > 1) {
                    this.logger.log(`[LOGIN_DIAGNOSTIC] Se encontraron ${matchingUsers.length} usuarios con el mismo email en diferentes tenants. Identificando por credenciales.`);
                    const validUsers = [];
                    for (const u of matchingUsers) {
                        if (u.passwordHash && (await bcrypt.compare(password, u.passwordHash))) {
                            validUsers.push(u);
                        }
                    }
                    if (validUsers.length === 1) {
                        usuario = validUsers[0];
                    }
                    else if (validUsers.length > 1) {
                        throw new common_1.UnauthorizedException('Existen múltiples cuentas con este correo. Debe especificar el identificador de la empresa (Tenant ID).');
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            const errorMsg = error?.message || 'Error desconocido';
            const errorCode = error?.code || error?.meta?.code || 'N/A';
            this.logger.error(`[LOGIN_DIAGNOSTIC] [CASO E] ERROR DE BD/PRISMA durante consulta de usuario. Código: ${errorCode}, Mensaje: ${errorMsg}`, error?.stack);
            throw new common_1.InternalServerErrorException({
                statusCode: 500,
                message: 'Error de conexión o consulta con la base de datos al autenticar',
                error: 'DatabaseQueryError',
                code: errorCode,
            });
        }
        if (!usuario) {
            this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO A] Usuario NO encontrado para email: "${normalizedEmail}"`);
            throw new common_1.UnauthorizedException('Credenciales inválidas');
        }
        this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 4] Usuario encontrado - ID: ${usuario.id}, TenantID: ${usuario.tenantId}, Rol: ${usuario.rol}, Activo: ${usuario.activo}`);
        if (!usuario.activo) {
            this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO C] Usuario encontrado pero INACTIVO - ID: ${usuario.id}`);
            throw new common_1.UnauthorizedException('Este usuario ha sido desactivado');
        }
        this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 5] Estado del usuario verificado: ACTIVO`);
        const tenantEstado = usuario.tenant?.estado;
        this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 6] Verificando estado del tenant (${usuario.tenantId}): ${tenantEstado}`);
        if (tenantEstado !== 'ACTIVO') {
            this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO D] Tenant NO está ACTIVO (${usuario.tenantId}) - Estado actual: ${tenantEstado}`);
            throw new common_1.UnauthorizedException('La suscripción de la ferretería se encuentra suspendida');
        }
        let passwordValido = false;
        try {
            this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 7] Comparando contraseña con bcrypt.compare()`);
            passwordValido = await bcrypt.compare(password, usuario.passwordHash);
        }
        catch (bcryptError) {
            this.logger.error(`[LOGIN_DIAGNOSTIC] [CASO F] Error de ejecución en bcrypt.compare(): ${bcryptError?.message}`, bcryptError?.stack);
            throw new common_1.InternalServerErrorException('Error al validar credenciales de seguridad');
        }
        this.logger.log(`[LOGIN_DIAGNOSTIC] Resultado de bcrypt.compare(): ${passwordValido}`);
        if (!passwordValido) {
            this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO B] Contraseña INCORRECTA para usuario ID: ${usuario.id}`);
            throw new common_1.UnauthorizedException('Credenciales inválidas');
        }
        this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 8] Generando tokens JWT para usuario ID: ${usuario.id}`);
        const payload = {
            sub: usuario.id,
            tenantId: usuario.tenantId,
            rol: usuario.rol,
            email: usuario.email,
            type: 'tenant',
        };
        const accessToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
        });
        const refreshToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        });
        const isProduction = this.configService.get('NODE_ENV') === 'production';
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });
        this.logger.log(`[LOGIN_DIAGNOSTIC] [CASO G] Login EXITOSO para usuario ID: ${usuario.id}, TenantID: ${usuario.tenantId}`);
        return {
            type: 'tenant',
            accessToken,
            user: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                rol: usuario.rol,
                activo: usuario.activo,
            },
            tenant: {
                id: usuario.tenant.id,
                nombreComercial: usuario.tenant.nombreComercial,
                logoUrl: usuario.tenant.logoUrl,
                colorPrimario: usuario.tenant.colorPrimario,
                estado: usuario.tenant.estado,
            },
        };
    }
    async refresh(refreshToken, res) {
        if (!refreshToken) {
            throw new common_1.UnauthorizedException('No se encontró el refresh token en las cookies');
        }
        try {
            const decoded = this.jwtService.verify(refreshToken);
            if (decoded.type !== 'tenant' || !decoded.tenantId) {
                throw new common_1.UnauthorizedException('Token inválido para refrescar sesión');
            }
            const usuario = await this.prisma.usuario.findUnique({
                where: { id: decoded.sub },
                include: { tenant: true },
            });
            if (!usuario || !usuario.activo || usuario.tenant.estado !== 'ACTIVO') {
                throw new common_1.UnauthorizedException('Usuario o ferretería no autorizados');
            }
            const newPayload = {
                sub: usuario.id,
                tenantId: usuario.tenantId,
                rol: usuario.rol,
                email: usuario.email,
                type: 'tenant',
            };
            const accessToken = this.jwtService.sign(newPayload, {
                expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
            });
            return { accessToken };
        }
        catch {
            res.clearCookie('refreshToken', { path: '/' });
            throw new common_1.UnauthorizedException('Refresh token expirado o inválido');
        }
    }
    logout(res) {
        res.clearCookie('refreshToken', { path: '/' });
        return { success: true, message: 'Sesión cerrada correctamente' };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, typeof (_a = typeof jwt_1.JwtService !== "undefined" && jwt_1.JwtService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map