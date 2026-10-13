import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: valida la interfaz del ciclo de compras (confirmaciones, doble envío,
// reintentos con la misma solicitud, nota de caja, estado de cuenta pagada). NO sustituye la validación
// de persistencia: esa está en test/compras.postgres.integration.ts contra PostgreSQL real.

const tenant = { id: 'tenant-compras-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'user-ADMIN', nombre: 'Administrador de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };
const proveedor = { id: 'prov-1', nombre: 'Distribuidora Central' };

type Sim = {
  orden: Record<string, any>;
  cuenta: Record<string, any>;
  stock: number;
  recepciones: { solicitudId: string; body: any }[];
  pagos: { solicitudId: string; body: any }[];
  facturas: { solicitudId: string; body: any }[];
  aplicadas: Set<string>;
  fallarSiguienteRecepcion: boolean;
  errores: string[];
  inesperados: string[];
};

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = {
      orden: {
        id: 'orden-1', codigo: 'COMP-1', numero_factura: 'FAC-100', proveedor_nombre: proveedor.nombre, estado: 'SOLICITADA',
        total: 9000, created_at: '2026-10-09T12:00:00Z',
        items: [{ id: 'det-1', codigo: 'TOR-1', nombre: 'Tornillo', cantidad: 200, cantidad_recibida: 0, precio_costo: 45 }],
      },
      cuenta: { id: 'cta-1', tipo: 'CXP', nombre: proveedor.nombre, documento: 'FAC-100', monto: 9000, saldo: 9000, vencimiento: '2026-11-15', vencida: false, pagos: [] },
      stock: 100, recepciones: [], pagos: [], facturas: [], aplicadas: new Set<string>(), fallarSiguienteRecepcion: false, errores: [], inesperados: [],
    };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        const method = request.method();
        const path = url.pathname.slice(4);
        if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
        if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, tenant);
        if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], descuentoMaximo: 0 } });
        if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'compras-e2e-token', user: admin, tenant });
        const vacias: Record<string, unknown> = {
          '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
          '/maintenance/backup': { configured: false }, '/productos/comercial': [], '/clientes': [], '/caja': [],
          '/operaciones/caja': [], '/operaciones/entregas': [], '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
        };
        if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
        if (method === 'GET' && path === '/operaciones/proveedores') return responder(route, 200, [proveedor]);
        // Sugerencia de proveedor preferido al elegir producto (PR #127/#130): sin asociaciones en este simulador.
        if (method === 'GET' && /^\/operaciones\/productos\/[^/]+\/proveedores$/.test(path)) return responder(route, 200, []);
        if (method === 'GET' && path === '/productos') return responder(route, 200, [{ id: 'prod-1', codigo: 'TOR-1', nombre: 'Tornillo', precioCosto: 45, precioVenta: 70, stockActual: sim.stock, stockMinimo: 0, unidadMedida: 'UNIDAD', activo: true }]);
        if (method === 'GET' && path === '/operaciones/compras') return responder(route, 200, [{ ...sim.orden, items: sim.orden.items.map((i: any) => ({ ...i })) }]);
        if (method === 'POST' && path === '/operaciones/compras') {
          const body = request.postDataJSON();
          sim.facturas.push({ solicitudId: body.solicitudId, body });
          return responder(route, 201, { id: 'orden-2' });
        }
        if (method === 'GET' && path === '/operaciones/cuentas') return responder(route, 200, url.searchParams.get('tipo') === 'CXP' ? [sim.cuenta] : []);

        const recepcion = path.match(/^\/operaciones\/compras\/([^/]+)\/recepciones$/);
        if (method === 'POST' && recepcion) {
          const body = request.postDataJSON();
          sim.recepciones.push({ solicitudId: body.solicitudId, body });
          if (sim.fallarSiguienteRecepcion) { sim.fallarSiguienteRecepcion = false; await route.abort(); return; }
          // Un servidor aplica cada solicitud una sola vez; el reintento de una solicitud ya aplicada solo devuelve el resultado.
          if (!sim.aplicadas.has(body.solicitudId)) {
            sim.aplicadas.add(body.solicitudId);
            for (const item of body.items) {
              const linea = sim.orden.items.find((l: any) => l.id === item.detalleId);
              linea.cantidad_recibida += item.cantidad;
              sim.stock += item.cantidad;
            }
            sim.orden.estado = sim.orden.items.every((l: any) => l.cantidad_recibida >= l.cantidad) ? 'RECIBIDA' : 'SOLICITADA';
          }
          return responder(route, 201, { id: 'rec-1' });
        }
        const pago = path.match(/^\/operaciones\/cuentas\/([^/]+)\/pagos$/);
        if (method === 'POST' && pago) {
          const body = request.postDataJSON();
          sim.pagos.push({ solicitudId: body.solicitudId, body });
          if (!sim.aplicadas.has(body.solicitudId)) {
            sim.aplicadas.add(body.solicitudId);
            sim.cuenta.saldo -= body.monto;
            sim.cuenta.pagos.push({ id: `pago-${sim.pagos.length}`, metodo: body.metodo, monto: body.monto, created_at: '2026-10-09T13:00:00Z' });
          }
          return responder(route, 201, { id: 'pago-1' });
        }
        sim.inesperados.push(`${method} ${path}`);
        await route.abort(); return;
      }
      if (url.origin === origen) await route.continue();
      else await route.abort();
    });

    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API fuera del backend simulado').toEqual([]);
  }, { auto: true }],
});

async function ingresar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await expect(page.getByRole('heading', { name: 'Administrar el negocio', exact: true })).toBeVisible();
  await page.goto(ruta);
}

test.describe('Ciclo de compras — interfaz con backend simulado (E2E simulado)', () => {
  test('recibir mercancía exige confirmación: cancelar no envía nada; aceptar envía una sola recepción', async ({ page, sim }) => {
    await ingresar(page, '/ordenes-compra');
    await expect(page.getByRole('button', { name: 'Confirmar recepción' })).toBeVisible();
    page.once('dialog', d => { expect(d.message()).toMatch(/aumentará las existencias/i); void d.dismiss(); });
    await page.getByRole('button', { name: 'Confirmar recepción' }).click();
    await page.waitForTimeout(150);
    expect(sim.recepciones).toHaveLength(0);
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Confirmar recepción' }).click();
    await expect.poll(() => sim.recepciones.length).toBe(1);
    expect(sim.stock).toBe(300);
  });

  test('un doble clic en Confirmar recepción envía una sola recepción', async ({ page, sim }) => {
    await ingresar(page, '/ordenes-compra');
    page.on('dialog', d => void d.accept());
    await page.getByRole('button', { name: 'Confirmar recepción' }).dblclick();
    await expect.poll(() => sim.recepciones.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(200);
    expect(sim.recepciones).toHaveLength(1);
    expect(sim.stock).toBe(300);
  });

  test('si se pierde la respuesta, la recepción queda pendiente y el reintento usa la misma solicitud', async ({ page, sim }) => {
    await ingresar(page, '/ordenes-compra');
    page.on('dialog', d => void d.accept());
    sim.fallarSiguienteRecepcion = true;
    await page.getByRole('button', { name: 'Confirmar recepción' }).click();
    await expect(page.getByText('Hay una operación pendiente de confirmar')).toBeVisible();
    // El reintento reenvía exactamente la misma operación pendiente, con su misma solicitud.
    await page.getByRole('button', { name: 'Confirmar operación pendiente' }).click();
    await expect.poll(() => sim.recepciones.length).toBe(2);
    expect(sim.recepciones[1].solicitudId).toBe(sim.recepciones[0].solicitudId);
    expect(sim.stock).toBe(300);
  });

  test('un doble clic en Registrar factura envía una sola factura', async ({ page, sim }) => {
    await ingresar(page, '/ordenes-compra');
    const formulario = page.locator('form').filter({ hasText: 'Registrar factura de compra' });
    await formulario.locator('select').first().selectOption('prov-1');
    await formulario.getByRole('textbox', { name: 'Número de factura' }).or(formulario.locator('input[required]').nth(0)).fill('FAC-200');
    await formulario.locator('select').nth(1).selectOption('prod-1');
    await formulario.getByRole('button', { name: 'Agregar producto' }).click();
    await formulario.getByRole('button', { name: 'Registrar factura' }).dblclick();
    await expect.poll(() => sim.facturas.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(200);
    expect(sim.facturas).toHaveLength(1);
    expect(sim.facturas[0].body).toMatchObject({ proveedorId: 'prov-1', numeroFactura: 'FAC-200' });
  });

  test('registrar un pago a proveedor pide confirmación, avisa que no afecta la caja y marca la cuenta como pagada', async ({ page, sim }) => {
    await ingresar(page, '/cuentas');
    await page.getByRole('button', { name: 'Proveedores · Por pagar' }).click();
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByText('no afectan la caja POS', { exact: false })).toBeVisible();
    page.once('dialog', d => { expect(d.message()).toContain('Registrar un pago'); void d.dismiss(); });
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await page.waitForTimeout(150);
    expect(sim.pagos).toHaveLength(0);
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect.poll(() => sim.pagos.length).toBe(1);
    expect(sim.pagos[0].body).toMatchObject({ metodo: 'EFECTIVO' });
    expect(sim.cuenta.saldo).toBe(0);
    await expect(page.getByText('· PAGADA')).toBeVisible();
  });

  test('el ciclo de compras cabe en un teléfono sin desbordamiento horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ingresar(page, '/ordenes-compra');
    await expect(page.getByRole('button', { name: 'Confirmar recepción' })).toBeVisible();
    const sinDesborde = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(sinDesborde).toBe(true);
  });
});
