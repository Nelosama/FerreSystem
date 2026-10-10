import { PrismaService } from '../prisma/prisma.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { getJwtSecret } from './jwt-secret';
import { leerConfiguracionAuth } from './auth-config';
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
  permisos?:string[];
  permisosConfigurados?:boolean;
  descuentoMaximo?:number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly aceptarTokensSinSesion: boolean;

  constructor(configService: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService),
    });
    this.aceptarTokensSinSesion = leerConfiguracionAuth(configService).aceptarTokensSinSesion;
  }

  // Una sesión revocada o vencida no autoriza nada, aunque la firma y el vencimiento del token sean válidos.
  private async exigirSesion(payload: any) {
    if (!payload.sid) {
      if (this.aceptarTokensSinSesion) return;
      throw new UnauthorizedException('Sesión no válida. Inicie sesión de nuevo.');
    }
    if (!(await sesionVigente(this.prisma, String(payload.sid), String(payload.sub)))) {
      throw new UnauthorizedException('Sesión cerrada o vencida. Inicie sesión de nuevo.');
    }
  }

  async validate(payload: any): Promise<JwtValidatedPayload> {
    if (!payload || !payload.sub || !payload.type) {
      throw new UnauthorizedException('Token inválido');
    }
    // El refresh token vive en cookie y solo lo acepta /auth/refresh; nunca autoriza una petición de API.
    if (payload.typ === 'refresh') throw new UnauthorizedException('Token inválido');

    if (payload.type === 'tenant') {
      const user=await this.prisma.usuario.findFirst({where:{id:payload.sub,tenantId:payload.tenantId,activo:true},include:{tenant:true}});
      if(!user || user.tenant.estado !== 'ACTIVO') throw new UnauthorizedException('Usuario o empresa no disponible');
      await this.exigirSesion(payload);
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
        ...(payload.impersonatedBy ? { impersonatedBy: payload.impersonatedBy, soporteSesionId: payload.soporteSesionId, readOnly: payload.readOnly !== false } : {}),
      };
    }

    if (payload.type === 'super_admin') {
      // Revalidar en cada petición: un Super Admin desactivado no conserva acceso hasta que expire el token.
      const superAdmin = await this.prisma.superAdmin.findUnique({ where: { id: String(payload.sub) }, select: { activo: true } });
      if (!superAdmin?.activo) throw new UnauthorizedException('Super Admin no autorizado');
      await this.exigirSesion(payload);
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

