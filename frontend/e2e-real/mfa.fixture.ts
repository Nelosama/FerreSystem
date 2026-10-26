import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
const { PrismaClient } = createRequire(resolve('../backend/package.json'))('@prisma/client');
const platformEmail = 'superadmin.e2e@e2e.invalid';
export async function syntheticMfaFor(email: string) {
  if (email !== platformEmail) return undefined;
  const url = new URL(process.env.DATABASE_URL || 'https://invalid');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !process.env.E2E_API_URL?.includes('127.0.0.1')) throw new Error('Synthetic MFA fixture requires the disposable local E2E environment');
  const db = new PrismaClient();
  try {
    const account = await db.superAdmin.update({ where: { email }, data: { mfaSecret: 'synthetic-emergency-code-fixture', emailVerifiedAt: new Date() } });
    const code = randomBytes(16).toString('hex');
    await db.authRecoveryCode.create({ data: { sujetoId: account.id, tipo: 'SUPER_ADMIN', hash: createHash('sha256').update(code).digest('hex') } });
    return code;
  } finally { await db.$disconnect(); }
}
/**
 * Segundo paso del login de plataforma: tras la contraseña correcta la pantalla muestra el campo MFA (no hay casilla de
 * Super Admin). Llamar después de pulsar «Ingresar»; para cuentas de negocio no hace nada. La cuenta sintética recibe su
 * código de emergencia aquí; si al enviar la contraseña aún no tenía MFA, el servidor pidió enrolarlo (comportamiento
 * correcto) y se repite el paso de contraseña ya con el segundo factor configurado.
 */
export async function completePlatformMfa(page: Page, email: string) {
  const code = await syntheticMfaFor(email);
  if (!code) return;
  const campo = page.locator('#login-mfa');
  const enrolar = page.getByRole('button', { name: 'Configurar MFA inicial de Super Admin' });
  await expect(campo.or(enrolar)).toBeVisible();
  if (await enrolar.isVisible()) {
    await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
    await expect(campo).toBeVisible();
  }
  await campo.fill(code);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
}
