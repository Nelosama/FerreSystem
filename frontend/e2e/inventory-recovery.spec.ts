import { test, expect } from '@playwright/test';

for (const mode of ['TOPNAV', 'SIDEBAR']) for (const mobile of [false, true]) {
  test(`alta recuperable ${mode} ${mobile ? 'móvil' : 'escritorio'}`, async ({ page }) => {
    const tenant = { id: 'inventory-test', nombreComercial: 'Inventario sintético', modoNavegacion: mode, templateVersion: 'v2', v2Mode: 'light' };
    const user = { id: 'inventory-admin', nombre: 'Admin', rol: 'ADMIN', permisos: [] };
    const calls: any[] = [], errors: string[] = [];
    let failResponse = true;
    page.on('pageerror', e => errors.push(e.message));
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ tenant, user }) => {
      if (!localStorage.getItem('ferre_user')) {
        localStorage.setItem('ferre_user', JSON.stringify(user));
        localStorage.setItem('ferre_tenant', JSON.stringify(tenant));
        localStorage.setItem('ferre_token', 'synthetic');
        localStorage.setItem('ferre_language', 'es');
      }
    }, { tenant, user });
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === 'http://127.0.0.1:4173') await route.continue(); else await route.abort();
        return;
      }
      if (url.pathname === '/api/productos' && req.method() === 'POST') {
        const dto = req.postDataJSON(); calls.push(dto);
        if (failResponse) { await route.abort('failed'); return; }
        await route.fulfill({ status: 201, json: { id: 'product-1', ...dto } }); return;
      }
      const data: Record<string, unknown> = {
        '/api/tenant/settings': tenant,
        '/api/auth/me': { user: { ...user, sub: user.id, tenantId: tenant.id } },
        '/api/productos': calls.length ? [{ id: 'product-1', ...calls[0], codigo: 'AUTO-001', categoria: { nombre: 'Acero especial' }, activo: true }] : [],
      };
      await route.fulfill({ json: data[url.pathname] ?? [] });
    });
    await page.goto('/inventario');
    await page.getByRole('button', { name: /Nuevo producto|Nuevo artículo/i }).click();
    const form = page.locator('form').filter({ has: page.locator('input[required][type="text"]') });
    await form.locator('input[required][type="text"]').fill('Varilla 3/8 negra');
    await form.locator('input[required][type="number"]').fill('45.25');
    const save = form.getByRole('button', { name: /Guardar producto/i });
    await save.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.getByRole('button', { name: 'Confirmar alta pendiente' }).last()).toBeVisible();
    expect(calls).toHaveLength(1);
    const first = calls[0];
    expect(first.solicitudId).toMatch(/^[0-9a-f-]{36}$/);
    await page.reload();
    await expect(page.getByRole('status')).toContainText('Varilla 3/8 negra');
    failResponse = false;
    await page.getByRole('button', { name: 'Confirmar alta pendiente' }).click();
    await expect(page.getByRole('button', { name: 'Confirmar alta pendiente' })).toHaveCount(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(first);
    await expect(page.getByRole('button', { name: 'Acero especial', exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ferre_pending_product:inventory-test:inventory-admin'))).toBeNull();
    expect(errors).toEqual([]);
  });
}
