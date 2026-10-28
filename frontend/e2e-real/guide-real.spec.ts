import { test, expect, request, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ACCESOS_NO_MOVILES_ADMIN } from '../src/utils/movilAdmin';
import { CATALOGO_MODULOS, MODULE_DEPENDENCIES, PENDING_MODULES } from '../src/config/modulesCatalog';
import { confirmarAlerta } from '../e2e/helpers/alertas';
const { PrismaClient } = createRequire(resolve('../backend/package.json'))('@prisma/client');
const prisma = new PrismaClient();
const BASE = `${process.env.E2E_API_URL!.replace(/\/$/, '')}/`;
const PASSWORD = process.env.E2E_PASSWORD!;
const company = 'e2e-empresa-a';
async function login(page: Page, email: string) {
  await page.goto('/login'); await page.locator('#login-correo').fill(email);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}
test.afterAll(() => prisma.$disconnect());
test('Modo Guía y módulos: navegador → NestJS → PostgreSQL, sin mocks', async ({ page }) => {
  const api = await request.newContext({ baseURL: BASE });
  const response = await api.post('auth/login', { data: { email: 'superadmin.e2e@e2e.invalid', password: PASSWORD } });
  expect(response.status()).toBe(200); const sa = (await response.json()).accessToken;
  const auth = { Authorization: `Bearer ${sa}` };
  await login(page, 'superadmin.e2e@e2e.invalid');
  await page.goto(`/admin/negocios/${company}/configuracion`);
  await page.getByLabel('Modo Guía para usuarios').selectOption('true');
  await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'guardada correctamente' })).toBeVisible();
  expect((await prisma.tenant.findUniqueOrThrow({ where: { id: company } })).configuracion.modoGuia).toBe(true);
  await page.evaluate(() => localStorage.clear());
  await login(page, 'cajero.a@e2e.invalid');
  const guide = page.locator('aside.guide');
  await guide.getByRole('button', { name: 'Iniciar guía', exact: true }).click();
  for (let i=0; i<4; i++) await guide.getByRole('button', { name: 'Siguiente' }).click();
  await guide.getByRole('button', { name: 'Marcar como completada' }).click();
  await expect(guide.getByRole('button', { name: 'Ayuda · Modo Guía' })).toBeVisible();
  const cashier = await prisma.usuario.findFirstOrThrow({ where: { tenantId: company, email: 'cajero.a@e2e.invalid' } });
  expect(cashier.guiaProgreso.status).toBe('completed');
  await page.reload(); await expect(guide.getByRole('button', { name: 'Ayuda · Modo Guía' })).toBeVisible();
  await expect(guide.getByText('¿Es tu primera vez en Jowa System?')).toHaveCount(0);
  expect((await api.put(`admin/tenants/${company}/settings`, { headers: auth, data: { configuracion: { modoGuia: false } } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(guide).toHaveCount(0);
  const beforeUsers = await prisma.usuario.count({ where: { tenantId: company } });
  await page.evaluate(() => localStorage.clear()); await login(page, 'superadmin.e2e@e2e.invalid');
  await page.goto(`/admin/negocios/${company}/servicios`);
  const users = page.getByRole('checkbox', { name: /^Personal ·/ });
  const commissions = page.getByRole('checkbox', { name: /^Comisiones de venta ·/ });
  await commissions.uncheck();
  await users.uncheck();
  await page.getByRole('button', { name: 'Guardar servicios' }).click();
  await confirmarAlerta(page);
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  await page.reload(); await expect(users).not.toBeChecked();
  const adminLogin = await api.post('auth/login', { data: { email: 'admin.a@e2e.invalid', password: PASSWORD } });
  const admin = (await adminLogin.json()).accessToken;
  expect((await api.get('usuarios', { headers: { Authorization: `Bearer ${admin}` } })).status()).toBe(403);
  expect(await prisma.usuario.count({ where: { tenantId: company } })).toBe(beforeUsers);
  expect((await api.get(`admin/tenants/${company}/usuarios?gestion=true`, { headers: auth })).status()).toBe(200);
  await users.check(); await commissions.check(); await page.getByRole('button', { name: 'Guardar servicios' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  expect((await api.get('usuarios', { headers: { Authorization: `Bearer ${admin}` } })).status()).toBe(200);
  await api.dispose();
});

/** ¿El menú del administrador (rail con paneles en escritorio o menú inferior en móvil) ofrece un enlace a la ruta? */
async function menuOfrece(page: Page, ruta: string): Promise<boolean> {
  const enlace = `a[href="${ruta}"]`;
  if (await page.locator('nav.app-rail').isVisible()) {
    const rail = page.locator('nav.app-rail');
    if (await rail.locator(enlace).count()) return true;
    const botones = rail.locator('button[aria-expanded]');
    for (let i = 0; i < await botones.count(); i++) {
      await botones.nth(i).click();
      if (await rail.locator(enlace).count()) return true;
    }
    return false;
  }
  await page.locator('.mobile-bottom-nav button').click();
  const hallado = await page.locator(`.mobile-bottom-nav ${enlace}, [role="dialog"] ${enlace}`).count() > 0;
  await page.keyboard.press('Escape');
  return hallado;
}

test('17 módulos: URL, navegación y API reales, dependencias y recuperación administrativa', async ({ page }) => {
  test.setTimeout(180000);
  expect(CATALOGO_MODULOS).toHaveLength(17);
  const api = await request.newContext({ baseURL: BASE });
  const platform = await api.post('auth/login', { data: { email: 'superadmin.e2e@e2e.invalid', password: PASSWORD } });
  expect(platform.status()).toBe(200);
  const auth = { Authorization: `Bearer ${(await platform.json()).accessToken}` };
  const admin = await api.post('auth/login', { data: { email: 'admin.a@e2e.invalid', password: PASSWORD } });
  expect(admin.status()).toBe(200);
  const tenantAuth = { Authorization: `Bearer ${(await admin.json()).accessToken}` };
  const initial = await api.get(`admin/tenants/${company}/modules`, { headers: auth });
  expect(initial.status()).toBe(200);
  const initialModules = await initial.json() as { moduleKey: string; enabled: boolean }[];
  const saved = CATALOGO_MODULOS.map(({ key }) => ({ moduleKey: key, enabled: initialModules.find(m => m.moduleKey === key)?.enabled !== false }));
  const allOff = saved.map(m => ({ ...m, enabled: false }));
  const routes: Record<string, string> = {
    pos: '/pos', cotizaciones: '/cotizaciones', pedidos_especiales: '/pedidos-especiales', apartados: '/apartados',
    inventario: '/inventario', levantamiento: '/levantamiento', ordenes_compra: '/ordenes-compra',
    transferencias_sucursal: '/transferencias', garantias: '/garantias', clientes: '/clientes',
    listas_precio: '/listas-precio', usuarios: '/usuarios', comisiones_venta: '/comisiones',
    arqueo_caja: '/arqueo-caja', reportes: '/reportes', configuracion: '/configuracion', contabilidad: '/contabilidad',
  };
  // Las cuatro claves pendientes no tienen operaciones propias.
  // Comisiones consume Usuarios/POS; Configuración conserva su recuperación exclusiva de plataforma.
  const today = new Date().toISOString().slice(0, 10);
  const endpoints: Record<string, string> = {
    pos: 'ventas', cotizaciones: 'cotizaciones', inventario: 'productos', levantamiento: 'levantamientos',
    ordenes_compra: 'operaciones/compras', garantias: 'garantias/coberturas', clientes: 'clientes',
    usuarios: 'usuarios', arqueo_caja: 'operaciones/caja', reportes: `operaciones/resumen?desde=${today}&hasta=${today}`,
    contabilidad: 'contabilidad/configuracion',
  };
  const historical = () => Promise.all([
    prisma.producto.findMany({ where: { tenantId: company }, orderBy: { id: 'asc' } }),
    prisma.venta.findMany({ where: { tenantId: company }, orderBy: { id: 'asc' } }),
    prisma.usuario.findMany({ where: { tenantId: company }, orderBy: { id: 'asc' } }),
    prisma.tenantModule.findMany({ where: { tenantId: 'e2e-empresa-b' }, orderBy: { id: 'asc' } }),
  ]);
  const before = await historical();
  const update = (modules: typeof saved) => api.put(`admin/tenants/${company}/modules`, { headers: auth, data: { modules } });
  try {
    await login(page, 'admin.a@e2e.invalid');
    for (const [index, { key }] of CATALOGO_MODULOS.entries()) {
      await page.setViewportSize({ width: [1280, 768, 390][index % 3], height: 900 });
      const enabled = new Set<string>();
      const enable = (moduleKey: string) => { if (enabled.has(moduleKey)) return; enabled.add(moduleKey); (MODULE_DEPENDENCIES[moduleKey] || []).forEach(enable); };
      enable(key);
      expect((await update(allOff.map(m => ({ ...m, enabled: enabled.has(m.moduleKey) })))).status()).toBe(200);
      const settings = await api.get('tenant/settings', { headers: tenantAuth });
      expect((await settings.json()).modulosHabilitados.sort()).toEqual([...enabled].sort());
      if (endpoints[key]) expect((await api.get(endpoints[key], { headers: tenantAuth })).status(), `${key} habilitado`).toBe(200);
      await page.goto(routes[key]);
      if (key !== 'configuracion') {
        await expect(page.locator('[data-protected-content]')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Acceso Denegado|Módulo No Contratado/i })).toHaveCount(0);
        if (PENDING_MODULES.has(key)) await expect(page.getByRole('region', { name: 'Funciones pendientes' })).toBeVisible();
        else if (ACCESOS_NO_MOVILES_ADMIN.has(key) && !(await page.locator('nav.app-rail').isVisible())) expect(await menuOfrece(page, routes[key]), `${key} no se ofrece al administrador en móvil`).toBe(false);
        else expect(await menuOfrece(page, routes[key]), `${key} habilitado y ofrecido en el menú`).toBe(true);
        if (key === 'reportes') {
          await expect(page.getByRole('region', { name: 'Ventas por cajero' })).toBeVisible();
          await expect(page.getByRole('alert')).toHaveCount(0);
        }
      }
      expect((await update(allOff)).status()).toBe(200);
      if (endpoints[key]) expect((await api.get(endpoints[key], { headers: tenantAuth })).status(), `${key} deshabilitado`).toBe(403);
      await page.goto(routes[key]);
      await expect(page.getByRole('heading', { name: /Acceso Denegado|Módulo No Contratado/i })).toBeVisible();
      await page.goto('/');
      await expect(page.locator(`a[href="${routes[key]}"]`)).toHaveCount(0);
    }
    expect(await historical()).toEqual(before);
    expect((await api.get(`admin/tenants/${company}/usuarios?gestion=true`, { headers: auth })).status()).toBe(200);
    expect((await api.get(`admin/tenants/${company}/settings`, { headers: auth })).status()).toBe(200);
  } finally {
    expect((await update(saved)).status()).toBe(200);
    await api.dispose();
  }
});
