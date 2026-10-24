// Explicit maintenance command. Never imported by seeds, migrations, startup or HTTP routes.
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { isPasswordAllowed } from '../src/common/password-policy';

async function main() {
  const email = process.env.SUPER_ADMIN_OBJETIVO_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const ticket = process.env.AUTH_EMERGENCY_TICKET;
  if (process.env.CI || !email || process.env.CONFIRM_SUPER_ADMIN_RECOVERY !== email || !ticket || !/^[A-Z]+-\d+$/.test(ticket) || !process.env.DATABASE_URL || !isPasswordAllowed(password)) {
    throw new Error('Use el procedimiento de emergencia documentado: destino exacto, confirmación, ticket y contraseña válida. Prohibido en CI.');
  }
  const hash = await bcrypt.hash(password!, 12);
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      const existing = await tx.superAdmin.findUnique({ where: { email } });
      if (!existing?.activo) throw new Error('Cuenta existente activa requerida; no se crean ni sustituyen identidades');
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`AUTH:${existing.id}`}, 0))`;
      // Keep id, email, verification and MFA. Database authority is required; there is no master password.
      await tx.superAdmin.update({ where: { id: existing.id }, data: { passwordHash: hash } });
      await tx.sesionAuth.updateMany({ where: { OR: [{ sujetoId: existing.id }, { tipo: 'SOPORTE' }], revokedAt: null }, data: { revokedAt: new Date(), revocationMotivo: 'EMERGENCY_PASSWORD_RECOVERY' } });
      await tx.authAction.deleteMany({ where: { sujetoId: existing.id } });
      await tx.authEvent.create({ data: { id: randomUUID(), actorId: `EMERGENCY:${ticket}`, sujetoId: existing.id, event: 'EMERGENCY_PASSWORD_RECOVERY' } });
    });
    console.log('Contraseña recuperada; identidad y MFA conservados, sesiones revocadas. Consulte el ticket de mantenimiento.');
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('Recuperación abortada. Revise los requisitos del procedimiento; no publique secretos ni errores crudos.'); process.exitCode = 1; });
