import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RecoveryMailService } from './recovery-mail.service';
import { newTotpSecret, opaqueToken, requireMfa, sealSecret, tokenHash, validStep } from './mfa';
import { clavesDeLogin, excepcionLimiteLogin, registrarFalloLogin, segundosBloqueados } from './login-rate-limit';
import { leerConfiguracionAuth } from './auth-config';
import { revocarSesionesDeSujeto } from './sesiones-auth';
import { AdminResetDto, ChangePasswordDto, ConfirmMfaDto, RecoveryRequestDto, ResetDto } from './dto/recovery.dto';

const accepted = { message: 'Si la cuenta cumple los requisitos, recibirá instrucciones. Los empleados deben contactar a su administrador.' };
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
    await tx.authEvent.create({ data: { actorId: actor, sujetoId: account.id, tenantId: platform ? null : account.tenantId, event } });
  }
  private async action(tx: any, account: any, platform: boolean, purpose: string, binding = tokenHash(account.passwordHash)) {
    const token = opaqueToken();
    await tx.authAction.deleteMany({ where: { sujetoId: account.id, purpose } });
    await tx.authAction.create({ data: { hash: tokenHash(token), sujetoId: account.id, tipo: platform ? 'SUPER_ADMIN' : 'TENANT', tenantId: platform ? null : account.tenantId, purpose, email: account.email, passwordBinding: binding, expiresAt: new Date(Date.now() + 600000) } });
    return token;
  }
  private async account(tx: any, identity: Identity) {
    if (identity.impersonatedBy) throw new ForbiddenException('Use su sesión personal para gestionar credenciales');
    const platform = identity.type === 'super_admin';
    const account = await this.table(tx, platform).findFirst({ where: { id: identity.sub, activo: true, ...(!platform && { tenantId: identity.tenantId, tenant: { estado: 'ACTIVO' } }) } });
    if (!account) throw invalid();
    return { account, platform };
  }
  private async current(tx: any, account: any, platform: boolean, password: string, code?: string) {
    if (!await bcrypt.compare(password, account.passwordHash)) throw invalid();
    if (platform || account.mfaSecret) await requireMfa(tx, account, platform, code, this.config);
  }

  async request(dto: RecoveryRequestDto, ip?: string) {
    const started = Date.now();
    await this.limit(`request:${dto.scope}:${dto.tenantId || ''}:${dto.email}`, ip);
    try {
      const platform = dto.scope === 'super_admin';
      const email = dto.email.toLowerCase().trim();
      const account = platform
        ? await this.prisma.superAdmin.findFirst({ where: { email, activo: true } })
        : dto.tenantId ? await this.prisma.usuario.findFirst({ where: { tenantId: dto.tenantId, email, activo: true, rol: 'ADMIN', tenant: { estado: 'ACTIVO' } } }) : null;
      if (account?.emailVerifiedAt && account.mfaSecret) {
        const token = await this.prisma.$transaction(async tx => {
          await this.lock(tx, account.id);
          return this.action(tx, account, platform, 'RESET_EMAIL');
        });
        await this.mail.send(account.email!, token, 'RESET_EMAIL', platform ? undefined : (account as any).tenantId);
      }
    } catch {
      // Never leak eligibility, mailbox/provider details, tokens or database errors.
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

  async requestBootstrap(email: string, password: string, ip?: string) {
    const started = Date.now();
    await this.limit(`bootstrap:${email}`, ip);
    try {
      const account = await this.prisma.superAdmin.findFirst({ where: { email: email.toLowerCase().trim(), activo: true } });
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
  async reset(dto: ResetDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.consume(dto.token, ['RESET_EMAIL', 'RESET_ADMIN'], async (tx, a, account, platform) => {
      if (a.passwordBinding !== tokenHash(account.passwordHash)) throw invalid();
      if (a.purpose === 'RESET_EMAIL') {
        if (!account.emailVerifiedAt || (!platform && account.rol !== 'ADMIN')) throw invalid();
        await requireMfa(tx, account, platform, dto.mfaCode, this.config);
      }
      if (platform && a.purpose !== 'RESET_EMAIL') throw invalid();
      await this.table(tx, platform).update({ where: { id: account.id }, data: { passwordHash } });
      await revocarSesionesDeSujeto(tx, account.id, 'PASSWORD_RESET');
      // Support access originating from this Super Admin must also stop.
      if (platform) await this.revokeSupport(tx);
      await tx.authAction.deleteMany({ where: { sujetoId: account.id } });
      await this.event(tx, account.id, account, platform, a.purpose);
      return { success: true };
    });
  }
  private async revokeSupport(tx: any) {
    await tx.$executeRaw`UPDATE sesiones_auth SET revoked_at=now(), revocation_motivo='SUPER_ADMIN_PASSWORD_CHANGE'
      WHERE tipo='SOPORTE' AND revoked_at IS NULL`;
  }
  async change(identity: Identity, dto: ChangePasswordDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, identity.sub);
      const { account, platform } = await this.account(tx, identity);
      await this.current(tx, account, platform, dto.currentPassword, dto.mfaCode);
      await this.table(tx, platform).update({ where: { id: account.id }, data: { passwordHash } });
      await revocarSesionesDeSujeto(tx, account.id, 'PASSWORD_CHANGE');
      if (platform) await this.revokeSupport(tx);
      await tx.authAction.deleteMany({ where: { sujetoId: account.id } });
      await this.event(tx, account.id, account, platform, 'PASSWORD_CHANGE');
      return { success: true };
    });
  }
  async adminReset(identity: Identity, dto: AdminResetDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, identity.sub);
      const { account: actor, platform } = await this.account(tx, identity);
      if (!platform && actor.rol !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede restablecer accesos');
      const tenantId = platform ? dto.tenantId : identity.tenantId;
      if (!tenantId || (!platform && dto.tenantId && dto.tenantId !== tenantId)) throw new ForbiddenException('Empresa no autorizada');
      await this.current(tx, actor, platform, dto.currentPassword, dto.mfaCode);
      if (dto.usuarioId !== actor.id) await this.lock(tx, dto.usuarioId);
      const target = await tx.usuario.findFirst({ where: { id: dto.usuarioId, tenantId, activo: true, tenant: { estado: 'ACTIVO' } } });
      if (!target || target.id === actor.id || (!platform && target.rol === 'ADMIN' && !actor.mfaSecret)) throw new ForbiddenException('Restablecimiento no autorizado');
      const token = await this.action(tx, target, false, 'RESET_ADMIN');
      await revocarSesionesDeSujeto(tx, target.id, 'ADMIN_RESET_REQUEST');
      await this.event(tx, actor.id, target, false, 'ADMIN_RESET_REQUEST');
      // One-time handoff only. No password is returned or chosen by the administrator.
      return { token, expiresIn: 600 };
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
