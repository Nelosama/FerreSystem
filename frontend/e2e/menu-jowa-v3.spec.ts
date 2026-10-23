import { test, expect, type Page } from '@playwright/test';

// Menú lateral reorganizado, grupos desplegables, estado de conexión, menú de plataforma y plantilla V3.
async function setup(page: Page, role: string, mode = 'SIDEBAR') {
  const company = { id: 'ux-company', nombreComercial: 'Ferretería El Roble', colorPrimario: '#1D4ED8', modoNavegacion: mode, idioma: 'es' };
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

test('ADMIN: rail ordenado por uso, paneles por orden de uso, color del negocio y estado de conexión', async ({ page }) => {
  await setup(page, 'ADMIN');
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-template');
  const rail = page.locator('nav.admin-rail');
  await expect(rail.getByRole('button', { name: 'Ventas' })).toBeVisible();
  expect(await rail.locator('ul.app-rail-list > li').allInnerTexts()).toEqual(['Inicio', 'Ventas', 'Inventario', 'Compras', 'Clientes', 'Más']);
  const panel = async (nombre: string, id: string) => { await rail.getByRole('button', { name: nombre }).click(); return hrefs(page.locator(`#app-rail-panel-${id}`)); };
  const ventas = await panel('Ventas', 'ventas');
  expect(ventas.indexOf('/pos')).toBeGreaterThanOrEqual(0);
  expect(ventas.indexOf('/pos')).toBeLessThan(ventas.indexOf('/cotizaciones'));
  expect(ventas.indexOf('/cotizaciones')).toBeLessThan(ventas.indexOf('/arqueo-caja'));
  const clientes = await panel('Clientes', 'clientes');
  expect(clientes.indexOf('/clientes')).toBeLessThan(clientes.indexOf('/cuentas'));
  const inventario = await panel('Inventario', 'inventario');
  expect(inventario.indexOf('/inventario')).toBeLessThan(inventario.indexOf('/levantamiento'));
  const mas = await panel('Más', 'mas');
  expect(mas.indexOf('/reportes')).toBeLessThan(mas.indexOf('/usuarios'));

  // El estado activo toma el color del negocio (#1D4ED8, azul), no un color fijo de la plataforma.
  const activo = rail.getByRole('link', { name: 'Inicio', exact: true });
  await expect(activo).toHaveClass(/is-active/);
  const icono = await activo.locator('svg').evaluate(nodo => {
    const lienzo = document.createElement('canvas'); lienzo.width = lienzo.height = 1;
    const g = lienzo.getContext('2d')!; g.fillStyle = getComputedStyle(nodo).color; g.fillRect(0, 0, 1, 1);
    return [...g.getImageData(0, 0, 1, 1).data];
  });
  expect(icono[2]).toBeGreaterThan(icono[0]);
  expect(icono[2]).toBeGreaterThan(icono[1]);
  await expect(page.locator('.jowa-connection')).toContainText('En línea');
});

test('VENDEDOR: el menú lateral conserva grupos desplegables que se recuerdan y el color del negocio', async ({ page }) => {
  await setup(page, 'VENDEDOR');
  await page.goto('/');
  const nav = page.locator('aside.jowa-sidebar');
  const grupo = nav.getByRole('button', { name: 'Ventas y caja' });
  await expect(grupo).toHaveAttribute('aria-expanded', 'true');
  await grupo.click();
  await expect(grupo).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.locator('a[href="/pos"]')).toBeHidden();
  await page.reload();
  await expect(nav.getByRole('button', { name: 'Ventas y caja' })).toHaveAttribute('aria-expanded', 'false');
  await nav.getByRole('button', { name: 'Ventas y caja' }).click();
  await expect(nav.locator('a[href="/pos"]')).toBeVisible();

  const activo = nav.locator('a.jowa-nav-item[href="/"]');
  await expect(activo).toHaveClass(/active/);
  await expect(activo).toHaveCSS('box-shadow', /rgb\(29, 78, 216\)/);
  await expect(page.locator('.jowa-connection')).toContainText('En línea');
});

test('sin conexión: el menú lo indica y solo el POS sigue disponible', async ({ page, context }) => {
  await setup(page, 'CAJERO');
  await page.goto('/');
  // El rail del cajero muestra Caja y Mi caja; el indicador de conexión queda dentro del rail.
  const nav = page.locator('nav.cajero-rail');
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

test('TOPNAV se conserva en el diseño único', async ({ page }) => {
  await setup(page, 'ADMIN', 'TOPNAV');
  await page.goto('/');
  await expect(page.locator('header.jowa-topnav')).toBeVisible();
  await expect(page.locator('aside.jowa-sidebar')).toHaveCount(0);
});

test('SUPERADMIN: rail de áreas con pestañas por URL y pestañas del negocio', async ({ page }) => {
  await setup(page, 'SUPERADMIN');
  await page.goto('/admin');
  const rail = page.getByRole('navigation', { name: 'Áreas de la plataforma' });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Clientes' })).toHaveAttribute('aria-current', 'page');
  await rail.getByRole('link', { name: 'Seguridad' }).click();
  await expect(page).toHaveURL(/\/admin\?seccion=auditoria$/);
  await expect(rail.getByRole('link', { name: 'Seguridad' })).toHaveAttribute('aria-current', 'page');
  await expect(rail.getByRole('link', { name: 'Clientes' })).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('tab', { name: 'Auditoría' })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(rail.getByRole('link', { name: 'Seguridad' })).toHaveAttribute('aria-current', 'page');

  await page.goto('/admin/negocios/ux-company/marca');
  // Dentro de un negocio el área Clientes sigue activa y las pestañas del negocio están visibles.
  await expect(rail.getByRole('link', { name: 'Clientes' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toContainText('Ferretería El Roble');
  await expect(page.getByRole('tab', { name: 'Configuración y marca' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Usuarios' }).click();
  await expect(page).toHaveURL(/\/admin\/negocios\/ux-company\/usuarios$/);
  // El rail de plataforma no adopta el color del negocio administrado.
  await expect(rail).toHaveCSS('background-color', 'rgb(20, 28, 34)');
});

test('barra superior muestra el estado de la caja a quien vende', async ({ page }) => {
  await setup(page, 'CAJERO');
  await page.goto('/');
  await expect(page.locator('.app-caja-estado')).toContainText('Caja cerrada');
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

test('SUPERADMIN: el rail sustituye al menú lateral y no hay pestañas superiores duplicadas', async ({ page }) => {
  await setup(page, 'SUPERADMIN');
  await page.goto('/admin');
  await expect(page.getByRole('navigation', { name: 'Áreas de la plataforma' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú de plataforma' })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Clientes' })).toBeVisible();
});
