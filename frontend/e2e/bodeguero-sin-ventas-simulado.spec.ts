import { expect, test, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO (JW-10). El servidor no envía cifras de ventas a BODEGUERO
// (backend/test/dashboard.postgres.integration.ts y centinela-entregas-148.postgres.integration.ts);
// aquí se comprueba que la interfaz no inventa un importe donde no lo hay.

const tenant = { id: 'tenant-bod-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const pendiente = {
  ventaId: 'venta-7', numeroVenta: 7, creadaAt: '2026-10-10T12:00:00.000Z', cliente: 'Constructora del Norte', cajero: 'Cajero Uno',
  antiguedadHoras: 1, alerta: 'NINGUNA',
  lineas: [{ detalleId: 'det-7', codigo: 'TUB-1', nombre: 'Tubo PVC', modoEntrega: 'BODEGA', cantidad: 3, entregada: 0, preparada: 0, cancelada: 0, pendiente: 3, enPoderDelCliente: 0 }],
};

async function preparar(page: Page) {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') await route.continue(); else await route.abort(); return; }
    const cab = { 'access-control-allow-origin': request.headers().origin ?? 'http://localhost', 'access-control-allow-credentials': 'true' };
    const ok = (status: number, body: unknown) => route.fulfill({ status, json: body, headers: cab });
    const method = request.method(); const path = url.pathname.slice(4);
    const usuario = { id: 'u-bod', nombre: 'Bodeguero', email: 'bodega@prueba.invalid', rol: 'BODEGUERO' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cab, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (method === 'GET' && path === '/tenant/settings') return ok(200, { ...tenant, modoNavegacion: 'SIDEBAR' });
    if (method === 'GET' && path === '/auth/me') return ok(200, { user: { sub: usuario.id, tenantId: tenant.id, rol: 'BODEGUERO', permisos: [], permisosConfigurados: false, descuentoMaximo: 0 } });
    if (method === 'POST' && path === '/auth/login') return ok(200, { type: 'tenant', accessToken: 'bod-token', user: usuario, tenant });
    // Respuesta real del servidor para BODEGUERO: sin secciones de ventas.
    if (method === 'GET' && path === '/dashboard') return ok(200, { ventasDelDia: null, alertasStock: { cantidad: 2, items: [] }, cotizacionesPendientes: { cantidad: 1, porVencerHoy: 0 }, tendenciaSemanal: [], ultimasVentas: [] });
    if (method === 'GET' && path === '/entregas/pendientes') return ok(200, { umbrales: {}, pendientes: [pendiente] });
    if (method === 'GET') return ok(200, []);
    await route.abort();
  });
  return errores;
}

async function entrar(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('bodega@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test('BODEGUERO: el inicio muestra existencias y cotizaciones sin una tarjeta de ventas con L 0.00', async ({ page }) => {
  const errores = await preparar(page);
  await entrar(page);
  await expect(page.getByText('Requieren reabastecimiento')).toBeVisible();
  await expect(page.getByText('Presupuestos activos')).toBeVisible();
  await expect(page.getByText('Total registrado hoy')).toHaveCount(0);
  await expect(page.getByText(/L\s?0\.00/)).toHaveCount(0);
  expect(errores).toEqual([]);
});

test('BODEGUERO: la entrega pendiente muestra qué entregar sin importe de la venta', async ({ page }) => {
  const errores = await preparar(page);
  await entrar(page);
  await page.goto('/entregas');
  const tarjeta = page.getByRole('region', { name: 'Venta 7' });
  await expect(tarjeta).toContainText('Pendiente 3');
  await expect(tarjeta).toContainText('Cobró Cajero Uno');
  await expect(tarjeta).not.toContainText('L ');
  await expect(tarjeta).not.toContainText('NaN');
  expect(errores).toEqual([]);
});
