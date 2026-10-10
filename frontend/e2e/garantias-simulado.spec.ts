import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: valida la interfaz de garantías (buscar factura, elegir producto, días, vista
// previa del vencimiento, guardado con solicitud, permisos de cajero y viewport móvil).
// NO sustituye la persistencia: eso está en backend/test/garantias.postgres.integration.ts contra PostgreSQL real.

const tenant = { id: 'tenant-garantias-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'user-ADMIN', nombre: 'Administrador de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };
const cajero = { id: 'user-CAJERO', nombre: 'Cajero de prueba', email: 'cajero@prueba.invalid', rol: 'CAJERO' };

type Sim = {
  facturas: Record<string, any>;
  coberturas: any[];
  posts: any[];
  inesperados: string[];
  errores: string[];
};

const factura = {
  id: 'venta-1043',
  numeroVenta: 1043,
  fechaVenta: '2026-10-09',
  estado: 'COMPLETADA',
  cliente: 'Constructora del Norte',
  items: [
    { detalleVentaId: 'det-1', productoId: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro percutor 1/2" DeWalt', cantidad: 1, cobertura: null },
    { detalleVentaId: 'det-2', productoId: 'prod-2', codigo: 'INV-2', nombre: 'Inversor soldadora 200A', cantidad: 1, cobertura: null },
  ],
};

const test = base.extend<{ sim: Sim; rol: 'ADMIN' | 'CAJERO' }>({
  rol: ['ADMIN', { option: true }],
  sim: [async ({ page, baseURL, rol }, use) => {
    const sim: Sim = { facturas: { '1043': structuredClone(factura) }, coberturas: [], posts: [], inesperados: [], errores: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    const usuario = rol === 'ADMIN' ? admin : cajero;
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, tenant);
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol: usuario.rol, permisos: [], descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'garantias-e2e-token', user: usuario, tenant });
      const vacias: Record<string, unknown> = { '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } }, '/maintenance/backup': { configured: false } };
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path.startsWith('/garantias/facturas/')) {
        const n = path.split('/').pop()!;
        return sim.facturas[n] ? responder(route, 200, sim.facturas[n]) : responder(route, 404, { message: 'Factura no encontrada' });
      }
      if (method === 'GET' && path === '/garantias/coberturas') return responder(route, 200, sim.coberturas);
      if (method === 'POST' && path === '/garantias/coberturas') {
        const body = request.postDataJSON();
        sim.posts.push(body);
        if (body.diasGarantia === undefined || 'fechaVenta' in body) return responder(route, 400, { message: 'Datos inválidos' });
        const creada = { id: `gar-${sim.posts.length}`, ventaId: body.ventaId, detalleVentaId: body.detalleVentaId, productoId: 'prod', numeroSerie: body.numeroSerie ?? null, fechaInicio: '2026-10-09', diasGarantia: body.diasGarantia, fechaVencimiento: '2027-01-07', estado: 'VIGENTE', numeroVenta: 1043, cliente: 'Constructora del Norte', producto: { id: 'prod-1', nombre: 'Taladro percutor 1/2" DeWalt', codigo: 'TAL-1' } };
        sim.coberturas.unshift(creada);
        const f = sim.facturas['1043'];
        f.items = f.items.map((i: any) => (i.detalleVentaId === body.detalleVentaId ? { ...i, cobertura: creada } : i));
        return responder(route, 201, creada);
      }
      sim.inesperados.push(`${method} ${path}`);
      return responder(route, 404, { message: 'No simulado' });
    });
    await use(sim);
    expect(sim.errores, 'No debe haber errores de página').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API fuera del backend simulado').toEqual([]);
  }, { auto: true }],
});

async function ingresar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  // Espera a salir de /login: la pantalla de inicio depende del rol.
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test.describe('Garantías — interfaz con backend simulado (E2E simulado)', () => {
  test('administrador: busca la factura, elige el producto, revisa el vencimiento y guarda con solicitud', async ({ page, sim }) => {
    await ingresar(page, '/garantias');
    await page.getByLabel('Número de factura, ej. 1043').or(page.getByPlaceholder('Número de factura, ej. 1043')).fill('1043');
    await page.getByRole('button', { name: 'Buscar factura', exact: true }).click();
    await expect(page.getByText('Constructora del Norte')).toBeVisible();

    await page.getByRole('button', { name: /Taladro percutor/ }).click();
    await page.getByLabel('Días de garantía').or(page.locator('#gar-dias')).fill('90');
    // Vista previa: fecha de la factura (9 oct 2026) + 90 días = 7 ene 2027, no la fecha del navegador.
    await expect(page.getByText('7 ene 2027').first()).toBeVisible();
    await page.getByRole('button', { name: /Guardar garantía/ }).click();

    await expect(page.getByText(/Garantía registrada\. Vence el 7 ene 2027/)).toBeVisible();
    expect(sim.posts).toHaveLength(1);
    expect(sim.posts[0]).toMatchObject({ ventaId: 'venta-1043', detalleVentaId: 'det-1', diasGarantia: 90 });
    expect(sim.posts[0].solicitudId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(sim.posts[0]).not.toHaveProperty('fechaVenta');
    await expect(page.getByText('VIGENTE').first()).toBeVisible();
  });

  test('una línea ya garantizada no se puede volver a elegir', async ({ page, sim }) => {
    sim.facturas['1043'].items[0].cobertura = { id: 'g-0', fechaVencimiento: '2027-01-07', diasGarantia: 90, estado: 'VIGENTE' };
    await ingresar(page, '/garantias');
    await page.getByPlaceholder('Número de factura, ej. 1043').fill('1043');
    await page.getByRole('button', { name: 'Buscar factura', exact: true }).click();
    await expect(page.getByRole('button', { name: /Taladro percutor/ })).toBeDisabled();
    await expect(page.getByText(/Ya tiene garantía/).first()).toBeVisible();
  });

  test('días no válidos: no se puede guardar y no se envía nada', async ({ page, sim }) => {
    await ingresar(page, '/garantias');
    await page.getByPlaceholder('Número de factura, ej. 1043').fill('1043');
    await page.getByRole('button', { name: 'Buscar factura', exact: true }).click();
    await page.getByRole('button', { name: /Inversor soldadora/ }).click();
    for (const malo of ['0', '30.5', '3651']) {
      await page.locator('#gar-dias').fill(malo);
      await expect(page.getByRole('alert').filter({ hasText: 'entera de días' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Guardar garantía/ })).toBeDisabled();
    }
    expect(sim.posts).toHaveLength(0);
  });

  test('factura inexistente: muestra un mensaje claro y no ofrece guardar', async ({ page, sim }) => {
    await ingresar(page, '/garantias');
    await page.getByPlaceholder('Número de factura, ej. 1043').fill('999999');
    await page.getByRole('button', { name: 'Buscar factura', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No existe una factura' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Guardar garantía/ })).toHaveCount(0);
    expect(sim.posts).toHaveLength(0);
  });

  test.describe('cajero', () => {
  test.use({ rol: 'CAJERO' });

  test('consulta sin formulario de alta ni edición', async ({ page, sim }) => {
    sim.coberturas.push({ id: 'g-1', fechaInicio: '2026-10-09', diasGarantia: 365, fechaVencimiento: '2027-10-09', estado: 'VIGENTE', numeroVenta: 1043, cliente: 'Constructora del Norte', numeroSerie: 'SN-1', producto: { id: 'p', nombre: 'Taladro', codigo: 'TAL-1' } });
    await ingresar(page, '/garantias');
    await expect(page.getByText('Solo el administrador puede registrar garantías.')).toBeVisible();
    await page.getByPlaceholder('Número de factura, ej. 1043').fill('1043');
    await page.getByRole('button', { name: 'Buscar factura', exact: true }).click();
    await expect(page.getByRole('button', { name: /Guardar garantía/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar días' })).toHaveCount(0);
    await expect(page.getByText('S/N SN-1')).toBeVisible();
  });

  });

  test('móvil 390 px: sin desbordamiento horizontal', async ({ page, sim }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ingresar(page, '/garantias');
    await page.getByPlaceholder('Número de factura, ej. 1043').fill('1043');
    await page.getByRole('button', { name: 'Buscar factura', exact: true }).click();
    await page.getByRole('button', { name: /Taladro percutor/ }).click();
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde).toBeLessThanOrEqual(0);
    expect(sim.posts).toHaveLength(0);
  });
});
