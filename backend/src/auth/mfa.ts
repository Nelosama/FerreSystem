import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('base64url');
function key(config: ConfigService) {
  const value = config.get<string>('AUTH_MFA_ENCRYPTION_KEY') || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new ServiceUnavailableException('Configuración MFA no disponible');
  return Buffer.from(value, 'hex');
}
// Bind ciphertext to its owner. Moving a secret between accounts invalidates its tag.
export function sealSecret(secret: string, owner: string, config: ConfigService) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(config), iv);
  cipher.setAAD(Buffer.from(owner));
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(b => b.toString('base64url')).join('.');
}
export function openSecret(value: string, owner: string, config: ConfigService) {
  const [iv, tag, body] = value.split('.').map(v => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key(config), iv);
  cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  let bits = '';
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{5}/g)!.map(s => alphabet[parseInt(s, 2)]).join('');
}
export function totp(secret: string, step: number, digits = 6) {
  const bits = secret.split('').map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map(s => parseInt(s, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', bytes).update(counter).digest(), offset = digest[19] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, '0');
}
export function validStep(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}
// Consuming the moving factor with compare-and-swap prevents replay across API instances.
export async function requireMfa(prisma: any, account: any, platform: boolean, code: string | undefined, config: ConfigService) {
  if (!account.mfaSecret || !code) throw new UnauthorizedException('Credenciales o verificación inválidas');
  const model = platform ? prisma.superAdmin : prisma.usuario;
  if (/^[a-f0-9]{32}$/.test(code)) {
    const removed = await prisma.authRecoveryCode.deleteMany({ where: { sujetoId: account.id, tipo: platform ? 'SUPER_ADMIN' : 'TENANT', hash: tokenHash(code) } });
    if (removed.count === 1) return;
  } else {
    const step = validStep(openSecret(account.mfaSecret, account.id, config), code);
    if (step !== null) {
      const consumed = await model.updateMany({ where: { id: account.id, mfaSecret: account.mfaSecret, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } });
      if (consumed.count === 1) return;
    }
  }
  throw new UnauthorizedException('Credenciales o verificación inválidas');
}
