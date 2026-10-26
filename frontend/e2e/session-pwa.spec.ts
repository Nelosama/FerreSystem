import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
test('PWA real: shell cacheado no autoriza sesión expirada ni almacena API privada', async ({ page, context }) => {
  const identity = { user: { id: 'pwa-u', nombre: 'Operador PWA', rol: 'ADMIN' }, tenant: { id: 'pwa-t', nombreComercial: 'Empresa PWA' } };
  const token = (exp: number) => `e30.${Buffer.from(JSON.stringify({ sub: identity.user.id, tenantId: identity.tenant.id, type: 'tenant', sid: 'pwa-s', exp })).toString('base64url')}.test`;
  let expired = false, moduleReads = 0;
  await page.addInitScript(({ identity, accessToken }) => {
    if (!localStorage.getItem('pwa-test-seeded')) {
      localStorage.setItem('ferre_user', JSON.stringify(identity.user));
      localStorage.setItem('ferre_tenant', JSON.stringify(identity.tenant));
      localStorage.setItem('ferre_token', accessToken);
      localStorage.setItem('pwa-test-seeded', '1');
    }
  }, { identity, accessToken: token(Date.now() / 1000 + 900) });
  await context.route('**/api/**', async route => {
    const headers = { 'access-control-allow-origin': route.request().headers().origin || new URL(page.url()).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type,Authorization' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ headers, status: 204 }); return; }
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/refresh') { await route.fulfill({ headers, status: expired ? 401 : 200, json: { accessToken: token(Date.now() / 1000 + 900) } }); return; }
    if (path === '/api/auth/me') { await route.fulfill({ headers, json: { user: { sub: identity.user.id, tenantId: identity.tenant.id, type: 'tenant', rol: 'ADMIN' } } }); return; }
    if (path === '/api/levantamientos') moduleReads++;
    await route.fulfill({ headers, json: path === '/api/tenant/settings' ? identity.tenant : [] });
  });
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => !!(await caches.match('/index.html')))).toBe(true);
  await page.clock.install();
  await page.clock.setFixedTime(new Date(Date.now() + 86400_000));
  expired = true;
  const before = moduleReads;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Tu sesión ha expirado. Inicia sesión nuevamente para continuar.')).toBeVisible();
  await page.reload();
  await expect(page.locator('#login-clave')).toBeVisible();
  expect(moduleReads).toBe(before);
  const privateCache = await page.evaluate(async () => {
    const requests = (await Promise.all((await caches.keys()).map(async name => (await caches.open(name)).keys()))).flat();
    return requests.filter(request => new URL(request.url).pathname.startsWith('/api') || request.headers.has('Authorization')).map(request => request.url);
  });
  expect(privateCache).toEqual([]);
});
