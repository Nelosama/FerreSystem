import { missingPasswordCheck } from './password-timing';
import { refreshCookieOptions } from './refresh-cookie';
import { normalizeTenantConfiguration } from '../tenants/tenant-configuration';
import { Injectable, UnauthorizedException, ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { randomUUID } from 'node:crypto';
import { leerConfiguracionAuth } from './auth-config';
import { clavesDeLogin, excepcionLimiteLogin, registrarExitoLogin, registrarFalloLogin, segundosBloqueados } from './login-rate-limit';
import { crearSesion, revocarSesion, revocarSesionesDeSujeto, rotarRefresh, sidDeToken } from './sesiones-auth';
import { normalizarIdentificador, resolverCuenta } from './identidad-login';
import { aplicarBloqueo, registrarFalloCuenta, reiniciarFallosCuenta, type TipoCuenta } from './bloqueo-cuenta';
import { consumirContrasenaTemporal, PROPOSITO_TEMPORAL, temporalVigente } from './contrasena-temporal';
import { crearAccionAuth, registrarEventoAuth, VIGENCIA_ACCION_MS } from './auth-actions';

const bearerDe = (req?: Request) => req?.headers?.authorization?.replace(/^Bearer /, '') || undefined;

export const MENSAJE_CREDENCIALES = 'Credenciales inválidas';

export interface OpcionesLogin {
  /** /admin/auth/login: solo cuentas de Super Admin. Cualquier otra cuenta falla igual que una inexistente. */
  soloPlataforma?: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Inicio de sesión de dos campos: «Usuario» (usuario, código o correo) y «Contraseña». Empresa y rol salen de la cuenta.
   * Límites: por identificador y por IP (pausa temporal, igual exista o no la cuenta) y contador persistente por cuenta.
   * Durante la pausa del identificador (no de la IP) solo se acepta una contraseña temporal vigente, para que la recuperación
   * no venza dentro de la pausa; cualquier otro intento responde con el mismo límite, sin revelar nada.
   */
  async login(loginDto: LoginDto, res: Response, req?: Request, opciones: OpcionesLogin = {}) {
    const identificador = normalizarIdentificador(loginDto.usuario ?? loginDto.email);
    const claves = clavesDeLogin(`login:${identificador}`, req?.ip);
    const cfg = leerConfiguracionAuth(this.configService);
    const segundos = await segundosBloqueados(this.prisma, claves);
    let soloTemporal = false;
    if (segundos > 0) {
      if (!identificador || (await segundosBloqueados(this.prisma, { ip: claves.ip })) > 0) {
        res.setHeader('Retry-After', String(segundos));
        throw excepcionLimiteLogin(segundos);
      }
      soloTemporal = true;
    }
    try {
      const resultado = await this.autenticar(identificador, loginDto, res, soloTemporal, opciones);
      // Un acceso (o una temporal válida, que prueba control del correo) reinicia el contador por identificador; el de la IP sigue.
      await registrarExitoLogin(this.prisma, claves);
      return resultado;
    } catch (error) {
      const credencial = error instanceof UnauthorizedException;
      if (soloTemporal && (credencial || error instanceof ForbiddenException)) {
        // El intento cuenta para la IP aunque el identificador ya esté en pausa.
        await registrarFalloLogin(this.prisma, { ip: claves.ip }, cfg);
        res.setHeader('Retry-After', String(segundos));
        throw excepcionLimiteLogin(segundos);
      }
      // Un fallo de infraestructura (500) no se disfraza ni cuenta como intento.
      if (credencial) await registrarFalloLogin(this.prisma, claves, cfg);
      throw error;
    }
  }

  private expiracionRefresh(refreshToken: string): Date {
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    return new Date((decoded?.exp ?? 0) * 1000);
  }

  private errorBaseDatos(error: any, etapa: string): never {
    const errorCode = typeof error?.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : 'N/A';
    this.logger.error(`[LOGIN_DIAGNOSTIC] Error de BD/Prisma (${etapa}). Código: ${errorCode}`);
    throw new InternalServerErrorException({
      statusCode: 500,
      message: 'Error de conexión o consulta con la base de datos al autenticar',
      error: 'DatabaseQueryError',
      code: errorCode,
    });
  }

  /**
   * Credencial incorrecta: cuenta el fallo en el servidor (atómico) y responde siempre con el 401 genérico. El intento que
   * bloquea una cuenta operativa también es genérico: el estado de bloqueo no se revela a quien no conoce la contraseña.
   */
  private async rechazarCredencial(tipo: TipoCuenta, cuenta: any): Promise<never> {
    const resultado = await registrarFalloCuenta(this.prisma, tipo, cuenta.id);
    if (resultado.bloqueadaAhora) {
      await aplicarBloqueo(this.prisma, cuenta);
      this.logger.warn(`[AUTH] Cuenta bloqueada por intentos fallidos: ${String(cuenta.id)}`);
    }
    throw new UnauthorizedException(MENSAJE_CREDENCIALES);
  }

  /** La temporal es de un solo uso y NO abre sesión: entrega un token de cambio obligatorio que solo sirve para definir la contraseña nueva. */
  private async exigirCambioDePassword(tipo: TipoCuenta, cuenta: any, password: string) {
    const plataforma = tipo === 'SUPER_ADMIN';
    const cambioToken = await this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`AUTH:${cuenta.id}`}, 0))`;
      if (!(await consumirContrasenaTemporal(tx, cuenta, plataforma, password))) return null;
      // Usarla cierra las sesiones anteriores (y el soporte iniciado por un Super Admin) aunque aún no defina la contraseña nueva.
      await revocarSesionesDeSujeto(tx, cuenta.id, 'CONTRASENA_TEMPORAL');
      if (plataforma) await tx.$executeRaw`UPDATE sesiones_auth SET revoked_at=now(), revocation_motivo='SUPER_ADMIN_CONTRASENA_TEMPORAL' WHERE tipo='SOPORTE' AND revoked_at IS NULL`;
      const token = await crearAccionAuth(tx, cuenta, plataforma, 'FORCED_CHANGE');
      await registrarEventoAuth(tx, cuenta.id, cuenta, plataforma, 'TEMP_PASSWORD_USED');
      return token;
    });
    if (!cambioToken) throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    return { type: 'password_change_required' as const, requiereCambioPassword: true as const, cambioToken, expiresIn: VIGENCIA_ACCION_MS / 1000 };
  }

  private async autenticar(identificador: string, loginDto: LoginDto, res: Response, soloTemporal: boolean, opciones: OpcionesLogin) {
    const password = loginDto.password;
    let resuelta;
    try {
      resuelta = await resolverCuenta(this.prisma, identificador, opciones.soloPlataforma ? undefined : loginDto.tenantId || undefined);
    } catch (error: any) {
      this.errorBaseDatos(error, 'resolución de cuenta');
    }

    const noAdmitida = resuelta.estado === 'NO_EXISTE' || resuelta.estado === 'AMBIGUA' || (opciones.soloPlataforma && resuelta.estado !== 'SUPER_ADMIN');
    if (noAdmitida) {
      await missingPasswordCheck(password);
      // Un identificador repetido en varias cuentas no se resuelve ni se distingue de uno inexistente.
      // El identificador no se registra en claro: los intentos fallidos ya se guardan solo como hash (login-rate-limit).
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Identificador no admitido (${resuelta.estado}${opciones.soloPlataforma ? ', se esperaba Super Admin' : ''})`);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }

    const plataforma = resuelta.estado === 'SUPER_ADMIN';
    const tipo: TipoCuenta = plataforma ? 'SUPER_ADMIN' : 'TENANT';
    const cuenta = resuelta.cuenta;
    const recuperable = plataforma || cuenta.rol === 'ADMIN';

    // Una cuenta bloqueada no prueba ninguna contraseña: así no sirve de oráculo para adivinarla mientras está bloqueada.
    // Responde igual que una contraseña incorrecta; el Admin ve el estado en Usuarios y la reactiva.
    if (!plataforma && cuenta.bloqueadoAt) {
      await missingPasswordCheck(password);
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Intento sobre cuenta BLOQUEADA - ID: ${cuenta.id}`);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }

    // La contraseña va antes del estado de la cuenta para no revelar si existe como cuenta inactiva o empresa suspendida.
    let via: 'REAL' | 'TEMPORAL' | null = null;
    try {
      if (!soloTemporal && await bcrypt.compare(password, cuenta.passwordHash)) via = 'REAL';
      else if (recuperable && await temporalVigente(this.prisma, cuenta, plataforma, password)) via = 'TEMPORAL';
    } catch (error: any) {
      if (error?.code && /^P\d{4}$/.test(String(error.code))) this.errorBaseDatos(error, 'validación de credenciales');
      this.logger.error('[LOGIN_DIAGNOSTIC] Error de ejecución al validar credenciales');
      throw new InternalServerErrorException('Error al validar credenciales de seguridad');
    }
    if (!via) {
      // En la pausa por intentos no se cuenta nada más: `login` responde con el límite vigente.
      if (soloTemporal) throw new UnauthorizedException(MENSAJE_CREDENCIALES);
      await this.rechazarCredencial(tipo, cuenta);
    }

    if (!cuenta.activo) {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Cuenta INACTIVA - ID: ${cuenta.id}`);
      throw new UnauthorizedException(plataforma ? MENSAJE_CREDENCIALES : 'Este usuario ha sido desactivado');
    }
    if (!plataforma && cuenta.tenant?.estado !== 'ACTIVO') {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Tenant NO ACTIVO (${cuenta.tenantId}) - Estado actual: ${cuenta.tenant?.estado}`);
      throw new UnauthorizedException('La suscripción de la ferretería se encuentra suspendida');
    }

    if (via === 'TEMPORAL') return this.exigirCambioDePassword(tipo, cuenta, password);

    // El reinicio es condicional a que no haya un bloqueo confirmado en paralelo.
    if (!(await reiniciarFallosCuenta(this.prisma, tipo, cuenta.id))) throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    // Quien recuerda su contraseña ya no necesita la temporal pendiente.
    if (recuperable) await this.prisma.authAction.deleteMany({ where: { sujetoId: cuenta.id, purpose: PROPOSITO_TEMPORAL } });

    return plataforma ? this.emitirSuperAdmin(cuenta, res) : this.emitirUsuario(cuenta, res);
  }

  private async emitirSuperAdmin(superAdmin: any, res: Response) {
    const sid = randomUUID();
    const payload = {
      sub: superAdmin.id,
      email: superAdmin.email,
      rol: 'SUPER_ADMIN',
      type: 'super_admin',
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
    await crearSesion(this.prisma, { id: sid, tipo: 'SUPER_ADMIN', sujetoId: superAdmin.id, passwordHash: superAdmin.passwordHash, expiresAt: this.expiracionRefresh(refreshToken), refreshJti });
    res.cookie('superAdminRefreshToken', refreshToken, {
      ...refreshCookieOptions(this.configService, true),
      maxAge: Math.max(0, this.expiracionRefresh(refreshToken).getTime() - Date.now()),
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

  private async emitirUsuario(usuario: any, res: Response) {
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

    this.logger.log(`[LOGIN_DIAGNOSTIC] Login EXITOSO para usuario ID: ${usuario.id}, TenantID: ${usuario.tenantId}`);

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

      if (!usuario || usuario.tenantId !== decoded.tenantId || !usuario.activo || usuario.bloqueadoAt || usuario.tenant.estado !== 'ACTIVO') {
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

