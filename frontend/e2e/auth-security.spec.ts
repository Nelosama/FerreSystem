import { test, expect } from '@playwright/test';
import { prepararSesion, desbordamientoHorizontal } from './ux-auditoria.fixture';

test.describe('Seguridad web/PWA · interfaz con API simulada', () => {
  for (const width of [320, 390, 1440]) {
    test(`login solo con usuario y contraseña; tras tres fallos ofrece la contraseña temporal @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      // Sin empresa, rol, idioma, acceso de Super Admin ni MFA en la pantalla inicial.
      await expect(page.locator('form.login-formulario input:visible')).toHaveCount(2);
      await expect(page.getByLabel('Identificador de empresa')).toHaveCount(0);
      await expect(page.getByText('Acceso de Super Admin')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveCount(0);
      await expect(page.locator('#login-mfa')).toHaveCount(0);
      const identifier = page.getByLabel('Usuario, código o correo');
      await identifier.fill('44556');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      const sent: any[] = [];
      await page.route('**/api/auth/login', async route => { sent.push(route.request().postDataJSON()); await route.fulfill({ status: 401, json: { message: 'Credenciales inválidas' } }); });
      const entrar = page.getByRole('button', { name: 'Ingresar al sistema' });
      await entrar.click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0]).toEqual({ email: '44556', password: 'Synthetic-Password-456' });
      await expect(page.getByRole('alert')).toBeVisible();
      const recuperar = page.getByRole('button', { name: 'Enviar contraseña temporal' });
      await expect(recuperar).toHaveCount(0);
      await entrar.click(); await expect.poll(() => sent.length).toBe(2);
      await expect(recuperar).toHaveCount(0);
      await entrar.click(); await expect.poll(() => sent.length).toBe(3);
      await expect(recuperar).toBeVisible();
      await expect(page.getByText('La cuenta se bloquea al sexto intento fallido', { exact: false })).toBeVisible();
      let pedido: any;
      await page.route('**/api/auth/security/request', async route => { pedido = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { message: 'Si la cuenta cumple los requisitos, recibirá una contraseña temporal.' } }); });
      await recuperar.click();
      await expect.poll(() => pedido).toEqual({ email: '44556' });
      await expect(page.getByRole('status').filter({ hasText: 'recibirá una contraseña temporal' })).toBeVisible();
      // Cambiar el identificador reinicia el contador local.
      await identifier.fill('otra.persona');
      await expect(recuperar).toHaveCount(0);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`MFA aparece solo cuando la cuenta lo exige y no cuenta como fallo @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login?empresa=empresa-A');
      await page.getByLabel('Usuario, código o correo').fill('admin@empresa.test');
      await page.locator('#login-clave').fill('Synthetic-Password-456');
      const sent: any[] = [];
      await page.route('**/api/auth/login', async route => { sent.push(route.request().postDataJSON()); await route.fulfill({ status: 401, json: { code: 'MFA_REQUERIDO', message: 'Ingrese el código de su aplicación de autenticación' } }); });
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.locator('#login-mfa')).toBeVisible();
      // El enlace de empresa acota la búsqueda sin mostrar un campo de empresa.
      expect(sent[0]).toEqual({ email: 'admin@empresa.test', password: 'Synthetic-Password-456', tenantId: 'empresa-A' });
      await page.locator('#login-mfa').fill('123456');
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect.poll(() => sent.length).toBe(2);
      expect(sent[1]).toMatchObject({ mfaCode: '123456', tenantId: 'empresa-A' });
      await expect(page.getByRole('button', { name: 'Enviar contraseña temporal' })).toHaveCount(0);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
    test(`clave temporal: obliga a crear una contraseña antes de mostrar módulos @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      const user = { id: 'u-temp', nombre: 'Ana Admin', email: 'ana@empresa.test', rol: 'ADMIN', activo: true, permisos: [], permisosConfigurados: false, descuentoMaximo: 0 };
      let debeCambiar = true;
      await page.route('**/api/auth/login', route => route.fulfill({ json: { type: 'tenant', accessToken: 'synthetic-access', user: { ...user, debeCambiarPassword: true }, tenant: { id: 't-temp', nombreComercial: 'Ferretería Temp', colorPrimario: '#EA580C', estado: 'ACTIVO' } } }));
      await page.route('**/api/auth/me**', route => route.fulfill({ json: { user: { sub: 'u-temp', tenantId: 't-temp', type: 'tenant', rol: 'ADMIN', permisos: [], debeCambiarPassword: debeCambiar } } }));
      const otras: string[] = [];
      page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && !/\/auth\//.test(u.pathname)) otras.push(u.pathname); });
      await page.goto('/login');
      await page.getByLabel('Usuario, código o correo').fill('ana@empresa.test');
      await page.locator('#login-clave').fill('Abcd-Efgh-Jkmn-Pqrs');
      await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
      await expect(page.getByRole('heading', { name: 'Cree una contraseña nueva' })).toBeVisible();
      await expect(page.locator('nav, .admin-shell, .platform-shell')).toHaveCount(0);
      await page.locator('#cambio-nueva').fill('Propia-Clave-2026');
      await page.locator('#cambio-confirmar').fill('Otra-Clave-2026');
      await page.getByRole('button', { name: 'Guardar contraseña nueva' }).click();
      await expect(page.getByRole('alert')).toContainText('no coinciden');
      let cambio: any;
      await page.route('**/api/auth/security/required-change', async route => { cambio = route.request().postDataJSON(); debeCambiar = false; await route.fulfill({ status: 201, json: { success: true } }); });
      await page.locator('#cambio-confirmar').fill('Propia-Clave-2026');
      await page.getByRole('button', { name: 'Guardar contraseña nueva' }).click();
      await expect.poll(() => cambio).toEqual({ password: 'Propia-Clave-2026' });
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByText('Contraseña actualizada. Inicie sesión con su contraseña nueva.')).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('ferre_token'))).toBeNull();
      // Ningún módulo pidió datos mientras la cuenta debía cambiar su contraseña.
      expect(otras.filter(ruta => !/\/logo$/.test(ruta))).toEqual([]);
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
      await expect.poll(() => sent).toEqual({ token, password: 'Synthetic-New-789' });
      await expect(page.locator('#recovery-password')).toHaveValue('');
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(token);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    });
  }
  test('sin enlace privado no aparece el formulario de token; el idioma no se elige en el login', async ({ page }) => {
    await prepararSesion(page, 'ADMIN', { sinSesion: true, idioma: 'en' }); await page.goto('/login');
    // El idioma guardado en el equipo se respeta, pero el login no ofrece un selector.
    await expect(page.getByLabel('Username, code or email')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(English|Español)$/ })).toHaveCount(0);
    await expect(page.locator('#recovery-token')).toHaveCount(0);
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
