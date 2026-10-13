import { expect, test, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: valida el resumen administrativo para iPhone (390 px): cifras que llegan de la API,
// aislamiento de un fallo parcial, acceso denegado al cajero y ausencia de desbordamiento horizontal.
// NO sustituye la persistencia: los datos son de simulación; los cálculos están en test/resumen-movil.test.mjs.

const tenant = { id: 'tenant-movil-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const usuario = (rol: 'ADMIN' | 'CAJERO') => ({ id: `user-${rol}`, nombre: 'Usuario de prueba', email: 'usuario@prueba.invalid', rol });
const en3Dias = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

type Opciones = { rol: 'ADMIN' | 'CAJERO'; cxpFalla: boolean };

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
    if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: `user-${opciones.rol}`, tenantId: tenant.id, rol: opciones.rol, permisos: [], descuentoMaximo: 0 } });
    if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'movil-e2e-token', user: usuario(opciones.rol), tenant });
    if (method === 'GET' && path === '/operaciones/resumen') return responder(route, 200, {
      devoluciones: { cantidad: 0, monto: 0 },
      metodos: [{ metodo_pago: 'EFECTIVO', cantidad: 2, total: 1000 }, { metodo_pago: 'TARJETA', cantidad: 1, total: 500 }],
      rotacion: [], alertas: [],
    });
    if (method === 'GET' && path === '/operaciones/caja/cierres') return responder(route, 200, [{ id: 'caja-1', codigo: 'CAJA-1', usuario_nombre: 'Carla Pérez', monto_esperado: 1500 }]);
    if (method === 'GET' && path === '/productos/alertas/stock-bajo') return responder(route, 200, [{ id: 'p1', codigo: 'T1', nombre: 'Tubo PVC', stockActual: 2, stockMinimo: 5 }]);
    if (method === 'GET' && path === '/clientes') return responder(route, 200, [
      { id: 'cl1', nombre: 'Constructora Norte', saldoPendiente: 2300 },
      { id: 'cl2', nombre: 'Cliente al día', saldoPendiente: 0 },
    ]);
    if (method === 'GET' && path === '/operaciones/cuentas') {
      if (url.searchParams.get('tipo') === 'CXP' && opciones.cxpFalla) return responder(route, 500, { message: 'fallo simulado' });
      return responder(route, 200, url.searchParams.get('tipo') === 'CXP'
        ? [{ nombre: 'Distribuidora Sur', documento: 'FAC-9', saldo: 800, vencimiento: en3Dias(), vencida: false }]
        : []);
    }
    if (method === 'GET' && path === '/operaciones/solicitudes-devolucion') return responder(route, 200, [{ id: 's1', estado: 'PENDIENTE', numero_venta: 'V-10', total_venta: 450 }]);
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

test.describe('Resumen administrativo para iPhone (simulado)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('el administrador ve ventas, caja, existencias, cobros, pagos y solicitudes sin desbordar la pantalla', async ({ page, baseURL }) => {
    await simular(page, baseURL, { rol: 'ADMIN', cxpFalla: false });
    await ingresar(page);
    await expect(page.getByRole('heading', { name: 'Administrar el negocio', exact: true })).toBeVisible();
    await page.goto('/admin-movil');

    await expect(page.getByRole('heading', { name: 'Resumen administrativo', exact: true })).toBeVisible();
    await expect(page.getByText(/1,500\.00/).first()).toBeVisible();
    await expect(page.getByText('Carla Pérez')).toBeVisible();
    await expect(page.getByText('Tubo PVC')).toBeVisible();
    await expect(page.getByText('Constructora Norte')).toBeVisible();
    await expect(page.getByText('Cliente al día')).toHaveCount(0);
    await expect(page.getByText('Distribuidora Sur')).toBeVisible();
    await expect(page.getByText('FAC-9')).toBeVisible();
    await expect(page.getByText('V-10')).toBeVisible();

    const sinDesborde = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(sinDesborde).toBe(true);
  });

  test('si falla una sección, las demás siguen visibles y solo esa muestra el aviso', async ({ page, baseURL }) => {
    await simular(page, baseURL, { rol: 'ADMIN', cxpFalla: true });
    await ingresar(page);
    await expect(page.getByRole('heading', { name: 'Administrar el negocio', exact: true })).toBeVisible();
    await page.goto('/admin-movil');

    await expect(page.getByText('Tubo PVC')).toBeVisible();
    await expect(page.getByText('Constructora Norte')).toBeVisible();
    const seccionCxp = page.locator('section', { has: page.getByRole('heading', { name: 'Facturas de proveedores por vencer (7 días)' }) });
    await expect(seccionCxp.getByRole('alert')).toHaveText('No se pudo cargar esta sección. Intente de nuevo.');
    await expect(page.getByText('Distribuidora Sur')).toHaveCount(0);
  });

  test('el cajero no accede al resumen administrativo', async ({ page, baseURL }) => {
    await simular(page, baseURL, { rol: 'CAJERO', cxpFalla: false });
    await ingresar(page);
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.goto('/admin-movil');
    await expect(page.getByRole('heading', { name: 'Resumen administrativo', exact: true })).toHaveCount(0);
  });
});
