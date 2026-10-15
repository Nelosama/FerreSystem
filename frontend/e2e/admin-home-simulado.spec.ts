import { expect, test, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO del panel administrativo (AdminHomePage). Verifica: cifras que llegan de
// /dashboard, indicadores sin datos y sin secciones «En preparación», ausencia de botones «Actualizar», botón
// flotante en móvil sin desbordamiento horizontal, y que un fallo del resumen no muestra cifras falsas.
// Datos de simulación; no sustituye la prueba con datos reales ni la comparación visual con Figma.

const tenant = { id: 'tenant-home-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const usuario = { id: 'user-ADMIN', nombre: 'Administrador de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };

const dashboard = {
  ventasDelDia: { total: 1500, cantidad: 3, variacionPorcentaje: 25 },
  alertasStock: { cantidad: 1, items: [{ id: 'p1', codigo: 'T1', nombre: 'Tubo PVC', stockActual: 2, stockMinimo: 5, unidadMedida: 'UNIDAD' }] },
  cotizacionesPendientes: { cantidad: 4, porVencerHoy: 1 },
  tendenciaSemanal: ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']
    .map((fecha, i) => ({ dia: ['MIE', 'JUE', 'VIE', 'SAB', 'DOM', 'LUN', 'HOY'][i], fecha, total: i === 6 ? 1500 : 200 * i, esHoy: i === 6 })),
  ultimasVentas: [{ id: 'v1', numeroVenta: 3, cliente: 'Consumidor Final', cajero: 'Carla', total: 500, metodoPago: 'EFECTIVO', hora: '09:30' }],
};

type Opciones = { dashboardFalla: boolean };

async function simular(page: Page, baseURL: string | undefined, opciones: Opciones) {
  const origen = new URL(baseURL!).origin;
  const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
  const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
    const method = request.method();
    const path = url.pathname.slice(4);
    if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
    if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, tenant);
    if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], descuentoMaximo: 0 } });
    if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'home-e2e-token', user: usuario, tenant });
    if (method === 'GET' && path === '/dashboard') return opciones.dashboardFalla ? responder(route, 500, { message: 'fallo simulado' }) : responder(route, 200, dashboard);
    if (method === 'GET') return responder(route, 200, []);
    return responder(route, 200, {});
  });
}

async function ingresar(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
}

test.describe('Panel administrativo (simulado)', () => {
  test('escritorio: muestra cifras reales, sin secciones pendientes y ninguna acción «Actualizar»', async ({ page, baseURL }) => {
    await simular(page, baseURL, { dashboardFalla: false });
    await ingresar(page);
    await expect(page.getByRole('heading', { name: /Hola, / })).toBeVisible();
    await expect(page.getByText(/3 venta\(s\)/)).toBeVisible();
    await expect(page.getByText(/Actualizado \d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByText('Tubo PVC')).toBeVisible();
    await expect(page.getByText('Tendencia semanal')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Ventas de los últimos 7 días' })).toBeVisible();
    await expect(page.getByText('En preparación')).toHaveCount(0);
    await expect(page.getByText('Próximamente')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Actualizar/ })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/admin-home-escritorio.png', fullPage: true });
  });

  test.describe('móvil', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('muestra el botón flotante de nueva venta sin desbordamiento horizontal', async ({ page, baseURL }) => {
      await simular(page, baseURL, { dashboardFalla: false });
      await ingresar(page);
      await expect(page.getByRole('link', { name: 'Nueva venta' })).toBeVisible();
      const desbordamiento = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(desbordamiento).toBeLessThanOrEqual(0);
      await page.screenshot({ path: 'test-results/admin-home-movil.png', fullPage: true });
    });
  });

  test('si el resumen falla no muestra cifras falsas y avisa del reintento automático', async ({ page, baseURL }) => {
    await simular(page, baseURL, { dashboardFalla: true });
    await ingresar(page);
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudo cargar el resumen' })).toBeVisible();
    await expect(page.getByText(/\$|L\. ?\d/).filter({ hasText: /1,?500/ })).toHaveCount(0);
    await expect(page.getByText('3 venta(s)')).toHaveCount(0);
  });
});
