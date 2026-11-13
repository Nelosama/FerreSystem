import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: autorización de descuentos en cotizaciones (decisión del dueño del 2026-11-12).
// El servidor real (cotizaciones.service.ts, autorizaciones.service.ts) es quien bloquea; aquí se comprueba que la
// pantalla muestra el estado, no ofrece convertir sin aprobación, que abrir la solicitud no la aprueba y que cada botón
// llama al endpoint correcto. Las reglas del servidor las cubre test/autorizacion-descuento-cotizaciones.postgres.integration.ts.

const tenant = { id: 'tenant-cot-descuento-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
type EstadoAut = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'NO_REQUERIDA';
type Sim = { rol: 'ADMIN' | 'CAJERO'; estado: EstadoAut; llamadas: { method: string; path: string; body: any }[]; errores: string[]; inesperados: string[] };

const autorizacion = (estado: EstadoAut) => estado === 'NO_REQUERIDA'
  ? { requerida: false, estado, solicitudId: null, solicitanteId: null, solicitante: null, solicitadaAt: null, decisor: null, decididaAt: null, motivoDecision: null }
  : { requerida: true, estado, solicitudId: 'sol-1', solicitanteId: 'user-cajero', solicitante: 'Cajera de prueba', solicitadaAt: '2026-11-13T15:00:00.000Z',
    decisor: estado === 'PENDIENTE' ? null : 'Administrador de prueba', decididaAt: estado === 'PENDIENTE' ? null : '2026-11-13T15:05:00.000Z', motivoDecision: estado === 'RECHAZADA' ? 'Margen insuficiente' : null };

const cotizacion = (estado: EstadoAut) => {
  const descuento = estado === 'NO_REQUERIDA' ? 0 : 20;
  return {
    id: 'cot-1', numeroCotizacion: 9, clienteNombre: 'Cliente obra', createdAt: '2026-11-13T15:00:00.000Z', fechaValidez: '2099-12-31T00:00:00.000Z',
    diasValidez: 15, subtotal: 250 - descuento, descuentoGeneral: 0, porcentajeIsv: 15, isv: (250 - descuento) * 0.15, descuento, total: (250 - descuento) * 1.15,
    estado: 'ENVIADA', notas: '', autorizacionDescuento: autorizacion(estado),
    detalles: [{ id: 'det-1', productoId: 'prod-1', codigoProducto: 'M-1', descripcionProducto: 'Martillo', unidadMedida: 'UNIDAD', usaMedida: false,
      cantidad: 2, medida: 1, totalMedida: 2, precioLista: 100, precioUnitario: 100, descuento, tipoDescuento: 'MONTO', exento: false, subtotal: 200 - descuento, isv: 0, totalLinea: 0 }],
  };
};

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { rol: 'ADMIN', estado: 'PENDIENTE', llamadas: [], errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const usuario = () => sim.rol === 'ADMIN'
      ? { id: 'user-admin', nombre: 'Administrador de prueba', email: 'admin@prueba.invalid', rol: 'ADMIN', permisos: [], permisosConfigurados: false }
      : { id: 'user-cajero', nombre: 'Cajera de prueba', email: 'cajera@prueba.invalid', rol: 'CAJERO', permisos: [], permisosConfigurados: false };
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') { const u = usuario(); return responder(route, 200, { user: { sub: u.id, tenantId: tenant.id, rol: u.rol, permisos: [], permisosConfigurados: false, descuentoMaximo: 0 } }); }
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'cot-descuento-token', user: usuario(), tenant });
      if (method === 'GET' && path === '/cotizaciones') return responder(route, 200, [cotizacion(sim.estado)]);
      if (method === 'GET' && path === '/productos') return responder(route, 200, []);
      const body = request.postData() ? request.postDataJSON() : undefined;
      if (method === 'POST' && ['/autorizaciones/sol-1/aprobar', '/autorizaciones/sol-1/rechazar', '/autorizaciones/sol-1/cancelar', '/cotizaciones/cot-1/quitar-descuento', '/cotizaciones/cot-1/autorizacion-descuento'].includes(path)) {
        sim.llamadas.push({ method, path, body });
        sim.estado = path.endsWith('aprobar') ? 'APROBADA' : path.endsWith('rechazar') ? 'RECHAZADA' : path.endsWith('autorizacion-descuento') ? 'PENDIENTE' : 'NO_REQUERIDA';
        return responder(route, 201, {});
      }
      if (method === 'GET') return responder(route, 200, path === '/dashboard' ? { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } } : path === '/dashboard/pendientes' ? { indicadores: [] } : []);
      sim.inesperados.push(`${method} ${path}`);
      await route.abort();
    });
    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API no previstas').toEqual([]);
  }, { auto: true }],
});

async function abrirCotizaciones(page: Page, correo: string) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(correo);
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/cotizaciones');
  await expect(page.getByText('Cliente obra')).toBeVisible();
}

const convertir = (page: Page) => page.getByTitle('Convertir a Factura/Venta POS');
const insignia = (page: Page) => page.getByTestId('autorizacion-descuento-cot-1');
const dialogo = (page: Page) => page.getByRole('dialog');

test.describe('Cotizaciones: autorización de descuentos (simulado)', () => {
  test('ADMIN: descuento pendiente sin botón de convertir; abrir la solicitud no la aprueba; aprobar con motivo opcional', async ({ page, sim }) => {
    await abrirCotizaciones(page, 'admin@prueba.invalid');
    await expect(page.getByText(/Descuentos por autorizar: 1/)).toBeVisible();
    await expect(insignia(page)).toHaveText(/Descuento por autorizar/);
    await expect(convertir(page)).toHaveCount(0);
    await insignia(page).click();
    await expect(dialogo(page)).toContainText('Solicitado por Cajera de prueba');
    await expect(dialogo(page)).toContainText('Martillo');
    expect(sim.llamadas, 'Abrir la solicitud no debe decidirla').toEqual([]);
    await dialogo(page).getByLabel('Motivo (opcional)').fill('Cliente frecuente');
    await dialogo(page).getByRole('button', { name: 'Aprobar descuento' }).click();
    await expect.poll(() => sim.llamadas.length).toBe(1);
    expect(sim.llamadas[0]).toMatchObject({ path: '/autorizaciones/sol-1/aprobar', body: { motivo: 'Cliente frecuente' } });
    await expect(insignia(page)).toHaveText(/Descuento autorizado/);
    await expect(convertir(page)).toHaveCount(1);
  });

  test('ADMIN rechaza sin motivo: el cuerpo va vacío y la cotización sigue sin poder convertirse', async ({ page, sim }) => {
    await abrirCotizaciones(page, 'admin@prueba.invalid');
    await insignia(page).click();
    await dialogo(page).getByRole('button', { name: 'Rechazar' }).click();
    await expect.poll(() => sim.llamadas.length).toBe(1);
    expect(sim.llamadas[0]).toMatchObject({ path: '/autorizaciones/sol-1/rechazar', body: {} });
    await expect(insignia(page)).toHaveText(/Descuento rechazado/);
    await expect(convertir(page)).toHaveCount(0);
  });

  test('CAJERO: no puede aprobar; cancela la solicitud y la cotización queda al precio original, lista para convertir', async ({ page, sim }) => {
    sim.rol = 'CAJERO';
    await abrirCotizaciones(page, 'cajera@prueba.invalid');
    await expect(page.getByText(/Descuentos por autorizar/)).toHaveCount(0);
    await expect(convertir(page)).toHaveCount(0);
    await insignia(page).click();
    await expect(dialogo(page).getByRole('button', { name: 'Aprobar descuento' })).toHaveCount(0);
    await expect(dialogo(page)).toContainText('Solo un administrador puede aprobar o rechazar.');
    await dialogo(page).getByRole('button', { name: 'Cancelar solicitud' }).click();
    await page.locator('.ferre-alerta-confirmar').click();
    await expect.poll(() => sim.llamadas.length).toBe(1);
    expect(sim.llamadas[0].path).toBe('/autorizaciones/sol-1/cancelar');
    await expect(insignia(page)).toHaveCount(0);
    await expect(convertir(page)).toHaveCount(1);
  });

  test('CAJERO con descuento rechazado: puede volver a solicitarlo o quitarlo', async ({ page, sim }) => {
    sim.rol = 'CAJERO'; sim.estado = 'RECHAZADA';
    await abrirCotizaciones(page, 'cajera@prueba.invalid');
    await insignia(page).click();
    await expect(dialogo(page)).toContainText('Margen insuficiente');
    await dialogo(page).getByRole('button', { name: 'Solicitar autorización' }).click();
    await expect.poll(() => sim.llamadas.length).toBe(1);
    expect(sim.llamadas[0].path).toBe('/cotizaciones/cot-1/autorizacion-descuento');
    await expect(insignia(page)).toHaveText(/Descuento por autorizar/);
  });
});
