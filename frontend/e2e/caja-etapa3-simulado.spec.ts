import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: caja, etapa 3 (decisión del dueño del 2026-11-12).
// Comprueba en la interfaz: cierre ciego para el cajero (sin esperado), conteo y recuento, cierre que espera autorización y se
// consulta con la misma solicitud, saldo trasladado; y para el ADMIN, configuración, decisión de solicitudes y revisión de
// diferencias. Las reglas del servidor están en backend/test/caja-etapa3.postgres.integration.ts.

const tenant = { id: 'tenant-caja3-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
type Sim = {
  rol: 'ADMIN' | 'CAJERO'; requiereCierre: boolean; cierreAprobado: boolean; config: any; llamadas: { method: string; path: string; body: any }[];
  // Apertura: sin caja abierta, con o sin autorización; `perder` aborta la respuesta de los próximos POST (red caída tras enviar).
  sinCaja: boolean; requiereApertura: boolean; aperturaAprobada: boolean; abiertas: number; cerradas: number; perder: number;
  solicitudes: any[]; cierres: any[]; errores: string[]; inesperados: string[];
};
const cajaAbierta = { id: 'caja-1', estado: 'ABIERTA', usuario_id: 'user-CAJERO', fecha_apertura: '2026-11-14T13:00:00Z', monto_apertura: 500,
  movimientos: [{ id: 'm1', tipo: 'VENTA_POS', monto: 115, metodo: 'EFECTIVO', concepto: 'Venta', created_at: '2026-11-14T13:10:00Z' }] };

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { rol: 'CAJERO', requiereCierre: false, cierreAprobado: false, config: { aperturaAutonoma: true, cierreAutonomo: true, umbralAvisoDiferencia: 0 }, llamadas: [], solicitudes: [], cierres: [], errores: [], inesperados: [],
      sinCaja: false, requiereApertura: false, aperturaAprobada: false, abiertas: 0, cerradas: 0, perder: 0 };
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
      const usuario = { id: `user-${sim.rol}`, nombre: sim.rol === 'ADMIN' ? 'Administrador' : 'Cajera', email: 'usuario@prueba.invalid', rol: sim.rol };
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol: sim.rol, permisos: [], permisosConfigurados: false, descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'caja3-token', user: usuario, tenant });
      // Caja abierta de la cajera: vista ciega (solo el fondo) como la entrega el servidor.
      if (method === 'GET' && path === '/operaciones/caja') return responder(route, 200, sim.rol === 'CAJERO' && (!sim.sinCaja || sim.abiertas > 0) && sim.cerradas === 0 ? [{ ...cajaAbierta, resumen: { fondoInicial: 500, ciego: true }, ultimoConteo: null }] : []);
      if (method === 'GET' && path === '/operaciones/caja/apertura') return responder(route, 200, { requiereAutorizacionApertura: sim.requiereApertura, requiereAutorizacionCierre: sim.requiereCierre, saldoTrasladado: null });
      if (method === 'GET' && path === '/operaciones/caja/cierres') return responder(route, 200, sim.cierres);
      if (method === 'GET' && path === '/operaciones/caja/configuracion') return responder(route, 200, sim.config);
      if (method === 'GET' && path === '/autorizaciones') return responder(route, 200, { solicitudes: sim.solicitudes, pendientes: sim.solicitudes.length, page: 1, hayMas: false });
      const body = request.postData() ? request.postDataJSON() : undefined;
      // El servidor procesa la operación, pero la respuesta no llega al navegador.
      const entregar = async (status: number, cuerpo: unknown) => { if (sim.perder > 0) { sim.perder--; await route.abort('failed'); return; } await responder(route, status, cuerpo); };
      if (method === 'POST' && path === '/operaciones/caja/abrir') {
        sim.llamadas.push({ method, path, body });
        if (sim.requiereApertura && !sim.aperturaAprobada) return entregar(201, { estado: 'PENDIENTE_AUTORIZACION', solicitudAutorizacionId: 'sol-ap', monto: body.monto });
        sim.abiertas = 1; // idempotente por solicitudId: repetirla devuelve la misma caja
        return entregar(201, { ...cajaAbierta, monto_apertura: body.monto });
      }
      if (method === 'POST' && path === '/operaciones/caja/caja-1/conteos') {
        sim.llamadas.push({ method, path, body });
        const diferencia = body.monto - 615;
        return responder(route, 201, { conteoId: `k${sim.llamadas.length}`, numero: sim.llamadas.filter(l => l.path.endsWith('/conteos')).length, monto: body.monto, diferencia, resultado: diferencia === 0 ? 'CUADRA' : diferencia < 0 ? 'FALTA' : 'SOBRA' });
      }
      if (method === 'POST' && path === '/operaciones/caja/caja-1/cerrar') {
        sim.llamadas.push({ method, path, body });
        if (sim.requiereCierre && !sim.cierreAprobado) return entregar(201, { estado: 'PENDIENTE_AUTORIZACION', solicitudAutorizacionId: 'sol-1', conteo: { conteoId: 'k', numero: 1, monto: body.monto, diferencia: body.monto - 615, resultado: 'FALTA' } });
        sim.cerradas = 1;
        return entregar(201, { ...cajaAbierta, estado: 'CERRADA', monto_cierre_fisico: body.monto, diferencia: body.monto - 615, monto_trasladado: body.montoTrasladado ?? null });
      }
      if ((method === 'PUT' && path === '/operaciones/caja/configuracion') || (method === 'POST' && /^\/(autorizaciones\/sol-1\/(aprobar|rechazar)|operaciones\/caja\/cerrada-1\/revisar-diferencia)$/.test(path))) {
        sim.llamadas.push({ method, path, body });
        if (method === 'PUT') sim.config = body;
        else if (path.includes('revisar')) sim.cierres = sim.cierres.map(c => ({ ...c, requiere_revision: false, diferencia_revisada_at: '2026-11-14T21:00:00Z', diferencia_revisada_por_nombre: 'Administrador' }));
        else sim.solicitudes = [];
        return responder(route, method === 'PUT' ? 200 : 201, method === 'PUT' ? body : {});
      }
      if (method === 'GET' && /^\/operaciones\/caja\/[^/]+$/.test(path)) return responder(route, 200, { ...cajaAbierta, estado: 'CERRADA', resumen: { fondoInicial: 500, ingresosEfectivo: 115, egresosEfectivo: 0, efectivoEsperado: 615, totalesPorMetodo: { EFECTIVO: 115 } }, monto_cierre_fisico: 600, diferencia: -15 });
      if (method === 'GET') return responder(route, 200, path === '/dashboard' ? { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } } : path === '/dashboard/pendientes' ? { indicadores: [] } : []);
      sim.inesperados.push(`${method} ${path}`);
      await route.abort();
    });
    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API no previstas').toEqual([]);
  }, { auto: true }],
});

async function abrirPantalla(page: Page) {
  await page.goto('/login');
  await page.locator('#login-correo').fill('usuario@prueba.invalid');
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/arqueo-caja');
}
const confirmar = (page: Page) => page.locator('.ferre-alerta-confirmar').click();

test.describe('Caja — etapa 3 (simulado)', () => {
  test('cajero: no ve el esperado; registra conteo y recuento; cierra con motivo y saldo trasladado', async ({ page, sim }) => {
    await abrirPantalla(page);
    await expect(page.getByText(/Cierre ciego/)).toBeVisible();
    await expect(page.locator('.cash-expected')).toHaveCount(0);
    await page.getByLabel('Efectivo contado').fill('600');
    await page.getByRole('button', { name: 'Registrar conteo' }).click();
    await expect(page.getByTestId('caja-resultado-conteo')).toContainText(/Conteo 1: Faltante L\. 15\.00/);
    await page.getByLabel('Efectivo contado').fill('615');
    // Cambiar el monto sin volver a contar no permite cerrar.
    await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeDisabled();
    await page.getByRole('button', { name: 'Registrar conteo' }).click();
    await expect(page.getByTestId('caja-resultado-conteo')).toContainText(/Conteo 2: Cuadra/);
    await page.getByLabel('Saldo que queda para mañana (opcional)').fill('100');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await confirmar(page);
    await expect.poll(() => sim.llamadas.filter(l => l.path.endsWith('/cerrar')).length).toBe(1);
    expect(sim.llamadas.find(l => l.path.endsWith('/cerrar'))!.body).toMatchObject({ monto: 615, montoTrasladado: 100 });
  });

  test('cajero en tienda sin cierre autónomo: queda esperando autorización y consulta con la misma solicitud', async ({ page, sim }) => {
    sim.requiereCierre = true;
    await abrirPantalla(page);
    await expect(page.getByText('Esta tienda requiere autorización del administrador para cerrar caja.')).toBeVisible();
    await page.getByLabel('Efectivo contado').fill('600');
    await page.getByRole('button', { name: 'Registrar conteo' }).click();
    await page.getByLabel('Explique la diferencia').fill('Faltan 15 por vuelto');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await confirmar(page);
    await expect(page.getByTestId('caja-esperando-autorizacion')).toContainText('Cierre pendiente de autorización del administrador.');
    sim.cierreAprobado = true;
    await page.getByRole('button', { name: 'Consultar de nuevo' }).click();
    await expect(page.getByTestId('caja-esperando-autorizacion')).toHaveCount(0);
    const cierres = sim.llamadas.filter(l => l.path.endsWith('/cerrar'));
    expect(cierres).toHaveLength(2);
    expect(cierres[1].body).toEqual(cierres[0].body);
  });

  test('ADMIN: guarda la configuración, autoriza una solicitud de caja y marca revisada una diferencia', async ({ page, sim }) => {
    sim.rol = 'ADMIN';
    sim.solicitudes = [{ id: 'sol-1', tipo: 'CIERRE_CAJA', estado: 'PENDIENTE', solicitante: 'Cajera', solicitadaAt: '2026-11-14T20:00:00Z', resumen: { monto: 600, diferencia: -15, motivo: 'Faltan 15 por vuelto' } }];
    sim.cierres = [{ id: 'cerrada-1', estado: 'CERRADA', usuario_nombre: 'Cajera', fecha_apertura: '2026-11-14T13:00:00Z', monto_esperado: 615, monto_cierre_fisico: 600, diferencia: -15, requiere_revision: true, diferencia_revisada_at: null }];
    await abrirPantalla(page);
    await page.getByLabel('El cajero puede cerrar caja sin autorización').uncheck();
    await page.getByLabel('Avisar diferencias de cierre desde (L)').fill('10');
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect.poll(() => sim.llamadas.find(l => l.method === 'PUT')?.body).toEqual({ aperturaAutonoma: true, cierreAutonomo: false, umbralAvisoDiferencia: 10 });
    const solicitud = page.getByTestId('solicitud-caja-sol-1');
    await expect(solicitud).toContainText('Faltan 15 por vuelto');
    await solicitud.getByRole('button', { name: 'Autorizar' }).click();
    await expect.poll(() => sim.llamadas.some(l => l.path === '/autorizaciones/sol-1/aprobar')).toBe(true);
    await expect(page.getByText('Diferencia por revisar')).toBeVisible();
    await page.getByRole('button', { name: 'Marcar revisada' }).click();
    await expect(page.getByText('Revisada por Administrador')).toBeVisible();
  });
  // Auditoría de #248 (P2): una respuesta perdida seguida de un reintento que el servidor responde «pendiente de autorización»
  // no puede anunciarse como apertura o cierre hechos; la espera se conserva (también tras recargar y ante otro fallo de red) y
  // la operación se completa una sola vez, con la misma solicitud.
  test('apertura con autorización: respuesta perdida → reintento pendiente → recarga → aprobación → una sola apertura', async ({ page, sim }) => {
    sim.sinCaja = true; sim.requiereApertura = true; sim.perder = 1;
    await abrirPantalla(page);
    await page.getByLabel('Fondo inicial').fill('300');
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    await page.getByRole('button', { name: 'Reintentar operación pendiente' }).click();
    const espera = page.getByTestId('caja-esperando-autorizacion');
    await expect(espera).toContainText('Apertura pendiente de autorización del administrador.');
    await expect(page.getByText('Caja abierta.', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(espera).toContainText('Apertura pendiente de autorización del administrador.');
    // Un fallo de red al consultar no suelta la espera.
    sim.perder = 1;
    await page.getByRole('button', { name: 'Consultar de nuevo' }).click();
    await expect(espera).toBeVisible();
    sim.aperturaAprobada = true;
    await page.getByRole('button', { name: 'Consultar de nuevo' }).click();
    await expect(espera).toHaveCount(0);
    await expect(page.getByText('Caja abierta.', { exact: true })).toBeVisible();
    const aperturas = sim.llamadas.filter(l => l.path.endsWith('/abrir'));
    expect(aperturas.length).toBeGreaterThanOrEqual(3);
    expect(new Set(aperturas.map(l => l.body.solicitudId)).size).toBe(1);
    expect(sim.abiertas).toBe(1);
  });

  test('cierre con autorización: respuesta perdida → reintento pendiente → recarga → aprobación → un solo cierre y recibo al final', async ({ page, sim }) => {
    sim.requiereCierre = true; sim.perder = 1;
    await abrirPantalla(page);
    await page.getByLabel('Efectivo contado').fill('600');
    await page.getByRole('button', { name: 'Registrar conteo' }).click();
    await page.getByLabel('Explique la diferencia').fill('Faltan 15 por vuelto');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await confirmar(page);
    await page.getByRole('button', { name: 'Reintentar operación pendiente' }).click();
    const espera = page.getByTestId('caja-esperando-autorizacion');
    await expect(espera).toContainText('Cierre pendiente de autorización del administrador.');
    await expect(page.getByText('Caja cerrada.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Comprobante de cierre')).toHaveCount(0);
    await page.reload();
    await expect(espera).toContainText('Cierre pendiente de autorización del administrador.');
    sim.perder = 1;
    await page.getByRole('button', { name: 'Consultar de nuevo' }).click();
    await expect(espera).toBeVisible();
    sim.cierreAprobado = true;
    await page.getByRole('button', { name: 'Consultar de nuevo' }).click();
    await expect(espera).toHaveCount(0);
    await expect(page.getByText('Comprobante de cierre')).toBeVisible();
    const cierres = sim.llamadas.filter(l => l.path.endsWith('/cerrar'));
    expect(cierres.length).toBeGreaterThanOrEqual(3);
    for (const c of cierres) expect(c.body).toEqual(cierres[0].body);
    expect(sim.cerradas).toBe(1);
  });
});
