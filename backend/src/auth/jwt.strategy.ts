import { PrismaService } from '../prisma/prisma.service';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { getJwtSecret } from './jwt-secret';
import { aceptaTokenSinSesion, ConfiguracionAuth, leerConfiguracionAuth } from './auth-config';
import { sesionVigente } from './sesiones-auth';

export interface JwtValidatedPayload {
  sub: string;
  email: string;
  rol: string;
  type: 'tenant' | 'super_admin';
  tenantId?: string;
  impersonatedBy?: string;
  soporteSesionId?: string;
  readOnly?: boolean;
  sid?: string;
  permisos?:string[];
  permisosConfigurados?:boolean;
  descuentoMaximo?:number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly configuracionAuth: ConfiguracionAuth;

  constructor(configService: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService),
    });
    this.configuracionAuth = leerConfiguracionAuth(configService);
  }

  // Una sesión revocada o vencida no autoriza nada, aunque la firma y el vencimiento del token sean válidos.
  private async exigirSesion(payload: any, passwordHash?: string) {
    if (!payload.sid) {
      if (aceptaTokenSinSesion(this.configuracionAuth)) return;
      throw new UnauthorizedException('Sesión no válida. Inicie sesión de nuevo.');
    }
    if (!(await sesionVigente(this.prisma, String(payload.sid), String(payload.sub), passwordHash))) {
      throw new UnauthorizedException('Sesión cerrada o vencida. Inicie sesión de nuevo.');
    }
  }

  async validate(payload: any): Promise<JwtValidatedPayload> {
    try { return await this.validatePayload(payload); }
    catch (error) {
      // Infrastructure failure cannot establish that a session was revoked.
      // Fail closed with a recoverable response; never retry a business write.
      const code = error && typeof error === 'object'
        ? ('code' in error ? error.code : 'errorCode' in error ? error.errorCode : undefined)
        : undefined;
      if (typeof code === 'string' && ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037'].includes(code)) {
        throw new ServiceUnavailableException('Servicio temporalmente no disponible');
      }
      throw error;
    }
  }

  private async validatePayload(payload: any): Promise<JwtValidatedPayload> {
    if (!payload || !payload.sub || !payload.type) {
      throw new UnauthorizedException('Token inválido');
    }
    // El refresh token vive en cookie y solo lo acepta /auth/refresh; nunca autoriza una petición de API.
    if (payload.typ === 'refresh') throw new UnauthorizedException('Token inválido');

    if (payload.type === 'tenant') {
      // Una cuenta bloqueada por intentos fallidos no autoriza nada, aunque conserve un token (p. ej. sin sesión revocable).
      const user=await this.prisma.usuario.findFirst({where:{id:payload.sub,tenantId:payload.tenantId,activo:true,bloqueadoAt:null},include:{tenant:true}});
      if(!user || user.tenant.estado !== 'ACTIVO') throw new UnauthorizedException('Usuario o empresa no disponible');
      await this.exigirSesion(payload, user.passwordHash);
      // Una sesión de soporte solo es válida si el Super Admin que la originó sigue activo y el token trae su sesión auditada.
      if (payload.impersonatedBy) {
        if (typeof payload.soporteSesionId !== 'string' || !payload.soporteSesionId) throw new UnauthorizedException('Sesión de soporte inválida');
        const superAdmin = await this.prisma.superAdmin.findUnique({ where: { id: String(payload.impersonatedBy) }, select: { activo: true } });
        if (!superAdmin?.activo) throw new UnauthorizedException('Sesión de soporte no autorizada');
      }
      return {
        sub: payload.sub,
        email: payload.email,
        rol: user.rol,
        permisos:user.permisos,
        permisosConfigurados:user.permisosConfigurados,
        descuentoMaximo:Number(user.descuentoMaximo),
        type: 'tenant',
        tenantId: payload.tenantId,
        sid: typeof payload.sid === 'string' ? payload.sid : undefined,
        ...(payload.impersonatedBy ? { impersonatedBy: payload.impersonatedBy, soporteSesionId: payload.soporteSesionId, readOnly: payload.readOnly !== false } : {}),
      };
    }

    if (payload.type === 'super_admin') {
      // Revalidar en cada petición: un Super Admin desactivado no conserva acceso hasta que expire el token.
      const superAdmin = await this.prisma.superAdmin.findUnique({ where: { id: String(payload.sub) }, select: { activo: true, mfaSecret: true, passwordHash: true } });
      if (!superAdmin?.activo || !superAdmin.mfaSecret || payload.mfa !== true) throw new UnauthorizedException('Super Admin no autorizado');
      await this.exigirSesion(payload, superAdmin.passwordHash);
      return {
        sub: payload.sub,
        email: payload.email,
        rol: 'SUPER_ADMIN',
        type: 'super_admin',
      };
    }

    throw new UnauthorizedException('Tipo de token no reconocido');
  }
}

