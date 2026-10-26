import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: el Admin cambia un precio y el cajero vende sin botón de actualización ni paso adicional.
// El catálogo y el carrito se sincronizan en la siguiente interacción; antes de enviar se valida el precio vigente.
// El servidor también rechaza precios antiguos (backend/test/ventas.postgres.integration.ts, «precio cambió»).

const tenant = { id: 'tenant-pos-precios-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const cajero = { id: 'user-CAJERO', nombre: 'Cajero de prueba', email: 'usuario@prueba.invalid', rol: 'CAJERO' };
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', codigoBarras: null, codigoFabricante: null, descripcion: null,
  categoria: { id: 'c1', nombre: 'Herramientas' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 100, precioCosto: 60,
  margen: null, stockActual: 10, stockReservado: 0, stockDisponible: 10, stockFisico: 10, stockMinimo: 1, activo: true, imagenUrl: null, marca: null, version: 1 };

// retrasoVentaMs: retrasa la respuesta de POST /ventas. perderRespuesta: el servidor registra la venta pero la respuesta no llega.
type Sim = { precio: number; lecturasCatalogo: number; fallosCatalogo: number; ventas: any[]; errores: string[]; inesperados: string[]; retrasoVentaMs: number; perderRespuesta: boolean; consultas: string[]; clientes: any[]; descartes: string[]; fallarDescarte: boolean };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { precio: 100, lecturasCatalogo: 0, fallosCatalogo: 0, ventas: [], errores: [], inesperados: [], retrasoVentaMs: 0, perderRespuesta: false, consultas: [], clientes: [], descartes: [], fallarDescarte: false };
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
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'pos-precios-token', user: cajero, tenant });
      const vacias: Record<string, unknown> = {
        '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
        '/maintenance/backup': { configured: false }, '/clientes/buscar': [], '/operaciones/proveedores': [], '/operaciones/entregas': [],
        '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
      };
      if (method === 'GET' && path === '/clientes/buscar') return responder(route, 200, sim.clientes);
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path === '/productos/comercial') {
        sim.lecturasCatalogo++;
        if (sim.fallosCatalogo > 0) { sim.fallosCatalogo--; return route.abort('connectionreset'); }
        return responder(route, 200, [{ ...producto, precioVenta: sim.precio }]);
      }
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
  await page.locator('#login-correo').fill('usuario@prueba.invalid');
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/pos');
  await expect(page.getByText('Taladro').first()).toBeVisible();
}


const cobrar = (page: Page) => page.getByRole('button', { name: /Procesar Venta/ }).last();

test.describe('POS: precios sincronizados automáticamente (simulado)', () => {
  test.beforeEach(async ({ page }) => { await page.clock.install(); });

  test('el Admin cambia un precio y el cajero vende con el precio nuevo, sin botón ni paso adicional', async ({ page, sim }) => {
    await abrirPos(page);
    await expect(page.getByRole('button', { name: /Actualizar catálogo/ })).toHaveCount(0);
    await page.getByText('Taladro').first().click();
    await expect(page.getByText(/1 x L\.? ?100\.00/)).toBeVisible();

    // El Admin aprueba un precio nuevo mientras el cajero atiende.
    sim.precio = 120;
    await page.clock.fastForward(4000);
    const lecturas = sim.lecturasCatalogo;
    // Siguiente interacción del cajero: el catálogo y el carrito se actualizan en segundo plano.
    await page.getByLabel('Efectivo recibido').click();
    await expect.poll(() => sim.lecturasCatalogo).toBeGreaterThan(lecturas);
    await expect(page.getByText(/1 x L\.? ?120\.00/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Precio actualizado por el administrador' })).toContainText('Taladro');

    await cobrar(page).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles).toEqual([expect.objectContaining({ productoId: 'prod-1', cantidad: 1, precioUnitario: 120 })]);
  });

  test('si el precio cambia justo antes de cobrar, actualiza el total y no envía con el precio anterior', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    // Sin esperar el mínimo entre lecturas: la interacción no vuelve a leer, pero el cobro siempre valida.
    sim.precio = 130;
    await cobrar(page).click();
    await expect(page.getByText(/1 x L\.? ?130\.00/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Revise el total con el cliente y vuelva a cobrar' })).toBeVisible();
    expect(sim.ventas).toEqual([]);
    await cobrar(page).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(130);
  });

  test('reintenta una lectura fallida y, si no puede confirmar el precio vigente, no cobra', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    // Un fallo aislado se reintenta y la venta sale con el precio confirmado.
    sim.fallosCatalogo = 1;
    await cobrar(page).click();
    await page.clock.fastForward(1000);
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(100);
    await page.getByRole('button', { name: /nueva venta/i }).first().click();

    // Sin conexión con el catálogo: no se envía la venta con un precio que no se pudo validar.
    await page.getByText('Taladro').first().click();
    sim.fallosCatalogo = 5;
    await cobrar(page).click();
    await page.clock.fastForward(1000);
    await expect(page.getByText('No se pudo confirmar el precio vigente de los productos')).toBeVisible();
    expect(sim.ventas).toHaveLength(1);
  });
});
