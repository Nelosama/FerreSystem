import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO — A-02: clave de reintento en el alta de clientes, el alta de cotizaciones y «Duplicar».
// La pantalla envía `solicitudId` (UUID v4). Si la red falla, volver a guardar el mismo contenido reutiliza la clave
// (también tras recargar la página); terminada el alta, la siguiente lleva una clave nueva. Lo que hace el servidor con
// la clave (mismo registro, 409 con otro contenido, aislamiento) está en backend/test/idempotencia-altas.postgres.integration.ts.

const tenant = { id: 'tenant-a02-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', descripcion: null, categoria: { nombre: 'Herramientas' }, precioVenta: 100, precioCosto: 60,
  stockActual: 10, stockDisponible: 10, stockMinimo: 1, unidadMedida: 'UNIDAD', usaMedida: false, activo: true };
const sinAutorizacion = { requerida: false, estado: 'NO_REQUERIDA', solicitudId: null, solicitanteId: null, solicitante: null, solicitadaAt: null, decisor: null, decididaAt: null, motivoDecision: null };
const cotizacion = (id: string, numero: number) => ({
  id, numeroCotizacion: numero, clienteNombre: 'Constructora del valle', createdAt: '2026-11-18T15:00:00.000Z', fechaValidez: '2099-12-31T00:00:00.000Z',
  diasValidez: 15, subtotal: 100, descuentoGeneral: 0, porcentajeIsv: 15, isv: 15, descuento: 0, total: 115, estado: 'BORRADOR', notas: '', autorizacionDescuento: sinAutorizacion,
  detalles: [{ id: `det-${id}`, productoId: 'prod-1', codigoProducto: 'TAL-1', descripcionProducto: 'Taladro', unidadMedida: 'UNIDAD', usaMedida: false,
    cantidad: 1, medida: 1, totalMedida: 1, precioLista: 100, precioUnitario: 100, descuento: 0, tipoDescuento: 'MONTO', exento: false, subtotal: 100, isv: 15, totalLinea: 115 }],
});
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Envio = { path: string; body: any };
type Sim = { envios: Envio[]; fallarSiguientes: number; errores: string[]; inesperados: string[] };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { envios: [], fallarSiguientes: 0, errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const usuario = { id: 'user-admin', nombre: 'Administrador de prueba', email: 'admin@prueba.invalid', rol: 'ADMIN', permisos: [], permisosConfigurados: false };
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol: usuario.rol, permisos: [], permisosConfigurados: false, descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'a02-token', user: usuario, tenant });
      if (method === 'GET' && path === '/productos') return responder(route, 200, [producto]);
      if (method === 'GET' && path === '/cotizaciones') return responder(route, 200, [cotizacion('cot-1', 1)]);
      if (method === 'POST' && ['/clientes', '/cotizaciones', '/cotizaciones/cot-1/duplicar'].includes(path)) {
        const body = request.postData() ? request.postDataJSON() : undefined;
        sim.envios.push({ path, body });
        // Pérdida de red: el servidor puede haber creado el registro, pero la pantalla no recibe respuesta.
        if (sim.fallarSiguientes > 0) { sim.fallarSiguientes--; await route.abort('connectionreset'); return; }
        if (path === '/clientes') return responder(route, 201, { id: `cli-${sim.envios.length}`, numeroCliente: sim.envios.length, ...body });
        return responder(route, 201, { ...cotizacion(`cot-${sim.envios.length + 1}`, sim.envios.length + 1) });
      }
      if (method === 'GET') return responder(route, 200, path === '/dashboard' ? { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } } : path === '/dashboard/pendientes' ? { indicadores: [] } : []);
      sim.inesperados.push(`${method} ${path}`);
      await route.abort();
    });
    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API no previstas').toEqual([]);
  }, { auto: true }],
});

async function entrar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('#login-correo').fill('admin@prueba.invalid');
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

async function llenarCliente(page: Page, nombre: string) {
  await page.getByRole('button', { name: /NUEVO CLIENTE/ }).first().click();
  await page.getByPlaceholder('Ej. Constructora del Norte S.A.').fill(nombre);
}

async function llenarCotizacion(page: Page, cliente: string) {
  await page.getByRole('button', { name: 'NUEVA COTIZACIÓN' }).click();
  await page.locator('.form-group', { hasText: 'CLIENTE O RAZÓN SOCIAL' }).locator('input').fill(cliente);
  await page.getByRole('button', { name: /AGREGAR PRODUCTO DESDE INVENTARIO/ }).click();
  await page.getByRole('row', { name: /Taladro/ }).getByRole('button').click();
}

const claves = (sim: Sim, path: string) => sim.envios.filter((e) => e.path === path).map((e) => e.body?.solicitudId);

test.describe('A-02: clave de reintento en altas (simulado)', () => {
  test('alta de cliente: el reintento tras un fallo de red (incluso tras recargar) reutiliza la clave; la siguiente alta usa otra', async ({ page, sim }) => {
    await entrar(page, '/clientes');
    sim.fallarSiguientes = 1;
    await llenarCliente(page, 'Constructora Delta');
    await page.getByRole('button', { name: 'Guardar cliente' }).click();
    await expect.poll(() => sim.envios.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Guardar cliente' })).toBeEnabled();

    // La persona recarga y vuelve a escribir lo mismo: es el mismo intento, no un cliente nuevo.
    await page.reload();
    sim.fallarSiguientes = 1;
    await llenarCliente(page, 'Constructora Delta');
    await page.getByRole('button', { name: 'Guardar cliente' }).click();
    await expect.poll(() => sim.envios.length).toBe(2);
    await expect(page.getByRole('button', { name: 'Guardar cliente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Guardar cliente' }).click();
    await expect.poll(() => sim.envios.length).toBe(3);
    await expect(page.getByPlaceholder('Ej. Constructora del Norte S.A.')).toHaveCount(0);

    const [a, b, c] = claves(sim, '/clientes');
    expect(a).toMatch(UUID_V4);
    expect([b, c]).toEqual([a, a]);
    expect(sim.envios.map((e) => e.body.nombre)).toEqual(['Constructora Delta', 'Constructora Delta', 'Constructora Delta']);

    // Terminada el alta, registrar otra vez el mismo nombre es una operación nueva con otra clave.
    await llenarCliente(page, 'Constructora Delta');
    await page.getByRole('button', { name: 'Guardar cliente' }).click();
    await expect.poll(() => sim.envios.length).toBe(4);
    expect(claves(sim, '/clientes')[3]).toMatch(UUID_V4);
    expect(claves(sim, '/clientes')[3]).not.toBe(a);
  });

  test('alta de cotización: el reintento conserva la clave, otro contenido o una cotización nueva usan otra', async ({ page, sim }) => {
    await entrar(page, '/cotizaciones');
    sim.fallarSiguientes = 2;
    await llenarCotizacion(page, 'Constructora del valle');
    const guardar = page.getByRole('button', { name: 'GUARDAR BORRADOR' });
    await guardar.click();
    await expect.poll(() => sim.envios.length).toBe(1);
    await guardar.click();
    await expect.poll(() => sim.envios.length).toBe(2);
    // Cambia el cliente: es otro contenido y no puede reutilizar la clave del intento anterior.
    await page.locator('.form-group', { hasText: 'CLIENTE O RAZÓN SOCIAL' }).locator('input').fill('Constructora del río');
    await guardar.click();
    await expect.poll(() => sim.envios.length).toBe(3);
    await expect(guardar).toHaveCount(0);

    const [a, b, c] = claves(sim, '/cotizaciones');
    expect(a).toMatch(UUID_V4);
    expect(b).toBe(a);
    expect(c).toMatch(UUID_V4);
    expect(c).not.toBe(a);
    expect(sim.envios[0].body).toMatchObject({ clienteNombre: 'Constructora del valle', detalles: [{ productoId: 'prod-1', cantidad: 1 }] });

    await llenarCotizacion(page, 'Constructora del río');
    await page.getByRole('button', { name: 'GUARDAR BORRADOR' }).click();
    await expect.poll(() => sim.envios.length).toBe(4);
    expect(claves(sim, '/cotizaciones')[3]).not.toBe(c);
  });

  test('duplicar: repetir tras un fallo de red envía la misma clave; la siguiente copia lleva otra', async ({ page, sim }) => {
    await entrar(page, '/cotizaciones');
    const duplicar = page.getByTitle('Duplicar esta cotización').first();
    sim.fallarSiguientes = 1;
    await duplicar.click();
    await expect.poll(() => sim.envios.length).toBe(1);
    await duplicar.click();
    await expect.poll(() => sim.envios.length).toBe(2);
    await duplicar.click();
    await expect.poll(() => sim.envios.length).toBe(3);

    const [a, b, c] = claves(sim, '/cotizaciones/cot-1/duplicar');
    expect(a).toMatch(UUID_V4);
    expect(b).toBe(a);
    expect(c).toMatch(UUID_V4);
    expect(c).not.toBe(a);
  });
});
