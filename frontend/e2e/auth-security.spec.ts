import { test, expect } from '@playwright/test';
import { prepararSesion, desbordamientoHorizontal } from './ux-auditoria.fixture';

test.describe('Seguridad web/PWA · interfaz con API simulada', () => {
  for (const width of [320, 390, 1440]) {
    test(`login de dos campos: sin empresa, rol, idioma, Super Admin ni MFA; recuperación oculta hasta el tercer fallo @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
      await expect(page.locator('form input:not([type=hidden])')).toHaveCount(2);
      await expect(page.getByLabel('Identificador de empresa')).toHaveCount(0);
      await expect(page.getByLabel('Acceso de Super Admin')).toHaveCount(0);
      await expect(page.locator('#login-mfa')).toHaveCount(0);
      await expect(page.locator('select')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveCount(0);
      await expect(page.getByText('Recuperar acceso', { exact: true })).toHaveCount(0);
      await page.getByLabel('Usuario', { exact: true }).fill('44556');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      const sent: any[] = [];
      let intentos = 0;
      await page.route('**/api/auth/login', async route => {
        sent.push(route.request().postDataJSON());
        intentos++;
        await route.fulfill({ status: 401, json: { message: 'Credenciales inválidas', ...(intentos >= 3 && { recuperacionDisponible: true }) } });
      });
      for (let i = 1; i <= 2; i++) {
        await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
        await expect.poll(() => sent.length).toBe(i);
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByText('Recuperar acceso', { exact: true })).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByText('Recuperar acceso', { exact: true })).toBeVisible();
      expect(sent[0]).toEqual({ usuario: '44556', password: 'Synthetic-Password-456' });
      let solicitud: any;
      await page.route('**/api/auth/security/request', async route => { solicitud = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { message: 'ok' } }); });
      await page.getByRole('button', { name: 'Enviar contraseña temporal por correo' }).click();
      await expect.poll(() => solicitud).toEqual({ usuario: '44556' });
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`usuario bloqueado: mensaje de contacto con el Admin y sin recuperación pública @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      await page.getByLabel('Usuario', { exact: true }).fill('cajero1');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      await page.route('**/api/auth/login', route => route.fulfill({ status: 403, json: { statusCode: 403, code: 'CUENTA_BLOQUEADA', message: 'Cuenta bloqueada por intentos fallidos. Contacte al Admin o Super Admin de su empresa para reactivarla o cambiar su contraseña.' } }));
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByRole('alert')).toContainText('Contacte al Admin o Super Admin');
      await expect(page.getByText('Recuperar acceso', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Enviar contraseña temporal por correo' })).toHaveCount(0);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`contraseña temporal: cambio obligatorio antes de cualquier acceso al sistema @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      await page.getByLabel('Usuario', { exact: true }).fill('admin@ferreteria.test');
      await page.locator('#login-clave').fill('TemporalSynthetic16');
      await page.route('**/api/auth/login', route => route.fulfill({ json: { type: 'password_change_required', requiereCambioPassword: true, cambioToken: 'synthetic-change-token', expiresIn: 600 } }));
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByRole('heading', { name: 'Defina su contraseña nueva' })).toBeVisible();
      // Sin sesión: ni el formulario de acceso, ni módulos, ni token de sesión.
      await expect(page.locator('#login-clave')).toHaveCount(0);
      await expect(page).toHaveURL(/\/login/);
      expect(await page.evaluate(() => localStorage.getItem('ferre_token'))).toBeNull();
      await page.goto('/');
      await expect(page).toHaveURL(/\/login/);
      await page.getByLabel('Usuario', { exact: true }).fill('admin@ferreteria.test');
      await page.locator('#login-clave').fill('TemporalSynthetic16');
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByRole('heading', { name: 'Defina su contraseña nueva' })).toBeVisible();
      await page.locator('#forced-password').fill('Synthetic-New-789');
      await page.locator('#forced-confirm').fill('Synthetic-Other-789');
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('no coinciden');
      let sentChange: any;
      await page.route('**/api/auth/security/forced-change', async route => { sentChange = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); });
      await page.locator('#forced-confirm').fill('Synthetic-New-789');
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await expect.poll(() => sentChange).toEqual({ token: 'synthetic-change-token', password: 'Synthetic-New-789' });
      await expect(page.locator('#login-clave')).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Contraseña actualizada');
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/synthetic-change-token|Synthetic-New-789|TemporalSynthetic16/);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`enlace de recuperación privado no persiste en URL ni almacenamiento @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      const token = 'synthetic-one-time-token';
      await page.goto(`/login#action=RESET_ADMIN&token=${token}`);
      await expect(page.locator('#recovery-token')).toHaveValue(token);
      await expect(page).toHaveURL(url => url.hash === '');
      await page.locator('#recovery-password').fill('Synthetic-New-789');
      let sent: any;
      await page.route('**/api/auth/security/reset', async route => { sent = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); });
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await expect.poll(() => sent).toMatchObject({ token, password: 'Synthetic-New-789' });
      await expect(page.locator('#recovery-password')).toHaveValue('');
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(token);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
  }
  test('el login no ofrece cambio de idioma y conserva el idioma predeterminado', async ({ page }) => {
    await prepararSesion(page, 'ADMIN', { sinSesion: true }); await page.goto('/login');
    await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Español', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar al sistema' })).toBeVisible();
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
