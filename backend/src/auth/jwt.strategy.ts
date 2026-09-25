import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtValidatedPayload {
  sub: string;
  email: string;
  rol: string;
  type: 'tenant' | 'super_admin';
  tenantId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'ferresystem-super-secure-dev-secret-key-2026',
    });
  }

  async validate(payload: any): Promise<JwtValidatedPayload> {
    if (!payload || !payload.sub || !payload.type) {
      throw new UnauthorizedException('Token inválido');
    }

    if (payload.type === 'tenant') {
      return {
        sub: payload.sub,
        email: payload.email,
        rol: payload.rol,
        type: 'tenant',
        tenantId: payload.tenantId,
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
