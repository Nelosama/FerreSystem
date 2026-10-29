import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: conversión de una cotización con un precio distinto del vigente.
// Misma política que el POS (backend/src/ventas/politica-precio.ts, cotizaciones.service.ts): sin excepción → 409;
// motivo fuera de 10-300 → 400; sin rol ADMIN o sin el permiso «pos.excepcion_precio» → 403; con ambos → 201.

const tenant = { id: 'tenant-cot-excepcion-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const MENSAJE_409 = 'El precio cambió; actualice el catálogo o solicite al administrador';
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', descripcion: null, categoria: { nombre: 'Herramientas' }, precioVenta: 100, precioCosto: 60,
  stockActual: 10, stockDisponible: 10, stockMinimo: 1, unidadMedida: 'UNIDAD', usaMedida: false, activo: true };
const cotizacion = (precioUnitario: number) => ({ id: 'cot-1', numeroCotizacion: 7, clienteNombre: 'Cliente de prueba', createdAt: '2026-10-20T15:00:00.000Z',
  fechaValidez: '2099-12-31T00:00:00.000Z', diasValidez: 15, subtotal: precioUnitario, descuentoGeneral: 0, porcentajeIsv: 15, isv: precioUnitario * 0.15,
  descuento: 0, total: precioUnitario * 1.15, estado: 'APROBADA', notas: '',
  detalles: [{ id: 'det-1', productoId: 'prod-1', codigoProducto: 'TAL-1', descripcionProducto: 'Taladro', unidadMedida: 'UNIDAD', usaMedida: false,
    cantidad: 1, medida: 1, totalMedida: 1, precioLista: 100, precioUnitario, descuento: 0, exento: false, subtotal: precioUnitario, isv: 0, totalLinea: precioUnitario }] });

type Sim = { permisos: string[]; permisoServidor: boolean; precioCotizado: number; precioCatalogo: number; conversiones: any[]; errores: string[]; inesperados: string[] };

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { permisos: ['pos.excepcion_precio'], permisoServidor: true, precioCotizado: 90, precioCatalogo: 100, conversiones: [], errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const usuario = () => ({ id: 'user-admin', nombre: 'Administrador de prueba', email: 'admin@prueba.invalid', rol: 'ADMIN', permisos: sim.permisos, permisosConfigurados: true });
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') { const u = usuario(); return responder(route, 200, { user: { sub: u.id, tenantId: tenant.id, rol: u.rol, permisos: u.permisos, permisosConfigurados: true, descuentoMaximo: 100 } }); }
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'cot-excepcion-token', user: usuario(), tenant });
      if (method === 'GET' && path === '/cotizaciones') return responder(route, 200, [cotizacion(sim.precioCotizado)]);
      if (method === 'GET' && path === '/productos') return responder(route, 200, [{ ...producto, precioVenta: sim.precioCatalogo }]);
      if (method === 'POST' && path === '/cotizaciones/cot-1/convertir') {
        const body = request.postDataJSON(); sim.conversiones.push(body);
        if (sim.precioCotizado !== sim.precioCatalogo) {
          if (!body.excepcionPrecio) return responder(route, 409, { message: MENSAJE_409 });
          const motivo = String(body.excepcionPrecio.motivo ?? '').trim();
          if (motivo.length < 10 || motivo.length > 300) return responder(route, 400, { message: 'Explique el motivo de la excepción de precio (entre 10 y 300 caracteres)' });
          if (!sim.permisoServidor) return responder(route, 403, { message: 'Cobrar un precio distinto del vigente requiere el permiso explícito de excepción de precio' });
        }
        return responder(route, 201, { id: 'venta-1', numeroVenta: 1 });
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

async function abrirConversion(page: Page) {
  await page.goto('/login');
  await page.locator('#login-correo').fill('admin@prueba.invalid');
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/cotizaciones');
  await page.getByTitle('Convertir a Factura/Venta POS').first().click();
  await expect(page.getByText('CONVERTIR COTIZACIÓN A VENTA POS')).toBeVisible();
}

const confirmar = (page: Page) => page.getByRole('button', { name: 'CONFIRMAR Y CONVERTIR A VENTA' });

test.describe('Cotizaciones: excepción de precio al convertir (simulado)', () => {
  test('ADMIN con el permiso ve la diferencia, debe dar un motivo válido y la conversión lo envía', async ({ page, sim }) => {
    await abrirConversion(page);
    await expect(page.getByText(/Taladro: cotizado L\.? ?90\.00 · vigente L\.? ?100\.00/)).toBeVisible();
    await expect(confirmar(page)).toBeDisabled();
    const motivo = page.getByLabel('Motivo de la excepción de precio (quedará auditado)');
    await motivo.fill('corto');
    await expect(confirmar(page)).toBeDisabled();
    await motivo.fill('  Precio negociado en la cotización  ');
    await expect(confirmar(page)).toBeEnabled();
    await confirmar(page).click();
    await expect.poll(() => sim.conversiones.length).toBe(1);
    expect(sim.conversiones[0]).toEqual({ metodoPago: 'EFECTIVO', excepcionPrecio: { motivo: 'Precio negociado en la cotización' } });
    await expect(page.getByText(/convertida a Venta/)).toBeVisible();
  });

  test('ADMIN sin el permiso no puede dar motivo; el servidor responde 409 y la cotización sigue sin convertir', async ({ page, sim }) => {
    sim.permisos = ['cotizaciones.convertir_venta'];
    await abrirConversion(page);
    await expect(page.getByLabel(/Motivo de la excepción de precio/)).toHaveCount(0);
    await expect(page.getByText(/solo lo puede autorizar un administrador con el permiso de excepción de precio/)).toBeVisible();
    await confirmar(page).click();
    await expect.poll(() => sim.conversiones.length).toBe(1);
    expect(sim.conversiones[0].excepcionPrecio).toBeUndefined();
    await expect(page.getByText(MENSAJE_409).first()).toBeVisible();
    await expect(page.getByText('CONVERTIR COTIZACIÓN A VENTA POS')).toBeVisible();
  });

  test('el catálogo cargado aún coincide pero el servidor rechaza con 409: se pide el motivo y el reintento lo envía', async ({ page, sim }) => {
    sim.precioCotizado = 100;
    await abrirConversion(page);
    await expect(page.getByLabel(/Motivo de la excepción de precio/)).toHaveCount(0);
    // El administrador cambió el precio vigente después de cargar la pantalla.
    sim.precioCatalogo = 110;
    await confirmar(page).click();
    await expect.poll(() => sim.conversiones.length).toBe(1);
    await expect(page.getByText(MENSAJE_409).first()).toBeVisible();
    const motivo = page.getByLabel('Motivo de la excepción de precio (quedará auditado)');
    await expect(motivo).toBeVisible();
    await expect(confirmar(page)).toBeDisabled();
    await motivo.fill('Se respeta el precio cotizado al cliente');
    await confirmar(page).click();
    await expect.poll(() => sim.conversiones.length).toBe(2);
    expect(sim.conversiones[1].excepcionPrecio).toEqual({ motivo: 'Se respeta el precio cotizado al cliente' });
    await expect(page.getByText(/convertida a Venta/)).toBeVisible();
  });

  test('un 403 del servidor (permiso revocado) se muestra y la cotización sigue sin convertir', async ({ page, sim }) => {
    sim.permisoServidor = false;
    await abrirConversion(page);
    await page.getByLabel('Motivo de la excepción de precio (quedará auditado)').fill('Precio negociado en la cotización');
    await confirmar(page).click();
    await expect.poll(() => sim.conversiones.length).toBe(1);
    await expect(page.getByText('Cobrar un precio distinto del vigente requiere el permiso explícito de excepción de precio').first()).toBeVisible();
    await expect(page.getByText('CONVERTIR COTIZACIÓN A VENTA POS')).toBeVisible();
  });
});
