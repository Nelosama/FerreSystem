import { randomBytes } from 'node:crypto';
import { tokenHash } from '../src/auth/mfa';

/** Only for fixtures that already own a disposable PostgreSQL database. Never imported by application code. */
export async function syntheticPlatformMfa(prisma: any, email: string) {
  const admin = await prisma.superAdmin.findUniqueOrThrow({ where: { email } });
  // These fixtures exercise one-use emergency codes. TOTP/encrypted keys are tested separately.
  await prisma.superAdmin.update({ where: { id: admin.id }, data: { mfaSecret: 'synthetic-emergency-code-fixture', emailVerifiedAt: new Date() } });
  const code = randomBytes(16).toString('hex');
  await prisma.authRecoveryCode.create({ data: { sujetoId: admin.id, tipo: 'SUPER_ADMIN', hash: tokenHash(code) } });
  return code;
}
