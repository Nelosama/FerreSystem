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
  await expect(page.locator('aside.app-sidebar')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-template');
  expect(errores).toEqual([]);
});

test('SIDEBAR y TOPNAV muestran exactamente los mismos módulos para ADMIN', async ({ page }) => {
  await preparar(page, 'ADMIN', { modoNavegacion: 'SIDEBAR' });
  await page.goto('/');
  await expect(page.locator('aside.app-sidebar a[href="/pos"]')).toBeVisible();
  const lateral = await enlaces(page.locator('aside.app-sidebar'));
  const superiorPage = await page.context().newPage();
  await preparar(superiorPage, 'ADMIN', { modoNavegacion: 'TOPNAV' });
  await superiorPage.goto('/');
  await expect(superiorPage.locator('header.app-top-navigation a[href="/pos"]')).toBeAttached();
  const superior = await enlaces(superiorPage.locator('header.app-top-navigation'));
  expect(superior).toEqual(lateral);
  expect(lateral).toContain('/pos');
  expect(lateral).toContain('/inventario');
});

test('el modo de navegación del negocio persiste al volver a entrar', async ({ page }) => {
  await preparar(page, 'CAJERO', { modoNavegacion: 'TOPNAV' });
  await page.goto('/');
  await expect(page.locator('header.app-top-navigation')).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('header.app-top-navigation')).toBeVisible();
  await expect(page.locator('aside.app-sidebar')).toHaveCount(0);
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
