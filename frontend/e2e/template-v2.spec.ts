import { test, expect } from '@playwright/test';

test('V2 preserves branding across modes, reload, and return to classic variants', async ({ page, baseURL }) => {
  const errors: string[] = [];
  let serverTenant: any = { id: 'theme-test', nombreComercial: 'Mi ferretería', colorPrimario: '#0284C7', fuenteTitulos: 'Poppins', fuenteCuerpo: 'Inter', estiloUI: 'MINIMALISTA' };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/tenant/settings' && route.request().method() === 'PUT') { const body = route.request().postDataJSON(); serverTenant = { ...serverTenant, ...body, ...body.configuracion }; }
      await route.fulfill({ json: url.pathname === '/api/tenant/settings' ? serverTenant : {}, headers: { 'access-control-allow-origin': new URL(baseURL!).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, PUT, OPTIONS', 'access-control-allow-headers': '*' } });
    } else if (url.origin === new URL(baseURL!).origin) await route.continue();
    else await route.abort();
  });
  await page.addInitScript(() => {
    if (localStorage.getItem('ferre_tenant')) return;
    localStorage.setItem('ferre_token', 'test-only');
    localStorage.setItem('ferre_user', JSON.stringify({ id: 'test-admin', nombre: 'Admin', rol: 'ADMIN' }));
    localStorage.setItem('ferre_tenant', JSON.stringify({ id: 'theme-test', nombreComercial: 'Mi ferretería', colorPrimario: '#0284C7', fuenteTitulos: 'Poppins', fuenteCuerpo: 'Inter', estiloUI: 'MINIMALISTA' }));
  });
  await page.goto('/configuracion');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-template', 'v1');
  await page.getByLabel('Plantilla de diseño', { exact: true }).selectOption('v2');
  for (const [mode, background] of [['dark', 'rgb(17, 24, 39)'], ['hybrid', 'rgb(250, 250, 249)'], ['light', 'rgb(250, 250, 249)']]) {
    await page.getByLabel('Modo de Template V2').selectOption(mode);
    await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(root).toHaveClass(`v2-mode-${mode}`);
    await expect(page.locator('body')).toHaveCSS('background-color', background);
    await expect(page.locator('.v2-sidebar .v2-tenant-brand')).toHaveText('Mi ferretería');
    await expect(page.locator('.v2-sidebar .v2-tenant-brand')).toHaveCSS('font-family', 'Poppins, sans-serif');
    await expect(page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true })).toHaveCSS('background-color', 'rgb(2, 132, 199)');
    if (mode === 'hybrid') await expect(page.locator('.v2-sidebar')).toHaveCSS('background-color', 'rgb(2, 132, 199)');
  }
  await page.reload();
  await expect(root).toHaveClass('v2-mode-light');
  serverTenant.modoNavegacion = 'TOPNAV';
  serverTenant.logoUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>';
  await page.reload();
  await expect(page.locator('.v2-top-navigation .v2-tenant-brand img')).toHaveAttribute('alt', 'Mi ferretería');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
  await expect(page.locator('.v2-topbar .v2-tenant-brand img')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel('Plantilla de diseño', { exact: true }).selectOption('v1');
  for (const style of ['MINIMALISTA', 'MODERNO', 'INDUSTRIAL']) {
    await page.getByLabel('Variante clásica').selectOption(style);
    await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
    await expect(root).toHaveAttribute('data-template', 'v1');
    await expect(root).not.toHaveClass(/v2-mode/);
  }
  expect(errors).toEqual([]);
});
