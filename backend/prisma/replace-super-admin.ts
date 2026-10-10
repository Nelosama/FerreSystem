import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const targetEmail = process.env.SUPER_ADMIN_OBJETIVO_EMAIL ?? '';

async function main() {
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!targetEmail) {
    throw new Error('SUPER_ADMIN_OBJETIVO_EMAIL es obligatorio. No hay correo por defecto.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be configured for the explicit admin replacement command.');
  }
  if (process.env.CONFIRM_SUPER_ADMIN_REPLACEMENT !== targetEmail) {
    throw new Error('Set CONFIRM_SUPER_ADMIN_REPLACEMENT to the value of SUPER_ADMIN_OBJETIVO_EMAIL to confirm this operation.');
  }
  if (!password || password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must contain at least 8 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(
    async (tx) => {
      const existingAdmins = await tx.superAdmin.findMany({ select: { id: true } });
      if (existingAdmins.length > 1) {
        throw new Error('Replacement aborted: more than one Super Admin exists; review records manually.');
      }

      await tx.superAdmin.deleteMany({ where: { id: { in: existingAdmins.map(({ id }) => id) } } });
      await tx.superAdmin.create({
        data: {
          nombre: 'Nelo',
          email: targetEmail,
          passwordHash,
          activo: true,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.log('Super Admin replacement completed. Tenant users were not modified.');
}

main()
  .catch((error) => {
    console.error('Super Admin replacement failed:', error?.message || 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });