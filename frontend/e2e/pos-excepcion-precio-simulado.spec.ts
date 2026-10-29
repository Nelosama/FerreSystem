import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: excepción de precio de una venta pendiente del POS.
// El servidor simulado aplica la política de backend/src/ventas/politica-precio.ts: precio distinto del vigente sin
// excepción → 409; motivo fuera de 10-300 → 400; sin rol ADMIN o sin el permiso «pos.excepcion_precio» → 403; con ambos → 201.
// La interfaz solo ofrece la excepción a ADMIN con el permiso explícito; el servidor decide siempre.

const tenant = { id: 'tenant-pos-excepcion-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', codigoBarras: null, codigoFabricante: null, descripcion: null,
  categoria: { id: 'c1', nombre: 'Herramientas' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 100, precioCosto: 60,
  margen: null, stockActual: 10, stockReservado: 0, stockDisponible: 10, stockFisico: 10, stockMinimo: 1, activo: true, imagenUrl: null, marca: null, version: 1 };
const MENSAJE_409 = 'El precio cambió; actualice el catálogo o solicite al administrador';
const MENSAJE_403 = 'Cobrar un precio distinto del vigente requiere el permiso explícito de excepción de precio';

type Usuario = { rol: 'ADMIN' | 'CAJERO'; permisos: string[] };
// permisoServidor: lo que el servidor considera asignado (puede diferir de la sesión si se revocó después de iniciarla).
// rechazoForzado: el servidor responde ese error a la excepción aunque el motivo y el permiso sean válidos.
type Sim = { precio: number; ventas: any[]; intentos: any[]; errores: string[]; inesperados: string[]; cortarSinRegistrar: boolean;
  usuario: Usuario; permisoServidor: boolean; rechazoForzado: null | { status: number; message: string } };

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { precio: 100, ventas: [], intentos: [], errores: [], inesperados: [], cortarSinRegistrar: false,
      usuario: { rol: 'ADMIN', permisos: ['pos.excepcion_precio'] }, permisoServidor: true, rechazoForzado: null };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const usuarioSesion = () => ({ id: `user-${sim.usuario.rol}`, nombre: 'Usuario de prueba', email: 'usuario@prueba.invalid', rol: sim.usuario.rol, permisos: sim.usuario.permisos, permisosConfigurados: true });
    const ventaRegistrada = (body: any, n: number) => ({ id: `v-${n}`, numeroVenta: n, subtotal: 100, isv: 15, descuento: 0, total: 115, metodoPago: body.metodoPago, createdAt: new Date().toISOString(), detalles: [], estado: 'COMPLETADA' });
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') { const u = usuarioSesion(); return responder(route, 200, { user: { sub: u.id, tenantId: tenant.id, rol: u.rol, permisos: u.permisos, permisosConfigurados: true, descuentoMaximo: 0 } }); }
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'pos-excepcion-token', user: usuarioSesion(), tenant });
      if (method === 'GET' && path === '/productos/comercial') return responder(route, 200, [{ ...producto, precioVenta: sim.precio }]);
      if (method === 'GET' && path === '/operaciones/caja') return responder(route, 200, [{ id: 'caja-1', codigo: 'CAJA-1', estado: 'ABIERTA', usuario_id: usuarioSesion().id, monto_apertura: 500, efectivo_esperado: 500, totales: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 }, movimientos: [] }]);
      if (method === 'GET' && (path === '/operaciones/proveedores' || path === '/clientes/buscar')) return responder(route, 200, []);
      if (method === 'POST' && path === '/ventas') {
        const body = request.postDataJSON(); sim.intentos.push(body);
        if (sim.cortarSinRegistrar) { await route.abort('connectionreset'); return; }
        if (body.detalles.some((d: any) => d.precioUnitario !== sim.precio)) {
          if (!body.excepcionPrecio) return responder(route, 409, { message: MENSAJE_409 });
          const motivo = typeof body.excepcionPrecio.motivo === 'string' ? body.excepcionPrecio.motivo.trim() : '';
          if (motivo.length < 10 || motivo.length > 300) return responder(route, 400, { message: 'Explique el motivo de la excepción de precio (entre 10 y 300 caracteres)' });
          if (sim.rechazoForzado) return responder(route, sim.rechazoForzado.status, { message: sim.rechazoForzado.message });
          if (sim.usuario.rol !== 'ADMIN' || !sim.permisoServidor) return responder(route, 403, { message: MENSAJE_403 });
        }
        sim.ventas.push(body);
        return responder(route, 201, ventaRegistrada(body, sim.ventas.length));
      }
      if (method === 'GET' && path.startsWith('/ventas/solicitudes/')) {
        const id = path.split('/').pop()!;
        const index = sim.ventas.findIndex(v => v.solicitudId === id);
        return responder(route, 200, index < 0 ? { estado: 'NO_REGISTRADA' } : { estado: 'REGISTRADA', venta: ventaRegistrada(sim.ventas[index], index + 1) });
      }
      // Pantallas de inicio del ADMIN tras el login: no intervienen en la prueba.
      if (method === 'GET') return responder(route, 200, path === '/dashboard' ? { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } } : []);
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
const mantener = (page: Page) => page.getByRole('button', { name: 'Mantener el precio de esta venta (excepción)' });
const pendienteGuardado = (page: Page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith('ferre_pending_sale:'));
  return key ? JSON.parse(localStorage.getItem(key)!) : null;
});

// Venta pendiente con el precio anterior (100) que el servidor rechaza con 409 porque el vigente ya es 120.
async function pendienteRechazadoPorPrecio(page: Page, sim: Sim) {
  await abrirPos(page);
  await page.getByText('Taladro').first().click();
  sim.cortarSinRegistrar = true;
  await cobrar(page).click();
  await expect.poll(() => sim.intentos.length).toBe(1);
  await expect(page.getByText('Había una venta en proceso.')).toBeVisible();
  sim.cortarSinRegistrar = false; sim.precio = 120;
  await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
  await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
  await expect.poll(() => sim.intentos.length).toBe(2);
  await expect(page.getByText(MENSAJE_409)).toBeVisible();
  expect(sim.intentos[1].excepcionPrecio).toBeUndefined();
  await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
}

async function registrarConExcepcion(page: Page, motivo: string) {
  await mantener(page).click();
  const dialogo = page.getByRole('dialog', { name: 'Excepción de precio' });
  await expect(dialogo).toContainText('Taladro');
  await expect(dialogo).toContainText(/en la venta L\.? ?100\.00 · vigente L\.? ?120\.00/);
  await dialogo.getByLabel('Motivo de la excepción').fill(motivo);
  await dialogo.getByRole('button', { name: 'Registrar con excepción' }).click();
}

test.describe('POS: excepción de precio de una venta pendiente (simulado)', () => {
  test('ADMIN con el permiso registra el precio anterior con un motivo; el motivo corto no se envía', async ({ page, sim }) => {
    await pendienteRechazadoPorPrecio(page, sim);
    await mantener(page).click();
    const dialogo = page.getByRole('dialog', { name: 'Excepción de precio' });
    const registrar = dialogo.getByRole('button', { name: 'Registrar con excepción' });
    // 9 caracteres útiles (los espacios no cuentan): no se puede enviar.
    await dialogo.getByLabel('Motivo de la excepción').fill('   corto 12   ');
    await expect(registrar).toBeDisabled();
    await dialogo.getByLabel('Motivo de la excepción').fill('  Precio pactado con el cliente antes del cambio  ');
    await expect(dialogo).toContainText('46/300');
    await registrar.click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.intentos).toHaveLength(3);
    // Misma solicitud, precio anterior y motivo recortado.
    expect(sim.ventas[0].solicitudId).toBe(sim.intentos[0].solicitudId);
    expect(sim.ventas[0].detalles).toEqual([expect.objectContaining({ productoId: 'prod-1', precioUnitario: 100 })]);
    expect(sim.ventas[0].excepcionPrecio).toEqual({ motivo: 'Precio pactado con el cliente antes del cambio' });
    await expect(page.getByText('Venta registrada. Puede imprimir o descargar el comprobante.')).toBeVisible();
  });

  test('si la conexión se corta tras enviar la excepción, el reintento lleva el mismo motivo', async ({ page, sim }) => {
    await pendienteRechazadoPorPrecio(page, sim);
    sim.cortarSinRegistrar = true;
    await registrarConExcepcion(page, 'Cliente pagó el precio anterior');
    await expect.poll(() => sim.intentos.length).toBe(3);
    expect((await pendienteGuardado(page)).excepcionPrecio).toEqual({ motivo: 'Cliente pagó el precio anterior' });
    // Tras recargar, la venta pendiente conserva el motivo y lo muestra.
    sim.cortarSinRegistrar = false;
    await page.reload();
    await expect(page.getByText('Se registrará con excepción de precio. Motivo: «Cliente pagó el precio anterior»')).toBeVisible();
    await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
    await expect(mantener(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.intentos[3].solicitudId).toBe(sim.intentos[0].solicitudId);
    expect(sim.intentos[3].excepcionPrecio).toEqual({ motivo: 'Cliente pagó el precio anterior' });
  });

  for (const caso of [
    { nombre: 'ADMIN sin el permiso', usuario: { rol: 'ADMIN', permisos: ['pos.vender'] } },
    { nombre: 'CAJERO aunque tenga el permiso en su lista', usuario: { rol: 'CAJERO', permisos: ['pos.vender', 'pos.excepcion_precio'] } },
  ] as const) {
    test(`${caso.nombre}: no se ofrece la excepción y la corrección cobra el precio vigente`, async ({ page, sim }) => {
      sim.usuario = { rol: caso.usuario.rol, permisos: [...caso.usuario.permisos] };
      await pendienteRechazadoPorPrecio(page, sim);
      await expect(mantener(page)).toHaveCount(0);
      await expect(page.getByText(/Mantener el precio anterior solo lo puede autorizar un administrador con el permiso de excepción de precio/)).toBeVisible();
      await page.getByRole('button', { name: 'Corregir datos de esta venta' }).click();
      await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
      await expect(page.getByText(/1 x L\.? ?120\.00/)).toBeVisible();
      await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
      await expect.poll(() => sim.ventas.length).toBe(1);
      expect(sim.ventas[0].detalles[0].precioUnitario).toBe(120);
      expect(sim.intentos.every(i => i.excepcionPrecio === undefined)).toBe(true);
    });
  }

  for (const caso of [
    { nombre: '403 (permiso revocado en el servidor)', status: 403, message: MENSAJE_403 },
    { nombre: '400 (motivo rechazado por el servidor)', status: 400, message: 'Explique el motivo de la excepción de precio (entre 10 y 300 caracteres)' },
  ]) {
    test(`un ${caso.nombre} se muestra, no registra y quita el motivo del pendiente`, async ({ page, sim }) => {
      await pendienteRechazadoPorPrecio(page, sim);
      sim.rechazoForzado = { status: caso.status, message: caso.message };
      await registrarConExcepcion(page, 'Precio pactado con el cliente');
      await expect.poll(() => sim.intentos.length).toBe(3);
      await expect(page.getByText(caso.message)).toBeVisible();
      expect(sim.ventas).toEqual([]);
      expect(sim.intentos[2].excepcionPrecio).toEqual({ motivo: 'Precio pactado con el cliente' });
      await expect.poll(async () => (await pendienteGuardado(page))?.excepcionPrecio).toBeUndefined();
      expect((await pendienteGuardado(page)).solicitudId).toBe(sim.intentos[0].solicitudId);
      // Un reintento simple ya no repite la excepción rechazada: el servidor vuelve a exigirla (409).
      sim.rechazoForzado = null;
      await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
      await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
      await expect.poll(() => sim.intentos.length).toBe(4);
      expect(sim.intentos[3].excepcionPrecio).toBeUndefined();
      expect(sim.ventas).toEqual([]);
    });
  }

  test('corregir la venta descarta el motivo y cobra el precio vigente', async ({ page, sim }) => {
    await pendienteRechazadoPorPrecio(page, sim);
    sim.cortarSinRegistrar = true;
    await registrarConExcepcion(page, 'Precio pactado con el cliente');
    await expect.poll(() => sim.intentos.length).toBe(3);
    sim.cortarSinRegistrar = false;
    await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
    await page.getByRole('button', { name: 'Corregir datos de esta venta' }).click();
    await expect.poll(async () => (await pendienteGuardado(page))?.excepcionPrecio).toBeUndefined();
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    await expect(page.getByText(/1 x L\.? ?120\.00/)).toBeVisible();
    await page.getByRole('button', { name: 'Ya revisé el pago: continuar registro' }).click();
    await expect.poll(() => sim.ventas.length).toBe(1);
    expect(sim.ventas[0].detalles[0].precioUnitario).toBe(120);
    expect(sim.ventas[0].excepcionPrecio).toBeUndefined();
  });
});
