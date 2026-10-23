import { test, expect } from '@playwright/test';
import { prepararSesion, desbordamientoHorizontal } from './ux-auditoria.fixture';

test.describe('Seguridad web/PWA · interfaz con API simulada', () => {
  for (const width of [320, 390, 1440]) {
    test(`usuario y código requieren empresa; acceso de plataforma pide MFA @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      const identifier = page.getByLabel('Usuario, código o correo');
      await identifier.fill('44556');
      await expect(page.getByLabel('Identificador de empresa')).toHaveAttribute('required', '');
      await page.getByLabel('Identificador de empresa').fill('empresa-A');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      let sent: any;
      await page.route('**/api/auth/login', async route => { sent = route.request().postDataJSON(); await route.fulfill({ status: 401, json: { message: 'Credenciales inválidas' } }); });
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect.poll(() => sent).toMatchObject({ email: '44556', tenantId: 'empresa-A' });
      await expect(page.getByRole('alert')).toBeVisible();
      await page.getByLabel('Acceso de Super Admin').check();
      await expect(page.locator('#login-mfa')).toHaveAttribute('required', '');
      expect(await desbordamientoHorizontal(page)).toBe(0);
    });
    test(`enlace de recuperación privado no persiste en URL ni almacenamiento @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      const token = 'synthetic-one-time-token';
      await page.goto(`/login#action=RESET_ADMIN&token=${token}`);
      await expect(page.locator('#recovery-token')).toHaveValue(token);
      expect(new URL(page.url()).hash).toBe('');
      await page.locator('#recovery-password').fill('Synthetic-New-789');
      let sent: any;
      await page.route('**/api/auth/security/reset', async route => { sent = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); });
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await expect.poll(() => sent).toMatchObject({ token, password: 'Synthetic-New-789' });
      await expect(page.locator('#recovery-password')).toHaveValue('');
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(token);
      expect(await desbordamientoHorizontal(page)).toBe(0);
    });
  }
  test('bootstrap MFA muestra códigos de emergencia una sola vez en memoria', async ({ page }) => {
    await prepararSesion(page, 'ADMIN', { sinSesion: true });
    await page.goto('/login#action=BOOTSTRAP_MFA&token=synthetic-mail-proof');
    await page.locator('#recovery-password').fill('Synthetic-Current-456');
    await page.route('**/api/auth/security/mfa/bootstrap', route => route.fulfill({ json: { secret: 'SYNTHETICSETUPSECRET', token: 'synthetic-enrollment' } }));
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByText('SYNTHETICSETUPSECRET', { exact: true })).toBeVisible();
    await page.locator('#recovery-code').fill('123456');
    await page.route('**/api/auth/security/mfa/confirm', route => route.fulfill({ json: { recoveryCodes: ['synthetic-emergency-code'] } }));
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByText('synthetic-emergency-code', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('synthetic-emergency-code');
  });
  test('idioma de login se puede cambiar a inglés sin sesión', async ({ page }) => {
    await prepararSesion(page, 'ADMIN', { sinSesion: true }); await page.goto('/login');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByLabel('Username, code or email')).toBeVisible();
    await expect(page.getByText('Recover access', { exact: true })).toBeVisible();
  });
  test('bloqueo por inactividad y cambio de empleado cierran identidad', async ({ page }) => {
    await prepararSesion(page, 'ADMIN');
    await page.goto('/usuarios');
    await page.getByText('Seguridad de mi cuenta', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bloquear / cambiar de empleado', exact: true })).toBeVisible();
    await page.clock.install();
    await page.clock.fastForward(300001);
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('ferre_token'))).toBeNull();
  });
});
