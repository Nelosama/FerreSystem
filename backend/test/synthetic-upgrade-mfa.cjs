// Fixture only for the upgrade rehearsal's disposable loopback database.
// Produces one emergency code without changing the synthetic account's password.
const { PrismaClient } = require('@prisma/client');
const { randomBytes, createHash } = require('node:crypto');
if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL || 'https://invalid').hostname) || process.env.NODE_ENV === 'production') {
  throw new Error('Synthetic upgrade MFA requires the isolated rehearsal database');
}
const db = new PrismaClient();
(async () => {
  const account = await db.superAdmin.findUniqueOrThrow({ where: { email: 'superadmin@piloto.invalid' } });
  if (account.id !== 'SA1') throw new Error('Unexpected rehearsal identity');
  await db.superAdmin.update({ where: { id: account.id }, data: { mfaSecret: 'synthetic-emergency-code-fixture', emailVerifiedAt: new Date() } });
  const code = randomBytes(16).toString('hex');
  await db.authRecoveryCode.create({ data: { sujetoId: account.id, tipo: 'SUPER_ADMIN', hash: createHash('sha256').update(code).digest('hex') } });
  process.stdout.write(code);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
