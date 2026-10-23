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
type Sim = { ventas: any[]; errores: string[]; inesperados: string[]; retrasoVentaMs: number; perderRespuesta: boolean; consultas: string[]; clientes: any[]; descartes: string[]; fallarDescarte: boolean };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { ventas: [], errores: [], inesperados: [], retrasoVentaMs: 0, perderRespuesta: false, consultas: [], clientes: [], descartes: [], fallarDescarte: false };
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
      if (method === 'GET' && path === '/clientes/buscar') return responder(route, 200, sim.clientes);
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
      if (method === 'POST' && path.endsWith('/descartar')) {
        const id = path.split('/')[3]; sim.descartes.push(id);
        if (sim.fallarDescarte) return route.abort('connectionreset');
        const index = sim.ventas.findIndex(v => v.solicitudId === id);
        return responder(route, 201, index < 0 ? { estado: 'DESCARTADA' } : { estado: 'REGISTRADA', venta: ventaRegistrada(sim.ventas[index], index + 1) });
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
    // Los métodos de pago se muestran traducidos; el valor enviado sigue siendo TARJETA (se comprueba en el payload).
    const tarjeta = page.getByRole('button', { name: 'Tarjeta', exact: true });
    await tarjeta.click();
    await expect(tarjeta).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Efectivo', exact: true })).toHaveAttribute('aria-pressed', 'false');
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
    await page.getByRole('button', { name: 'Transferencia', exact: true }).click();
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

  test('venta a crédito: el comprobante en pantalla dice «TOTAL A CRÉDITO», no «TOTAL PAGADO»', async ({ page, sim }) => {
    sim.clientes = [{ id: 'cli-1', numeroCliente: 7, nombre: 'Constructora Norte', rtn: '08011999000001', telefono: null, creditoHabilitado: true }];
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    // El cliente va plegado; elegir Crédito abre el selector (la venta a crédito exige cliente).
    await page.getByRole('button', { name: 'Crédito', exact: true }).click();
    await page.getByRole('button', { name: /Constructora Norte/ }).click();
    await expect(page.getByLabel('Efectivo recibido')).toHaveCount(0);
    await page.getByRole('button', { name: /Procesar Venta/ }).last().click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0]).toMatchObject({ metodoPago: 'CREDITO', clienteId: 'cli-1' });
    await expect(page.getByText(/TOTAL A CRÉDITO/)).toBeVisible();
    await expect(page.getByText(/TOTAL PAGADO/)).toHaveCount(0);
    await expect(page.getByText(/Método de Pago: Crédito/)).toBeVisible();
  });
});

const pendingKey = `ferre_pending_sale:${tenant.id}:${cajero.id}`;
const draftKey = `ferre_sale_draft:${tenant.id}:${cajero.id}`;
const pendiente = { solicitudId: '3f2b8c1e-9a4d-4e6b-8c7a-1d2e3f4a5b6c', cart: [{ productoId: producto.id, codigo: producto.codigo, nombre: producto.nombre, precioUnitario: 100, cantidad: 1 }], clienteNombre: 'Consumidor Final', clienteRtn: '', metodoPago: 'EFECTIVO', descuentoPorcentaje: 0 };
const confirmarDescarte = async (page: Page) => {
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Descartar venta', exact: true }).click();
};

test('cancelar antes del cobro exige confirmación y limpia cliente, pago y almacenamiento sin enviar venta', async ({ page, sim }) => {
  await abrirPos(page);
  await page.getByText('Taladro').first().click();
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.getByLabel('Autorización bancaria').fill('AUT-ABANDONADA');
  await page.getByLabel('Terminal POS').fill('POS-01');
  await page.getByRole('button', { name: 'Cancelar venta', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  await expect(page.getByLabel('Autorización bancaria')).toHaveValue('AUT-ABANDONADA');
  await page.getByRole('button', { name: 'Cancelar venta', exact: true }).click();
  await confirmarDescarte(page);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), draftKey)).toBeNull();
  await expect(page.getByRole('button', { name: 'Efectivo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('Taladro').first().click();
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await expect(page.getByLabel('Autorización bancaria')).toHaveValue('');
  expect(sim.ventas).toHaveLength(0); expect(sim.descartes).toHaveLength(0);
});

test('borrador abandonado se recupera después de recarga y permite continuar o descartar sin conexión', async ({ page, sim }) => {
  await abrirPos(page); await page.getByText('Taladro').first().click(); await page.reload();
  await page.getByRole('button', { name: 'Continuar venta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancelar venta', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Descartar venta', exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Descartar venta', exact: true }).click();
  await confirmarDescarte(page);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), draftKey)).toBeNull();
  expect(sim.ventas).toHaveLength(0);
});

test('pendiente enviado sin confirmación se descarta por el servidor y no reaparece al reiniciar la página', async ({ page, sim }) => {
  await abrirPos(page);
  await page.evaluate(({ key, sale }) => localStorage.setItem(key, JSON.stringify(sale)), { key: pendingKey, sale: pendiente });
  await page.reload();
  await page.getByRole('button', { name: 'Descartar venta', exact: true }).click(); await confirmarDescarte(page);
  await expect.poll(() => sim.descartes.length).toBe(1);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();
  await page.reload();
  await expect(page.getByText('Había una venta en proceso.')).toHaveCount(0);
  await page.getByText('Taladro').first().click();
  await expect(page.getByRole('button', { name: /Procesar Venta/ }).last()).toBeEnabled();
  expect(sim.ventas).toHaveLength(0);
});

test('pérdida de conexión al descartar conserva la identidad y permite reintentar al recuperar red', async ({ page, sim }) => {
  await abrirPos(page); sim.fallarDescarte = true;
  await page.evaluate(({ key, sale }) => localStorage.setItem(key, JSON.stringify(sale)), { key: pendingKey, sale: pendiente });
  await page.reload();
  await page.getByRole('button', { name: 'Descartar venta', exact: true }).click(); await confirmarDescarte(page);
  await expect.poll(() => sim.descartes.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Descartar venta', exact: true })).toBeEnabled();
  expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), pendingKey))!).solicitudId).toBe(pendiente.solicitudId);
  sim.fallarDescarte = false;
  await page.reload(); await page.getByRole('button', { name: 'Descartar venta', exact: true }).click(); await confirmarDescarte(page);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();
  expect(sim.descartes).toEqual([pendiente.solicitudId, pendiente.solicitudId]); expect(sim.ventas).toHaveLength(0);
});

test('descartar una respuesta perdida recupera el comprobante de la venta confirmada', async ({ page, sim }) => {
  await abrirPos(page); sim.perderRespuesta = true;
  await page.getByText('Taladro').first().click(); await page.getByRole('button', { name: /Procesar Venta/ }).last().click();
  await expect(page.getByText('Había una venta en proceso.')).toBeVisible(); await page.reload();
  await page.getByRole('button', { name: 'Descartar venta', exact: true }).click(); await confirmarDescarte(page);
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada' })).toBeVisible();
  expect(sim.ventas).toHaveLength(1);
  expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).not.toBeNull();
  await page.getByRole('button', { name: /Nueva venta/i }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();
});
