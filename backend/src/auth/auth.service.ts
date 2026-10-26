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
import { crearSesion, revocarSesion, rotarRefresh, sidDeToken } from './sesiones-auth';
import { normalizarIdentificador, resolverCuenta } from './identidad-login';
import { puedeRecuperar, registrarFalloCuenta, reiniciarFallosCuenta, type TipoCuenta } from './bloqueo-cuenta';
import { consumirContrasenaTemporal } from './contrasena-temporal';
import { crearAccionAuth, registrarEventoAuth, VIGENCIA_ACCION_MS } from './auth-actions';

const bearerDe = (req?: Request) => req?.headers?.authorization?.replace(/^Bearer /, '') || undefined;

export const MENSAJE_CREDENCIALES = 'Credenciales inválidas';
export const MENSAJE_CUENTA_BLOQUEADA = 'Cuenta bloqueada por intentos fallidos. Contacte al Admin o Super Admin de su empresa para reactivarla o cambiar su contraseña.';

/** Estado de un intento de login: lo llena `autenticar` y lo lee `login` para contar el fallo en los límites compartidos. */
interface ContextoLogin {
  /** Contar el fallo también en la clave por identificador. Un usuario con contador propio (bloqueo en el 6.º fallo) no la usa. */
  contarCuenta: boolean;
  /** Credencial incorrecta: cuenta como fallo aunque la respuesta no sea 401 (p. ej. el intento que bloquea). */
  fallo: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // Límite de intentos por identificador y por IP. Un fallo cuenta aunque la cuenta no exista.
  async login(loginDto: LoginDto, res: Response, req?: Request) {
    const identificador = normalizarIdentificador(loginDto.usuario ?? loginDto.email);
    const claves = clavesDeLogin(`login:${identificador}`, req?.ip);
    const segundos = await segundosBloqueados(this.prisma, claves);
    let soloTemporal = false;
    if (segundos > 0) {
      // Bloqueada la IP: nadie entra. Bloqueado solo el identificador: únicamente una contraseña temporal vigente
      // (aleatoria, de un uso, enviada al correo verificado) puede entrar, para que la recuperación no caduque dentro del bloqueo.
      if ((await segundosBloqueados(this.prisma, { ip: claves.ip })) > 0 || !identificador) {
        res.setHeader('Retry-After', String(segundos));
        throw excepcionLimiteLogin(segundos);
      }
      soloTemporal = true;
    }
    const contexto: ContextoLogin = { contarCuenta: true, fallo: false };
    try {
      const resultado = await this.autenticar(identificador, loginDto.password, res, contexto, soloTemporal);
      // Un acceso (o una temporal válida, que prueba control del correo) reinicia el contador por identificador; el de la IP sigue.
      await registrarExitoLogin(this.prisma, claves);
      return resultado;
    } catch (error) {
      // Un fallo de infraestructura (500) no se disfraza de límite de intentos.
      if (soloTemporal && (error instanceof UnauthorizedException || error instanceof ForbiddenException)) {
        res.setHeader('Retry-After', String(segundos));
        throw excepcionLimiteLogin(segundos);
      }
      if (error instanceof UnauthorizedException || contexto.fallo) {
        await registrarFalloLogin(this.prisma, contexto.contarCuenta ? claves : { ip: claves.ip }, leerConfiguracionAuth(this.configService));
      }
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

  /** Credencial incorrecta: cuenta el fallo en el servidor (atómico) y decide entre 401 genérico y bloqueo. */
  private async rechazarCredencial(tipo: TipoCuenta, cuenta: any, esAdmin: boolean, contexto: ContextoLogin, soloTemporal: boolean): Promise<never> {
    // Durante la pausa por intentos no se cuenta nada más: `login` responde con el límite vigente.
    if (soloTemporal) throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    contexto.fallo = true;
    if (tipo === 'TENANT' && !esAdmin) contexto.contarCuenta = false;
    const resultado = await registrarFalloCuenta(this.prisma, tipo, cuenta.id);
    if (resultado.bloqueadaAhora) {
      await registrarEventoAuth(this.prisma, 'sistema', cuenta, false, 'ACCOUNT_LOCKED').catch(() => undefined);
      this.logger.warn(`[AUTH] Cuenta bloqueada por intentos fallidos: ${String(cuenta.id)}`);
    }
    if (resultado.bloqueada) throw new ForbiddenException({ statusCode: 403, message: MENSAJE_CUENTA_BLOQUEADA, code: 'CUENTA_BLOQUEADA' });
    // Solo Admin y Super Admin con correo verificado ven la recuperación, y solo desde el tercer fallo.
    const recuperacionDisponible = esAdmin && puedeRecuperar(resultado.fallos) && !!cuenta.email && !!cuenta.emailVerifiedAt;
    throw new UnauthorizedException({ statusCode: 401, message: MENSAJE_CREDENCIALES, error: 'Unauthorized', ...(recuperacionDisponible && { recuperacionDisponible: true }) });
  }

  /** Contraseña real, o la temporal vigente de recuperación (solo Admin/Super Admin). */
  private async verificarContrasena(tipo: TipoCuenta, cuenta: any, password: string, esAdmin: boolean, soloTemporal: boolean): Promise<'REAL' | 'TEMPORAL' | null> {
    if (!soloTemporal && await bcrypt.compare(password, cuenta.passwordHash)) return 'REAL';
    if (esAdmin && await consumirContrasenaTemporal(this.prisma, cuenta.id, tipo, password)) return 'TEMPORAL';
    return null;
  }

  /** La temporal es de un solo uso y NO abre sesión: entrega un token de cambio obligatorio que solo sirve para definir la contraseña nueva. */
  private async exigirCambioDePassword(tipo: TipoCuenta, cuenta: any) {
    const plataforma = tipo === 'SUPER_ADMIN';
    const cambioToken = await this.prisma.$transaction(async (tx) => {
      const token = await crearAccionAuth(tx, cuenta, plataforma, 'FORCED_CHANGE');
      await registrarEventoAuth(tx, cuenta.id, cuenta, plataforma, 'TEMP_PASSWORD_USED');
      return token;
    });
    return { type: 'password_change_required' as const, requiereCambioPassword: true as const, cambioToken, expiresIn: VIGENCIA_ACCION_MS / 1000 };
  }

  private async autenticar(identificador: string, password: string, res: Response, contexto: ContextoLogin, soloTemporal: boolean) {
    let resuelta;
    try {
      resuelta = await resolverCuenta(this.prisma, identificador);
    } catch (error: any) {
      this.errorBaseDatos(error, 'resolución de cuenta');
    }

    if (resuelta.estado === 'NO_EXISTE' || resuelta.estado === 'AMBIGUA') {
      await missingPasswordCheck(password);
      // Un identificador repetido en varias cuentas no se resuelve: nunca se prueba la contraseña contra varias empresas.
      // El identificador no se registra en claro: los intentos fallidos ya se guardan solo como hash (login-rate-limit).
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Identificador sin cuenta única (${resuelta.estado})`);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }

    if (resuelta.estado === 'SUPER_ADMIN') return this.autenticarSuperAdmin(resuelta.cuenta, password, res, contexto, soloTemporal);
    return this.autenticarUsuario(resuelta.cuenta, password, res, contexto, soloTemporal);
  }

  private async autenticarSuperAdmin(superAdmin: any, password: string, res: Response, contexto: ContextoLogin, soloTemporal: boolean) {
    const via = await this.verificarContrasena('SUPER_ADMIN', superAdmin, password, true, soloTemporal);
    if (!via || !superAdmin.activo) {
      if (!via) await this.rechazarCredencial('SUPER_ADMIN', superAdmin, true, contexto, soloTemporal);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }
    if (via === 'TEMPORAL') return this.exigirCambioDePassword('SUPER_ADMIN', superAdmin);

    await reiniciarFallosCuenta(this.prisma, 'SUPER_ADMIN', superAdmin.id);
    await this.prisma.authTempPassword.deleteMany({ where: { sujetoId: superAdmin.id, tipo: 'SUPER_ADMIN' } });
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

  private async autenticarUsuario(usuario: any, password: string, res: Response, contexto: ContextoLogin, soloTemporal: boolean) {
    const esAdmin = usuario.rol === 'ADMIN';
    if (!esAdmin) contexto.contarCuenta = false;
    this.logger.log(`[LOGIN_DIAGNOSTIC] Cuenta resuelta - ID: ${usuario.id}, TenantID: ${usuario.tenantId}, Rol: ${usuario.rol}, Activo: ${usuario.activo}`);

    // Una cuenta bloqueada no prueba ninguna contraseña ni cuenta más fallos: solo el Admin o el Super Admin la reactivan.
    if (usuario.bloqueadoAt) {
      throw new ForbiddenException({ statusCode: 403, message: MENSAJE_CUENTA_BLOQUEADA, code: 'CUENTA_BLOQUEADA' });
    }

    // La contraseña va antes del estado de la cuenta para no revelar si existe como cuenta inactiva o empresa suspendida.
    let via: 'REAL' | 'TEMPORAL' | null;
    try {
      via = await this.verificarContrasena('TENANT', usuario, password, esAdmin, soloTemporal);
    } catch (error: any) {
      if (error?.code && /^P\d{4}$/.test(String(error.code))) this.errorBaseDatos(error, 'contraseña temporal');
      this.logger.error('[LOGIN_DIAGNOSTIC] Error de ejecución al validar credenciales');
      throw new InternalServerErrorException('Error al validar credenciales de seguridad');
    }
    if (!via) await this.rechazarCredencial('TENANT', usuario, esAdmin, contexto, soloTemporal);

    if (!usuario.activo) {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Usuario INACTIVO - ID: ${usuario.id}`);
      throw new UnauthorizedException('Este usuario ha sido desactivado');
    }
    const tenantEstado = usuario.tenant?.estado;
    if (tenantEstado !== 'ACTIVO') {
      this.logger.warn(`[LOGIN_DIAGNOSTIC] Tenant NO ACTIVO (${usuario.tenantId}) - Estado actual: ${tenantEstado}`);
      throw new UnauthorizedException('La suscripción de la ferretería se encuentra suspendida');
    }
    if (via === 'TEMPORAL') return this.exigirCambioDePassword('TENANT', usuario);

    // El reinicio es condicional a que no haya un bloqueo confirmado en paralelo.
    if (!(await reiniciarFallosCuenta(this.prisma, 'TENANT', usuario.id))) {
      throw new ForbiddenException({ statusCode: 403, message: MENSAJE_CUENTA_BLOQUEADA, code: 'CUENTA_BLOQUEADA' });
    }
    if (esAdmin) await this.prisma.authTempPassword.deleteMany({ where: { sujetoId: usuario.id, tipo: 'TENANT' } });

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

