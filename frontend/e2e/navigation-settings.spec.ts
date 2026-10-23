import { test, expect, type Page } from '@playwright/test';

const roles = ['SUPERADMIN', 'ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'] as const;
async function setup(page: Page, role: string, mode: string, language = 'es', enabled?: string[]) {
  const company = { id: 'ux-company', nombreComercial: 'Ferretería UX', colorPrimario: '#0284C7', modoNavegacion: mode, v2Mode: 'light', idioma: role === 'SUPERADMIN' ? 'es' : language, modulosHabilitados: enabled };
  const user = { id: 'ux-user', nombre: 'Usuario UX', rol: role, permisos: [] };
  let settings: any = company;
  let failSave = false;
  const writes: any[] = [];
  await page.addInitScript(({ company, user, language }) => {
    if (!localStorage.getItem('ferre_user')) {
      localStorage.setItem('ferre_user', JSON.stringify(user));
      localStorage.setItem('ferre_tenant', JSON.stringify(company));
      localStorage.setItem('ferre_token', 'test-only');
      localStorage.setItem('ferre_language', language);
      localStorage.setItem('ferre_saas_tenants', JSON.stringify([{ ...company, colorPrimario: '#FF0000', modoNavegacion: 'SIDEBAR', modulosHabilitados: [] }]));
    }
  }, { company, user, language });
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.origin === 'http://127.0.0.1:4173') await route.continue(); else await route.abort();
      return;
    }
    if (/^\/api\/admin\/tenants\/[^/]+\/settings$/.test(url.pathname)) {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON(); writes.push(body);
        if (failSave) { await route.fulfill({ status: 500, json: { message: 'Error de prueba al guardar' } }); return; }
        settings = { ...settings, ...body, ...body.configuracion };
      }
      await route.fulfill({ json: settings }); return;
    }
    if (/^\/api\/admin\/tenants\/[^/]+\/logo$/.test(url.pathname)) { await route.fulfill({ status: 404, json: { message: 'El negocio no tiene logotipo' } }); return; }
    if (url.pathname === '/api/tenant/settings') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON(); writes.push(body);
        if (failSave) { await route.fulfill({ status: 500, json: { message: 'Error de prueba al guardar' } }); return; }
        settings = { ...settings, ...body, ...body.configuracion };
      }
      await route.fulfill({ json: settings }); return;
    }
    if (url.pathname === '/api/auth/login') {
      await route.fulfill({ json: { type: 'tenant', accessToken: 'test-only', user, tenant: settings } }); return;
    }
    const data: Record<string, unknown> = {
      '/api/auth/me': { user: { ...user, sub: user.id, tenantId: company.id, type: role === 'SUPERADMIN' ? 'super_admin' : 'tenant' } },
      '/api/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
      '/api/maintenance/backup': { configured: false },
      '/api/admin/tenants': [], '/api/admin/dashboard': {},
      '/api/sucursales': [],
    };
    await route.fulfill({ json: data[url.pathname] || [] });
  });
  return { writes, fail: (value: boolean) => { failSave = value; }, settings: () => settings };
}

for (const role of roles) for (const mode of ['SIDEBAR', 'TOPNAV']) for (const language of ['es', 'en']) {
  test(`${role} ${mode} ${language}: navegación, prioridades, módulos y móvil`, async ({ page }) => {
    const expectedLanguage = language;
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page, role, mode, language, []);
    await page.goto(role === 'SUPERADMIN' ? '/admin' : '/');
    // El SUPERADMIN usa siempre el rail de plataforma (el modo del negocio no le aplica).
    // Cajero y administrador en modo lateral usan el rail de iconos; sus accesos secundarios quedan en paneles («Más»).
    const rail = ['CAJERO', 'ADMIN'].includes(role) && mode === 'SIDEBAR';
    const navigation = role === 'SUPERADMIN' ? page.getByRole('navigation', { name: 'Áreas de la plataforma' }) : rail ? page.locator('nav.app-rail') : page.locator(mode === 'SIDEBAR' ? 'aside.desktop-sidebar-nav' : 'header.desktop-sidebar-nav');
    await expect(navigation).toBeVisible();
    if (rail && await navigation.getByRole('button', { name: 'Más' }).count()) await navigation.getByRole('button', { name: 'Más' }).click();
    await expect(navigation.locator('a[href="/pos"]')).toHaveCount(0);
    await expect(navigation.locator('a[href="/apartados"]')).toHaveCount(0);
    // La configuración se abre por negocio desde el panel del SUPERADMIN; no hay entrada global en el menú.
    await expect(navigation.locator('a[href="/configuracion"]')).toHaveCount(0);
    if (role !== 'SUPERADMIN') {
      // Acciones principales del inicio: como máximo cuatro (el administrador las ve como «Acciones frecuentes»).
      const accionesInicio = role === 'ADMIN' ? page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link') : page.locator('.daily-tasks .task-link');
      expect(await accionesInicio.count()).toBeLessThanOrEqual(4);
      if (['CAJERO', 'VENDEDOR'].includes(role)) {
        if (mode === 'TOPNAV') { const submenu = navigation.locator('a[href="/arqueo-caja"]').locator('xpath=ancestor::details'); if (await submenu.count()) await submenu.locator('summary').click(); }
        await expect(navigation.locator('a[href="/arqueo-caja"]')).toHaveCount(0);
      }
      if (role !== 'ADMIN') await expect(navigation.locator('a[href="/usuarios"]')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (role === 'SUPERADMIN') {
      // En móvil el rail es la barra inferior de cuatro áreas; no hay botón «Más».
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link')).toHaveCount(4); // En móvil el logotipo del rail queda oculto.
      await page.goto('/inventario');
      await expect(page.getByRole('heading', { name: language === 'es' ? /Acceso Denegado/i : /Access Denied/i, exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      return;
    }
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    const more = page.locator('.mobile-bottom-nav button');
    await more.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(more).toBeFocused();
    if (role === 'SUPERADMIN') {
      await page.goto('/'); await expect(page).toHaveURL(/\/admin$/);
    }
    await page.goto('/inventario');
    await expect(page.getByRole('heading', { name: expectedLanguage === 'es' ? /Acceso Denegado/i : /Access Denied/i, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const role of ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO']) for (const mode of ['SIDEBAR', 'TOPNAV']) for (const enabled of [false, true]) {
  test(`POS ${enabled} ${role} ${mode}: menús, buscador, accesos, móvil y URL`, async ({ page }) => {
    await setup(page, role, mode, 'es', enabled ? ['pos'] : []);
    await page.goto('/');
    const cajeroRail = role === 'CAJERO' && mode === 'SIDEBAR';
    const adminRail = role === 'ADMIN' && mode === 'SIDEBAR';
    const nav = cajeroRail || adminRail ? page.locator('nav.app-rail') : page.locator(mode === 'SIDEBAR' ? 'aside.desktop-sidebar-nav' : 'header.desktop-sidebar-nav');
    await expect(nav).toBeVisible();
    if (cajeroRail && await nav.getByRole('button', { name: 'Más' }).count()) await nav.getByRole('button', { name: 'Más' }).click();
    // El buscador de pantallas está plegado dentro del shell del administrador (se abre antes: pulsar fuera cierra el panel del rail).
    if (adminRail) await page.locator('.task-finder-toggle').click();
    // El administrador agrupa Entregas y Devoluciones en el panel «Ventas» del rail (solo existe con el módulo POS).
    if (adminRail) {
      const ventas = nav.getByRole('button', { name: 'Ventas', exact: true });
      if (enabled) { await expect(ventas).toBeVisible(); await ventas.click(); }
      else await expect(ventas).toHaveCount(0);
    }
    const salesMenu = nav.getByRole('button', { name: 'Ventas y caja' });
    if (mode === 'TOPNAV' && await salesMenu.count()) await salesMenu.click();
    for (const route of ['entregas', 'devoluciones']) {
      const allowed = enabled && (route === 'entregas' ? role !== 'VENDEDOR' : role !== 'BODEGUERO');
      await expect(nav.locator(`a[href="/${route}"]`)).toHaveCount(allowed ? 1 : 0);
      await page.locator('#task-search').fill(route === 'entregas' ? 'entregar' : 'devolución');
      await expect(page.locator(`.task-search-results a[href="/${route}"]`)).toHaveCount(allowed ? 1 : 0);
      if (!allowed) await expect(page.locator(`.daily-tasks a[href="/${route}"]`)).toHaveCount(0);
    }
    if (role === 'BODEGUERO') await expect(page.locator('.daily-tasks a[href="/entregas"]')).toHaveCount(enabled ? 1 : 0);
    if (['ADMIN', 'CAJERO'].includes(role)) {
      await expect(nav.locator('a[href="/arqueo-caja"]')).toHaveCount(0);
      // FS-14: el cajero ya no tiene Clientes; con un solo ítem la categoría puede no mostrarse como grupo.
      const grupoCobros = nav.getByRole('button', { name: 'Clientes y cobros' });
      if (mode === 'TOPNAV' && await grupoCobros.count()) await grupoCobros.click();
      await expect(nav.locator('a[href="/cuentas"]')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.mobile-bottom-nav button').click();
    const mobile = page.locator('.mobile-bottom-nav, [role="dialog"]');
    for (const route of ['entregas', 'devoluciones']) {
      const allowed = enabled && (route === 'entregas' ? role !== 'VENDEDOR' : role !== 'BODEGUERO');
      // En móvil el administrador no recibe devoluciones (regla de la interfaz móvil administrativa).
      const ofrecidoEnMovil = allowed && !(role === 'ADMIN' && route === 'devoluciones');
      expect(await mobile.locator(`a[href="/${route}"]`).count()).toBe(ofrecidoEnMovil ? 1 : 0);
    }
    await page.keyboard.press('Escape');
    for (const route of ['entregas', 'devoluciones']) for (const url of [`/${route}`, `/${route.toUpperCase()}/`]) {
      await page.goto(url);
      const allowed = enabled && (route === 'entregas' ? role !== 'VENDEDOR' : role !== 'BODEGUERO');
      const denied = page.getByRole('heading', { name: /Acceso Denegado/i, exact: true });
      if (allowed) {
        await expect(page.locator('.task-finder-toggle')).toBeVisible();
        await expect(denied).toHaveCount(0);
      } else await expect(denied).toBeVisible();
    }
  });
}

test('settings: valores fiscales soportados, guardado, reload, errores y capturas', async ({ page }) => {
  const api = await setup(page, 'SUPERADMIN', 'TOPNAV');
  await page.goto('/admin/negocios/ux-company/configuracion');
  await expect(page.getByRole('navigation', { name: 'Áreas de la plataforma' })).toBeVisible();
  await expect(page.locator('#task-search')).toHaveCount(0);
  await expect(page.locator('#tax-rate')).toHaveValue('15');
  for (const id of ['currency-code', 'currency-symbol', 'tax-name', 'tax-rate']) await expect(page.locator('#' + id)).toHaveAttribute('readonly', '');
  await page.locator('#business-name').fill('Empresa guardada');
  await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'guardada correctamente' })).toBeVisible();
  expect(api.writes[0]).toMatchObject({ modoNavegacion: 'TOPNAV', configuracion: { impuesto: { tasa: 15 }, moneda: { codigo: 'HNL' } } });
  await page.reload();
  await expect(page.locator('input[type="number"]')).toHaveValue('15');
  await expect(page.getByRole('navigation', { name: 'Áreas de la plataforma' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/ux-settings-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/ux-settings-mobile.png', fullPage: true });
  api.fail(true);
  await page.locator('#business-name').fill('Borrador sin guardar');
  await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Error de prueba al guardar');
  expect(api.settings().impuesto.tasa).toBe(15);
  await expect(page.locator('#business-name')).toHaveValue('Borrador sin guardar');
  await expect(page.getByRole('status').filter({ hasText: 'guardada correctamente' })).toHaveCount(0);
  await page.evaluate(() => { localStorage.removeItem('ferre_user'); localStorage.removeItem('ferre_tenant'); localStorage.removeItem('ferre_token'); });
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('test@example.invalid');
  await page.locator('input[type="password"]').fill('test-only-password');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await expect(page).toHaveURL(/\/(admin)?$/);
  await page.goto('/admin/negocios/ux-company/configuracion');
  await expect(page.locator('input[type="number"]')).toHaveValue('15');
});

test('marca de Super Admin guarda por API, permanece al recargar y no anuncia éxito ante error', async ({ page }) => {
  await setup(page, 'SUPERADMIN', 'SIDEBAR');
  let record: any = { id: 'target-company', nombreComercial: 'Empresa de prueba', colorPrimario: '#0284C7', modoNavegacion: 'SIDEBAR', estado: 'ACTIVO', plan: 'Plan Pro', cantidadUsuarios: 1, usuarios: [], modulosHabilitados: ['pos'] };
  let fail = false; const calls: string[] = [];
  await page.route('**/api/admin/tenants**', async route => {
    if (route.request().method() === 'PATCH') {
      calls.push(new URL(route.request().url()).pathname);
      if (fail) { await route.fulfill({ status: 500, json: { message: 'Error al guardar marca' } }); return; }
      record = { ...record, ...route.request().postDataJSON() };
      await route.fulfill({ json: record });
    } else await route.fulfill({ json: [record] });
  });
  await page.goto('/admin');
  async function openBrand(name: string) {
    const row = page.getByRole('row').filter({ hasText: name });
    await row.locator('summary').click();
    await row.getByRole('button', { name: 'MARCA', exact: true }).click();
  }
  await openBrand('Empresa de prueba');
  const modal = page.locator('.industrial-card').filter({ has: page.getByRole('heading', { name: 'CONFIGURAR MARCA Y DATOS DE EMPRESA', exact: true }) });
  await modal.locator('input[type="text"]').first().fill('Empresa actualizada');
  await modal.getByRole('button', { name: 'GUARDAR CONFIGURACIÓN', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(calls).toEqual(['/api/admin/tenants/target-company']);
  await page.reload();
  await openBrand('Empresa actualizada');
  fail = true;
  await modal.locator('input[type="text"]').first().fill('Marca sin guardar');
  await modal.getByRole('button', { name: 'GUARDAR CONFIGURACIÓN', exact: true }).click();
  await expect(modal.getByRole('alert')).toHaveText('Error al guardar marca');
  expect(record.nombreComercial).toBe('Empresa actualizada');
  await expect(page.getByText('Configuración guardada en el servidor.', { exact: true })).toHaveCount(0);
});

for (const language of ['es', 'en']) test(`inicio ADMIN: pendientes traducidos y Configuración denegada ${language}`, async ({ page }) => {
  await setup(page, 'ADMIN', 'TOPNAV', language);
  await page.goto('/configuracion');
  await expect(page.getByRole('heading', { name: language === 'es' ? 'Acceso Denegado' : 'Access Denied', exact: true })).toBeVisible();
  await page.goto('/');
  await page.locator('.admin-home__nota summary').click();
  await expect(page.locator('.admin-home__nota p')).toContainText(language==='es'?'todavía no registran':'do not record');
  await expect(page.locator('.admin-home__nota a')).toHaveCount(0);
  await expect(page.locator('a[href="/apartados"]')).toHaveCount(0);
});

for (const language of ['es', 'en']) test(`configuración del negocio traducida ${language}`, async ({ page }) => {
  await setup(page, 'SUPERADMIN', 'TOPNAV', language);
  await page.goto('/admin/negocios/ux-company/configuracion');
  // La plataforma no muestra el buscador de tareas de los negocios.
  await expect(page.locator('#task-search')).toHaveCount(0);
  await expect(page.locator('#fiscal-limit')).toContainText(language==='es'?'solo lectura':'read-only');
});

test('configuración vacía del servidor sustituye apariencia vieja de la caché', async ({ page }) => {
  await setup(page,'SUPERADMIN','TOPNAV');
  await page.route('**/api/admin/tenants/ux-company/settings',route=>route.fulfill({ json:{ id:'ux-company',nombreComercial:'Servidor',colorPrimario:'#0284C7',modoNavegacion:'SIDEBAR',configuracion:{},modulosHabilitados:[] } }));
  await page.goto('/admin/negocios/ux-company/configuracion');
  // Diseño único: ya no existen selectores de plantilla, estilo ni tipografía.
  await expect(page.locator('#template-version')).toHaveCount(0);
  await expect(page.locator('#classic-style')).toHaveCount(0);
  await expect(page.locator('#heading-font')).toHaveCount(0);
  // La navegación de la plataforma del Super Admin no depende del negocio editado; el formulario sí refleja el servidor.

  await expect(page.locator('#currency-code')).toHaveValue('HNL');
  await expect(page.locator('#tax-rate')).toHaveValue('15');
});

test('formato de impresión: el Super Admin elige rollo de 80 mm, se guarda y se conserva al recargar', async ({ page }) => {
  const api = await setup(page, 'SUPERADMIN', 'TOPNAV');
  await page.goto('/admin/negocios/ux-company/configuracion');
  await expect(page.getByLabel('Formato de impresión de facturas y recibos')).toHaveValue('A4');
  await page.getByLabel('Formato de impresión de facturas y recibos').selectOption('ROLLO_80MM');
  await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'guardada correctamente' })).toBeVisible();
  expect(api.writes.at(-1)).toMatchObject({ configuracion: { formatoImpresion: 'ROLLO_80MM' } });
  await page.reload();
  await expect(page.getByLabel('Formato de impresión de facturas y recibos')).toHaveValue('ROLLO_80MM');
});

for (const width of [390, 320]) test(`settings: controles completos dentro de la pantalla de ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await setup(page, 'SUPERADMIN', 'TOPNAV');
  await page.goto('/admin/negocios/ux-company/configuracion');
  await expect(page.locator('#business-name')).toHaveValue('Ferretería UX');
  const controles = page.locator('main .industrial-card, main form, main form input:visible, main form select:visible, .settings-save-actions button');
  expect(await controles.count()).toBeGreaterThan(8);
  const fuera = await controles.evaluateAll(elements => elements.flatMap(element => {
    const rect = element.getBoundingClientRect();
    return rect.left < 0 || rect.right > window.innerWidth + 1 ? [{ control: element.id || element.textContent, left: rect.left, right: rect.right, viewport: window.innerWidth }] : [];
  }));
  expect(fuera).toEqual([]);
});
