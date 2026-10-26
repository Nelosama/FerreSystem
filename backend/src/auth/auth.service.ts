import { requireMfa } from './mfa';
import { missingPasswordCheck } from './password-timing';
import { refreshCookieOptions } from './refresh-cookie';
import { normalizeTenantConfiguration } from '../tenants/tenant-configuration';
import { Injectable, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { randomUUID } from 'node:crypto';
import { leerConfiguracionAuth } from './auth-config';
import { clavesDeLogin, excepcionLimiteLogin, registrarExitoLogin, registrarFalloLogin, segundosBloqueados } from './login-rate-limit';
import { crearSesion, revocarSesion, rotarRefresh, sidDeToken } from './sesiones-auth';
import { consumirClaveTemporal, CuentaResuelta, registrarExitoCuenta, registrarFalloCuenta, resolverCuenta, verificarClave } from './credenciales';

export const MENSAJE_AMBIGUO = 'Este usuario corresponde a más de una cuenta. Ingrese con su correo o con el enlace de su empresa, o pida ayuda a su administrador.';
export const MENSAJE_BLOQUEADA = 'Cuenta bloqueada por intentos fallidos. Contacte a su administrador para reactivarla.';

const bearerDe = (req?: Request) => req?.headers?.authorization?.replace(/^Bearer /, '') || undefined;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // Límite de intentos por cuenta y por IP. Un fallo cuenta aunque la cuenta no exista.
  async login(loginDto: LoginDto, res: Response, req?: Request) {
    const claves = clavesDeLogin(`${loginDto.tenantId || 'global'}:${loginDto?.email}`, req?.ip);
    const segundos = await segundosBloqueados(this.prisma, claves);
    if (segundos > 0) {
      res.setHeader('Retry-After', String(segundos));
      throw excepcionLimiteLogin(segundos);
    }
    try {
      const resultado = await this.autenticar(loginDto, res, req);
      await registrarExitoLogin(this.prisma, claves);
      return resultado;
    } catch (error) {
      // Pedir el segundo factor tras una contraseña correcta no es un intento fallido.
      if (error instanceof UnauthorizedException && (error.getResponse() as any)?.code !== 'MFA_REQUERIDO') {
        await registrarFalloLogin(this.prisma, claves, leerConfiguracionAuth(this.configService));
      }
      throw error;
    }
  }

  private expiracionRefresh(refreshToken: string): Date {
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    return new Date((decoded?.exp ?? 0) * 1000);
  }

  private async autenticar(loginDto: LoginDto, res: Response, req?: Request) {
    const { email, password } = loginDto;
    // Solo un enlace de empresa aporta tenantId; el formulario de login no pide empresa.
    const targetTenantId = loginDto.tenantId || (req?.headers['x-tenant-id'] as string) || undefined;

    let resolucion: CuentaResuelta;
    try {
      resolucion = await resolverCuenta(this.prisma, email, targetTenantId);
    } catch (error: any) {
      const errorCode = typeof error?.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : 'N/A';
      this.logger.error(`[LOGIN_DIAGNOSTIC] Error consultando la cuenta. Código: ${errorCode}`);
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'Error de conexión o consulta con la base de datos al autenticar',
        error: 'DatabaseQueryError',
        code: errorCode,
      });
    }

    if (resolucion.estado !== 'UNICA') {
      await missingPasswordCheck(password);
      // El correo no se registra en claro: los intentos fallidos ya se guardan solo como hash (login-rate-limit).
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Identificador sin cuenta única (${resolucion.estado})`);
      if (resolucion.estado === 'AMBIGUA') {
        // Nunca se compara la contraseña contra varias cuentas: el intento falla sin elegir ninguna.
        throw new UnauthorizedException({ statusCode: 401, code: 'IDENTIFICADOR_AMBIGUO', message: MENSAJE_AMBIGUO });
      }
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const { cuenta, plataforma } = resolucion;

    // La contraseña se valida antes del estado de la cuenta para no revelar si existe una cuenta inactiva,
    // bloqueada o de una empresa suspendida sin conocer la contraseña.
    let clave: 'PASSWORD' | 'TEMPORAL' | null;
    try {
      clave = await verificarClave(this.prisma, cuenta, plataforma, password);
    } catch {
      this.logger.error('[LOGIN_DIAGNOSTIC] [CASO F] Error al validar la contraseña');
      throw new InternalServerErrorException('Error al validar credenciales de seguridad');
    }
    if (!clave) {
      const { fallos, bloqueada } = await registrarFalloCuenta(this.prisma, cuenta, plataforma);
      this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO B] Contraseña incorrecta para la cuenta ${cuenta.id} (fallos consecutivos: ${fallos}${bloqueada ? ', bloqueada' : ''})`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!cuenta.activo) {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO C] Cuenta INACTIVA - ID: ${cuenta.id}`);
      throw new UnauthorizedException(plataforma ? 'Credenciales inválidas' : 'Este usuario ha sido desactivado');
    }
    if (!plataforma && cuenta.bloqueadoAt) {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Cuenta BLOQUEADA por intentos fallidos - ID: ${cuenta.id}`);
      throw new UnauthorizedException({ statusCode: 401, code: 'CUENTA_BLOQUEADA', message: MENSAJE_BLOQUEADA });
    }
    if (!plataforma && cuenta.tenant?.estado !== 'ACTIVO') {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] [CASO D] Tenant NO está ACTIVO (${cuenta.tenantId}) - Estado actual: ${cuenta.tenant?.estado}`);
      throw new UnauthorizedException('La suscripción de la ferretería se encuentra suspendida');
    }

    // MFA opcional de cuentas de negocio que lo configuraron. El Super Admin no lo requiere.
    if (!plataforma && cuenta.mfaSecret) {
      if (!loginDto.mfaCode) throw new UnauthorizedException({ statusCode: 401, code: 'MFA_REQUERIDO', message: 'Ingrese el código de su aplicación de autenticación' });
      await requireMfa(this.prisma, cuenta, false, loginDto.mfaCode, this.configService);
    }

    let vigente = cuenta;
    if (clave === 'TEMPORAL') {
      vigente = await consumirClaveTemporal(this.prisma, cuenta, plataforma, password);
      if (!vigente) {
        await registrarFalloCuenta(this.prisma, cuenta, plataforma);
        throw new UnauthorizedException('Credenciales inválidas');
      }
      this.logger.log(`[LOGIN_DIAGNOSTIC] Clave temporal usada por la cuenta ${cuenta.id}; debe cambiar su contraseña`);
    } else {
      await registrarExitoCuenta(this.prisma, cuenta, plataforma);
    }
    const debeCambiarPassword = !!vigente.debeCambiarPassword;

    if (plataforma) return this.emitirSuperAdmin(cuenta, debeCambiarPassword, res);
    const usuario = cuenta;

    // Etapa 8: Generación de JWT
    this.logger.log(`[LOGIN_DIAGNOSTIC] [ETAPA 8] Generando tokens JWT para usuario ID: ${usuario.id}`);
    const sid = randomUUID();
    const payload = {
      sub: usuario.id,
      tenantId: usuario.tenantId,
      rol: usuario.rol,
      email: usuario.email,
      type: 'tenant',
      sid,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
    });

    const refreshJti = randomUUID();
    const refreshToken = this.jwtService.sign({ ...payload, typ: 'refresh' }, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
      jwtid: refreshJti,
    });

    await crearSesion(this.prisma, { id: sid, tipo: 'TENANT', sujetoId: usuario.id, passwordHash: usuario.passwordHash, tenantId: usuario.tenantId, expiresAt: this.expiracionRefresh(refreshToken), refreshJti });

    // Guardar refresh token en cookie httpOnly + secure
    res.cookie('refreshToken', refreshToken, {
      ...refreshCookieOptions(this.configService),
      maxAge: Math.max(0, this.expiracionRefresh(refreshToken).getTime() - Date.now()),
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
        permisos: usuario.permisos,
        permisosConfigurados:usuario.permisosConfigurados,
        descuentoMaximo: Number(usuario.descuentoMaximo),
        debeCambiarPassword,
      },
      tenant: {
        ...normalizeTenantConfiguration(usuario.tenant.configuracion),
        modoNavegacion: usuario.tenant.modoNavegacion,
        updatedAt: usuario.tenant.updatedAt,
        id: usuario.tenant.id,
        nombreComercial: usuario.tenant.nombreComercial,
        logoUrl: usuario.tenant.logoUrl,
        // Metadatos del logotipo privado; los bytes se piden a GET /tenant/logo con el token.
        logotipo: usuario.tenant.logoStorageKey ? { mime: usuario.tenant.logoMime, bytes: usuario.tenant.logoBytes, actualizadoAt: usuario.tenant.logoActualizadoAt } : null,
        colorPrimario: usuario.tenant.colorPrimario,
        estado: usuario.tenant.estado,
        direccion: usuario.tenant.direccion,
        telefono: usuario.tenant.telefono,
        email: usuario.tenant.email,
      },
    };
  }

  private async emitirSuperAdmin(superAdmin: any, debeCambiarPassword: boolean, res: Response) {
    const sid = randomUUID();
    const payload = { sub: superAdmin.id, email: superAdmin.email, rol: 'SUPER_ADMIN', type: 'super_admin', sid };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
    });
    const refreshJti = randomUUID();
    const refreshToken = this.jwtService.sign({ ...payload, typ: 'refresh' }, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
      jwtid: refreshJti,
    });
    await crearSesion(this.prisma, { id: sid, tipo: 'SUPER_ADMIN', sujetoId: superAdmin.id, passwordHash: superAdmin.passwordHash, expiresAt: this.expiracionRefresh(refreshToken), refreshJti });
    res.cookie('superAdminRefreshToken', refreshToken, {
      ...refreshCookieOptions(this.configService, true),
      maxAge: Math.max(0, this.expiracionRefresh(refreshToken).getTime() - Date.now()),
    });
    return {
      type: 'super_admin' as const,
      accessToken,
      superAdmin: { id: superAdmin.id, nombre: superAdmin.nombre, email: superAdmin.email, debeCambiarPassword },
    };
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('No se encontró el refresh token en las cookies');
    }

    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken);
    } catch {
      res.clearCookie('refreshToken', refreshCookieOptions(this.configService));
      throw new UnauthorizedException('Refresh token expirado o inválido');
    }
    try {
      if (decoded.typ !== 'refresh' || decoded.type !== 'tenant' || !decoded.tenantId) {
        throw new UnauthorizedException('Token inválido para refrescar sesión');
      }
      if (!decoded.sid) throw new UnauthorizedException('Sesión cerrada o vencida');

      const usuario = await this.prisma.usuario.findUnique({
        where: { id: decoded.sub },
        include: { tenant: true },
      });

      if (!usuario || usuario.tenantId !== decoded.tenantId || !usuario.activo || usuario.tenant.estado !== 'ACTIVO') {
        throw new UnauthorizedException('Usuario o ferretería no autorizados');
      }

      const newPayload = {
        sub: usuario.id,
        tenantId: usuario.tenantId,
        rol: usuario.rol,
        email: usuario.email,
        type: 'tenant',
        sid: decoded.sid,
      };

      // H-04: cada refresh sustituye la cookie; presentar una ya sustituida fuera de la gracia revoca la sesión.
      const rotacion = await rotarRefresh(this.prisma, {
        sid: String(decoded.sid), sujetoId: String(decoded.sub), passwordHash: usuario.passwordHash, jti: typeof decoded.jti === 'string' ? decoded.jti : undefined,
        graciaMs: leerConfiguracionAuth(this.configService).graciaRefreshSegundos * 1000,
      });
      if (rotacion.estado === 'REUTILIZADA') {
        this.logger.warn(`[AUTH] Refresh reutilizado fuera de la ventana de gracia: sesión ${String(decoded.sid)} revocada`);
        throw new UnauthorizedException('Sesión cerrada por reutilización del token');
      }
      if (rotacion.estado === 'NO_VIGENTE') throw new UnauthorizedException('Sesión cerrada o vencida');

      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
      });
      const restanteMs = rotacion.expiresAt.getTime() - Date.now();
      // El vencimiento absoluto de la sesión no se alarga al rotar.
      const nuevoRefresh = this.jwtService.sign({ ...newPayload, typ: 'refresh' }, {
        expiresIn: Math.max(1, Math.floor(restanteMs / 1000)),
        jwtid: rotacion.jti,
      });
      res.cookie('refreshToken', nuevoRefresh, { ...refreshCookieOptions(this.configService), maxAge: Math.max(0, restanteMs) });

      return { accessToken };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res.clearCookie('refreshToken', refreshCookieOptions(this.configService));
        throw new UnauthorizedException('Refresh token expirado o inválido');
      }
      throw error; // Un fallo de infraestructura no invalida el refresh token.
    }
  }

  // Revoca la sesión del refresh token (cookie) y la del Bearer enviado (incluye sesiones de soporte).
  async logout(res: Response, req?: Request) {
    res.clearCookie('refreshToken', refreshCookieOptions(this.configService));
    const sids = new Set([sidDeToken(this.jwtService, req?.cookies?.refreshToken), sidDeToken(this.jwtService, bearerDe(req))]);
    for (const sid of sids) {
      if (sid) await revocarSesion(this.prisma, sid, 'LOGOUT');
    }
    return { success: true, message: 'Sesión cerrada correctamente' };
  }
}

