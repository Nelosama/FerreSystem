import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RecoveryMailService } from './recovery-mail.service';
import { newTotpSecret, requireMfa, sealSecret, tokenHash, validStep } from './mfa';
import { crearAccionAuth, registrarEventoAuth } from './auth-actions';
import { emitirContrasenaTemporal, generarContrasenaTemporal } from './contrasena-temporal';
import { FALLOS_PARA_RECUPERACION } from './bloqueo-cuenta';
import { normalizarIdentificador, resolverCuenta } from './identidad-login';
import { clavesDeLogin, excepcionLimiteLogin, registrarFalloLogin, segundosBloqueados } from './login-rate-limit';
import { leerConfiguracionAuth } from './auth-config';
import { revocarSesionesDeSujeto } from './sesiones-auth';
import { audit } from '../operaciones/ledger';
import { AdminResetDto, ChangePasswordDto, ConfirmMfaDto, ForcedChangeDto, RecoveryRequestDto, ResetDto, UnlockDto } from './dto/recovery.dto';

const accepted = { message: 'Si la cuenta cumple los requisitos, recibirá instrucciones en su correo verificado. Los demás usuarios deben contactar al Admin o Super Admin.' };
const invalid = () => new UnauthorizedException('Solicitud vencida o verificación inválida');
type Identity = { sub: string; type: string; tenantId?: string; impersonatedBy?: string; rol?: string };

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly mail: RecoveryMailService) {}

  async limit(key: string, ip?: string) {
    const keys = clavesDeLogin(`security:${key}`, ip);
    const seconds = await segundosBloqueados(this.prisma, keys);
    if (seconds > 0) throw excepcionLimiteLogin(seconds);
    // Count successful and failed requests alike; sending emails must also be limited.
    await registrarFalloLogin(this.prisma, keys, leerConfiguracionAuth(this.config));
  }
  private table(tx: any, platform: boolean) { return platform ? tx.superAdmin : tx.usuario; }
  private async lock(tx: any, id: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`AUTH:${id}`}, 0))`;
  }
  private async event(tx: any, actor: string, account: any, platform: boolean, event: string) {
    await registrarEventoAuth(tx, actor, account, platform, event);
  }
  private action(tx: any, account: any, platform: boolean, purpose: string, binding?: string) {
    return crearAccionAuth(tx, account, platform, purpose, binding);
  }
  private async account(tx: any, identity: Identity) {
    if (identity.impersonatedBy) throw new ForbiddenException('Use su sesión personal para gestionar credenciales');
    const platform = identity.type === 'super_admin';
    const account = await this.table(tx, platform).findFirst({ where: { id: identity.sub, activo: true, ...(!platform && { tenantId: identity.tenantId, tenant: { estado: 'ACTIVO' } }) } });
    if (!account) throw invalid();
    return { account, platform };
  }
  /** Reautenticación: contraseña actual y, para el Super Admin o quien lo configuró, el segundo factor. */
  private async current(tx: any, account: any, platform: boolean, password: string, code?: string) {
    if (!await bcrypt.compare(password, account.passwordHash)) throw invalid();
    if (platform || account.mfaSecret) await requireMfa(tx, account, platform, code, this.config);
  }
  /** Contraseña nueva definida por el titular: reinicia contadores y bloqueo, invalida enlaces y temporales y cierra las sesiones. */
  private async aplicarPassword(tx: any, account: any, platform: boolean, passwordHash: string, motivo: string) {
    const datos: any = { passwordHash, intentosFallidos: 0, ultimoFalloAt: null, ...(!platform && { bloqueadoAt: null }) };
    await this.table(tx, platform).update({ where: { id: account.id }, data: datos });
    await revocarSesionesDeSujeto(tx, account.id, motivo);
    // Support access originating from a Super Admin must also stop.
    if (platform) await this.revokeSupport(tx);
    await tx.authAction.deleteMany({ where: { sujetoId: account.id } });
  }
  private elegibleRecuperacion(account: any, platform: boolean) {
    // El Super Admin sin MFA no podría completar la recuperación (el segundo factor es obligatorio): no se le envía nada.
    const rol = platform ? !!account.mfaSecret : account.rol === 'ADMIN' && account.tenant?.estado === 'ACTIVO';
    return rol && account.activo && !!account.email && !!account.emailVerifiedAt && account.intentosFallidos >= FALLOS_PARA_RECUPERACION;
  }

  /**
   * Recuperación de Admin/Super Admin: contraseña temporal por correo verificado. Solo se atiende si el identificador resuelve a
   * UNA cuenta elegible que ya acumula 3 fallos consecutivos. La respuesta es idéntica y tarda lo mismo (8,5 s) haya o no envío:
   * no revela si la cuenta existe ni si cumple los requisitos. Cajero, Vendedor, Contador y demás roles no tienen recuperación pública.
   */
  async request(dto: RecoveryRequestDto, ip?: string) {
    const started = Date.now();
    const identificador = normalizarIdentificador(dto.usuario ?? dto.email);
    await this.limit(`request:${identificador}`, ip);
    let emitida: string | undefined;
    try {
      const resuelta = await resolverCuenta(this.prisma, identificador, dto.tenantId || undefined);
      const platform = resuelta.estado === 'SUPER_ADMIN';
      const candidata: any = resuelta.estado === 'SUPER_ADMIN' || resuelta.estado === 'TENANT' ? resuelta.cuenta : null;
      if (candidata && this.elegibleRecuperacion(candidata, platform)) {
        const clave = generarContrasenaTemporal();
        const destino = await this.prisma.$transaction(async tx => {
          await this.lock(tx, candidata.id);
          const actual = await this.table(tx, platform).findUnique({ where: { id: candidata.id } });
          if (!actual || !this.elegibleRecuperacion({ ...actual, tenant: candidata.tenant }, platform)) return null;
          await emitirContrasenaTemporal(tx, actual, platform, clave);
          await this.event(tx, actual.id, actual, platform, 'TEMP_PASSWORD_ISSUED');
          return actual.email as string;
        });
        if (destino) {
          emitida = tokenHash(clave);
          await this.mail.sendTemporaryPassword(destino, clave);
        }
      }
    } catch {
      // Una temporal que no se pudo entregar no debe quedar vigente.
      if (emitida) await this.prisma.authAction.deleteMany({ where: { hash: emitida } }).catch(() => undefined);
      // Never leak eligibility, mailbox/provider details, passwords or database errors.
      this.logger.error('Solicitud de recuperación no entregada; revisar infraestructura de correo');
    } finally {
      // Provider has an 8 s deadline. Equal response floor covers eligible and ineligible accounts.
      await delay(Math.max(0, 8500 - (Date.now() - started)));
    }
    return accepted;
  }

  async requestVerification(identity: Identity) {
    const { account, platform } = await this.account(this.prisma, identity);
    if (!account.email || (!platform && account.rol !== 'ADMIN')) throw new BadRequestException('Solo administradores con correo pueden verificarlo');
    const token = await this.prisma.$transaction(async tx => { await this.lock(tx, account.id); return this.action(tx, account, platform, 'VERIFY_EMAIL'); });
    await this.mail.send(account.email, token, 'VERIFY_EMAIL', platform ? undefined : account.tenantId);
    return accepted;
  }

  /** Enrolamiento inicial del MFA del Super Admin: requiere su contraseña y el control del correo de la cuenta. */
  async requestBootstrap(identificador: string, password: string, ip?: string) {
    const started = Date.now();
    const email = normalizarIdentificador(identificador);
    await this.limit(`bootstrap:${email}`, ip);
    try {
      const account = await this.prisma.superAdmin.findFirst({ where: { email, activo: true } });
      if (account && !account.mfaSecret && await bcrypt.compare(password, account.passwordHash)) {
        const token = await this.prisma.$transaction(async tx => {
          await this.lock(tx, account.id); return this.action(tx, account, true, 'BOOTSTRAP_MFA');
        });
        await this.mail.send(account.email, token, 'BOOTSTRAP_MFA');
      }
    } catch { this.logger.error('Enrolamiento inicial no entregado; revisar infraestructura de correo'); }
    finally { await delay(Math.max(0, 8500 - (Date.now() - started))); }
    return accepted;
  }
  bootstrapMfa(token: string, currentPassword: string) {
    return this.consume(token, ['BOOTSTRAP_MFA'], async (tx, a, account, platform) => {
      if (!platform || account.mfaSecret || a.passwordBinding !== tokenHash(account.passwordHash) || !await bcrypt.compare(currentPassword, account.passwordHash)) throw invalid();
      await tx.superAdmin.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
      const secret = newTotpSecret();
      const enrollment = await this.action(tx, account, true, 'MFA_ENROLL', tokenHash(account.passwordHash + secret));
      await this.event(tx, account.id, account, true, 'MFA_BOOTSTRAP_EMAIL_VERIFIED');
      return { token: enrollment, secret };
    });
  }

  // All consumers serialize per account, then re-read and delete the token in the same transaction.
  // A rollback retains it; successful reset removes all other outstanding actions.
  private async consume(token: string, purposes: string[], operation: (tx: any, a: any, account: any, platform: boolean) => Promise<any>) {
    return this.prisma.$transaction(async tx => {
      const first = await tx.authAction.findUnique({ where: { hash: tokenHash(token) } });
      if (!first) throw invalid();
      await this.lock(tx, first.sujetoId);
      const a = await tx.authAction.findUnique({ where: { hash: first.hash } });
      if (!a || !purposes.includes(a.purpose) || a.expiresAt.getTime() <= Date.now()) throw invalid();
      const platform = a.tipo === 'SUPER_ADMIN';
      const account = await this.table(tx, platform).findFirst({ where: { id: a.sujetoId, activo: true, ...(!platform && { tenantId: a.tenantId, tenant: { estado: 'ACTIVO' } }) } });
      if (!account || account.email !== a.email) throw invalid();
      const result = await operation(tx, a, account, platform);
      await tx.authAction.deleteMany({ where: { hash: a.hash } });
      return result;
    });
  }

  verifyEmail(token: string) {
    return this.consume(token, ['VERIFY_EMAIL'], async (tx, a, account, platform) => {
      if (a.passwordBinding !== tokenHash(account.passwordHash)) throw invalid();
      await this.table(tx, platform).update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
      await this.event(tx, account.id, account, platform, 'EMAIL_VERIFIED');
      return { success: true };
    });
  }
  /** Enlace privado de un solo uso entregado por un Admin/Super Admin (alta o restablecimiento): el titular define su contraseña. */
  async reset(dto: ResetDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.consume(dto.token, ['RESET_ADMIN'], async (tx, a, account, platform) => {
      if (platform || a.passwordBinding !== tokenHash(account.passwordHash)) throw invalid();
      await this.aplicarPassword(tx, account, platform, passwordHash, 'PASSWORD_RESET');
      await this.event(tx, account.id, account, platform, a.purpose);
      return { success: true };
    });
  }
  /**
   * Cambio obligatorio tras entrar con la contraseña temporal. Hasta completarlo no existe sesión ni acceso a ningún módulo.
   * El token solo se emite después de la contraseña temporal y, para el Super Admin, de su segundo factor.
   */
  async forcedChange(dto: ForcedChangeDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.consume(dto.token, ['FORCED_CHANGE'], async (tx, a, account, platform) => {
      if (a.passwordBinding !== tokenHash(account.passwordHash) || (!platform && account.rol !== 'ADMIN')) throw invalid();
      if (await bcrypt.compare(dto.password, account.passwordHash)) throw new BadRequestException('Defina una contraseña distinta de la anterior');
      await this.aplicarPassword(tx, account, platform, passwordHash, 'PASSWORD_FORCED_CHANGE');
      await this.event(tx, account.id, account, platform, 'PASSWORD_FORCED_CHANGE');
      return { success: true };
    });
  }
  private async revokeSupport(tx: any) {
    await tx.$executeRaw`UPDATE sesiones_auth SET revoked_at=now(), revocation_motivo='SUPER_ADMIN_PASSWORD_CHANGE'
      WHERE tipo='SOPORTE' AND revoked_at IS NULL`;
  }
  /** Cualquier usuario cambia su propia contraseña conociendo la actual (y su segundo factor si lo tiene). */
  async change(identity: Identity, dto: ChangePasswordDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, identity.sub);
      const { account, platform } = await this.account(tx, identity);
      await this.current(tx, account, platform, dto.currentPassword, dto.mfaCode);
      await this.aplicarPassword(tx, account, platform, passwordHash, 'PASSWORD_CHANGE');
      await this.event(tx, account.id, account, platform, 'PASSWORD_CHANGE');
      return { success: true };
    });
  }
  /** Empresa sobre la que actúa: la propia para un Admin, la indicada para el Super Admin. */
  private async actorDeGestion(tx: any, identity: Identity, tenantIdSolicitado?: string) {
    const { account: actor, platform } = await this.account(tx, identity);
    if (!platform && actor.rol !== 'ADMIN') throw new ForbiddenException('Solo un Admin o Super Admin puede gestionar accesos');
    const tenantId = platform ? tenantIdSolicitado : identity.tenantId;
    if (!tenantId || (!platform && tenantIdSolicitado && tenantIdSolicitado !== tenantId)) throw new ForbiddenException('Empresa no autorizada');
    return { actor, platform, tenantId };
  }
  async adminReset(identity: Identity, dto: AdminResetDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, identity.sub);
      const { actor, platform, tenantId } = await this.actorDeGestion(tx, identity, dto.tenantId);
      await this.current(tx, actor, platform, dto.currentPassword, dto.mfaCode);
      if (dto.usuarioId !== actor.id) await this.lock(tx, dto.usuarioId);
      const target = await tx.usuario.findFirst({ where: { id: dto.usuarioId, tenantId, activo: true, tenant: { estado: 'ACTIVO' } } });
      // Un Admin solo restablece a otro Admin si él mismo tiene segundo factor; nunca su propia cuenta.
      if (!target || target.id === actor.id || (!platform && target.rol === 'ADMIN' && !actor.mfaSecret)) throw new ForbiddenException('Restablecimiento no autorizado');
      const token = await this.action(tx, target, false, 'RESET_ADMIN');
      await revocarSesionesDeSujeto(tx, target.id, 'ADMIN_RESET_REQUEST');
      await this.event(tx, actor.id, target, false, 'ADMIN_RESET_REQUEST');
      // One-time handoff only. No password is returned or chosen by the administrator.
      return { token, expiresIn: 600 };
    });
  }
  /**
   * Reactiva una cuenta bloqueada por intentos fallidos. Admin: solo cuentas operativas de su empresa. Super Admin: cualquier
   * empresa. No cambia la contraseña, no reactiva cuentas desactivadas ni devuelve ninguna credencial.
   */
  async unlock(identity: Identity, dto: UnlockDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, identity.sub);
      const { actor, platform, tenantId } = await this.actorDeGestion(tx, identity, dto.tenantId);
      if (dto.usuarioId !== actor.id) await this.lock(tx, dto.usuarioId);
      const target = await tx.usuario.findFirst({ where: { id: dto.usuarioId, tenantId } });
      if (!target || target.id === actor.id || (!platform && target.rol === 'ADMIN')) throw new ForbiddenException('Operación no autorizada');
      if (!target.bloqueadoAt) return { success: true, desbloqueada: false };
      await tx.usuario.update({ where: { id: target.id }, data: { bloqueadoAt: null, intentosFallidos: 0, ultimoFalloAt: null } });
      await this.event(tx, actor.id, target, false, 'ACCOUNT_UNLOCKED');
      await audit(tx, tenantId, actor.id, 'USUARIO_DESBLOQUEAR', target.id, { bloqueadoAt: target.bloqueadoAt, intentosFallidos: target.intentosFallidos, ...(platform && { superAdminId: actor.id }) });
      return { success: true, desbloqueada: true };
    });
  }
  /** Cuentas bloqueadas: el Super Admin las ve en todas las empresas (o en una); el Admin solo en la suya. */
  async locked(identity: Identity, tenantIdSolicitado?: string) {
    const { platform } = await this.account(this.prisma, identity);
    if (!platform && identity.rol !== 'ADMIN') throw new ForbiddenException('Solo un Admin o Super Admin puede gestionar accesos');
    const tenantId = platform ? tenantIdSolicitado || undefined : identity.tenantId;
    return this.prisma.usuario.findMany({
      where: { bloqueadoAt: { not: null }, ...(tenantId && { tenantId }) },
      select: { id: true, tenantId: true, nombre: true, username: true, email: true, rol: true, bloqueadoAt: true, intentosFallidos: true, tenant: { select: { nombreComercial: true } } },
      orderBy: { bloqueadoAt: 'desc' }, take: 500,
    });
  }
  async enroll(identity: Identity, currentPassword: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, identity.sub);
      const { account, platform } = await this.account(tx, identity);
      if (account.mfaSecret || !account.emailVerifiedAt || (!platform && account.rol !== 'ADMIN') || !await bcrypt.compare(currentPassword, account.passwordHash)) throw invalid();
      const secret = newTotpSecret();
      const token = await this.action(tx, account, platform, 'MFA_ENROLL', tokenHash(account.passwordHash + secret));
      return { secret, token, uri: `otpauth://totp/Jowa:${encodeURIComponent(account.email)}?secret=${secret}&issuer=Jowa&algorithm=SHA1&digits=6&period=30` };
    });
  }
  confirmMfa(dto: ConfirmMfaDto) {
    return this.consume(dto.token, ['MFA_ENROLL'], async (tx, a, account, platform) => {
      const step = /^[A-Z2-7]{32}$/.test(dto.secret) ? validStep(dto.secret, dto.mfaCode || '') : null;
      if (account.mfaSecret || step === null || a.passwordBinding !== tokenHash(account.passwordHash + dto.secret)) throw invalid();
      await this.table(tx, platform).update({ where: { id: account.id }, data: { mfaSecret: sealSecret(dto.secret, account.id, this.config), mfaLastStep: step } });
      const codes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
      await tx.authRecoveryCode.deleteMany({ where: { sujetoId: account.id, tipo: a.tipo } });
      await tx.authRecoveryCode.createMany({ data: codes.map(code => ({ hash: tokenHash(code), sujetoId: account.id, tipo: a.tipo })) });
      await revocarSesionesDeSujeto(tx, account.id, 'MFA_ENROLLED');
      await this.event(tx, account.id, account, platform, 'MFA_ENROLLED');
      return { recoveryCodes: codes };
    });
  }
}
