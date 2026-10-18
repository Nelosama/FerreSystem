import { test, expect, type Page } from '@playwright/test';

// Menú lateral reorganizado, grupos desplegables, estado de conexión, menú de plataforma y plantilla V3.
async function setup(page: Page, role: string, mode = 'SIDEBAR') {
  const company = { id: 'ux-company', nombreComercial: 'Ferretería El Roble', colorPrimario: '#1D4ED8', modoNavegacion: mode, templateVersion: 'v3', idioma: 'es' };
  const user = { id: 'ux-user', nombre: 'Usuario UX', rol: role, permisos: [] };
  await page.addInitScript(({ company, user }) => {
    if (!localStorage.getItem('ferre_user')) {
      localStorage.setItem('ferre_user', JSON.stringify(user));
      localStorage.setItem('ferre_tenant', JSON.stringify(company));
      localStorage.setItem('ferre_token', 'test-only');
      localStorage.setItem('ferre_language', 'es');
    }
  }, { company, user });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.origin === 'http://127.0.0.1:4173') await route.continue(); else await route.abort();
      return;
    }
    if (url.pathname === '/api/tenant/settings' || /^\/api\/admin\/tenants\/[^/]+\/settings$/.test(url.pathname)) { await route.fulfill({ json: company }); return; }
    if (/\/logo$/.test(url.pathname)) { await route.fulfill({ status: 404, json: {} }); return; }
    const data: Record<string, unknown> = {
      '/api/auth/me': { user: { ...user, sub: user.id, tenantId: company.id, type: role === 'SUPERADMIN' ? 'super_admin' : 'tenant' } },
      '/api/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
      '/api/maintenance/backup': { configured: false },
      '/api/admin/dashboard': {},
    };
    await route.fulfill({ json: data[url.pathname] ?? [] });
  });
}

const hrefs = (nav: ReturnType<Page['locator']>) => nav.locator('a').evaluateAll(links => links.map(a => a.getAttribute('href')));

test('ADMIN: orden por uso, grupos desplegables que se recuerdan y plantilla V3 con el color del negocio', async ({ page }) => {
  await setup(page, 'ADMIN');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-template', 'v3');
  const nav = page.locator('aside.jowa-sidebar');
  await expect(nav.getByRole('button', { name: 'Ventas y caja' })).toBeVisible();
  const orden = await hrefs(nav);
  expect(orden[0]).toBe('/');
  expect(orden.indexOf('/pos')).toBeLessThan(orden.indexOf('/arqueo-caja'));
  expect(orden.indexOf('/arqueo-caja')).toBeLessThan(orden.indexOf('/cotizaciones'));
  expect(orden.indexOf('/clientes')).toBeLessThan(orden.indexOf('/cuentas'));
  expect(orden.indexOf('/inventario')).toBeLessThan(orden.indexOf('/levantamiento'));
  expect(orden.indexOf('/reportes')).toBeLessThan(orden.indexOf('/usuarios'));
  expect(await nav.getByRole('button').allTextContents()).toEqual(['Ventas y caja', 'Clientes y cobros', 'Inventario y compras', 'Administración']);

  const inventario = nav.getByRole('button', { name: 'Inventario y compras' });
  await inventario.click();
  await expect(inventario).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.locator('a[href="/levantamiento"]')).toBeHidden();
  await page.reload();
  await expect(nav.getByRole('button', { name: 'Inventario y compras' })).toHaveAttribute('aria-expanded', 'false');
  await nav.getByRole('button', { name: 'Inventario y compras' }).click();
  await expect(nav.locator('a[href="/levantamiento"]')).toBeVisible();

  const activo = nav.locator('a.jowa-nav-item[href="/"]');
  await expect(activo).toHaveClass(/active/);
  await expect(activo).toHaveCSS('box-shadow', /rgb\(29, 78, 216\)/);
  await expect(page.locator('.jowa-connection')).toContainText('En línea');
});

test('sin conexión: el menú lo indica y solo el POS sigue disponible', async ({ page, context }) => {
  await setup(page, 'CAJERO');
  await page.goto('/');
  const nav = page.locator('aside.jowa-sidebar');
  await expect(nav.locator('a[href="/pos"]')).toHaveCount(1);
  await context.setOffline(true);
  await expect(page.locator('.jowa-connection')).toContainText('Sin conexión');
  await expect(nav.locator('a[href="/pos"]')).not.toHaveClass(/sin-red/);
  await expect(nav.locator('a[href="/arqueo-caja"]')).toHaveClass(/sin-red/);
  await expect(nav.locator('a[href="/arqueo-caja"]')).toContainText('en línea');
  await context.setOffline(false);
  await expect(page.locator('.jowa-connection')).toContainText('En línea');
  await expect(nav.locator('a[href="/arqueo-caja"]')).not.toHaveClass(/sin-red/);
});

test('TOPNAV se conserva con la plantilla V3', async ({ page }) => {
  await setup(page, 'ADMIN', 'TOPNAV');
  await page.goto('/');
  await expect(page.locator('header.jowa-topnav')).toBeVisible();
  await expect(page.locator('aside.jowa-sidebar')).toHaveCount(0);
});

test('SUPERADMIN: menú de plataforma con secciones por URL y menú del negocio anidado', async ({ page }) => {
  await setup(page, 'SUPERADMIN');
  await page.goto('/admin');
  const nav = page.locator('aside.jowa-platform-sidebar');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Negocios' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Auditoría' }).click();
  await expect(page).toHaveURL(/\/admin\?seccion=auditoria$/);
  await expect(nav.getByRole('link', { name: 'Auditoría' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Negocios' })).not.toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(nav.getByRole('link', { name: 'Auditoría' })).toHaveAttribute('aria-current', 'page');

  await page.goto('/admin/negocios/ux-company/marca');
  const contexto = nav.locator('.jowa-platform-context');
  await expect(contexto).toContainText('Ferretería El Roble');
  await expect(contexto.getByRole('link', { name: 'Marca y navegación' })).toHaveClass(/active/);
  await contexto.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page).toHaveURL(/\/admin\/negocios\/ux-company\/usuarios$/);
  // El menú de plataforma no adopta el color del negocio administrado.
  await expect(nav).toHaveCSS('background-color', 'rgb(20, 28, 34)');
});

test('barra superior muestra el estado de la caja a quien vende', async ({ page }) => {
  await setup(page, 'CAJERO');
  await page.goto('/');
  await expect(page.locator('.jowa-caja-estado')).toContainText('Caja cerrada');
});

test('el POS muestra sus tres pasos en el ticket', async ({ page }) => {
  await setup(page, 'CAJERO');
  await page.goto('/pos');
  const pasos = page.locator('.pos-paso');
  await expect(pasos).toHaveCount(3);
  await expect(pasos.nth(0)).toContainText('Cliente');
  await expect(pasos.nth(1)).toContainText('Productos');
  await expect(pasos.nth(2)).toContainText('Pago y entrega');
});

test('SUPERADMIN en modo lateral: no repite las pestañas superiores de plataforma', async ({ page }) => {
  await setup(page, 'SUPERADMIN');
  await page.goto('/admin');
  await expect(page.locator('aside.jowa-platform-sidebar')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Administración de plataforma' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Menú de plataforma' })).toBeVisible();
});
