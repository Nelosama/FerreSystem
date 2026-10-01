import { Injectable, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto, res: Response, req?: Request) {
    const { email, password } = loginDto;
    const targetTenantId = loginDto.tenantId || (req?.headers['x-tenant-id'] as string) || undefined;

    // Etapa 1 & 2: Recepción de petición y normalización de email
    const normalizedEmail = email?.toLowerCase().trim();
    let superAdmin: any = null;
    try {
      superAdmin = await this.prisma.superAdmin.findUnique({ where: { email: normalizedEmail } });
    } catch (error: any) {
      const errorCode = error?.code || error?.meta?.code || 'N/A';
      this.logger.error('[LOGIN_DIAGNOSTIC] Error consultando SuperAdmin.', error?.stack);
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'Error de conexión o consulta con la base de datos al autenticar',
        error: 'DatabaseQueryError',
        code: errorCode,
      });
    }

    if (superAdmin) {
      if (!superAdmin.activo || !(await bcrypt.compare(password, superAdmin.passwordHash))) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const payload = {
        sub: superAdmin.id,
        email: superAdmin.email,
        rol: 'SUPER_ADMIN',
        type: 'super_admin',
      };
      const accessToken = this.jwtService.sign(payload, {
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
      });
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
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
        type: 'super_admin' as const,
        accessToken,
        superAdmin: {
          id: superAdmin.id,
          nombre: superAdmin.nombre,
          email: superAdmin.email,
        },
      };
    }

    this.logger.log(
      `[LOGIN_DIAGNOSTIC] [ETAPA 1-2] Inicio de intento de login para email normalizado: "${normalizedEmail}" (TenantId objetivo: ${targetTenantId || 'autodetect'})`,
    );

    // Etapa 3 & 4: Búsqueda en BD considerando multi-tenancy (@@unique([tenantId, email]))
    let usuario: any = null;
    try {
      if (targetTenantId) {
        this.logger.log(
          `[LOGIN_DIAGNOSTIC] [ETAPA 3] Buscando usuario específico en tenant: "${targetTenantId}" para email: "${normalizedEmail}"`,
        );
        usuario = await this.prisma.usuario.findFirst({
          where: { tenantId: targetTenantId, email: normalizedEmail },
          include: { tenant: true },
        });
      } else {
        this.logger.log(
          `[LOGIN_DIAGNOSTIC] [ETAPA 3] Consultando usuarios globales con email: "${normalizedEmail}"`,
        );
        const matchingUsers = await this.prisma.usuario.findMany({
          where: { email: normalizedEmail },
          include: { tenant: true },
        });

        if (matchingUsers.length === 1) {
          usuario = matchingUsers[0];
        } else if (matchingUsers.length > 1) {
          this.logger.log(
            `[LOGIN_DIAGNOSTIC] Se encontraron ${matchingUsers.length} usuarios con el mismo email en diferentes tenants. Identificando por credenciales.`,
          );
          const validUsers: any[] = [];
          for (const u of matchingUsers) {
            if (u.passwordHash && (await bcrypt.compare(password, u.passwordHash))) {
              validUsers.push(u);
            }
          }

          if (validUsers.length === 1) {
            usuario = validUsers[0];
          } else if (validUsers.length > 1) {
            throw new UnauthorizedException(
              'Existen múltiples cuentas con este correo. Debe especificar el identificador de la empresa (Tenant ID).',
            );
          }
        }
      }
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const errorMsg = error?.message || 'Error desconocido';
      const errorCode = error?.code || error?.meta?.code || 'N/A';
      this.logger.error(
        `[LOGIN_DIAGNOSTIC] [CASO E] ERROR DE BD/PRISMA durante consulta de usuario. Código: ${errorCode}, Mensaje: ${errorMsg}`,
        error?.stack,
      );
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'Error de conexión o consulta con la base de datos al autenticar',
        error: 'DatabaseQueryError',
        code: errorCode,
      });
    }

    if (!usuario) {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO A] Usuario NO encontrado para email: "${normalizedEmail}"`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.logger.log(
      `[LOGIN_DIAGNOSTIC] [ETAPA 4] Usuario encontrado - ID: ${usuario.id}, TenantID: ${usuario.tenantId}, Rol: ${usuario.rol}, Activo: ${usuario.activo}`,
    );

    // Etapa 5: Validación de usuario.activo
    if (!usuario.activo) {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO C] Usuario encontrado pero INACTIVO - ID: ${usuario.id}`);
      throw new UnauthorizedException('Este usuario ha sido desactivado');
    }
    this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 5] Estado del usuario verificado: ACTIVO`);

    // Etapa 6: Validación de usuario.tenant.estado
    const tenantEstado = usuario.tenant?.estado;
    this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 6] Verificando estado del tenant (${usuario.tenantId}): ${tenantEstado}`);
    if (tenantEstado !== 'ACTIVO') {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO D] Tenant NO está ACTIVO (${usuario.tenantId}) - Estado actual: ${tenantEstado}`);
      throw new UnauthorizedException('La suscripción de la ferretería se encuentra suspendida');
    }

    // Etapa 7: Validación de contraseña con bcrypt
    let passwordValido = false;
    try {
      this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 7] Comparando contraseña con bcrypt.compare()`);
      passwordValido = await bcrypt.compare(password, usuario.passwordHash);
    } catch (bcryptError: any) {
      this.logger.error(
        `[LOGIN_DIAGNOSTIC] [CASO F] Error de ejecución en bcrypt.compare(): ${bcryptError?.message}`,
        bcryptError?.stack,
      );
      throw new InternalServerErrorException('Error al validar credenciales de seguridad');
    }

    this.logger.log(`[LOGIN_DIAGNOSTIC] Resultado de bcrypt.compare(): ${passwordValido}`);
    if (!passwordValido) {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO B] Contraseña INCORRECTA para usuario ID: ${usuario.id}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Etapa 8: Generación de JWT
    this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 8] Generando tokens JWT para usuario ID: ${usuario.id}`);
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

    // Etapa 9: Respuesta exitosa
    this.logger.log(`[LOGIN_DIAGNOSTIC] [CASO G] Login EXITOSO para usuario ID: ${usuario.id}, TenantID: ${usuario.tenantId}`);

    return {
      type: 'tenant' as const,
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
