import { test, expect } from '@playwright/test';

// PNG 1x1 válido: el logotipo se sirve autenticado desde /api/tenant/logo y el mock responde con bytes reales.
const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000 1f15c4890000000d49444154789c6360f8cfc0f01f0005000201a5f6453f0000000049454e44ae426082'.replace(/ /g, ''), 'hex');

test('V2 preserves branding across modes, reload, and return to classic variants', async ({ page, baseURL }) => {
  const errors: string[] = [];
  let serverTenant: any = { id: 'theme-test', nombreComercial: 'Mi ferretería', colorPrimario: '#0284C7', fuenteTitulos: 'Poppins', fuenteCuerpo: 'Inter', estiloUI: 'MINIMALISTA' };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/tenant/logo' || url.pathname === '/api/admin/tenants/theme-test/logo') { await route.fulfill({ body: PNG_1X1, contentType: 'image/png' }); return; }
    if (url.pathname === '/api/auth/me') { await route.fulfill({ json: { user: { sub: 'test-admin', type: 'super_admin', rol: 'SUPER_ADMIN' } } }); return; }
    if (url.pathname.startsWith('/api/')) {
      if (/^\/api\/admin\/tenants\/theme-test\/settings$/.test(url.pathname) && route.request().method() === 'PUT') { const body = route.request().postDataJSON(); serverTenant = { ...serverTenant, ...body, ...body.configuracion }; }
      await route.fulfill({ json: /\/settings$/.test(url.pathname) ? serverTenant : {}, headers: { 'access-control-allow-origin': new URL(baseURL!).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, PUT, OPTIONS', 'access-control-allow-headers': '*' } });
    } else if (url.origin === new URL(baseURL!).origin) await route.continue();
    else await route.abort();
  });
  await page.addInitScript(() => {
    if (localStorage.getItem('ferre_tenant')) return;
    localStorage.setItem('ferre_token', 'test-only');
    localStorage.setItem('ferre_user', JSON.stringify({ id: 'test-admin', nombre: 'Admin', rol: 'SUPERADMIN' }));
    localStorage.setItem('ferre_tenant', JSON.stringify({ id: 'theme-test', nombreComercial: 'Mi ferretería', colorPrimario: '#0284C7', fuenteTitulos: 'Poppins', fuenteCuerpo: 'Inter', estiloUI: 'MINIMALISTA' }));
  });
  await page.goto('/admin/negocios/theme-test/configuracion');
  // Editar el negocio de otro tenant no cambia el tema de la plataforma del Super Admin: se verifica lo guardado en el servidor.
  await expect(page.getByLabel('Plantilla de diseño', { exact: true })).toHaveValue('v1');
  await page.getByLabel('Plantilla de diseño', { exact: true }).selectOption('v2');
  for (const mode of ['dark', 'hybrid', 'light']) {
    await page.getByLabel('Modo de Template V2').selectOption(mode);
    await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
    await expect.poll(() => serverTenant.configuracion?.v2Mode).toBe(mode);
    await expect.poll(() => serverTenant.configuracion?.templateVersion).toBe('v2');
    await expect(page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true })).toBeEnabled();
  }
  serverTenant.logotipo = { mime: 'image/png', bytes: PNG_1X1.length, actualizadoAt: '2026-10-15T00:00:00.000Z' };
  await page.reload();
  await expect(page.getByLabel('Plantilla de diseño', { exact: true })).toHaveValue('v2');
  await expect(page.getByLabel('Modo de Template V2')).toHaveValue('light');
  // Logotipo del negocio: el editor muestra el logotipo actual servido de forma autenticada.
  await expect(page.getByAltText('Logotipo de Mi ferretería')).toBeVisible();
  // Responsive: la pantalla de configuración no desborda horizontalmente en 390 px.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel('Plantilla de diseño', { exact: true }).selectOption('v1');
  for (const style of ['MINIMALISTA', 'MODERNO', 'INDUSTRIAL']) {
    await page.getByLabel('Variante clásica').selectOption(style);
    await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
    await expect.poll(() => serverTenant.configuracion?.templateVersion).toBe('v1');
  }
  expect(errors).toEqual([]);
});
