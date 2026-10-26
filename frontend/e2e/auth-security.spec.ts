import { test, expect } from '@playwright/test';
import { prepararSesion, desbordamientoHorizontal } from './ux-auditoria.fixture';

test.describe('Seguridad web/PWA · interfaz con API simulada', () => {
  for (const width of [320, 390, 1440]) {
    test(`login de dos campos: sin empresa, rol, idioma ni casilla de Super Admin; recuperación oculta hasta el tercer fallo @${width}`, async ({ page }) => {
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
        // El servidor responde siempre lo mismo: no anuncia si la cuenta puede recuperarse (sin enumeración).
        await route.fulfill({ status: 401, json: { statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' } });
      });
      for (let i = 1; i <= 2; i++) {
        await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
        await expect.poll(() => sent.length).toBe(i);
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByText('Recuperar acceso', { exact: true })).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByText('Recuperar acceso', { exact: true })).toBeVisible();
      expect(intentos).toBe(3);
      expect(sent[0]).toEqual({ usuario: '44556', password: 'Synthetic-Password-456' });
      // Cambiar el identificador reinicia el contador de la pantalla.
      await page.getByLabel('Usuario', { exact: true }).fill('otro');
      await expect(page.getByText('Recuperar acceso', { exact: true })).toHaveCount(0);
      await page.getByLabel('Usuario', { exact: true }).fill('44556');
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByText('Recuperar acceso', { exact: true })).toBeVisible();
      let solicitud: any;
      await page.route('**/api/auth/security/request', async route => { solicitud = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { message: 'ok' } }); });
      await page.getByRole('button', { name: 'Enviar contraseña temporal por correo' }).click();
      await expect.poll(() => solicitud).toEqual({ usuario: '44556' });
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`cuenta operativa: el bloqueo no se revela, pero el login orienta a pedir la reactivación al Admin @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      await expect(page.getByText(/seis intentos fallidos/)).toHaveCount(0);
      await page.getByLabel('Usuario', { exact: true }).fill('cajero1');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' } }));
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');
      await expect(page.getByText(/seis intentos fallidos.*Admin de su empresa/)).toBeVisible();
      await expect(page.getByText('Recuperar acceso', { exact: true })).toHaveCount(0);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`Super Admin: el código MFA aparece solo tras la contraseña correcta y se envía en el segundo paso @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      await expect(page.locator('#login-mfa')).toHaveCount(0);
      await page.getByLabel('Usuario', { exact: true }).fill('root@jowa.test');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      const sent: any[] = [];
      await page.route('**/api/auth/login', async route => {
        const body = route.request().postDataJSON(); sent.push(body);
        if (!body.mfaCode) return route.fulfill({ status: 401, json: { statusCode: 401, code: 'MFA_REQUERIDO', message: 'Ingrese el código de su aplicación de autenticación' } });
        return route.fulfill({ status: 401, json: { statusCode: 401, message: 'Credenciales o verificación inválidas' } });
      });
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.locator('#login-mfa')).toBeVisible();
      await expect(page.locator('#login-mfa')).toBeFocused();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.locator('#login-mfa').fill('123456');
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect.poll(() => sent.length).toBe(2);
      expect(sent[0]).toEqual({ usuario: 'root@jowa.test', password: 'Synthetic-Password-456' });
      expect(sent[1]).toEqual({ usuario: 'root@jowa.test', password: 'Synthetic-Password-456', mfaCode: '123456' });
      // Un código erróneo conserva el paso MFA (la contraseña ya fue validada) y vacía el campo.
      await expect(page.locator('#login-mfa')).toHaveValue('');
      // Cambiar de usuario vuelve al formulario de dos campos.
      await page.getByLabel('Usuario', { exact: true }).fill('otra@jowa.test');
      await expect(page.locator('#login-mfa')).toHaveCount(0);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`Super Admin sin MFA: no entra y puede pedir el enrolamiento inicial por correo @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      await page.getByLabel('Usuario', { exact: true }).fill('root@jowa.test');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { statusCode: 401, code: 'MFA_ENROLAMIENTO_REQUERIDO', message: 'Configure el segundo factor' } }));
      let solicitud: any;
      await page.route('**/api/auth/security/mfa/bootstrap-request', async route => { solicitud = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { message: 'ok' } }); });
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByRole('alert')).toContainText('segundo factor');
      await page.getByRole('button', { name: 'Configurar MFA inicial de Super Admin' }).click();
      await expect.poll(() => solicitud).toEqual({ usuario: 'root@jowa.test', password: 'Synthetic-Password-456' });
      await expect(page.getByRole('status')).toContainText('enlace de un solo uso');
      expect(await page.evaluate(() => localStorage.getItem('ferre_token'))).toBeNull();
    });
    test(`enlace de empresa: acota el login sin mostrar ningún campo de empresa @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login?empresa=tenant-heredado');
      await expect(page.locator('form input:not([type=hidden])')).toHaveCount(2);
      let sent: any;
      await page.route('**/api/auth/login', async route => { sent = route.request().postDataJSON(); await route.fulfill({ status: 401, json: { message: 'Credenciales inválidas' } }); });
      await page.getByLabel('Usuario', { exact: true }).fill('44556');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect.poll(() => sent).toEqual({ usuario: '44556', password: 'Synthetic-Password-456', tenantId: 'tenant-heredado' });
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
  test('un segundo enlace privado abierto en la misma pestaña usa su propio token (corrección de #180)', async ({ page }) => {
    await prepararSesion(page, 'ADMIN', { sinSesion: true });
    const enviados: any[] = [];
    await page.route('**/api/auth/security/reset', async route => { enviados.push(route.request().postDataJSON()); await route.fulfill({ json: { success: true } }); });
    await page.goto('/login#action=RESET_ADMIN&token=primer-token-sintetico');
    await expect(page.locator('#recovery-token')).toHaveValue('primer-token-sintetico');
    await page.locator('#recovery-password').fill('Synthetic-New-789');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect.poll(() => enviados.length).toBe(1);
    await page.evaluate(() => { window.location.hash = 'action=RESET_ADMIN&token=segundo-token-sintetico'; });
    await expect(page.locator('#recovery-token')).toHaveValue('segundo-token-sintetico');
    await expect(page).toHaveURL(url => url.hash === '');
    await page.locator('#recovery-password').fill('Synthetic-Other-789');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect.poll(() => enviados[1]).toEqual({ token: 'segundo-token-sintetico', password: 'Synthetic-Other-789' });
  });
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
