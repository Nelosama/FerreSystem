import { expect, test, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: abono de crédito con tarjeta (autorización y terminal obligatorias) y conciliación del POS
// bancario (solo ADMIN; diferencia con motivo). Valida interfaz, contrato de payloads y permisos en pantalla. NO prueba
// persistencia ni reglas del servidor: eso está en backend/test/pagos-bancarios.postgres.integration.ts.

const tenant = { id: 'tenant-pagos-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
type Rol = 'ADMIN' | 'CAJERO';
type Sim = { rol: Rol; abonos: any[]; conciliaciones: any[]; errores: string[]; inesperados: string[] };

const cuentaCxc = { id: 'cu-1', tipo: 'CXC', nombre: 'Constructora del Norte', documento: 'V-10', monto: 500, saldo: 300, vencimiento: null, vencida: false, pagos: [] };

const test2 = test.extend<{ rol: Rol; sim: Sim }>({
  rol: ['ADMIN', { option: true }],
  sim: [async ({ page, baseURL, rol }, use) => {
    const sim: Sim = { rol, abonos: [], conciliaciones: [], errores: [], inesperados: [] };
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
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'pagos-e2e-token', user: usuario, tenant });
      const vacias: Record<string, unknown> = {
        '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
        '/maintenance/backup': { configured: false }, '/productos/comercial': [], '/clientes': [], '/operaciones/proveedores': [],
        '/operaciones/caja': [], '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [], '/operaciones/entregas': [],
      };
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path === '/operaciones/cuentas') return responder(route, 200, url.searchParams.get('tipo') === 'CXC' ? [cuentaCxc] : []);
      const pago = path.match(/^\/operaciones\/cuentas\/([^/]+)\/pagos$/);
      if (method === 'POST' && pago) {
        const body = request.postDataJSON(); sim.abonos.push({ cuenta: pago[1], body });
        return responder(route, 201, { id: 'pc-1', ...body });
      }
      if (method === 'GET' && path === '/operaciones/conciliaciones-bancarias') return responder(route, 200, sim.conciliaciones);
      if (method === 'POST' && path === '/operaciones/conciliaciones-bancarias') {
        const body = request.postDataJSON();
        const diferencia = Math.round((Number(body.totalBanco) - 115) * 100) / 100;
        if (diferencia !== 0 && (!body.motivo || body.motivo.length < 10)) {
          return responder(route, 400, { message: 'Explique la diferencia entre el POS bancario y el sistema (mínimo 10 caracteres)' });
        }
        const fila = { id: `cb-${sim.conciliaciones.length + 1}`, terminal: body.terminal.toUpperCase(), fecha: body.fecha, total_banco: body.totalBanco, cantidad_banco: body.cantidadBanco, total_sistema: 115, cantidad_sistema: 1, diferencia, motivo: body.motivo ?? null, created_at: new Date().toISOString(), usuario_nombre: 'Usuario de prueba' };
        sim.conciliaciones.push(fila);
        return responder(route, 201, fila);
      }
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

test2.describe('Abono de crédito con tarjeta (simulado)', () => {
  test2.use({ rol: 'ADMIN' });
  test2('no se registra sin autorización y terminal; con ambas, el payload lleva pagoElectronico', async ({ page, sim }) => {
    page.on('dialog', d => d.accept());
    await ingresar(page, '/cuentas');
    await page.getByRole('button', { name: 'Registrar abono' }).first().click();
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: /Registrar abono · Constructora/ }) });
    await form.locator('select').selectOption('TARJETA');
    const registrar = form.getByRole('button', { name: 'Registrar', exact: true });
    await expect(registrar).toBeDisabled();
    await form.getByLabel('Autorización bancaria').fill('AUT-9988');
    await expect(registrar).toBeDisabled();
    await form.getByLabel('Terminal POS').fill('POS-02');
    await expect(registrar).toBeEnabled();
    await registrar.click();
    await expect.poll(() => sim.abonos.length).toBe(1);
    expect(sim.abonos[0]).toMatchObject({ cuenta: 'cu-1', body: { metodo: 'TARJETA', monto: 300, pagoElectronico: { referencia: 'AUT-9988', terminal: 'POS-02' } } });
  });
});

test2.describe('Conciliación del POS bancario (simulado)', () => {
  test2.use({ rol: 'ADMIN' });
  test2('una diferencia sin motivo se rechaza; con motivo queda registrada', async ({ page, sim }) => {
    await ingresar(page, '/conciliacion-bancaria');
    await expect(page.getByRole('heading', { name: 'Conciliación del POS bancario' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Terminal POS' }).fill('pos-01');
    await page.getByRole('spinbutton', { name: 'Total del banco' }).fill('100');
    await page.getByRole('spinbutton', { name: 'Transacciones del banco' }).fill('1');
    await page.getByRole('button', { name: 'Registrar conciliación' }).click();
    await expect(page.getByRole('alert')).toHaveText('Explique la diferencia entre el POS bancario y el sistema (mínimo 10 caracteres)');
    expect(sim.conciliaciones).toHaveLength(0);

    await page.getByRole('textbox', { name: 'Motivo' }).fill('Voucher anulado en el POS del banco');
    await page.getByRole('button', { name: 'Registrar conciliación' }).click();
    await expect(page.getByRole('status')).toHaveText('Conciliación registrada con diferencia. Quedó auditada.');
    expect(sim.conciliaciones[0]).toMatchObject({ terminal: 'POS-01', diferencia: -15, motivo: 'Voucher anulado en el POS del banco' });
    await expect(page.getByRole('cell', { name: 'POS-01' })).toBeVisible();
  });
});

test2.describe('Conciliación del POS bancario como CAJERO (negativo)', () => {
  test2.use({ rol: 'CAJERO' });
  test2('el cajero no ve la pantalla de conciliación ni consulta el historial', async ({ page, sim }) => {
    await ingresar(page, '/conciliacion-bancaria');
    await expect(page.getByRole('heading', { name: 'Conciliación del POS bancario' })).toHaveCount(0);
    expect(sim.conciliaciones).toEqual([]);
  });
});
