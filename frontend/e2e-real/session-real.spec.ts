import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// JWT, cookie HttpOnly, NestJS y PostgreSQL reales. Sin interceptar respuestas de API.
const requireBackend = createRequire(resolve('../backend/package.json'));
const jwt = requireBackend('jsonwebtoken');
const API = process.env.E2E_API_URL!;
async function openYesterday(page: Page, keepRefresh: boolean) {
  await page.goto('/login');
  const response = await page.request.post(`${API}/auth/login`, { data: { email: 'admin.a@e2e.invalid', password: process.env.E2E_PASSWORD } });
  expect(response.status()).toBe(200);
  const session = await response.json();
  const { sub, tenantId, rol, type, sid } = jwt.decode(session.accessToken);
  const expired = jwt.sign({ sub, tenantId, rol, type, sid, exp: Math.floor(Date.now() / 1000) - 86400 }, process.env.JWT_SECRET!);
  await page.evaluate(({ session, expired }) => {
    localStorage.setItem('ferre_token', expired);
    localStorage.setItem('ferre_user', JSON.stringify(session.user));
    localStorage.setItem('ferre_tenant', JSON.stringify(session.tenant));
  }, { session, expired });
  if (!keepRefresh) await page.context().clearCookies({ name: 'refreshToken' });
  return session;
}

test('API real: acceso expirado desde ayer se renueva antes de consultar inventario', async ({ page }) => {
  await openYesterday(page, true);
  const calls: string[] = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/')) calls.push(path); });
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  expect(calls.filter(path => path === '/api/auth/refresh')).toHaveLength(1);
  expect(calls.indexOf('/api/auth/me')).toBeLessThan(calls.indexOf('/api/levantamientos'));
});

test('API real: sesión de ayer sin refresh pide login sin abrir inventario', async ({ page }) => {
  await openYesterday(page, false);
  const calls: string[] = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/')) calls.push(path); });
  await page.goto('/inventario');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Tu sesión ha expirado. Inicia sesión nuevamente para continuar.')).toBeVisible();
  expect(calls).toEqual(['/api/auth/refresh']);
});

test('API real: logout revoca el Bearer; Atrás y la caché no devuelven el módulo', async ({ page }) => {
  await openYesterday(page, true);
  await page.goto('/levantamiento');
  await expect(page.locator('.operation-page')).toBeVisible();
  const bearer = await page.evaluate(() => localStorage.getItem('ferre_token'));
  const logout = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/logout');
  await page.getByTitle('Cerrar Sesión', { exact: true }).click();
  expect((await logout).status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);
  const rejected = await page.request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${bearer}` } });
  expect(rejected.status()).toBe(401);
  expect(rejected.headers()['cache-control']).toContain('no-store');
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.operation-page')).toHaveCount(0);
});
