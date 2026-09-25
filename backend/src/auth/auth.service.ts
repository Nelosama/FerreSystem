import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: { email: string; password: string }, res: Response) {
    const { email, password } = loginDto;

    // Buscar usuario por email (incluyendo datos de su tenant)
    const usuario = await this.prisma.usuario.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: { tenant: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('Este usuario ha sido desactivado');
    }

    if (usuario.tenant.estado !== 'ACTIVO') {
      throw new UnauthorizedException('La suscripción de la ferretería se encuentra suspendida');
    }

    const passwordValido = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Generar tokens
    const payload = {
      sub: usuario.id,
      tenantId: usuario.tenantId,
      rol: usuario.rol,
      email: usuario.email,
      type: 'tenant',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
    });

    // Guardar refresh token en cookie httpOnly + secure
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/',
    });

    return {
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

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('No se encontró el refresh token en las cookies');
    }

    try {
      const decoded = this.jwtService.verify(refreshToken);
      if (decoded.type !== 'tenant' || !decoded.tenantId) {
        throw new UnauthorizedException('Token inválido para refrescar sesión');
      }

      const usuario = await this.prisma.usuario.findUnique({
        where: { id: decoded.sub },
        include: { tenant: true },
      });

      if (!usuario || !usuario.activo || usuario.tenant.estado !== 'ACTIVO') {
        throw new UnauthorizedException('Usuario o ferretería no autorizados');
      }

      const newPayload = {
        sub: usuario.id,
        tenantId: usuario.tenantId,
        rol: usuario.rol,
        email: usuario.email,
        type: 'tenant',
      };

      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
      });

      return { accessToken };
    } catch {
      res.clearCookie('refreshToken', { path: '/' });
      throw new UnauthorizedException('Refresh token expirado o inválido');
    }
  }

  logout(res: Response) {
    res.clearCookie('refreshToken', { path: '/' });
    return { success: true, message: 'Sesión cerrada correctamente' };
  }
}
