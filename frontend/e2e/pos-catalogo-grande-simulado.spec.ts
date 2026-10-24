import { installScannerCamera } from './scanner-camera.fixture';
import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: POS con un catálogo de 300 productos (más que las 120 tarjetas que se pintan a la vez).
// Comprueba que la búsqueda y el código exacto recorren todo el catálogo, que «Mostrar más» amplía la lista y que
// el carrito (agregar, cantidad, quitar) mantiene totales correctos. Reglas de búsqueda: utils/posCatalogo.ts.

const tenant = { id: 'tenant-pos-catalogo-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const cajero = { id: 'user-CAJERO', nombre: 'Cajero de prueba', email: 'usuario@prueba.invalid', rol: 'CAJERO' };
const TOTAL = 300;
const productos = Array.from({ length: TOTAL }, (_, i) => ({
  id: `prod-${i}`, codigo: `COD-${String(i).padStart(3, '0')}`, nombre: `Artículo ${String(i).padStart(3, '0')}`,
  codigoBarras: String(7401000000000 + i), codigoFabricante: `FAB-${i}`, descripcion: i === 250 ? 'Llave inglesa cromada' : null,
  categoria: { id: 'c1', nombre: 'Herramientas' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false,
  precioVenta: i === 250 ? 25.99 : 12.5, stockActual: 10, stockReservado: 0, stockDisponible: 10, stockFisico: 10, stockMinimo: 1,
  activo: true, imagenUrl: null, marca: null, version: 1,
}));

type Sim = { errores: string[]; inesperados: string[] };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: cajero.id, tenantId: tenant.id, rol: 'CAJERO', permisos: [], descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'pos-catalogo-token', user: cajero, tenant });
      const vacias: Record<string, unknown> = {
        '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
        '/maintenance/backup': { configured: false }, '/clientes/buscar': [], '/operaciones/proveedores': [], '/operaciones/entregas': [],
        '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
      };
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path === '/productos/comercial') return responder(route, 200, productos);
      if (method === 'GET' && path === '/operaciones/caja') return responder(route, 200, [{ id: 'caja-1', codigo: 'CAJA-1', estado: 'ABIERTA', usuario_id: cajero.id, monto_apertura: 500, efectivo_esperado: 500, totales: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 }, movimientos: [] }]);
      sim.inesperados.push(`${method} ${path}`);
      await route.abort();
    });
    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API no previstas').toEqual([]);
  }, { auto: true }],
});

async function abrirPos(page: Page) {
  await page.goto('/login');
  await page.locator('#login-correo').fill('usuario@prueba.invalid');
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/pos');
  await expect(page.getByText('Artículo 000').first()).toBeVisible();
}

const tarjetas = (page: Page) => page.locator('.ferre-pos-catalog .industrial-card');
const buscador = (page: Page) => page.getByPlaceholder('Buscar por código o nombre de producto...');

test.describe('POS con catálogo grande (simulado)', () => {
  test('pinta 120 tarjetas, «Mostrar más» amplía y la búsqueda encuentra productos fuera de lo visible', async ({ page }) => {
    await abrirPos(page);
    await expect(tarjetas(page)).toHaveCount(120);
    await expect(page.getByText(`Mostrando 120 de ${TOTAL} productos`)).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar más' }).click();
    await expect(tarjetas(page)).toHaveCount(240);
    await page.getByRole('button', { name: 'Mostrar más' }).click();
    await expect(tarjetas(page)).toHaveCount(TOTAL);
    await expect(page.getByRole('button', { name: 'Mostrar más' })).toHaveCount(0);

    // Una búsqueda nueva vuelve a la primera página y recorre todo el catálogo (descripción, sin distinguir mayúsculas).
    await buscador(page).fill('LLAVE INGLESA');
    await expect(tarjetas(page)).toHaveCount(1);
    await expect(tarjetas(page).first()).toContainText('Artículo 250');
    await buscador(page).fill('fab-29');
    await expect(tarjetas(page)).toHaveCount(11); // FAB-29 y FAB-290…FAB-299
    await buscador(page).fill('');
    await expect(tarjetas(page)).toHaveCount(120);
  });

  test('código de barras exacto agrega un producto no visible; cantidad, quitar y totales se actualizan', async ({ page }) => {
    await abrirPos(page);
    // Producto 250: fuera de las 120 tarjetas visibles, encontrado por código de barras con Enter (mismo camino que un lector).
    await buscador(page).fill('7401000000250');
    await buscador(page).press('Enter');
    await expect(buscador(page)).toHaveValue('');
    const cantidad = page.getByLabel('Cantidad Artículo 250');
    await expect(cantidad).toHaveValue('1');
    await expect(page.getByRole('button', { name: /Procesar Venta L\. 29\.89/ })).toBeVisible(); // 25.99 + ISV 3.90

    // Código interno en minúsculas: misma regla que antes (sin distinguir mayúsculas). Suma una unidad al mismo renglón.
    await buscador(page).fill('cod-250');
    await buscador(page).press('Enter');
    await expect(cantidad).toHaveValue('2');
    await expect(page.getByRole('button', { name: /Procesar Venta L\. 59\.78/ })).toBeVisible(); // 51.98 + ISV 7.80

    // Otro producto desde una tarjeta, luego cantidad escrita a mano.
    await tarjetas(page).filter({ hasText: 'Artículo 001' }).click();
    await page.getByLabel('Cantidad Artículo 001').fill('3');
    await expect(page.getByRole('button', { name: /Procesar Venta L\. 102\.90/ })).toBeVisible(); // 51.98 + 37.50 = 89.48; ISV 13.42

    // Quitar el primer renglón deja solo el segundo.
    await cantidad.locator('xpath=../..').locator('button').last().click();
    await expect(page.getByLabel('Cantidad Artículo 250')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Procesar Venta L\. 43\.13/ })).toBeVisible(); // 37.50 + ISV 5.63
  });
});

// Shared scanner regression only: do not submit a sale, payment or cash operation.
test('escáner compartido: una lectura por apertura conserva carrito y total sin enviar venta', async ({ page, sim }) => {
  await installScannerCamera(page); await page.clock.install(); await abrirPos(page);
  await page.evaluate(() => { (window as any).scannerCamera.code = '7401000000250'; });
  await page.getByRole('button', { name: 'Leer código con cámara', exact: true }).click();
  const cantidad = page.getByLabel('Cantidad Artículo 250');
  await expect(cantidad).toHaveValue('1');
  await expect(page.getByText('Código leído: 7401000000250', { exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(cantidad).toHaveValue('1');
  await expect(page.getByRole('button', { name: /Procesar Venta L\. 29\.89/ })).toBeVisible();
  // An explicit second opening is allowed to add another unit, as before.
  await page.getByRole('button', { name: 'Leer código con cámara', exact: true }).click();
  await expect(cantidad).toHaveValue('2');
  await page.clock.runFor(1000); await expect(cantidad).toHaveValue('2');
  await expect(page.getByRole('button', { name: /Procesar Venta L\. 59\.78/ })).toBeVisible();
  expect(await page.evaluate(() => (window as any).scannerCamera.stops)).toBe(2);
  expect(sim.inesperados).toEqual([]); // Fixture rejects any unplanned write, including POST ventas.
});
