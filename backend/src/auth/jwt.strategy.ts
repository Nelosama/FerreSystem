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

    if (payload.type === 'tenant') {
      const user=await this.prisma.usuario.findFirst({where:{id:payload.sub,tenantId:payload.tenantId,activo:true},include:{tenant:true}});
      if(!user || user.tenant.estado !== 'ACTIVO') throw new UnauthorizedException('Usuario o empresa no disponible');
      return {
        sub: payload.sub,
        email: payload.email,
        rol: user.rol,
        permisos:user.permisos,
        permisosConfigurados:user.permisosConfigurados,
        descuentoMaximo:Number(user.descuentoMaximo),
        type: 'tenant',
        tenantId: payload.tenantId,
        ...(payload.impersonatedBy ? { impersonatedBy: payload.impersonatedBy, readOnly: payload.readOnly !== false } : {}),
      };
    }

    if (payload.type === 'super_admin') {
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

