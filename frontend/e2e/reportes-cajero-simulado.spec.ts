import { expect, test, type Page } from '@playwright/test';

// E2E CON BACKEND SIMULADO: Reportes muestra las ventas agrupadas por el usuario que las registró.
// Los importes y el filtro por día y negocio se prueban contra PostgreSQL real en
// backend/test/reportes-zona-horaria.postgres.integration.ts; aquí solo la presentación y la compatibilidad.

const tenant = { id: 'tenant-reportes-cajero-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'user-ADMIN', nombre: 'Admin de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };
const resumenBase = {
  devoluciones: [{ cantidad: 0, monto: 0 }],
  metodos: [{ metodo_pago: 'EFECTIVO', cantidad: 3, total: '150.30', base: '130.70', isv: '19.60' }, { metodo_pago: 'TARJETA', cantidad: 1, total: '20.00', base: '17.39', isv: '2.61' }],
  rotacion: [], alertas: [],
};

async function simular(page: Page, baseURL: string | undefined, resumen: unknown) {
  const origen = new URL(baseURL!).origin;
  const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
    const method = request.method();
    const path = url.pathname.slice(4);
    const responder = (body: unknown) => route.fulfill({ status: 200, json: body, headers: cabeceras });
    if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
    if (method === 'GET' && path === '/tenant/settings') return responder(tenant);
    if (method === 'GET' && path === '/auth/me') return responder({ user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], descuentoMaximo: 100 } });
    if (method === 'POST' && path === '/auth/login') return responder({ type: 'tenant', accessToken: 'reportes-e2e-token', user: admin, tenant });
    if (method === 'GET' && path === '/operaciones/resumen') return responder(resumen);
    if (method === 'GET') return responder([]);
    return responder({});
  });
}

async function abrirReportes(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/reportes');
}

test.describe('Reportes: ventas por cajero (simulado)', () => {
  test('agrupa por usuario con totales por método y el mayor total primero', async ({ page, baseURL }) => {
    const errores: string[] = [];
    page.on('pageerror', e => errores.push(e.message));
    await simular(page, baseURL, { ...resumenBase, cajeros: [
      { usuario_id: 'u1', usuario_nombre: 'Luis Cajero', metodo_pago: 'EFECTIVO', cantidad: 1, total: '30.10' },
      { usuario_id: 'u1', usuario_nombre: 'Luis Cajero', metodo_pago: 'TARJETA', cantidad: 1, total: '20.00' },
      { usuario_id: 'u2', usuario_nombre: 'Ana Cajera', metodo_pago: 'EFECTIVO', cantidad: 2, total: '120.20' },
    ] });
    await abrirReportes(page);
    const seccion = page.getByRole('region', { name: 'Ventas por cajero' });
    await expect(seccion).toBeVisible();
    const filas = seccion.locator('tbody tr');
    await expect(filas).toHaveCount(2);
    await expect(filas.nth(0)).toContainText('Ana Cajera');
    await expect(filas.nth(0)).toContainText('120.20');
    await expect(filas.nth(1)).toContainText('Luis Cajero');
    await expect(filas.nth(1).locator('td').last()).toHaveText(/50\.10/);
    await expect(seccion.getByRole('button', { name: /CSV/i })).toBeEnabled();
    expect(errores).toEqual([]);
  });

  test('con un servidor sin la dimensión por cajero, la página sigue funcionando y lo indica', async ({ page, baseURL }) => {
    const errores: string[] = [];
    page.on('pageerror', e => errores.push(e.message));
    await simular(page, baseURL, resumenBase);
    await abrirReportes(page);
    const seccion = page.getByRole('region', { name: 'Ventas por cajero' });
    await expect(seccion).toContainText('Sin ventas completadas en el rango.');
    await expect(page.getByRole('heading', { name: /170\.30/ })).toBeVisible();
    expect(errores).toEqual([]);
  });
});
