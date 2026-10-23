import { test, expect, type Page } from '@playwright/test';

// Shell del administrador (rail + barra superior) y su inicio. API simulada y estricta: toda petición no prevista queda
// registrada y la prueba falla. Los datos de cada prueba son de ejemplo y solo viven en este archivo; la aplicación
// nunca los muestra por sí sola.

type Cuenta = { saldo: number | string; vencida: boolean; vencimiento: string | null };
interface Escenario {
  rol?: 'ADMIN' | 'CAJERO';
  color?: string;
  modo?: 'SIDEBAR' | 'TOPNAV';
  modulos?: string[];
  modoGuia?: boolean;
  dashboard?: unknown;
  pendientes?: unknown;
  cxc?: unknown;
  cxp?: unknown;
  retraso?: number;
  fallaCuentas?: boolean;
}
interface Sim { peticiones: string[]; inesperados: string[]; errores: string[] }

const hoyNegocio = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' });
const sumarDias = (dia: string, dias: number) => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString();
};

const DASHBOARD = {
  ventasDelDia: { total: 28450, cantidad: 12, variacionPorcentaje: 8 },
  tendenciaSemanal: [{ dia: 'Lun', fecha: '2026-10-19', total: 1200, esHoy: false }, { dia: 'Mar', fecha: '2026-10-20', total: 3400, esHoy: true }],
  ultimasVentas: [
    { id: 'v1', numeroVenta: 'V-1048', cliente: 'Consumidor final', cajero: 'Carlos M.', total: 3420, metodoPago: 'EFECTIVO', hora: '10:42' },
    { id: 'v2', numeroVenta: 'V-1047', cliente: 'Marta López', cajero: 'Carlos M.', total: 875, metodoPago: 'CREDITO', hora: '09:56' },
  ],
  alertasStock: { cantidad: 6, items: [{ id: 'p1', codigo: 'PVC-112', nombre: 'Tubo PVC 1/2"', stockActual: 0, stockMinimo: 5, unidadMedida: 'UND' }] },
  cotizacionesPendientes: { cantidad: 2, porVencerHoy: 1 },
};
const PENDIENTES = { indicadores: [
  { clave: 'precios_pendientes', cantidad: 3, ruta: '/precios', alcance: 'NEGOCIO' },
  { clave: 'stock_bajo_minimo', cantidad: 6, ruta: '/inventario', alcance: 'NEGOCIO' },
] };

async function preparar(page: Page, e: Escenario = {}): Promise<Sim> {
  const rol = e.rol ?? 'ADMIN';
  const company = {
    id: 'ux-company', nombreComercial: 'Ferretería El Martillo', colorPrimario: e.color ?? '#EA580C', modoNavegacion: e.modo ?? 'SIDEBAR',
    idioma: 'es', sucursal: 'Principal · Tegucigalpa', modoGuia: e.modoGuia ?? false,
    ...(e.modulos ? { modulosHabilitados: e.modulos } : {}),
  };
  const user = { id: 'ux-user', nombre: 'Ana Reyes', rol, permisos: [] };
  const sim: Sim = { peticiones: [], inesperados: [], errores: [] };
  page.on('pageerror', error => sim.errores.push(error.message));
  await page.addInitScript(({ company, user }) => {
    if (!localStorage.getItem('ferre_user')) {
      localStorage.setItem('ferre_user', JSON.stringify(user));
      localStorage.setItem('ferre_tenant', JSON.stringify(company));
      localStorage.setItem('ferre_token', 'test-only');
      localStorage.setItem('ferre_language', 'es');
    }
  }, { company, user });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.origin === 'http://127.0.0.1:4173') await route.continue(); else await route.abort();
      return;
    }
    const ruta = url.pathname.slice(4);
    sim.peticiones.push(`${route.request().method()} ${ruta}${url.search}`);
    if (e.retraso && (ruta === '/dashboard' || ruta === '/operaciones/cuentas')) await new Promise(r => setTimeout(r, e.retraso));
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (ruta === '/tenant/settings') return json(company);
    if (/\/logo$/.test(ruta)) return json({}, 404);
    if (ruta === '/auth/me') return json({ user: { ...user, sub: user.id, tenantId: company.id, type: 'tenant' } });
    if (ruta === '/auth/guia') return json({ enabled: true, progress: { status: 'pending' } });
    if (ruta === '/auth/logout') return json({});
    if (ruta === '/dashboard') return json(e.dashboard ?? DASHBOARD);
    if (ruta === '/dashboard/pendientes') return json(e.pendientes ?? PENDIENTES);
    if (ruta === '/operaciones/cuentas') {
      if (e.fallaCuentas) return json({ message: 'error' }, 500);
      return json(url.searchParams.get('tipo') === 'CXC' ? (e.cxc ?? []) : (e.cxp ?? []));
    }
    if (ruta === '/operaciones/caja') return json([]);
    if (['/maintenance/backup'].includes(ruta)) return json({ configured: false });
    if (route.request().method() === 'GET') return json([]);
    sim.inesperados.push(`${route.request().method()} ${ruta}`);
    return json({}, 500);
  });
  return sim;
}

// Contraste WCAG entre dos colores [r, g, b] (0-255).
const luminancia = ([r, g, b]: number[]) => {
  const canal = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};
const contraste = (a: number[], b: number[]) => {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
};

const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('Shell del administrador (modo barra lateral)', () => {
  test('rail con Inicio, Ventas, Inventario, Compras, Clientes y Más, con módulos reales', async ({ page }) => {
    const sim = await preparar(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const rail = page.locator('nav.admin-rail');
    await expect(rail).toBeVisible();
    expect((await rail.boundingBox())!.width).toBeCloseTo(84, 0);
    await expect(rail.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    await expect(rail.getByRole('link', { name: 'Compras' })).toHaveAttribute('href', '/ordenes-compra');
    for (const grupo of ['Ventas', 'Inventario', 'Clientes', 'Más']) await expect(rail.getByRole('button', { name: grupo })).toBeVisible();
    const tamanos = await rail.locator('.app-rail-item > span:nth-child(2)').evaluateAll(nodos => nodos.map(n => parseFloat(getComputedStyle(n).fontSize)));
    expect(Math.min(...tamanos)).toBeGreaterThanOrEqual(12);

    await rail.getByRole('button', { name: 'Ventas' }).click();
    const panel = page.locator('#app-rail-panel-ventas');
    await expect(panel).toBeVisible();
    for (const ruta of ['/pos', '/cotizaciones', '/devoluciones', '/arqueo-caja']) await expect(panel.locator(`a[href="${ruta}"]`)).toHaveCount(1);
    await rail.getByRole('button', { name: 'Clientes' }).click();
    await expect(page.locator('#app-rail-panel-ventas')).toHaveCount(0);
    for (const ruta of ['/clientes', '/cuentas', '/estado-cuenta-clientes']) await expect(page.locator(`#app-rail-panel-clientes a[href="${ruta}"]`)).toHaveCount(1);
    await rail.getByRole('button', { name: 'Más' }).click();
    for (const ruta of ['/reportes', '/usuarios']) await expect(page.locator(`#app-rail-panel-mas a[href="${ruta}"]`)).toHaveCount(1);
    expect(sim.inesperados).toEqual([]);
    expect(sim.errores).toEqual([]);
  });

  test('un módulo deshabilitado no se ofrece en el rail ni se abre por la ruta directa', async ({ page }) => {
    const sim = await preparar(page, { modulos: ['inventario', 'clientes'] });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const rail = page.locator('nav.admin-rail');
    await expect(rail.getByRole('button', { name: 'Ventas' })).toHaveCount(0);
    await expect(rail.getByRole('link', { name: 'Compras' })).toHaveCount(0);
    await expect(rail.getByRole('link', { name: 'Inicio' })).toBeVisible();
    // Solo se listan los accesos de módulos habilitados: sin arqueo de caja no hay «Cuentas y abonos».
    await rail.getByRole('button', { name: 'Clientes' }).click();
    await expect(page.locator('#app-rail-panel-clientes a[href="/clientes"]')).toHaveCount(1);
    await expect(page.locator('#app-rail-panel-clientes a[href="/cuentas"]')).toHaveCount(0);
    await rail.getByRole('button', { name: 'Inventario' }).click();
    await expect(page.locator('#app-rail-panel-inventario a[href="/inventario"]')).toHaveCount(1);
    for (const ruta of ['/pos', '/ordenes-compra', '/cotizaciones', '/arqueo-caja', '/cuentas']) {
      await expect(page.locator(`nav.admin-rail a[href="${ruta}"]`)).toHaveCount(0);
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: /Acceso Denegado/i, exact: true })).toBeVisible();
    }
    expect(sim.inesperados).toEqual([]);
  });

  test('teclado: Tab recorre el rail, Enter abre un grupo, Escape lo cierra y devuelve el foco', async ({ page }) => {
    await preparar(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/inventario');
    const rail = page.locator('nav.admin-rail');
    await rail.getByRole('link', { name: /Jowa System/ }).focus();
    const recorrido: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      recorrido.push(await page.evaluate(() => (document.activeElement?.textContent ?? '').trim()));
    }
    expect(recorrido).toEqual(['Inicio', 'Ventas', 'Inventario', 'Compras', 'Clientes', 'Más']);

    const ventas = rail.getByRole('button', { name: 'Ventas' });
    await ventas.focus();
    await page.keyboard.press('Enter');
    await expect(ventas).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#app-rail-panel-ventas')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ventas).toHaveAttribute('aria-expanded', 'false');
    await expect(ventas).toBeFocused();
    // Pulsar fuera también lo cierra.
    await page.keyboard.press('Space');
    await expect(ventas).toHaveAttribute('aria-expanded', 'true');
    await page.locator('main').first().click({ position: { x: 5, y: 5 }, force: true });
    await expect(ventas).toHaveAttribute('aria-expanded', 'false');
  });

  test('navegación: el grupo de la pantalla actual queda activo, el historial funciona y el panel se cierra al navegar', async ({ page }) => {
    await preparar(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/inventario');
    const rail = page.locator('nav.admin-rail');
    await expect(rail.getByRole('button', { name: 'Inventario' })).toHaveClass(/is-active/);
    await rail.getByRole('button', { name: 'Ventas' }).click();
    await page.locator('#app-rail-panel-ventas a[href="/cotizaciones"]').click();
    await expect(page).toHaveURL(/\/cotizaciones$/);
    await expect(page.locator('#app-rail-panel-ventas')).toHaveCount(0);
    await expect(rail.getByRole('button', { name: 'Ventas' })).toHaveClass(/is-active/);
    await rail.getByRole('link', { name: 'Compras' }).click();
    await expect(page).toHaveURL(/\/ordenes-compra$/);
    await expect(rail.getByRole('link', { name: 'Compras' })).toHaveClass(/is-active/);
    await page.goBack();
    await expect(page).toHaveURL(/\/cotizaciones$/);
    await expect(rail.getByRole('button', { name: 'Ventas' })).toHaveClass(/is-active/);
    await page.goBack();
    await expect(page).toHaveURL(/\/inventario$/);
    await expect(rail.getByRole('button', { name: 'Inventario' })).toHaveClass(/is-active/);
    await rail.getByRole('link', { name: 'Inicio' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(rail.getByRole('link', { name: 'Inicio' })).toHaveClass(/is-active/);
  });

  test('barra superior: negocio, sucursal, usuario con su rol, notificaciones y un solo cierre de sesión que funciona', async ({ page }) => {
    await preparar(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const barra = page.locator('header.admin-topbar');
    await expect(barra).toBeVisible();
    expect((await barra.boundingBox())!.height).toBeCloseTo(56, 0);
    await expect(barra).toContainText('Ferretería El Martillo');
    await expect(barra.getByLabel('Seleccionar sucursal')).toHaveValue('Principal · Tegucigalpa');
    await expect(barra).toContainText('Ana Reyes');
    await expect(barra).toContainText('Administrador');
    await expect(barra.getByRole('button', { name: /notificaciones/i })).toBeVisible();
    // Un solo cierre de sesión accesible (la TopBar de la página no lo repite dentro del shell).
    const cerrar = page.getByTitle(/^(Cerrar Sesión|Log Out)$/);
    await expect(cerrar).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await cerrar.click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('ferre_token'))).toBeNull();
  });

  for (const color of ['#F5C400', '#0F172A']) {
    test(`el estado activo del rail usa el color del negocio ${color} y se distingue`, async ({ page }) => {
      await preparar(page, { color });
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto('/inventario');
      const medidas = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const g = canvas.getContext('2d')!;
        const rgba = (c: string) => { g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
        const rail = document.querySelector('nav.admin-rail')!;
        const activo = rail.querySelector('.app-rail-item.is-active')!;
        const pastilla = activo.querySelector('.app-rail-pill')!;
        const anillo = /(color\([^)]*\)|rgba?\([^)]*\))/.exec(getComputedStyle(pastilla).boxShadow)?.[1] ?? 'transparent';
        return { fondoRail: rgba(getComputedStyle(rail).backgroundColor), pastilla: rgba(getComputedStyle(pastilla).backgroundColor), anillo: rgba(anillo), icono: rgba(getComputedStyle(pastilla.querySelector('svg')!).color), etiqueta: rgba(getComputedStyle(activo).color) };
      });
      const sobre = (c: number[], fondo: number[]) => [0, 1, 2].map(i => c[i] * c[3] + fondo[i] * (1 - c[3]));
      expect(contraste(medidas.icono, sobre(medidas.pastilla, medidas.fondoRail))).toBeGreaterThanOrEqual(3);
      expect(contraste(medidas.etiqueta, medidas.fondoRail)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(sobre(medidas.anillo, medidas.fondoRail), medidas.fondoRail)).toBeGreaterThanOrEqual(3);
    });
  }

  test('modo barra superior: se conserva el layout anterior, sin rail ni barra del shell', async ({ page }) => {
    await preparar(page, { modo: 'TOPNAV' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('header.jowa-topnav')).toBeVisible();
    await expect(page.locator('nav.admin-rail')).toHaveCount(0);
    await expect(page.locator('header.admin-topbar')).toHaveCount(0);
    await expect(page.getByTitle(/^(Cerrar Sesión|Log Out)$/)).toHaveCount(1);
  });

  test('otros roles no reciben el shell del administrador', async ({ page }) => {
    await preparar(page, { rol: 'CAJERO' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/pos');
    await expect(page.locator('nav.admin-rail')).toHaveCount(0);
    await expect(page.locator('nav.cajero-rail')).toBeVisible();
  });
});

test.describe('Inicio del administrador con datos reales', () => {
  const hoy = hoyNegocio();
  const CXC: Cuenta[] = [
    { saldo: 1200, vencida: false, vencimiento: sumarDias(hoy, 12) },
    { saldo: 500.5, vencida: true, vencimiento: sumarDias(hoy, -3) },
    { saldo: 0, vencida: false, vencimiento: sumarDias(hoy, -20) },
  ];
  const CXP: Cuenta[] = [
    { saldo: 300, vencida: false, vencimiento: sumarDias(hoy, 1) },
    { saldo: 50, vencida: false, vencimiento: sumarDias(hoy, 10) },
    { saldo: 90, vencida: true, vencimiento: sumarDias(hoy, -2) },
  ];

  test('los cuatro indicadores salen de los servicios y cada uno lleva a su pantalla', async ({ page }) => {
    const sim = await preparar(page, { cxc: CXC, cxp: CXP });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const kpi = (id: string) => page.locator(`[data-kpi="${id}"]`);
    await expect(kpi('ventas')).toContainText(/28,?450\.00/);
    await expect(kpi('ventas')).toContainText('12 venta(s)');
    await expect(kpi('ventas')).toContainText('+8%');
    await expect(kpi('por-cobrar')).toContainText(/1,?700\.50/);
    await expect(kpi('por-cobrar')).toContainText('2 cuenta(s) abierta(s) · 1 vencida(s)');
    await expect(kpi('facturas')).toContainText('3');
    await expect(kpi('facturas')).toContainText('1 vencida(s)');
    await expect(kpi('stock')).toContainText('6 producto(s)');
    await expect(kpi('por-cobrar')).toHaveAttribute('href', '/cuentas');
    await expect(kpi('facturas')).toHaveAttribute('href', '/cuentas');
    await expect(kpi('stock')).toHaveAttribute('href', '/inventario');
    expect(sim.peticiones).toContain('GET /operaciones/cuentas?tipo=CXC');
    expect(sim.peticiones).toContain('GET /operaciones/cuentas?tipo=CXP');
    expect(sim.inesperados).toEqual([]);
    // Movimiento reciente: solo las ventas que devuelve el servicio.
    const tabla = page.locator('.admin-home__tabla');
    await expect(tabla.locator('tbody tr')).toHaveCount(2);
    await expect(tabla).toContainText('V-1048');
    await expect(tabla).toContainText('Carlos M.');
  });

  test('la próxima factura sin vencidas se describe con su fecha, y sin facturas lo dice', async ({ page }) => {
    await preparar(page, { cxc: [], cxp: [{ saldo: 300, vencida: false, vencimiento: sumarDias(hoy, 1) }] });
    await page.goto('/');
    await expect(page.locator('[data-kpi="facturas"]')).toContainText('La próxima vence mañana');
    await expect(page.locator('[data-kpi="por-cobrar"]')).toContainText('0 cuenta(s) abierta(s)');
    await expect(page.locator('[data-pendiente="cxp_vencidas"]')).toHaveCount(0);
    const otra = await page.context().newPage();
    await preparar(otra, { cxc: [], cxp: [] });
    await otra.goto('/');
    await expect(otra.locator('[data-kpi="facturas"]')).toContainText('Sin facturas pendientes');
  });

  test('las cuentas vencidas aparecen en «Necesita tu atención» con su cifra real', async ({ page }) => {
    await preparar(page, { cxc: CXC, cxp: CXP });
    await page.goto('/');
    const seccion = page.locator('section.admin-home__pendientes');
    await expect(seccion).toContainText('Necesita tu atención');
    await expect(seccion.locator('[data-pendiente="precios_pendientes"] .admin-home__contador')).toHaveText('3');
    await expect(seccion.locator('[data-pendiente="cxp_vencidas"] .admin-home__contador')).toHaveText('1');
    await expect(seccion.locator('[data-pendiente="cxc_vencidas"] .admin-home__contador')).toHaveText('1');
    await expect(seccion.locator('[data-pendiente="cxp_vencidas"]')).toHaveAttribute('href', '/cuentas');
  });

  test('acciones frecuentes: hasta cuatro, hacia pantallas existentes y solo las autorizadas', async ({ page }) => {
    await preparar(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const acciones = page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link');
    await expect(acciones).toHaveCount(4);
    const rutas = await acciones.evaluateAll(links => links.map(a => a.getAttribute('href')));
    expect(rutas).toEqual(['/inventario', '/ordenes-compra', '/cuentas', '/cotizaciones']);
    await acciones.nth(1).click();
    await expect(page).toHaveURL(/\/ordenes-compra$/);
  });

  test('sin módulo de cuentas ni cotizaciones: no se consultan cuentas ni se ofrecen sus acciones', async ({ page }) => {
    const sim = await preparar(page, { modulos: ['inventario', 'ordenes_compra', 'clientes'] });
    await page.goto('/');
    await expect(page.locator('[data-kpi="ventas"]')).toBeVisible();
    await expect(page.locator('[data-kpi="por-cobrar"]')).toHaveCount(0);
    await expect(page.locator('[data-kpi="facturas"]')).toHaveCount(0);
    const acciones = page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link');
    expect(await acciones.evaluateAll(links => links.map(a => a.getAttribute('href')))).toEqual(['/inventario', '/ordenes-compra']);
    expect(sim.peticiones.filter(p => p.includes('/operaciones/cuentas'))).toEqual([]);
  });

  test('estados: cargando no muestra ceros, el error no inventa cifras y una respuesta malformada es un error', async ({ page }) => {
    await preparar(page, { retraso: 1500, cxc: CXC, cxp: CXP });
    await page.goto('/');
    await expect(page.locator('[data-kpi="por-cobrar"] .admin-home__metrica-cifra')).toHaveText('—');
    await expect(page.locator('[data-kpi="por-cobrar"]')).toContainText('Cargando…');
    await expect(page.locator('[data-kpi="por-cobrar"]')).toContainText(/1,?700\.50/, { timeout: 10_000 });

    const fallo = await page.context().newPage();
    await preparar(fallo, { fallaCuentas: true });
    await fallo.goto('/');
    await expect(fallo.locator('[data-kpi="por-cobrar"]')).toContainText('No se pudo consultar');
    await expect(fallo.locator('[data-kpi="por-cobrar"] .admin-home__metrica-cifra')).toHaveText('—');
    await expect(fallo.locator('[data-kpi="facturas"] .admin-home__metrica-cifra')).toHaveText('—');

    const mala = await page.context().newPage();
    await preparar(mala, { cxc: { cuentas: [] }, cxp: 'texto' });
    await mala.goto('/');
    await expect(mala.locator('[data-kpi="por-cobrar"]')).toContainText('No se pudo consultar');
    await expect(mala.locator('[data-kpi="facturas"]')).toContainText('No se pudo consultar');
  });

  test('sin ventas todavía: estado vacío claro, sin cifras inventadas', async ({ page }) => {
    await preparar(page, { dashboard: { ...DASHBOARD, ventasDelDia: { total: 0, cantidad: 0, variacionPorcentaje: null }, ultimasVentas: [], tendenciaSemanal: [], alertasStock: { cantidad: 0, items: [] } }, pendientes: { indicadores: [] }, cxc: [], cxp: [] });
    await page.goto('/');
    await expect(page.locator('.admin-home__tarjeta[aria-labelledby="home-ventas"]')).toContainText('Aún no hay ventas registradas.');
    await expect(page.locator('section.admin-home__pendientes')).toContainText('Tu rol no tiene pendientes');
  });
});

test.describe('Interfaz móvil administrativa', () => {
  test('390 px: sin ventas, cobros, devoluciones ni cierres de caja, sin desbordes y con el negocio visible', async ({ page }) => {
    const sim = await preparar(page, { cxc: [{ saldo: 100, vencida: true, vencimiento: sumarDias(hoyNegocio(), -1) }], cxp: [] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('nav.admin-rail')).toBeHidden();
    const barra = page.locator('header.admin-topbar');
    await expect(barra).toContainText('Ferretería El Martillo');
    await expect(barra).toContainText('Principal · Tegucigalpa');
    await expect(page.locator('[data-kpi="por-cobrar"]')).toBeVisible();
    // La consulta de cuentas sigue (supervisión), pero sin enlace a la pantalla de cobros.
    await expect(page.locator('[data-kpi="por-cobrar"]')).not.toHaveAttribute('href', /.+/);
    await expect(page.locator('[data-pendiente="cxc_vencidas"]')).not.toHaveAttribute('href', /.+/);
    const acciones = page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link');
    expect(await acciones.evaluateAll(links => links.map(a => a.getAttribute('href')))).toEqual(['/inventario', '/ordenes-compra', '/cotizaciones']);
    await expect(page.getByRole('link', { name: 'Nueva venta' })).toHaveCount(0);
    expect(await sinDesborde(page)).toBe(true);

    const inferior = page.locator('.mobile-bottom-nav');
    await expect(inferior).toBeVisible();
    await inferior.getByRole('button', { name: 'Más' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    const rutas = await dialogo.locator('a').evaluateAll(links => links.map(a => a.getAttribute('href')));
    for (const prohibida of ['/pos', '/arqueo-caja', '/devoluciones', '/cuentas', '/apartados', '/pedidos-especiales']) expect(rutas).not.toContain(prohibida);
    for (const permitida of ['/reportes', '/levantamiento']) expect(rutas).toContain(permitida);
    expect(sim.inesperados).toEqual([]);
  });

  test('el buscador de pantallas no ofrece ventas ni cobros en móvil, y sí en escritorio', async ({ page }) => {
    await preparar(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('.task-finder-toggle').click();
    await page.locator('#task-search').fill('vender');
    await expect(page.locator('.task-search-results a[href="/pos"]')).toHaveCount(0);
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.locator('#task-search')).toBeVisible();
    await expect(page.locator('.task-search-results a[href="/pos"]')).toHaveCount(1);
  });
});

test.describe('Resoluciones de escritorio y tableta', () => {
  const pantallas = [
    { nombre: '1366×768', width: 1366, height: 768 },
    { nombre: '1920×1080', width: 1920, height: 1080 },
    { nombre: '1920×1080 al 125 %', width: 1536, height: 864 },
    { nombre: '1920×1080 al 150 %', width: 1280, height: 720 },
    { nombre: 'tableta 820', width: 820, height: 1180 },
  ];
  for (const p of pantallas) {
    test(`${p.nombre}: sin desbordes ni superposiciones entre rail, barra, contenido y paneles`, async ({ page }) => {
      await preparar(page, { cxc: [{ saldo: 10, vencida: false, vencimiento: sumarDias(hoyNegocio(), 5) }], cxp: [] });
      await page.setViewportSize({ width: p.width, height: p.height });
      await page.goto('/');
      await expect(page.locator('[data-kpi="ventas"]')).toBeVisible();
      expect(await sinDesborde(page)).toBe(true);
      const rail = (await page.locator('nav.admin-rail').boundingBox())!;
      const barra = (await page.locator('header.admin-topbar').boundingBox())!;
      const contenido = (await page.locator('.admin-home__main').boundingBox())!;
      expect(barra.x).toBeGreaterThanOrEqual(rail.x + rail.width - 1);
      expect(contenido.x).toBeGreaterThanOrEqual(rail.x + rail.width - 1);
      expect(contenido.y).toBeGreaterThanOrEqual(barra.y + barra.height - 1);
      await page.locator('nav.admin-rail').getByRole('button', { name: 'Ventas' }).click();
      const panel = (await page.locator('#app-rail-panel-ventas').boundingBox())!;
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height).toBeLessThanOrEqual(p.height);
      expect(panel.x + panel.width).toBeLessThanOrEqual(p.width);
    });
  }
});

test.describe('Guía inicial', () => {
  test('la guía existente convive con el shell: no tapa el rail ni la barra superior', async ({ page }) => {
    await preparar(page, { modoGuia: true });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const guia = page.locator('aside.guide');
    await expect(guia).toBeVisible();
    await expect(page.locator('.guide-card').first()).toBeVisible();
    const cajaGuia = (await guia.boundingBox())!;
    for (const selector of ['nav.admin-rail', 'header.admin-topbar']) {
      const otra = (await page.locator(selector).boundingBox())!;
      const seSolapan = cajaGuia.x < otra.x + otra.width && cajaGuia.x + cajaGuia.width > otra.x && cajaGuia.y < otra.y + otra.height && cajaGuia.y + cajaGuia.height > otra.y;
      expect(seSolapan, selector).toBe(false);
    }
    // Las acciones principales siguen a la vista.
    await expect(page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link').first()).toBeVisible();
  });
});
