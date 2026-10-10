import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO para PR #127: proveedores por producto, compra al contado y estado de cuenta.
// Valida interfaz, contrato de payloads y permisos en pantalla. NO prueba persistencia ni reglas de servidor:
// eso está en backend/test/*.postgres.integration.ts contra PostgreSQL real.

const tenant = { id: 'tenant-p1-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
type Rol = 'ADMIN' | 'BODEGUERO' | 'CAJERO' | 'VENDEDOR';
type Sim = {
  rol: Rol;
  vinculos: any[];
  puts: { proveedor: string; body: any }[];
  deletes: string[];
  compras: any[];
  fallarPut: { status: number; message: string } | null;
  errores: string[];
  inesperados: string[];
};

const producto = { id: 'prod-1', codigo: 'TOR-1', nombre: 'Tornillo 2 pulgadas', codigoBarras: null, codigoFabricante: null, descripcion: null,
  categoria: { id: 'c1', nombre: 'Ferretería' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 15, precioCosto: 10,
  margen: null, stockActual: 40, stockReservado: 0, stockDisponible: 40, stockMinimo: 5, activo: true, imagenUrl: null, marca: null, version: 1 };
const proveedores = [{ id: 'prov-1', nombre: 'Distribuidora Norte', telefono: null, rtn: null }, { id: 'prov-2', nombre: 'Ferretera Sur', telefono: null, rtn: null }];
const cliente = { id: 'cli-1', codigo: 'CLI-000001', numeroCliente: 1, nombre: 'Constructora del Norte', rtn: null, telefono: null, creditoHabilitado: true, saldoPendiente: 300 };
const estadoCuenta = {
  cliente: { id: 'cli-1', codigo: 'CLI-000001', numeroCliente: 1, nombre: 'Constructora del Norte', creditoHabilitado: true, limiteCredito: 1000, saldoPendiente: 300 },
  saldoCuentas: 300, conciliado: true,
  cuentas: [{ id: 'cu-1', documento: 'V-10', monto: 500, saldo: 300, vencimiento: '2026-01-01T00:00:00.000Z', vencida: true, creadaEn: '2026-01-01T00:00:00.000Z',
    abonos: [{ id: 'ab-1', monto: 200, metodo: 'EFECTIVO', fecha: '2026-01-05T00:00:00.000Z', notas: null }] }],
};

const test = base.extend<{ sim: Sim; rol: Rol }>({
  rol: ['ADMIN', { option: true }],
  sim: [async ({ page, baseURL, rol }, use) => {
    const sim: Sim = { rol, vinculos: [{ id: 'vi-1', proveedor_id: 'prov-1', proveedor_nombre: 'Distribuidora Norte', codigo_proveedor: null, es_preferido: false, ultimo_costo: 40, ultima_compra_at: '2026-10-01T12:00:00.000Z' }], puts: [], deletes: [], compras: [], fallarPut: null, errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const usuario = { id: `user-${rol}`, nombre: 'Usuario de prueba', email: 'usuario@prueba.invalid', rol };
    const permisos = rol === 'BODEGUERO' ? ['inventario.editar', 'inventario.ver'] : [];

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol, permisos, permisosConfigurados: rol === 'BODEGUERO', descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'p1-e2e-token', user: usuario, tenant });
      const vacias: Record<string, unknown> = {
        '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
        '/maintenance/backup': { configured: false }, '/productos/comercial': [], '/productos/alertas/stock-bajo': [],
        '/operaciones/caja': [], '/operaciones/entregas': [], '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
      };
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path === '/productos') return responder(route, 200, [producto]);
      if (method === 'GET' && path === '/operaciones/proveedores') return responder(route, 200, proveedores);
      if (method === 'GET' && path === '/operaciones/compras') return responder(route, 200, sim.compras);
      if (method === 'POST' && path === '/operaciones/compras') { const body = request.postDataJSON(); sim.compras.push(body); return responder(route, 201, { id: 'oc-1', ...body }); }
      if (method === 'GET' && path === '/clientes') return responder(route, 200, [cliente]);
      const vinc = path.match(/^\/operaciones\/productos\/([^/]+)\/proveedores(?:\/([^/]+))?$/);
      if (vinc && method === 'GET') return responder(route, 200, sim.vinculos);
      if (vinc && method === 'PUT') {
        const body = request.postDataJSON(); sim.puts.push({ proveedor: vinc[2], body });
        if (sim.fallarPut) { const f = sim.fallarPut; sim.fallarPut = null; return responder(route, f.status, { message: f.message }); }
        sim.vinculos = [...sim.vinculos.filter(v => v.proveedor_id !== vinc[2]), { id: `vi-${vinc[2]}`, proveedor_id: vinc[2], proveedor_nombre: 'Ferretera Sur', codigo_proveedor: body.codigoProveedor ?? null, es_preferido: body.esPreferido, ultimo_costo: null, ultima_compra_at: null }];
        return responder(route, 200, sim.vinculos);
      }
      if (vinc && method === 'DELETE') { sim.deletes.push(vinc[2]); sim.vinculos = sim.vinculos.filter(v => v.proveedor_id !== vinc[2]); return responder(route, 200, { success: true }); }
      if (method === 'GET' && /^\/operaciones\/productos\/[^/]+\/historial$/.test(path)) return responder(route, 200, { movimientos: [], costos: [] });
      if (method === 'GET' && path === '/operaciones/clientes/cli-1/estado-cuenta') {
        if (rol !== 'ADMIN') return responder(route, 403, { message: 'Forbidden' });
        return responder(route, 200, estadoCuenta);
      }
      if (method === 'GET' && path === '/operaciones/cuentas') return responder(route, 200, []);
      sim.inesperados.push(`${method} ${path}`);
      await route.abort();
    });
    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API no previstas').toEqual([]);
  }, { auto: true }],
});

async function ingresar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test.describe('Proveedores por producto (simulado)', () => {
  test('ADMIN asocia un proveedor con código, lo marca preferido y ve el último costo', async ({ page, sim }) => {
    await ingresar(page, '/inventario');
    const seleccion = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Administrar producto y revisar movimientos', exact: true }) }).locator('select').first();
    await seleccion.selectOption('prod-1');
    const panel = page.locator('section.supplier-link-panel');
    await expect(panel.getByRole('cell', { name: 'Distribuidora Norte' })).toBeVisible();
    await panel.getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption('prov-2');
    await panel.getByRole('textbox', { name: 'Código del proveedor' }).fill('FS-22');
    await panel.getByRole('checkbox', { name: 'Preferido' }).check();
    await panel.getByRole('button', { name: 'Agregar proveedor' }).click();
    await expect(panel.getByRole('status')).toHaveText('Proveedor guardado.');
    expect(sim.puts.at(-1)).toEqual({ proveedor: 'prov-2', body: { codigoProveedor: 'FS-22', esPreferido: true } });
  });

  test('si el servidor rechaza el proveedor (inactivo), el mensaje se muestra y no se cambia la lista', async ({ page, sim }) => {
    sim.fallarPut = { status: 400, message: 'El proveedor está inactivo' };
    await ingresar(page, '/inventario');
    await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Administrar producto y revisar movimientos', exact: true }) }).locator('select').first().selectOption('prod-1');
    const panel = page.locator('section.supplier-link-panel');
    await panel.getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption('prov-2');
    await panel.getByRole('button', { name: 'Agregar proveedor' }).click();
    await expect(panel.getByRole('alert')).toHaveText('El proveedor está inactivo');
    await expect(panel.getByRole('cell', { name: 'Distribuidora Norte' })).toBeVisible();
  });
});

test.describe('Compra al contado (simulado)', () => {
  test.describe('como ADMIN', () => {
    test.use({ rol: 'ADMIN' });
      test('ADMIN marca compra al contado y el payload lleva pagoContado sin mencionar caja', async ({ page, sim }) => {
    await ingresar(page, '/ordenes-compra');
    await expect(page.getByRole('heading', { name: 'Registrar factura de compra' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Pagar al contado al registrar' }).check();
    await expect(page.getByText(/NO descuenta la caja del turno/)).toBeVisible();
    await page.getByLabel('Método de pago').selectOption('TARJETA');
    await page.getByLabel('Proveedor').selectOption('prov-1');
    await page.getByLabel('Número de factura').fill('FAC-900');
    await page.getByLabel('Producto').selectOption('prod-1');
    await page.getByLabel('Cantidad').fill('5');
    await page.getByRole('button', { name: 'Agregar producto' }).click();
    await page.getByRole('button', { name: 'Registrar factura' }).click();
    await expect.poll(() => sim.compras.length).toBe(1);
    expect(sim.compras[0]).toMatchObject({ proveedorId: 'prov-1', numeroFactura: 'FAC-900', pagoContado: { metodo: 'TARJETA' } });
    });
  });

  test.describe('como BODEGUERO (negativo)', () => {
    test.use({ rol: 'BODEGUERO' });
    test('no ve el selector de pago al contado', async ({ page, sim }) => {
      await ingresar(page, '/ordenes-compra');
      await expect(page.getByRole('heading', { name: 'Registrar factura de compra' })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Pagar al contado al registrar' })).toHaveCount(0);
      expect(sim.compras).toEqual([]);
    });
  });
});

test.describe('Estado de cuenta de clientes (simulado)', () => {
  test('ADMIN busca un cliente y ve saldo, conciliación, factura vencida y abonos', async ({ page, sim }) => {
    await ingresar(page, '/estado-cuenta-clientes');
    await page.getByLabel('Buscar cliente').fill('Constructora');
    await page.getByRole('search').getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('button', { name: /CLI-000001 · Constructora del Norte/ }).click();
    await expect(page.getByRole('heading', { name: /Constructora del Norte · CLI-000001/ })).toBeVisible();
    await expect(page.getByText('El saldo concilia con las facturas abiertas.')).toBeVisible();
    await expect(page.getByText('VENCIDA')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'EFECTIVO' })).toBeVisible();
    expect(sim.inesperados).toEqual([]);
  });

  for (const rol of ['CAJERO', 'VENDEDOR'] as const) {
    test.describe(`como ${rol} (negativo)`, () => {
      test.use({ rol });
      test('no puede abrir el estado de cuenta ni ver saldos de clientes', async ({ page }) => {
        await ingresar(page, '/estado-cuenta-clientes');
        await expect(page.getByRole('heading', { name: 'Estado de cuenta de clientes' })).toHaveCount(0);
        await expect(page.getByText('Constructora del Norte')).toHaveCount(0);
      });
    });
  }
});
