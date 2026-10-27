import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: el Admin cambia un precio y el cajero vende sin botón de actualización ni paso adicional.
// El catálogo y el carrito se sincronizan en la siguiente interacción; antes de enviar se valida el precio vigente.
// El servidor simulado aplica la regla del backend para todos los roles: un precio distinto del vigente responde 409
// (backend/test/ventas.postgres.integration.ts y auditoria-piloto-ferreteria, «precio cambió»).

const tenant = { id: 'tenant-pos-precios-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const cajero = { id: 'user-CAJERO', nombre: 'Cajero de prueba', email: 'usuario@prueba.invalid', rol: 'CAJERO' };
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', codigoBarras: null, codigoFabricante: null, descripcion: null,
  categoria: { id: 'c1', nombre: 'Herramientas' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 100, precioCosto: 60,
  margen: null, stockActual: 10, stockReservado: 0, stockDisponible: 10, stockFisico: 10, stockMinimo: 1, activo: true, imagenUrl: null, marca: null, version: 1 };

// retrasoVentaMs: retrasa la respuesta de POST /ventas. perderRespuesta: el servidor registra la venta pero la respuesta no llega.
// cortarSinRegistrar: la conexión se corta antes de registrar. retrasoCatalogoMs: la lectura del catálogo tarda; sirve el
// precio vigente al iniciarse. intentos: todo POST /ventas recibido, registrado o rechazado.
type Sim = { precio: number; lecturasCatalogo: number; fallosCatalogo: number; ventas: any[]; errores: string[]; inesperados: string[]; retrasoVentaMs: number; perderRespuesta: boolean; consultas: string[]; clientes: any[]; descartes: string[]; fallarDescarte: boolean; sinProducto: boolean; intentos: any[]; cortarSinRegistrar: boolean; retrasoCatalogoMs: number };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { precio: 100, lecturasCatalogo: 0, fallosCatalogo: 0, ventas: [], errores: [], inesperados: [], retrasoVentaMs: 0, perderRespuesta: false, consultas: [], clientes: [], descartes: [], fallarDescarte: false, sinProducto: false, intentos: [], cortarSinRegistrar: false, retrasoCatalogoMs: 0 };
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
        const precioServido = sim.precio, sinProducto = sim.sinProducto;
        if (sim.fallosCatalogo > 0) { sim.fallosCatalogo--; return route.abort('connectionreset'); }
        if (sim.retrasoCatalogoMs) await new Promise(r => setTimeout(r, sim.retrasoCatalogoMs));
        return responder(route, 200, sinProducto ? [] : [{ ...producto, precioVenta: precioServido }]);
      }
      if (method === 'GET' && path === '/operaciones/caja') return responder(route, 200, [{ id: 'caja-1', codigo: 'CAJA-1', estado: 'ABIERTA', usuario_id: cajero.id, monto_apertura: 500, efectivo_esperado: 500, totales: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 }, movimientos: [] }]);
      const ventaRegistrada = (body: any, n: number) => ({ id: `v-${n}`, numeroVenta: n, subtotal: 100, isv: 15, descuento: 0, total: 115, metodoPago: body.metodoPago, createdAt: new Date().toISOString(), detalles: [], estado: 'COMPLETADA' });
      if (method === 'POST' && path === '/ventas') {
        const body = request.postDataJSON(); sim.intentos.push(body);
        if (sim.cortarSinRegistrar) { await route.abort('connectionreset'); return; }
        if (body.detalles.some((d: any) => d.precioUnitario !== sim.precio)) return responder(route, 409, { message: 'El precio cambió; actualice el catálogo o solicite al administrador' });
        sim.ventas.push(body);
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


// Sincronización imperceptible: ningún aviso de actualización, modal, diálogo ni botón de «Entendido»/«Actualizar».
async function sinAvisosDeActualizacion(page: Page) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Entendido|Actualizar/ })).toHaveCount(0);
  await expect(page.getByText(/Precio actualizado|precio anterior|→|Revise el total/)).toHaveCount(0);
  await expect(page.getByTestId('pos-aviso-cobro')).toHaveCount(0);
}

// Cambio detectado durante el intento de cobro: aviso dentro del POS (no modal) con el importe nuevo.
async function avisoDeCobro(page: Page, anterior: string, nuevo: string, total: string) {
  const aviso = page.getByTestId('pos-aviso-cobro');
  await expect(aviso).toBeVisible();
  await expect(aviso).toHaveAttribute('role', 'alert');
  await expect(aviso).toContainText(`Taladro L. ${anterior} → L. ${nuevo}`);
  await expect(aviso).toContainText(`Nuevo total: L. ${total}`);
  await expect(aviso).toContainText('No se registró la venta');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const cobrar = (page: Page) => page.getByRole('button', { name: /Procesar Venta/ }).last();

test.describe('POS: precios sincronizados automáticamente (simulado)', () => {
  test.beforeEach(async ({ page }) => { await page.clock.install(); });

  test('el Admin cambia un precio y el cajero vende con el precio nuevo, sin botón ni paso adicional', async ({ page, sim }) => {
    await abrirPos(page);
    await expect(page.getByRole('button', { name: /Actualizar catálogo/ })).toHaveCount(0);
    await page.getByText('Taladro').first().click();
    await page.getByText('Taladro').first().click();
    await expect(page.getByText(/2 x L\.? ?100\.00/)).toBeVisible();

    // El Admin aprueba un precio nuevo mientras el cajero atiende.
    sim.precio = 120;
    await page.clock.fastForward(4000);
    const lecturas = sim.lecturasCatalogo;
    // Siguiente interacción del cajero: el catálogo y el carrito se actualizan en segundo plano.
    await page.getByLabel('Efectivo recibido').click();
    await expect.poll(() => sim.lecturasCatalogo).toBeGreaterThan(lecturas);
    // La cantidad se conserva y el total ya refleja el precio nuevo, sin ningún aviso.
    await expect(page.getByText(/2 x L\.? ?120\.00/)).toBeVisible();
    await sinAvisosDeActualizacion(page);

    await cobrar(page).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles).toEqual([expect.objectContaining({ productoId: 'prod-1', cantidad: 2, precioUnitario: 120 })]);
  });

  test('si el precio cambia justo antes de cobrar, actualiza el total, lo informa en el POS y exige un segundo clic', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    // Sin esperar el mínimo entre lecturas: la interacción no vuelve a leer, pero el cobro siempre valida.
    sim.precio = 130;
    await cobrar(page).click();
    await expect(page.getByText(/1 x L\.? ?130\.00/)).toBeVisible();
    await avisoDeCobro(page, '100.00', '130.00', '149.50');
    expect(sim.intentos).toEqual([]);
    // Segundo clic con el total nuevo visible: se registra y el aviso desaparece.
    await cobrar(page).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(130);
    expect(sim.intentos).toHaveLength(1);
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

  test('un producto que deja de estar disponible bloquea el cobro y conserva el carrito', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    sim.sinProducto = true;
    await cobrar(page).click();
    await expect(page.getByText(/Ya no se puede vender: Taladro/)).toBeVisible();
    expect(sim.ventas).toEqual([]);
    await expect(page.getByText(/1 x L\.? ?100\.00/)).toBeVisible();
  });

  test('sin conexión (red caída) no se cobra con un precio sin validar; al volver la red se vende al precio vigente', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    sim.fallosCatalogo = 5;
    await cobrar(page).click();
    await page.clock.fastForward(1000);
    await expect(page.getByText('No se pudo confirmar el precio vigente de los productos')).toBeVisible();
    expect(sim.ventas).toEqual([]);
    sim.fallosCatalogo = 0; sim.precio = 140;
    await cobrar(page).click();
    await expect(page.getByText(/1 x L\.? ?140\.00/)).toBeVisible();
    await avisoDeCobro(page, '100.00', '140.00', '161.00');
    expect(sim.intentos).toEqual([]);
    await cobrar(page).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(140);
  });

  test('D1: una venta pendiente corregida tras un cambio de precio se valida y envía con el carrito corregido', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    // La respuesta se corta antes de registrar: queda una venta pendiente con el precio anterior.
    sim.cortarSinRegistrar = true;
    await cobrar(page).click();
    await expect.poll(() => sim.intentos.length).toBe(1);
    await expect(page.getByText('Había una venta en proceso')).toBeVisible();
    sim.cortarSinRegistrar = false; sim.precio = 120;
    await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
    // Reenviar el pendiente idéntico: el servidor rechaza el precio antiguo.
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    await expect.poll(() => sim.intentos.length).toBe(2);
    await expect(page.getByText('El precio cambió; actualice el catálogo')).toBeVisible();
    await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
    await page.getByRole('button', { name: 'Corregir datos de esta venta' }).click();
    // El cajero corrige la cantidad; la corrección debe conservarse.
    await page.getByLabel('Cantidad Taladro').fill('2');
    await expect(page.getByText(/2 x L\.? ?100\.00/)).toBeVisible();
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    // Se valida el carrito corregido: precio nuevo con la cantidad corregida, aviso en el POS y sin envío.
    await expect(page.getByText(/2 x L\.? ?120\.00/)).toBeVisible();
    await avisoDeCobro(page, '100.00', '120.00', '276.00');
    expect(sim.intentos).toHaveLength(2);
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.intentos).toHaveLength(3);
    // Misma identidad de solicitud; cantidad corregida y precio vigente.
    expect(sim.ventas[0].solicitudId).toBe(sim.intentos[0].solicitudId);
    expect(sim.ventas[0].detalles).toEqual([expect.objectContaining({ productoId: 'prod-1', cantidad: 2, precioUnitario: 120 })]);
  });

  test('D2: una lectura del catálogo en curso antes del clic no valida el cobro; una respuesta antigua no revierte el precio', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    await page.clock.fastForward(4000);
    sim.retrasoCatalogoMs = 6000;
    const antes = sim.lecturasCatalogo;
    // Interacción: lectura en segundo plano que sirve el precio 100 y tarda 6 s.
    await page.getByLabel('Efectivo recibido').click();
    await expect.poll(() => sim.lecturasCatalogo).toBe(antes + 1);
    // El Admin cambia el precio mientras esa lectura viaja; el cajero pulsa cobrar enseguida.
    sim.precio = 120; sim.retrasoCatalogoMs = 0;
    await cobrar(page).click();
    // El cobro inició su propia lectura y detectó el precio vigente: no envía el precio anterior.
    await expect(page.getByText(/1 x L\.? ?120\.00/)).toBeVisible();
    expect(sim.lecturasCatalogo).toBeGreaterThanOrEqual(antes + 2);
    await avisoDeCobro(page, '100.00', '120.00', '138.00');
    expect(sim.intentos).toEqual([]);
    // La lectura antigua termina después con el precio 100: no debe revertir el carrito.
    await page.waitForTimeout(6500);
    await expect(page.getByText(/1 x L\.? ?120\.00/)).toBeVisible();
    await cobrar(page).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.intentos).toHaveLength(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(120);
  });

  test('el cobro no reutiliza una lectura del catálogo iniciada antes del cambio de precio', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    await page.clock.fastForward(4000);
    // Una interacción inicia una lectura lenta que viaja con el precio anterior (100).
    sim.retrasoCatalogoMs = 1500;
    const lecturas = sim.lecturasCatalogo;
    await page.getByLabel('Efectivo recibido').click();
    await expect.poll(() => sim.lecturasCatalogo).toBeGreaterThan(lecturas);
    // El Admin cambia el precio mientras esa lectura sigue en vuelo y el cajero cobra de inmediato.
    sim.precio = 120; sim.retrasoCatalogoMs = 0;
    await cobrar(page).click();
    await expect(page.getByText(/1 x L\.? ?120\.00/)).toBeVisible();
    // Cambio detectado durante el intento de cobro: aviso en el POS y segundo clic (requisito vigente).
    await avisoDeCobro(page, '100.00', '120.00', '138.00');
    expect(sim.intentos).toEqual([]);
    await cobrar(page).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(120);
  });

  test('una venta pendiente corregida tras un cambio de precio se envía con el precio vigente', async ({ page, sim }) => {
    await abrirPos(page);
    await page.getByText('Taladro').first().click();
    // 1. La respuesta del cobro se pierde antes de registrarse: queda una venta pendiente.
    sim.cortarSinRegistrar = true;
    await cobrar(page).click();
    await expect.poll(() => sim.intentos.length).toBe(1);
    await expect(page.getByText('Había una venta en proceso.')).toBeVisible();
    sim.cortarSinRegistrar = false;
    // 2. El Admin cambia el precio; el servidor rechaza el precio anterior (409).
    sim.precio = 120;
    await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    await expect.poll(() => sim.intentos.length).toBe(2);
    expect(sim.ventas).toEqual([]);
    // 3. Corregir la venta: la siguiente interacción sincroniza el precio y el cobro la envía.
    await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
    await page.getByRole('button', { name: 'Corregir datos de esta venta' }).click();
    await page.clock.fastForward(4000);
    await page.getByRole('heading', { name: /punto de venta/i }).click();
    await expect(page.getByText(/1 x L\.? ?120\.00/)).toBeVisible();
    await sinAvisosDeActualizacion(page);
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(120);
    expect(sim.ventas[0].solicitudId).toBe(sim.intentos[0].solicitudId);
  });
});
