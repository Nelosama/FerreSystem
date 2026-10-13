import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO (BALANCE): cuentas por cobrar y por pagar en la pantalla de cuentas, filtros y referencia de
// pago a proveedor; estado de cuenta del cliente con saldo acumulado. La persistencia está en
// backend/test/cxc-cxp-balance.postgres.integration.ts.

const tenant = { id: 'tenant-balance-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
type Rol = 'ADMIN' | 'CAJERO';
type Sim = { rol: Rol; pagos: any[]; consultas: string[]; errores: string[]; inesperados: string[] };

const cuentaCxc = { id: 'cu-cxc-1', tipo: 'CXC', nombre: 'Constructora del Norte', documento: 'V-10', monto: 500, saldo: 250, vencimiento: '2099-01-01T00:00:00.000Z', vencida: false, estado: 'PARCIAL', created_at: '2026-10-01T12:00:00.000Z', pagos: [] };
const cuentaCxp = { id: 'cu-cxp-1', tipo: 'CXP', nombre: 'Distribuidora Sur', documento: 'FAC-77', monto: 300, saldo: 300, vencimiento: '2099-01-01T00:00:00.000Z', vencida: false, estado: 'PENDIENTE', created_at: '2026-10-01T12:00:00.000Z', pagos: [] };
const estadoCliente = {
  cliente: { id: 'cli-1', codigo: 'CLI-000001', numeroCliente: 1, nombre: 'Constructora del Norte', creditoHabilitado: true, limiteCredito: 1000, saldoPendiente: 250 },
  saldoCuentas: 250, conciliado: true,
  cuentas: [{ id: 'cu-cxc-1', documento: 'V-10', monto: 500, saldo: 250, vencimiento: '2099-01-01T00:00:00.000Z', vencida: false, creadaEn: '2026-10-01T12:00:00.000Z', abonos: [] }],
  movimientos: [
    { fecha: '2026-10-01T12:00:00.000Z', tipo: 'CARGO', documento: 'V-10', metodo: null, monto: 500, usuario: null, referencia: null, saldoAcumulado: 500 },
    { fecha: '2026-10-05T12:00:00.000Z', tipo: 'ABONO', documento: null, metodo: 'EFECTIVO', monto: -250, usuario: 'Cajera Ana', referencia: null, saldoAcumulado: 250 },
  ],
};

const test = base.extend<{ rol: Rol; sim: Sim }>({
  rol: ['ADMIN', { option: true }],
  sim: [async ({ page, baseURL, rol }, use) => {
    const sim: Sim = { rol, pagos: [], consultas: [], errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const usuario = { id: `user-${rol}`, nombre: 'Usuario de prueba', email: 'usuario@prueba.invalid', rol };
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol, permisos: [], descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'balance-e2e-token', user: usuario, tenant });
      const vacias: Record<string, unknown> = {
        '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
        '/maintenance/backup': { configured: false }, '/productos/comercial': [], '/productos': [], '/operaciones/proveedores': [],
        '/operaciones/caja': [], '/operaciones/entregas': [], '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
      };
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path === '/operaciones/cuentas') {
        sim.consultas.push(url.search);
        const tipo = url.searchParams.get('tipo');
        if (tipo === 'CXP' && rol !== 'ADMIN') return responder(route, 403, { message: 'Cuentas por pagar requieren administrador' });
        const estado = url.searchParams.get('estado');
        const base = tipo === 'CXP' ? [cuentaCxp] : [cuentaCxc];
        return responder(route, 200, estado ? base.filter(c => c.estado === estado) : base);
      }
      const pago = path.match(/^\/operaciones\/cuentas\/([^/]+)\/pagos$/);
      if (method === 'POST' && pago) { const body = request.postDataJSON(); sim.pagos.push({ cuenta: pago[1], body }); return responder(route, 201, { id: 'pg-1', ...body }); }
      if (method === 'GET' && path === '/clientes') return responder(route, 200, [estadoCliente.cliente]);
      if (method === 'GET' && path === '/operaciones/clientes/cli-1/estado-cuenta') return responder(route, 200, estadoCliente);
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

test.describe('Cuentas por cobrar y por pagar (BALANCE, simulado)', () => {
  test.describe('como ADMIN', () => {
    test.use({ rol: 'ADMIN' });

    test('filtra por estado de deuda, muestra el estado y registra un pago a proveedor con referencia', async ({ page, sim }) => {
      await ingresar(page, '/cuentas');
      await expect(page.locator('.balance-estado-PARCIAL')).toHaveText('Parcial');
      await page.getByRole('combobox', { name: /Estado de deuda/ }).selectOption('PARCIAL');
      await expect.poll(() => sim.consultas.some(q => q.includes('estado=PARCIAL'))).toBe(true);
      await page.getByRole('combobox', { name: /Estado de deuda/ }).selectOption('');
      await page.getByRole('button', { name: 'Proveedores · Por pagar' }).click();
      await expect(page.getByText('Distribuidora Sur')).toBeVisible();
      page.on('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Registrar pago' }).first().click();
      await page.getByLabel('Referencia de pago (comprobante)').fill('transf-4433');
      await page.getByRole('button', { name: 'Registrar', exact: true }).click();
      await expect.poll(() => sim.pagos.length).toBe(1);
      expect(sim.pagos[0]).toMatchObject({ cuenta: 'cu-cxp-1', body: { monto: 300, metodo: 'EFECTIVO', referencia: 'transf-4433' } });
    });

    test('el estado de cuenta del cliente muestra movimientos con saldo acumulado y responsable', async ({ page }) => {
      await ingresar(page, '/estado-cuenta-clientes');
      await page.getByLabel('Buscar cliente').fill('Constructora');
      await page.getByRole('search').getByRole('button', { name: 'Buscar' }).click();
      await page.getByRole('button', { name: /CLI-000001 · Constructora del Norte/ }).click();
      await expect(page.getByRole('heading', { name: 'Movimientos y saldo acumulado' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Cajera Ana' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Abono · EFECTIVO' })).toBeVisible();
    });
  });

  test.describe('como CAJERO (negativo)', () => {
    test.use({ rol: 'CAJERO' });
    test('el cajero ve cuentas por cobrar pero no las cuentas por pagar', async ({ page, sim }) => {
      await ingresar(page, '/cuentas');
      await expect(page.getByText('Constructora del Norte').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Proveedores · Por pagar' })).toHaveCount(0);
      expect(sim.consultas.some(q => q.includes('tipo=CXP'))).toBe(false);
    });
  });
});
