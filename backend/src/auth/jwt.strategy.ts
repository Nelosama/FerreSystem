import { PrismaService } from '../prisma/prisma.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { getJwtSecret } from './jwt-secret';

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
  constructor(configService: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService),
    });
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

