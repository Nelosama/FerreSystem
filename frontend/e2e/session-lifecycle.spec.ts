import { test, expect, type Page } from '@playwright/test';

const tenant = { id: 'session-t1', nombreComercial: 'Empresa sesión', colorPrimario: '#EA580C' };
const user = { id: 'session-u1', nombre: 'Operador', email: 'session@example.invalid', rol: 'ADMIN' };
const token = (exp = Date.now() / 1000 + 900) => `e30.${Buffer.from(JSON.stringify({ sub: user.id, tenantId: tenant.id, type: 'tenant', sid: 's1', exp })).toString('base64url')}.test`;
async function scenario(page: Page, expired = false, lifetimeSeconds = 900) {
  const state = { me: 200, refresh: 200, modules: 200, hold: false, calls: [] as string[], refreshes: 0 };
  await page.addInitScript(({ user, tenant, accessToken }) => {
    if (!localStorage.getItem('session-test-seeded')) {
      localStorage.setItem('ferre_token', accessToken);
      localStorage.setItem('ferre_user', JSON.stringify(user));
      localStorage.setItem('ferre_tenant', JSON.stringify(tenant));
      localStorage.setItem('session-test-seeded', '1');
    }
  }, { user, tenant, accessToken: token(expired ? Date.now() / 1000 - 86400 : Date.now() / 1000 + lifetimeSeconds) });
  await page.context().route('**/api/**', async route => {
    const headers = { 'access-control-allow-origin': route.request().headers().origin || new URL(page.url()).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'Content-Type,Authorization' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ headers, status: 204 }); return; }
    const path = new URL(route.request().url()).pathname.slice(4);
    state.calls.push(path);
    if (path === '/auth/refresh') {
      state.refreshes++;
      await route.fulfill({ headers, status: state.refresh, json: state.refresh === 200 ? { accessToken: token((await page.evaluate(() => Date.now())) / 1000 + 900) } : { message: 'Sesión inválida' } }); return;
    }
    if (path === '/auth/me') {
      if (state.hold) return;
      await route.fulfill({ headers, status: state.me, json: { user: { sub: user.id, tenantId: tenant.id, type: 'tenant', rol: user.rol } } }); return;
    }
    if (path === '/auth/logout') { await route.fulfill({ headers, json: {} }); return; }
    if (path === '/tenant/settings') { await route.fulfill({ headers, json: tenant }); return; }
    await route.fulfill({ headers, status: state.modules, json: state.modules === 200 ? [] : { message: state.modules === 403 ? 'Acceso denegado por el servidor' : 'Servidor temporalmente no disponible' } });
  });
  return state;
}

test('arranque: ningún módulo se monta mientras /auth/me sigue pendiente', async ({ page }) => {
  const state = await scenario(page); state.hold = true;
  await page.goto('/levantamiento');
  await expect(page.getByText('Verificando sesión…', { exact: true })).toBeVisible();
  expect(state.calls.filter(path => !['/auth/me'].includes(path))).toEqual([]);
  await expect(page.locator('.operation-page')).toHaveCount(0);
});

test('sesión de ayer inválida no consulta inventario ni muestra navegación', async ({ page }) => {
  const state = await scenario(page, true); state.refresh = 401;
  await page.goto('/inventario');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Tu sesión ha expirado. Inicia sesión nuevamente para continuar.')).toBeVisible();
  expect(state.calls).toEqual(['/auth/refresh']);
  expect(await page.evaluate(() => localStorage.getItem('ferre_user'))).toBeNull();
});

test('sesión de ayer se recupera con una sola renovación válida antes de abrir módulos', async ({ page }) => {
  const state = await scenario(page, true);
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  expect(state.calls.indexOf('/auth/me')).toBeLessThan(state.calls.indexOf('/levantamientos'));
  expect(state.refreshes).toBe(1);
});

for (const status of [502, 503, 504]) {
  test(`backend temporal ${status}: conserva sesión, bloquea módulos y permite reintentar`, async ({ page }) => {
    const state = await scenario(page); state.me = status;
    await page.goto('/levantamiento');
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
    expect(await page.evaluate(() => !!localStorage.getItem('ferre_token'))).toBe(true);
    expect(state.calls).not.toContain('/levantamientos');
    state.me = 200;
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.locator('.operation-page')).toBeVisible();
    expect(state.refreshes).toBe(0);
  });
}

test('403 con sesión válida muestra acceso denegado y conserva credenciales', async ({ page }) => {
  const state = await scenario(page); state.modules = 403;
  await page.goto('/levantamiento');
  await expect(page.getByRole('alert')).toContainText('Acceso denegado');
  expect(await page.evaluate(() => !!localStorage.getItem('ferre_token'))).toBe(true);
  expect(state.refreshes).toBe(0);
});

test('restaurar pestaña/PWA tras horas exige renovación y rechaza la sesión inválida', async ({ page }) => {
  const state = await scenario(page);
  await page.clock.install();
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  state.refresh = 401;
  await page.clock.setFixedTime(new Date(Date.now() + 86400_000));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.operation-page')).toHaveCount(0);
  expect(state.refreshes).toBe(1);
});

test('formulario abierto conserva datos no enviados al renovar; no escribe automáticamente', async ({ page }) => {
  const state = await scenario(page, false, 60);
  await page.clock.install();
  await page.goto('/levantamiento');
  const name = page.locator('.operation-form input').first();
  await name.fill('Conteo sin enviar');
  await page.clock.setFixedTime(new Date(Date.now() + 120_000));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(name).toBeVisible();
  await expect(name).toHaveValue('Conteo sin enviar');
  expect(state.refreshes).toBe(1);
  expect(state.calls.filter(path => path === '/levantamientos').length).toBe(1);
});

test('expiración mientras consulta inventario: 401 terminal pide login sin confirmar', async ({ page }) => {
  const state = await scenario(page);
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  state.modules = 401; state.refresh = 401;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('ferre_token'))).toBeNull();
  expect(state.refreshes).toBe(1);
});

test('logout captura el Bearer, limpia identidad y Atrás no reactiva módulos', async ({ page }) => {
  const state = await scenario(page);
  let logoutBearer: string | undefined;
  await page.route('**/api/auth/logout', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'Content-Type,Authorization' } }); return; }
    logoutBearer = route.request().headers().authorization;
    await route.fulfill({ headers: { 'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true' }, json: {} });
  });
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  await page.getByTitle('Cerrar Sesión', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => logoutBearer).toMatch(/^Bearer /);
  expect(await page.evaluate(() => localStorage.getItem('ferre_tenant'))).toBeNull();
  const calls = state.calls.length;
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.operation-page')).toHaveCount(0);
  expect(state.calls.length).toBe(calls);
});

test('otro usuario/tenant en otra pestaña retira el formulario sin borrar su login', async ({ page, context }) => {
  await scenario(page);
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  await page.locator('.operation-form input').first().fill('Información anterior');
  const second = await context.newPage();
  await second.goto('/login');
  await second.evaluate(() => {
    localStorage.setItem('ferre_user', JSON.stringify({ id: 'otra-persona', rol: 'ADMIN' }));
    localStorage.setItem('ferre_tenant', JSON.stringify({ id: 'otra-empresa' }));
    localStorage.setItem('ferre_token', 'otra-sesion');
  });
  await page.bringToFront();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.operation-page')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ferre_token'))).toBe('otra-sesion');
});

test('timeout de validación ofrece reintentar sin esperar un minuto ni cerrar sesión', async ({ page }) => {
  const state = await scenario(page); state.hold = true;
  await page.goto('/levantamiento');
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => !!localStorage.getItem('ferre_token'))).toBe(true);
  state.hold = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.locator('.operation-page')).toBeVisible();
});

test('sesión irrecuperable con formulario abierto retira datos y no anuncia un guardado', async ({ page }) => {
  const state = await scenario(page);
  await page.clock.install();
  await page.goto('/levantamiento');
  await page.locator('.operation-form input').first().fill('Captura privada sin enviar');
  state.refresh = 401;
  await page.clock.setFixedTime(new Date(Date.now() + 86400_000));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.operation-page')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Captura privada sin enviar');
  expect(state.calls.filter(path => path === '/levantamientos')).toHaveLength(1);
});

test('cerrar sesión en una pestaña retira los módulos de la otra pestaña sin nuevas consultas', async ({ page, context }) => {
  const state = await scenario(page);
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  const segunda = await context.newPage();
  await segunda.goto('/levantamiento');
  await expect(segunda.locator('.operation-page')).toBeVisible();
  await segunda.locator('.operation-form input').first().fill('Dato sin guardar');
  await page.getByTitle('Cerrar Sesión', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  const llamadas = state.calls.length;
  await segunda.bringToFront();
  await expect(segunda).toHaveURL(/\/login$/);
  await expect(segunda.locator('.operation-page')).toHaveCount(0);
  expect(await segunda.locator('input').evaluateAll(campos => campos.some(c => (c as HTMLInputElement).value === 'Dato sin guardar'))).toBe(false);
  expect(await segunda.evaluate(() => localStorage.getItem('ferre_token'))).toBeNull();
  // La otra pestaña no consulta módulos con la sesión cerrada (solo podría intentar renovar y recibir rechazo).
  expect(state.calls.slice(llamadas).filter(p => !['/auth/refresh', '/auth/logout', '/auth/me'].includes(p))).toEqual([]);
});
