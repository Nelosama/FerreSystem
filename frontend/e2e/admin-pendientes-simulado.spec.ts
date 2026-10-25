import { expect, test, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: contadores del inicio (GET /dashboard/pendientes), navegación a cada pantalla,
// cuatro acciones como máximo, estados de carga/error/sin pendientes, ES/EN, acceso a «Ventas sin conexión»
// en SIDEBAR y TOPNAV, la acción «Marcar como revisada» y las cuatro secciones de Configuración del negocio.
// Las cifras y la autorización reales se prueban en backend/test/dashboard.postgres.integration.ts.

const MODULOS = ['pos', 'cotizaciones', 'inventario', 'levantamiento', 'ordenes_compra', 'usuarios', 'reportes', 'clientes', 'arqueo_caja', 'configuracion'];

type Opciones = {
  rol?: string;
  modo?: 'SIDEBAR' | 'TOPNAV';
  idioma?: 'es' | 'en';
  modulos?: string[];
  pendientes?: { status: number; body: unknown; demoraMs?: number };
  operaciones?: unknown[];
  ajustes?: Record<string, unknown>;
};
type Registro = { resoluciones: { accion: string; nota: string }[]; pendientes: number; errores: string[] };

const indicadores = (valores: Record<string, number>) => ({
  generadoAt: new Date().toISOString(),
  indicadores: Object.entries(valores).map(([clave, cantidad]) => ({
    clave, cantidad, alcance: 'NEGOCIO',
    ruta: { contingencia_revision: '/contingencia-admin', precios_pendientes: '/precios', entregas_pendientes: '/entregas', cotizaciones_vencen_hoy: '/cotizaciones', stock_bajo_minimo: '/inventario' }[clave],
  })),
});

const dashboard = {
  ventasDelDia: { total: 1500, cantidad: 3, variacionPorcentaje: 25 },
  alertasStock: { cantidad: 1, items: [{ id: 'p1', codigo: 'T1', nombre: 'Tubo PVC', stockActual: 2, stockMinimo: 5, unidadMedida: 'UNIDAD' }] },
  cotizacionesPendientes: { cantidad: 4, porVencerHoy: 1 },
  tendenciaSemanal: [], ultimasVentas: [],
};

async function preparar(page: Page, baseURL: string | undefined, o: Opciones = {}): Promise<Registro> {
  const rol = o.rol ?? 'ADMIN';
  const company = { id: 'pend-company', nombreComercial: 'Ferretería Pendientes', colorPrimario: '#1D4ED8', modoNavegacion: o.modo ?? 'SIDEBAR', idioma: o.idioma ?? 'es', modulosHabilitados: o.modulos ?? MODULOS, ...o.ajustes };
  const user = { id: `u-${rol}`, nombre: 'Ana', rol, permisos: [] };
  const registro: Registro = { resoluciones: [], pendientes: 0, errores: [] };
  page.on('pageerror', e => registro.errores.push(e.message));
  await page.addInitScript(({ company, user }) => {
    if (!localStorage.getItem('ferre_user')) {
      localStorage.setItem('ferre_user', JSON.stringify(user));
      localStorage.setItem('ferre_tenant', JSON.stringify(company));
      localStorage.setItem('ferre_token', 'test-only');
      localStorage.setItem('ferre_language', 'es');
    }
  }, { company, user });
  const origen = new URL(baseURL!).origin;
  const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
    const path = url.pathname.slice(4);
    const method = request.method();
    if (path === '/tenant/settings' || /^\/admin\/tenants\/[^/]+\/settings$/.test(path)) return responder(route, 200, company);
    if (/\/logo$/.test(path)) return responder(route, 404, {});
    if (path === '/auth/me') return responder(route, 200, { user: { ...user, sub: user.id, tenantId: company.id, type: rol === 'SUPERADMIN' ? 'super_admin' : 'tenant' } });
    if (path === '/dashboard') return responder(route, 200, dashboard);
    if (path === '/dashboard/pendientes') {
      registro.pendientes++;
      const p = o.pendientes ?? { status: 200, body: indicadores({ contingencia_revision: 1, precios_pendientes: 3, entregas_pendientes: 2, cotizaciones_vencen_hoy: 0, stock_bajo_minimo: 0 }) };
      if (p.demoraMs) await new Promise(r => setTimeout(r, p.demoraMs));
      return responder(route, p.status, p.body);
    }
    if (path === '/contingencia/configuracion') return responder(route, 200, { habilitada: true, entornoHabilitado: true });
    if (path === '/contingencia/resumen') return responder(route, 200, { fecha: '2026-10-18', generadoAt: new Date().toISOString(), aviso: null, ventasDelDia: [], contingencia: {}, dispositivos: [] });
    if (path === '/contingencia/operaciones') return responder(route, 200, o.operaciones ?? []);
    if (method === 'POST' && /^\/contingencia\/operaciones\/[^/]+\/resolver$/.test(path)) {
      registro.resoluciones.push(request.postDataJSON());
      return responder(route, 201, {});
    }
    return responder(route, 200, method === 'GET' ? [] : {});
  });
  return registro;
}

// Abre cada panel de los rails (administrador y cajero) y reúne todos sus enlaces: ausente de verdad, no solo plegado.
async function enlacesDeTodosLosPaneles(page: Page) {
  const rail = page.locator('nav.app-rail');
  await expect(rail).toBeVisible();
  const reunidos = new Set<string>(await rail.locator('a[href]').evaluateAll(links => links.map(a => a.getAttribute('href') || '')));
  const botones = rail.locator('button.app-rail-item');
  for (let i = 0; i < await botones.count(); i++) {
    await botones.nth(i).click();
    for (const href of await rail.locator('.app-rail-panel a[href]').evaluateAll(links => links.map(a => a.getAttribute('href') || ''))) reunidos.add(href);
    await botones.nth(i).click();
  }
  return [...reunidos];
}

test.describe('Inicio del administrador: pendientes reales', () => {
  test('muestra las cifras del servidor, agrupa lo que está al día y cada fila conduce a su pantalla', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/');
    const seccion = page.locator('section.admin-home__pendientes');
    await expect(seccion.getByRole('link', { name: 'Precios por aprobar: 3' })).toBeVisible();
    await expect(seccion.getByRole('link', { name: 'Entregas pendientes: 2' })).toBeVisible();
    await expect(seccion.getByRole('link', { name: 'Operaciones sin conexión en revisión: 1' })).toHaveAttribute('href', '/contingencia-admin');
    // Prioridad del servidor: lo que bloquea dinero primero.
    expect(await seccion.locator('[data-pendiente]').evaluateAll(els => els.map(e => e.getAttribute('data-pendiente')))).toEqual(['contingencia_revision', 'precios_pendientes', 'entregas_pendientes']);
    await expect(seccion).toContainText('Al día: Cotizaciones por vencer · Stock bajo');
    await seccion.getByRole('link', { name: 'Precios por aprobar: 3' }).click();
    await expect(page).toHaveURL(/\/precios$/);
    await page.goBack();
    await seccion.getByRole('link', { name: 'Entregas pendientes: 2' }).click();
    await expect(page).toHaveURL(/\/entregas$/);
    expect(r.errores).toEqual([]);
  });

  test('como máximo cuatro acciones principales, sin botones redundantes y con la cifra de cotizaciones', async ({ page, baseURL }) => {
    await preparar(page, baseURL);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
    const acciones = page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link');
    expect(await acciones.count()).toBeLessThanOrEqual(4);
    expect(await acciones.count()).toBeGreaterThan(0);
    const destinos = await acciones.evaluateAll(a => a.map(x => x.getAttribute('href')));
    expect(new Set(destinos).size).toBe(destinos.length);
    // El total de cotizaciones pendientes no se pierde: queda en su acción, que lleva a la pantalla de cotizaciones.
    await expect(page.locator('[data-accion="cotizaciones"]')).toHaveAttribute('href', '/cotizaciones');
    await expect(page.locator('[data-accion="cotizaciones"]')).toContainText(/pendiente\(s\) · \d+ vence\(n\) hoy/);
    await expect(page.getByRole('button', { name: /Actualizar/ })).toHaveCount(0);
  });

  test('carga: no muestra ceros mientras el servidor no responde', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { pendientes: { status: 200, body: indicadores({ precios_pendientes: 0 }), demoraMs: 2500 } });
    await page.goto('/');
    const seccion = page.locator('section.admin-home__pendientes');
    await expect(seccion).toHaveAttribute('data-estado', 'cargando');
    await expect(seccion.getByRole('status')).toHaveText('Consultando pendientes…');
    await expect(seccion.locator('.admin-home__contador')).toHaveCount(0);
    await expect(seccion).toHaveAttribute('data-estado', 'al_dia', { timeout: 10_000 });
    await expect(seccion).toContainText('Todo al día: el servidor confirma que no hay pendientes.');
  });

  test('error: avisa sin cifras y una respuesta malformada no se toma como «sin pendientes»', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { pendientes: { status: 500, body: { message: 'fallo simulado' } } });
    await page.goto('/');
    const seccion = page.locator('section.admin-home__pendientes');
    await expect(seccion.getByRole('alert')).toContainText('No se pudieron consultar los pendientes');
    await expect(seccion.locator('.admin-home__contador')).toHaveCount(0);
    await expect(seccion).not.toContainText('Todo al día');
  });

  test('respuesta malformada: estado de error', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { pendientes: { status: 200, body: [] } });
    await page.goto('/');
    await expect(page.locator('section.admin-home__pendientes')).toHaveAttribute('data-estado', 'error');
  });

  test('inglés: el inicio y los pendientes se traducen', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { idioma: 'en' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hello, Ana' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Prices to approve: 3' })).toBeVisible();
    await expect(page.getByText("Today's sales (net of returns)")).toBeVisible();
    await expect(page.getByText('Up to date: Quotes expiring · Low stock')).toBeVisible();
  });

  test.describe('tableta y móvil', () => {
    for (const viewport of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      test(`${viewport.width}px: pendientes visibles y sin desbordamiento horizontal`, async ({ page, baseURL }) => {
        await page.setViewportSize(viewport);
        await preparar(page, baseURL);
        await page.goto('/');
        await expect(page.getByRole('link', { name: 'Precios por aprobar: 3' })).toBeVisible();
        const desbordamiento = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(desbordamiento).toBeLessThanOrEqual(0);
      });
    }
  });
});

test.describe('Ventas sin conexión: acceso desde el rail y permisos', () => {
  test('ADMIN accede desde el rail', async ({ page, baseURL }) => {
    await preparar(page, baseURL);
    await page.goto('/');
    // En el rail del administrador, «Ventas sin conexión» vive en el panel «Ventas».
    await page.locator('nav.admin-rail').getByRole('button', { name: 'Ventas', exact: true }).click();
    const enlace = page.locator('#app-rail-panel-ventas a[href="/contingencia-admin"]');
    await expect(enlace).toHaveText(/Ventas sin conexión/);
    await enlace.click();
    await expect(page.getByRole('heading', { name: /Contingencia offline/ })).toBeVisible();
  });

  test('con el valor histórico TOPNAV el acceso es el mismo: el rail es la única navegación', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { modo: 'TOPNAV' });
    await page.goto('/');
    await expect(page.locator('header.jowa-topnav')).toHaveCount(0);
    await page.locator('nav.admin-rail').getByRole('button', { name: 'Ventas', exact: true }).click();
    await page.locator('#app-rail-panel-ventas a[href="/contingencia-admin"]').click();
    await expect(page).toHaveURL(/\/contingencia-admin$/);
  });

  test('sin módulo POS o con otro rol no aparece en ningún menú', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { modulos: MODULOS.filter(m => m !== 'pos') });
    await page.goto('/');
    await expect(page.locator('a[href="/contingencia-admin"]')).toHaveCount(0);
    expect(await enlacesDeTodosLosPaneles(page)).not.toContain('/contingencia-admin');
  });

  test('CAJERO no ve la revisión offline', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { rol: 'CAJERO' });
    await page.goto('/');
    await expect(page.locator('a[href="/contingencia-admin"]')).toHaveCount(0);
    expect(await enlacesDeTodosLosPaneles(page)).not.toContain('/contingencia-admin');
  });

  test('una venta aplicada con observación se puede marcar como revisada con la acción existente', async ({ page, baseURL }) => {
    const operacion = {
      operacionId: '00000000-0000-4000-8000-0000000000b2', estado: 'APLICADA', requiereRevision: true, conflictos: [{ codigo: 'RELOJ_ANOMALO' }],
      correlativoLocal: 'CT-01-0007', correlativoDefinitivo: 'V-00000007', numeroVenta: 7, cajero: 'Carla', dispositivo: '01',
      totalCentavos: 1000, efectivoRecibidoCentavos: 1000, cambioCentavos: 0, ocurridoAt: new Date().toISOString(), recibidoAt: new Date().toISOString(),
      referenciaFacturaExterna: null, inventarioPendiente: [],
    };
    const r = await preparar(page, baseURL, { operaciones: [operacion] });
    await page.goto('/contingencia-admin');
    const tarjeta = page.getByRole('article', { name: 'Operación CT-01-0007' });
    // Una venta ya aplicada nunca ofrece aceptar ni cerrar sin venta.
    await expect(tarjeta.getByRole('button', { name: 'Aceptar y aplicar' })).toHaveCount(0);
    await tarjeta.getByLabel(/Nota de la decisión/).fill('Hora del equipo revisada con el cajero');
    await tarjeta.getByRole('button', { name: 'Marcar como revisada' }).click();
    await expect.poll(() => r.resoluciones.length).toBe(1);
    expect(r.resoluciones[0]).toMatchObject({ accion: 'MARCAR_REVISADA', nota: 'Hora del equipo revisada con el cajero' });
  });

  test('la lista distingue carga de «sin operaciones»', async ({ page, baseURL }) => {
    await preparar(page, baseURL, { operaciones: [] });
    await page.goto('/contingencia-admin');
    await expect(page.getByText('No hay operaciones pendientes de revisión.')).toBeVisible();
  });
});

test('Configuración del negocio: tres secciones, sin selector de navegación, solo Super Admin y compatible con configuraciones antiguas', async ({ page, baseURL }) => {
  await preparar(page, baseURL, { rol: 'SUPERADMIN', ajustes: { configuracion: { templateVersion: 'v2', estiloVisual: 'INDUSTRIAL', tipografia: 'Inter' }, formatoImpresion: 'ROLLO_80MM' } });
  await page.goto('/admin/negocios/pend-company/configuracion');
  const titulos = page.locator('form h2');
  await expect(titulos).toHaveText(['1. Mi negocio', '2. Venta e impresión', '3. Equipo y permisos']);
  await expect(page.locator('#business-name')).toHaveValue('Ferretería Pendientes');
  await expect(page.getByLabel('Formato de impresión de facturas y recibos')).toHaveValue('ROLLO_80MM');
  await expect(page.locator('#tax-rate')).toHaveValue('15');
  await expect(page.getByRole('link', { name: 'Usuarios, roles y permisos' })).toHaveAttribute('href', '/admin/negocios/pend-company/usuarios');
  await expect(page.getByRole('button', { name: /MENÚ LATERAL|MENÚ SUPERIOR/ })).toHaveCount(0);
});

test('ADMIN no obtiene la configuración del negocio', async ({ page, baseURL }) => {
  await preparar(page, baseURL);
  await page.goto('/admin/negocios/pend-company/configuracion');
  await expect(page.locator('form h2')).toHaveCount(0);
});
