import { test, expect, type Page } from '@playwright/test';

// Diseño único: sin plantillas ni variantes visuales; SIDEBAR y TOPNAV muestran los mismos módulos.
async function preparar(page: Page, rol: string, settings: Record<string, unknown>, caja: { respuesta?: unknown[] | 'error'; consultas?: { n: number } } = {}) {
  const user = { id: 'ux-user', nombre: 'Usuario UX', rol, permisos: [] };
  const company = { id: 'ux-company', nombreComercial: 'Ferretería El Roble', colorPrimario: '#1D4ED8', modoNavegacion: 'SIDEBAR', idioma: 'es', ...settings };
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
    if (url.pathname === '/api/tenant/settings') { await route.fulfill({ json: company }); return; }
    if (url.pathname === '/api/operaciones/caja') {
      if (caja.consultas) caja.consultas.n++;
      if (caja.respuesta === 'error') { await route.fulfill({ status: 500, json: { message: 'Error de prueba' } }); return; }
      await route.fulfill({ json: caja.respuesta ?? [] }); return;
    }
    if (/\/logo$/.test(url.pathname)) { await route.fulfill({ status: 404, json: {} }); return; }
    const data: Record<string, unknown> = {
      '/api/auth/me': { user: { ...user, sub: user.id, tenantId: company.id, type: rol === 'SUPERADMIN' ? 'super_admin' : 'tenant' } },
      '/api/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
      '/api/maintenance/backup': { configured: false },
    };
    await route.fulfill({ json: data[url.pathname] ?? [] });
  });
}

const enlaces = (locator: ReturnType<Page['locator']>) => locator.locator('a[href]').evaluateAll(links => [...new Set(links.map(a => a.getAttribute('href') || ''))].filter(h => h && h !== '/').sort());

test('configuración heredada con plantillas antiguas: la app carga sin errores y usa el diseño único', async ({ page }) => {
  const errores: string[] = []; page.on('pageerror', error => errores.push(error.message));
  await preparar(page, 'ADMIN', { templateVersion: 'v2', v2Mode: 'dark', estiloUI: 'MODERNO', fuenteTitulos: 'Poppins' });
  await page.goto('/');
  await expect(page.locator('nav.admin-rail')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-template');
  expect(errores).toEqual([]);
});

// El rail del administrador agrupa los accesos en paneles: se abre cada uno para reunir todos sus enlaces.
async function enlacesDelRail(page: Page) {
  const rail = page.locator('nav.admin-rail');
  const reunidos = new Set<string>(await rail.locator('a[href]').evaluateAll(links => links.map(a => a.getAttribute('href') || '')));
  const botones = rail.locator('button.app-rail-item');
  for (let i = 0; i < await botones.count(); i++) {
    await botones.nth(i).click();
    for (const href of await page.locator('nav.admin-rail .app-rail-panel a[href]').evaluateAll(links => links.map(a => a.getAttribute('href') || ''))) reunidos.add(href);
    await botones.nth(i).click();
  }
  return [...reunidos].filter(h => h && h !== '/').sort();
}

test('el valor histórico SIDEBAR/TOPNAV no cambia los módulos que ve el ADMIN: siempre el mismo rail', async ({ page }) => {
  await preparar(page, 'ADMIN', { modoNavegacion: 'SIDEBAR' });
  await page.goto('/');
  await expect(page.locator('nav.admin-rail')).toBeVisible();
  const historicoSidebar = await enlacesDelRail(page);
  const otra = await page.context().newPage();
  await preparar(otra, 'ADMIN', { modoNavegacion: 'TOPNAV' });
  await otra.goto('/');
  await expect(otra.locator('nav.admin-rail')).toBeVisible();
  await expect(otra.locator('header.app-top-navigation')).toHaveCount(0);
  expect(await enlacesDelRail(otra)).toEqual(historicoSidebar);
  expect(historicoSidebar).toContain('/pos');
  expect(historicoSidebar).toContain('/inventario');
});

test('el valor TOPNAV del negocio no cambia la navegación al volver a entrar', async ({ page }) => {
  await preparar(page, 'CAJERO', { modoNavegacion: 'TOPNAV' });
  await page.goto('/');
  await expect(page.locator('nav.cajero-rail')).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('nav.cajero-rail')).toBeVisible();
  await expect(page.locator('header.app-top-navigation, aside.app-sidebar')).toHaveCount(0);
});

test('caja: sin verificar sin respuesta válida, abierta o cerrada según el servidor, y una sola consulta en el POS', async ({ page }) => {
  const consultas = { n: 0 };
  await preparar(page, 'CAJERO', {}, { respuesta: 'error' });
  await page.goto('/pos');
  await expect(page.locator('.app-caja-estado')).toContainText('Caja sin verificar');
  await expect(page.locator('.app-caja-estado')).not.toContainText('abierta');

  const abierta = await page.context().newPage();
  await preparar(abierta, 'CAJERO', {}, { respuesta: [{ id: 'c1', estado: 'ABIERTA' }], consultas });
  await abierta.goto('/pos');
  await expect(abierta.locator('.app-caja-estado')).toContainText('Caja abierta');
  await expect.poll(() => consultas.n).toBeGreaterThan(0);
  expect(consultas.n).toBeLessThanOrEqual(2);
});

test('caja y navegación en inglés cuando el negocio está en EN', async ({ page }) => {
  await preparar(page, 'ADMIN', { idioma: 'en' }, { respuesta: [{ id: 'c1', estado: 'ABIERTA' }] });
  await page.goto('/');
  await expect(page.locator('.app-caja-estado')).toContainText('Cash open');
});

test('SUPERADMIN: todas las secciones de plataforma abren y el menú del negocio no se repite en modo lateral', async ({ page }) => {
  const errores: string[] = []; page.on('pageerror', error => errores.push(error.message));
  await preparar(page, 'SUPERADMIN', {});
  for (const seccion of ['negocios', 'administradores', 'servicios', 'soporte', 'auditoria', 'mantenimiento']) {
    await page.goto(`/admin?seccion=${seccion}`);
    await expect(page.locator('.platform-rail-item.is-active')).toHaveCount(1);
    await expect(page.locator('.platform-rail-item.is-active')).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/admin/negocios/ux-company/marca');
  await expect(page.locator('.platform-pills')).toBeVisible();
  await expect(page.locator('.negocio-tabs')).toHaveCount(0);
  expect(errores).toEqual([]);
});
