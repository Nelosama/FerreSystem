import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: el cajero cobra con tarjeta en el POS. No se envía la venta sin autorización bancaria;
// con autorización y terminal, el payload lleva pagoElectronico. La persistencia y las reglas del servidor están en
// backend/test/pagos-bancarios.postgres.integration.ts. El POS offline no se toca aquí (solo efectivo).

const tenant = { id: 'tenant-pos-tarjeta-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const cajero = { id: 'user-CAJERO', nombre: 'Cajero de prueba', email: 'usuario@prueba.invalid', rol: 'CAJERO' };
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', codigoBarras: null, codigoFabricante: null, descripcion: null,
  categoria: { id: 'c1', nombre: 'Herramientas' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 100, precioCosto: 60,
  margen: null, stockActual: 10, stockReservado: 0, stockDisponible: 10, stockFisico: 10, stockMinimo: 1, activo: true, imagenUrl: null, marca: null, version: 1 };

// retrasoVentaMs: retrasa la respuesta de POST /ventas. perderRespuesta: el servidor registra la venta pero la respuesta no llega.
type Sim = { ventas: any[]; errores: string[]; inesperados: string[]; retrasoVentaMs: number; perderRespuesta: boolean; consultas: string[] };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { ventas: [], errores: [], inesperados: [], retrasoVentaMs: 0, perderRespuesta: false, consultas: [] };
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
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'pos-tarjeta-token', user: cajero, tenant });
      const vacias: Record<string, unknown> = {
        '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
        '/maintenance/backup': { configured: false }, '/clientes/buscar': [], '/operaciones/proveedores': [], '/operaciones/entregas': [],
        '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
      };
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path === '/productos/comercial') return responder(route, 200, [producto]);
      if (method === 'GET' && path === '/operaciones/caja') return responder(route, 200, [{ id: 'caja-1', codigo: 'CAJA-1', estado: 'ABIERTA', usuario_id: cajero.id, monto_apertura: 500, efectivo_esperado: 500, totales: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 }, movimientos: [] }]);
      const ventaRegistrada = (body: any, n: number) => ({ id: `v-${n}`, numeroVenta: n, subtotal: 100, isv: 15, descuento: 0, total: 115, metodoPago: body.metodoPago, createdAt: new Date().toISOString(), detalles: [], estado: 'COMPLETADA' });
      if (method === 'POST' && path === '/ventas') {
        const body = request.postDataJSON(); sim.ventas.push(body);
        if (sim.retrasoVentaMs) await new Promise(r => setTimeout(r, sim.retrasoVentaMs));
        if (sim.perderRespuesta) { await route.abort('connectionreset'); return; }
        return responder(route, 201, ventaRegistrada(body, sim.ventas.length));
      }
      if (method === 'GET' && path.startsWith('/ventas/solicitudes/')) {
        const id = path.split('/').pop()!; sim.consultas.push(id);
        const index = sim.ventas.findIndex(v => v.solicitudId === id);
        return responder(route, 200, index < 0 ? { estado: 'NO_REGISTRADA' } : { estado: 'REGISTRADA', venta: ventaRegistrada(sim.ventas[index], index + 1) });
      }
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
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/pos');
  await expect(page.getByText('Taladro').first()).toBeVisible();
}

test.describe('Cobro con tarjeta en el POS (simulado)', () => {
  test('sin autorización bancaria no se envía la venta; con autorización y terminal, el payload la incluye', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    await page.getByRole('button', { name: 'TARJETA', exact: true }).click();
    const cobrar = page.getByRole('button', { name: /Procesar Venta/ }).last();
    await cobrar.click();
    await expect(page.getByText('Registre la autorización bancaria antes de confirmar la venta')).toBeVisible();
    expect(sim.ventas).toEqual([]);

    await page.getByLabel('Autorización bancaria').fill('aut-445566');
    await page.getByLabel('Terminal POS').fill('pos-01');
    await cobrar.click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0]).toMatchObject({ metodoPago: 'TARJETA', pagoElectronico: { referencia: 'aut-445566', terminal: 'pos-01' } });
  });

  test('efectivo no muestra campos de autorización', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    await expect(page.getByLabel('Autorización bancaria')).toHaveCount(0);
    expect(sim.ventas).toEqual([]);
  });

  test('efectivo: calcula el cambio en pantalla y en el comprobante sin enviarlo al servidor', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    const recibido = page.getByLabel('Efectivo recibido');
    const vuelto = page.getByTestId('pos-vuelto');
    await recibido.fill('100');
    await expect(vuelto).toHaveText(/Falta: L\.? ?15\.00/);
    await recibido.fill('abc');
    await expect(vuelto).toContainText('Escriba un importe válido');
    await recibido.fill('200,50');
    await expect(vuelto).toHaveText(/Cambio: L\.? ?85\.50/);

    await page.getByRole('button', { name: /Procesar Venta/ }).last().click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(Object.keys(sim.ventas[0])).not.toContain('efectivoRecibido');
    expect(JSON.stringify(sim.ventas[0])).not.toMatch(/200[.,]5|efectivoRecibido|cambio|vuelto/i);
    const ticket = page.getByTestId('ticket-vuelto');
    await expect(ticket).toContainText(/Efectivo recibido: L\.? ?200\.50/);
    await expect(ticket).toContainText(/Cambio: L\.? ?85\.50/);
    await expect(page.getByText(/Método de Pago: Efectivo/)).toBeVisible();
  });

  test('el comprobante en pantalla nombra la transferencia como tal y no como crédito', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    await page.getByRole('button', { name: 'TRANSFERENCIA', exact: true }).click();
    await expect(page.getByLabel('Efectivo recibido')).toHaveCount(0);
    await page.getByLabel('Autorización bancaria').fill('trf-778899');
    await page.getByRole('button', { name: /Procesar Venta/ }).last().click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    await expect(page.getByText(/Método de Pago: Transferencia/)).toBeVisible();
    await expect(page.getByText(/Método de Pago: Crédito/)).toHaveCount(0);
    await expect(page.getByText(/TOTAL PAGADO/)).toBeVisible();
    await expect(page.getByTestId('ticket-vuelto')).toHaveCount(0);
  });

  test('14.4 respuesta tardía: mientras la venta sigue en curso no se reenvía ni se puede cambiar el carrito', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    sim.retrasoVentaMs = 2500;
    const cobrar = page.getByRole('button', { name: /Procesar Venta|Procesando venta/ }).last();
    await cobrar.click();
    await expect(page.getByRole('button', { name: /Procesando venta/ }).last()).toBeDisabled();
    await cobrar.click({ force: true });
    await page.keyboard.press('Enter');
    await page.getByText('Taladro').first().click({ force: true });
    await expect.poll(() => sim.ventas.length).toBe(1);
    await expect(page.getByText(/Factura N°/)).toBeVisible({ timeout: 10_000 });
    expect(sim.ventas).toHaveLength(1);
    expect(sim.ventas[0].detalles).toEqual([expect.objectContaining({ productoId: 'prod-1', cantidad: 1 })]);
  });

  test('respuesta perdida: la venta queda pendiente y se confirma por su identidad sin enviarla otra vez', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    sim.perderRespuesta = true;
    await page.getByRole('button', { name: /Procesar Venta/ }).last().click();
    await expect(page.getByText(/No recibimos confirmación/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Procesar Venta/ }).last()).toBeDisabled();
    expect(sim.ventas).toHaveLength(1);

    await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
    await expect(page.getByText(/Factura N°/)).toBeVisible();
    expect(sim.consultas).toEqual([sim.ventas[0].solicitudId]);
    expect(sim.ventas).toHaveLength(1);
  });
});
