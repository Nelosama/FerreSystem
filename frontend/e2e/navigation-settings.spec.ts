import { test, expect, type Page } from '@playwright/test';

const roles = ['SUPERADMIN', 'ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'] as const;
async function setup(page: Page, role: string, mode: string, language = 'es', enabled?: string[]) {
  const company = { id: 'ux-company', nombreComercial: 'Ferretería UX', colorPrimario: '#0284C7', modoNavegacion: mode, templateVersion: 'v2', v2Mode: 'light', modulosHabilitados: enabled };
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
      '/api/auth/me': { user: { ...user, sub: user.id, tenantId: company.id } },
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
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page, role, mode, language, []);
    await page.goto(role === 'SUPERADMIN' ? '/admin' : '/');
    const navigation = page.locator(mode === 'SIDEBAR' ? 'aside.desktop-sidebar-nav' : 'header.desktop-sidebar-nav');
    await expect(navigation).toBeVisible();
    await expect(navigation.locator('a[href="/pos"]')).toHaveCount(0);
    await expect(navigation.locator('a[href="/apartados"]')).toHaveCount(0);
    if (role !== 'SUPERADMIN') {
      expect(await page.locator('.daily-tasks .task-link').count()).toBeLessThanOrEqual(4);
      if (['CAJERO', 'VENDEDOR'].includes(role)) {
        if (mode === 'TOPNAV') await navigation.getByRole('button', { name: language === 'es' ? 'Ventas y caja' : 'Sales and register' }).click();
        await expect(navigation.locator('a[href="/arqueo-caja"]')).toBeVisible();
      }
      if (role !== 'ADMIN') await expect(navigation.locator('a[href="/usuarios"]')).toHaveCount(0);
    } else await expect(navigation.locator('a[href="/configuracion"]')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
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
    await expect(page.getByRole('heading', { name: language === 'es' ? /Acceso Denegado/i : /Access Denied/i, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const role of ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO']) for (const mode of ['SIDEBAR', 'TOPNAV']) for (const enabled of [false, true]) {
  test(`POS ${enabled} ${role} ${mode}: menús, buscador, accesos, móvil y URL`, async ({ page }) => {
    await setup(page, role, mode, 'es', enabled ? ['pos'] : []);
    await page.goto('/');
    const nav = page.locator(mode === 'SIDEBAR' ? 'aside.desktop-sidebar-nav' : 'header.desktop-sidebar-nav');
    await expect(nav).toBeVisible();
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
      await expect(nav.locator('a[href="/arqueo-caja"]')).toHaveCount(1);
      // FS-14: el cajero ya no tiene Clientes; con un solo ítem la categoría puede no mostrarse como grupo.
      const grupoCobros = nav.getByRole('button', { name: 'Clientes y cobros' });
      if (mode === 'TOPNAV' && await grupoCobros.count()) await grupoCobros.click();
      await expect(nav.locator('a[href="/cuentas"]')).toHaveCount(1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.mobile-bottom-nav button').click();
    const mobile = page.locator('.mobile-bottom-nav, [role="dialog"]');
    for (const route of ['entregas', 'devoluciones']) {
      const allowed = enabled && (route === 'entregas' ? role !== 'VENDEDOR' : role !== 'BODEGUERO');
      expect(await mobile.locator(`a[href="/${route}"]`).count()).toBe(allowed ? 1 : 0);
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
  const api = await setup(page, 'ADMIN', 'TOPNAV');
  await page.goto('/configuracion');
  await expect(page.locator('.v2-top-navigation')).toBeVisible();
  await expect(page.locator('#task-search')).toHaveCount(0);
  await expect(page.locator('#tax-rate')).toHaveValue('15');
  for (const id of ['currency-code', 'currency-symbol', 'tax-name', 'tax-rate']) await expect(page.locator('#' + id)).toHaveAttribute('readonly', '');
  await page.locator('#business-name').fill('Empresa guardada');
  await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'guardada correctamente' })).toBeVisible();
  expect(api.writes[0]).toMatchObject({ modoNavegacion: 'TOPNAV', configuracion: { impuesto: { tasa: 15 }, moneda: { codigo: 'HNL' }, templateVersion: 'v2' } });
  await page.reload();
  await expect(page.locator('input[type="number"]')).toHaveValue('15');
  await expect(page.locator('.v2-top-navigation')).toBeVisible();
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
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/configuracion');
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

for (const language of ['es', 'en']) test(`buscador Escape restaura foco; configuración y pendientes traducidos ${language}`, async ({ page }) => {
  await setup(page, 'ADMIN', 'TOPNAV', language);
  await page.goto('/configuracion');
  // The accessible label comes from the shared translation, not its icon.
  const toggle=page.locator('.task-finder-toggle');
  await toggle.click(); await expect(page.locator('#task-search')).toBeFocused();
  await page.locator('#task-search').fill(language==='es'?'ventas':'sales');
  await page.keyboard.press('Escape'); await expect(toggle).toBeFocused();
  await expect(page.locator('#task-search')).toHaveCount(0);
  await expect(page.getByRole('heading',{ name:language==='es'?'CONFIGURACIÓN Y MARCA':'SETTINGS AND BRANDING',exact:true })).toBeVisible();
  await expect(page.locator('#fiscal-limit')).toContainText(language==='es'?'solo lectura':'read-only');
  await page.goto('/');
  await page.locator('.daily-tasks details summary').click();
  await expect(page.locator('.daily-tasks details p')).toContainText(language==='es'?'todavía no registran':'do not record');
  await expect(page.locator('.daily-tasks details a')).toHaveCount(0);
  await expect(page.locator('a[href="/apartados"]')).toHaveCount(0);
});

test('configuración vacía del servidor sustituye apariencia vieja de la caché', async ({ page }) => {
  await setup(page,'ADMIN','TOPNAV');
  await page.route('**/api/tenant/settings',route=>route.fulfill({ json:{ id:'ux-company',nombreComercial:'Servidor',colorPrimario:'#0284C7',modoNavegacion:'SIDEBAR',configuracion:{},modulosHabilitados:[] } }));
  await page.goto('/configuracion');
  await expect(page.locator('#template-version')).toHaveValue('v1');
  await expect(page.locator('#classic-style')).toHaveValue('INDUSTRIAL');
  await expect(page.locator('aside.desktop-sidebar-nav')).toBeVisible();
  await expect(page.locator('#currency-code')).toHaveValue('HNL');
  await expect(page.locator('#tax-rate')).toHaveValue('15');
});
