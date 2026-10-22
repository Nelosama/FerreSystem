import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, rol: string, options: { enabled?: boolean; modules?: string[]; completed?: boolean; permissions?: string[]; language?: string } = {}) {
  let settings: any = { id: 'guide-company', nombreComercial: 'Guía Test', modoNavegacion: 'SIDEBAR', idioma: options.language || 'es', colorPrimario: '#EA580C', modoGuia: options.enabled !== false, modulosHabilitados: options.modules };
  const user = { id: 'guide-user', nombre: 'Usuario Guía', rol, permisosConfigurados: !!options.permissions, permisos: options.permissions || [] };
  let progress: any = options.completed ? { status: 'completed', step: 'receipt' } : {};
  const writes: string[] = [];
  await page.addInitScript(({ settings, user }) => {
    localStorage.setItem('ferre_token', 'test-guide'); localStorage.setItem('ferre_user', JSON.stringify(user)); localStorage.setItem('ferre_tenant', JSON.stringify(settings));
  }, { settings, user });
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (!['GET','HEAD'].includes(req.method())) writes.push(path);
    if (path === '/api/auth/guia') {
      if (req.method() === 'PUT') progress = req.postDataJSON();
      await route.fulfill({ json: { enabled: settings.modoGuia, progress } }); return;
    }
    if (path === '/api/auth/me') { await route.fulfill({ json: { user: { ...user, sub: user.id, tenantId: settings.id, type: rol === 'SUPERADMIN' ? 'super_admin' : 'tenant' } } }); return; }
    if (path === '/api/tenant/settings' || path.endsWith('/settings')) {
      if (req.method() === 'PUT') { const body = req.postDataJSON(); settings = { ...settings, ...body, ...body.configuracion }; }
      await route.fulfill({ json: settings }); return;
    }
    if (path.endsWith('/modules')) {
      if (req.method() === 'PUT') settings.modulosHabilitados = req.postDataJSON().modules.filter((m: any) => m.enabled).map((m: any) => m.moduleKey);
      await route.fulfill({ json: [] }); return;
    }
    const json: Record<string, unknown> = {
      '/api/admin/tenants': [], '/api/maintenance/backup': { configured: false },
      '/api/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
      '/api/dashboard/pendientes': { indicadores: [] }, '/api/reportes': {},
    };
    await route.fulfill({ json: json[path] || [] });
  });
  return { writes, setEnabled: (enabled: boolean) => { settings.modoGuia = enabled; }, settings: () => settings };
}
for (const rol of ['ADMIN','CAJERO','VENDEDOR','BODEGUERO','SUPERADMIN']) for (const width of [1280,390]) {
  test(`guía ${rol} en ${width}px: avanzar, volver, salir sin operaciones`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await setup(page, rol);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(rol === 'SUPERADMIN' ? '/admin' : '/');
    const guide = page.locator('aside.guide');
    await expect(guide.getByText('¿Es tu primera vez en Jowa System?')).toBeVisible({ timeout: 15000 });
    await guide.getByRole('button', { name: 'Iniciar guía', exact: true }).click();
    await expect(guide.getByText(/1\//)).toBeVisible();
    await guide.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guide.getByText(/2\//)).toBeVisible();
    await expect(page.locator('.guide-highlight')).toHaveCount(1);
    await guide.getByRole('button', { name: 'Atrás' }).click();
    await expect(guide.getByText(/1\//)).toBeVisible();
    await guide.getByRole('button', { name: 'Salir', exact: true }).click();
    await expect(guide.getByRole('button', { name: 'Ayuda · Modo Guía', exact: true })).toBeVisible();
    expect(api.writes.every(path => path === '/api/auth/guia')).toBe(true);
    expect(errors).toEqual([]);
    const outside = await guide.evaluate(el => el.getBoundingClientRect().right > innerWidth + 1);
    expect(outside).toBe(false);
  });
}
test('guía completada persiste, no invita al recargar y se reinicia desde Ayuda', async ({ page }) => {
  await setup(page, 'CAJERO'); await page.goto('/');
  const guide = page.locator('aside.guide');
  await guide.getByRole('button', { name: 'Iniciar guía', exact: true }).click();
  for (let i=0; i<4; i++) await guide.getByRole('button', { name: 'Siguiente' }).click();
  await guide.getByRole('button', { name: 'Marcar como completada' }).click();
  await expect(guide.getByRole('button', { name: 'Ayuda · Modo Guía' })).toBeVisible();
  await page.reload();
  await expect(guide.getByRole('button', { name: 'Ayuda · Modo Guía' })).toBeVisible();
  await expect(guide.getByText('¿Es tu primera vez en Jowa System?')).toHaveCount(0);
  await guide.getByRole('button', { name: 'Ayuda · Modo Guía' }).click();
  await guide.getByRole('button', { name: 'Reiniciar', exact: true }).click();
  await expect(guide.getByText(/1\/5/)).toBeVisible();
});
test('desactivar guía elimina invitación y Ayuda sin cerrar sesión', async ({ page }) => {
  const api = await setup(page, 'CAJERO'); await page.goto('/');
  await expect(page.locator('aside.guide')).toBeVisible();
  api.setEnabled(false);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('aside.guide')).toHaveCount(0);
});
test('módulos y permisos limitan guía y URL directa', async ({ page }) => {
  await setup(page, 'CAJERO', { modules: [] }); await page.goto('/');
  await page.locator('aside.guide').getByRole('button', { name: 'Iniciar guía', exact: true }).click();
  await expect(page.locator('aside.guide').getByRole('button', { name: 'Siguiente' })).toHaveCount(0);
  await page.goto('/pos');
  await expect(page.getByRole('heading', { name: 'Acceso Denegado' })).toBeVisible();
});
test('Super Admin puede cambiar cada interruptor y conservarlos tras recarga', async ({ page }) => {
  const api = await setup(page, 'SUPERADMIN', { enabled: false });
  await page.goto('/admin/negocios/guide-company/servicios');
  const form = page.locator('form').filter({ hasText: 'Servicios del negocio' });
  await expect(form.locator('input[type="checkbox"]')).toHaveCount(16);
  for (const input of await form.locator('input[type="checkbox"]').all()) { await expect(input).toBeEnabled(); await input.check(); }
  await form.getByRole('button', { name: 'Guardar servicios' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  expect(api.settings().modulosHabilitados).toHaveLength(16);
  await page.reload(); await expect(form.locator('input:checked')).toHaveCount(16);
  for (const input of await form.locator('input[type="checkbox"]').all()) await input.uncheck();
  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Guardar servicios' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  await page.reload(); await expect(form.locator('input:checked')).toHaveCount(0);
});

test('omitir persiste y Ayuda permite retomarla', async ({ page }) => {
  await setup(page, 'CAJERO'); await page.goto('/');
  const guide = page.locator('aside.guide');
  await guide.getByRole('button', { name: 'Ahora no' }).click();
  await expect(guide.getByRole('button', { name: 'Iniciar guía' })).toHaveCount(0);
  await page.reload(); await expect(guide.getByRole('button', { name: 'Ayuda · Modo Guía' })).toBeVisible();
  await expect(guide.getByText('¿Es tu primera vez en Jowa System?')).toHaveCount(0);
  await guide.getByRole('button', { name: 'Ayuda · Modo Guía' }).click();
  await guide.getByRole('button', { name: 'Iniciar guía', exact: true }).click();
  await expect(guide.getByText(/1\/5/)).toBeVisible();
});
test('la guía conserva las traducciones inglesas', async ({ page }) => {
  await setup(page, 'CAJERO', { language: 'en' }); await page.goto('/');
  const guide = page.locator('aside.guide');
  await expect(guide.getByText('Is this your first time using Jowa System?')).toBeVisible();
  await guide.getByRole('button', { name: 'Start tour', exact: true }).click();
  await expect(guide.getByText(/Search by name or scan a product code/)).toBeVisible();
});

for (const width of [1280, 768, 390]) {
  test(`guía no se superpone a las acciones del negocio en ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await setup(page, 'SUPERADMIN');
    const branch = { id: 'guide-branch', nombre: 'Sucursal de prueba', activa: true };
    await page.route('**/api/admin/tenants/guide-company/sucursales**', async route => {
      if (route.request().method() === 'PATCH') branch.activa = route.request().postDataJSON().activa;
      await route.fulfill({ json: route.request().method() === 'GET' ? [branch] : branch });
    });
    await page.goto('/admin/negocios/guide-company');
    const guide = page.locator('aside.guide');
    await expect(guide.getByRole('button', { name: 'Iniciar guía', exact: true })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: branch.nombre });
    const deactivate = row.getByRole('button', { name: 'Desactivar', exact: true });
    await deactivate.scrollIntoViewIfNeeded();
    const guideBox = await guide.boundingBox();
    const buttonBox = await deactivate.boundingBox();
    expect(guideBox).not.toBeNull(); expect(buttonBox).not.toBeNull();
    const overlaps = guideBox!.x < buttonBox!.x + buttonBox!.width && guideBox!.x + guideBox!.width > buttonBox!.x
      && guideBox!.y < buttonBox!.y + buttonBox!.height && guideBox!.y + guideBox!.height > buttonBox!.y;
    expect(overlaps, 'La guía debe dejar libres las acciones operativas').toBe(false);
    page.once('dialog', dialog => dialog.accept());
    await deactivate.click();
    await expect(row).toContainText('Inactivo');
  });
}

for (const rol of ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO', 'SUPERADMIN']) {
  test(`guía ${rol} en tablet e inglés: tareas, retroceso y salida`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await setup(page, rol, { language: 'en' });
    await page.addInitScript(() => localStorage.setItem('ferre_language', 'en'));
    await page.goto(rol === 'SUPERADMIN' ? '/admin' : '/');
    const guide = page.locator('aside.guide');
    await guide.getByRole('button', { name: 'Start tour', exact: true }).click();
    await expect(guide.getByText(/1\//)).toBeVisible();
    await guide.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(guide.getByText(/2\//)).toBeVisible();
    await guide.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(guide.getByText(/1\//)).toBeVisible();
    await guide.getByRole('button', { name: 'Exit', exact: true }).click();
    await expect(guide.getByRole('button', { name: 'Help · Guided tour' })).toBeVisible();
  });
}
