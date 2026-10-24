import { test, expect, type Page } from '@playwright/test';

// Navegación híbrida configurable TOPNAV/SIDEBAR, dashboard ADMIN fluido, logotipos en el rail,
// empresas del Super Admin y menú «Gestionar empresa».
// API simulada y estricta: toda petición de escritura no prevista queda registrada y la prueba falla. Los datos son de
// ejemplo y solo viven en este archivo.

interface Escenario {
  rol: 'SUPERADMIN' | 'ADMIN' | 'CAJERO' | 'VENDEDOR' | 'BODEGUERO';
  modulos?: string[];
  /** Preferencia del negocio: decide la posición del mismo menú híbrido. */
  modoLegado?: 'SIDEBAR' | 'TOPNAV';
  color?: string;
  /** SVG del logotipo del negocio (se sirve como el archivo privado del negocio). */
  logo?: string;
  empresas?: number;
}
interface Sim { escrituras: { metodo: string; ruta: string; cuerpo: unknown }[]; errores: string[] }

const DASHBOARD = {
  ventasDelDia: { total: 48250, cantidad: 12, variacionPorcentaje: 14 },
  tendenciaSemanal: [{ dia: 'Lun', fecha: '2026-10-19', total: 1200, esHoy: false }, { dia: 'Mar', fecha: '2026-10-20', total: 3400, esHoy: true }],
  ultimasVentas: [
    { id: 'v1', numeroVenta: 'V-1048', cliente: 'Constructora del Valle', cajero: 'Marcos R.', total: 3420, metodoPago: 'TRANSFERENCIA', hora: '11:42' },
    { id: 'v2', numeroVenta: 'V-1047', cliente: 'Taller Hermanos Gómez', cajero: 'Ana P.', total: 875, metodoPago: 'EFECTIVO', hora: '11:35' },
    { id: 'v3', numeroVenta: 'V-1046', cliente: 'Ing. Roberto Flores', cajero: 'Marcos R.', total: 6210, metodoPago: 'CREDITO', hora: '11:15' },
    { id: 'v4', numeroVenta: 'V-1045', cliente: 'Distribuidora San Juan', cajero: 'Marcos R.', total: 1980, metodoPago: 'TARJETA', hora: '10:58' },
  ],
  alertasStock: { cantidad: 6, items: [{ id: 'p1', codigo: 'PVC-112', nombre: 'Tubo PVC 1/2"', stockActual: 0, stockMinimo: 5, unidadMedida: 'UND' }] },
  cotizacionesPendientes: { cantidad: 2, porVencerHoy: 1 },
};
const PENDIENTES = { indicadores: [
  { clave: 'precios_pendientes', cantidad: 3, ruta: '/precios', alcance: 'NEGOCIO' },
  { clave: 'stock_bajo_minimo', cantidad: 6, ruta: '/inventario', alcance: 'NEGOCIO' },
] };

const svg = (ancho: number, alto: number, contenido: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${contenido}</svg>`;
const LOGOS = {
  // Oscuro, cuadrado y transparente: el caso que desaparecía sobre el rail oscuro.
  oscuro: svg(200, 200, '<circle cx="100" cy="100" r="80" fill="#0b1f4d"/><rect x="85" y="50" width="30" height="100" fill="#f5c400"/>'),
  // Claro y transparente: sobre blanco desaparecería.
  claro: svg(200, 200, '<circle cx="100" cy="100" r="80" fill="#fafafa"/><rect x="85" y="50" width="30" height="100" fill="#e8e8e8"/>'),
  // Horizontal 4:1, con trazo oscuro y transparente.
  horizontal: svg(400, 100, '<rect x="10" y="30" width="380" height="40" fill="#14532d"/>'),
  // Cuadrado con fondo propio opaco.
  cuadradoOpaco: svg(200, 200, '<rect width="200" height="200" fill="#1d4ed8"/><circle cx="100" cy="100" r="50" fill="#ffffff"/>'),
};

const TENANTS = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `emp-${i + 1}`, nombreComercial: ['Ferretería El Tornillo Feliz', 'Distribuidora Ferretera del Valle', 'Materiales y Aceros de Choloma', 'Soluciones Eléctricas San Pedro', 'Ferretería La Unión', 'Depósito Central'][i % 6],
  direccion: 'Tegucigalpa', telefono: `2222-00${i}0`, email: `contacto${i + 1}@ejemplo.hn`, colorPrimario: ['#EA580C', '#1D4ED8', '#0F766E', '#7C3AED'][i % 4],
  plan: ['Enterprise Pro', 'PYME Comercial', 'Plan Básico'][i % 3], estado: i === 2 ? 'SUSPENDIDO' : 'ACTIVO',
  cantidadUsuarios: 3 + i, cantidadSucursales: 1 + (i % 3), modulosHabilitados: ['pos', 'inventario', 'clientes'], usuarios: [],
}));

async function preparar(page: Page, e: Escenario): Promise<Sim> {
  const company = {
    id: 'ux-company', nombreComercial: 'Ferretería El Roble', colorPrimario: e.color ?? '#1D4ED8', modoNavegacion: e.modoLegado ?? 'SIDEBAR',
    idioma: 'es', sucursal: 'Sucursal Principal', modoGuia: false,
    ...(e.modulos ? { modulosHabilitados: e.modulos } : {}),
    ...(e.logo ? { logotipo: { mime: 'image/png', bytes: 100, actualizadoAt: '2026-10-23T00:00:00.000Z' } } : {}),
  };
  const user = { id: 'ux-user', nombre: 'Carlos Mendoza', rol: e.rol, permisos: [] };
  const sim: Sim = { escrituras: [], errores: [] };
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
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.origin === 'http://127.0.0.1:4173') await route.continue(); else await route.abort();
      return;
    }
    const ruta = url.pathname.slice(4);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (request.method() !== 'GET') {
      sim.escrituras.push({ metodo: request.method(), ruta, cuerpo: request.postDataJSON?.() ?? null });
      if (ruta === '/auth/logout') return json({});
      if (/^\/admin\/tenants\/[^/]+\/settings$/.test(ruta)) return json({ ...company, ...(request.postDataJSON() ?? {}) });
      return json({});
    }
    if (ruta === '/tenant/logo') return e.logo ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: e.logo }) : json({}, 404);
    if (/\/logo$/.test(ruta)) return json({}, 404);
    if (ruta === '/tenant/settings' || /^\/admin\/tenants\/[^/]+\/settings$/.test(ruta)) return json(company);
    if (ruta === '/auth/me') return json({ user: { ...user, sub: user.id, tenantId: company.id, type: e.rol === 'SUPERADMIN' ? 'super_admin' : 'tenant' } });
    if (ruta === '/auth/guia') return json({ enabled: true, progress: { status: 'pending' } });
    if (ruta === '/dashboard') return json(DASHBOARD);
    if (ruta === '/dashboard/pendientes') return json(PENDIENTES);
    if (ruta === '/admin/tenants') return json(TENANTS(e.empresas ?? 4));
    if (ruta === '/maintenance/backup') return json({ configured: false });
    if (ruta === '/admin/dashboard') return json({});
    return json([]);
  });
  return sim;
}

const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const rail = (page: Page) => page.locator('nav.app-rail');
const etiquetasRail = async (page: Page) => {
  await expect(rail(page)).toBeVisible();
  return (await page.locator('nav.app-rail ul.app-rail-list > li').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
};

test.describe('Navegación híbrida configurable para los roles del negocio', () => {
  const ROLES = ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'] as const;

  for (const rol of ROLES) for (const modoLegado of ['SIDEBAR', 'TOPNAV'] as const) {
    test(`${rol} con modoNavegacion ${modoLegado}: menú híbrido y barra contextual`, async ({ page }) => {
      const sim = await preparar(page, { rol, modoLegado });
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto('/');
      await expect(rail(page)).toBeVisible();
      await expect(page.locator('[data-navigation-mode]')).toHaveAttribute('data-navigation-mode', modoLegado);
      const menu = await rail(page).boundingBox();
      expect(menu).not.toBeNull();
      if (modoLegado === 'TOPNAV') expect(menu!.width).toBe(1366);
      else expect(menu!.width).toBe(84);
      await expect(page.locator('header.admin-topbar')).toBeVisible();
      await expect(page.locator('aside.jowa-sidebar, header.jowa-topnav, .app-container-topnav')).toHaveCount(0);
      // Barra superior: negocio, sucursal activa, búsqueda de tareas, notificaciones, usuario y cierre de sesión (uno solo).
      const barra = page.locator('header.admin-topbar');
      await expect(barra.getByText('Ferretería El Roble', { exact: true })).toBeVisible();
      await expect(barra).toContainText('Sucursal Principal');
      await expect(barra.locator('.task-finder-toggle')).toBeVisible();
      // La campana la ven quienes pueden autorizar solicitudes (administrador); los demás roles no la necesitan.
      if (rol === 'ADMIN') await expect(barra.locator('.shell-topbar-actions button').first()).toBeVisible();
      await expect(barra).toContainText('Carlos Mendoza');
      await expect(page.getByTitle('Cerrar Sesión')).toHaveCount(1);
      // Inicio siempre es el primer acceso del rail.
      expect((await etiquetasRail(page))[0]).toBe('Inicio');
      await expect(rail(page).locator('ul.app-rail-list a[href="/"]')).toHaveCount(1);
      expect(await sinDesborde(page)).toBe(true);
      expect(sim.errores).toEqual([]);
    });
  }

  for (const width of [820, 1024]) test(`TOPNAV ADMIN a ${width}px: paneles visibles, teclado y móvil`, async ({ page }) => {
    await preparar(page, { rol: 'ADMIN', modoLegado: 'TOPNAV' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const menu = rail(page);
    await expect(menu).toBeVisible();
    const ventas = menu.getByRole('button', { name: 'Ventas', exact: true });
    await ventas.click();
    const panel = page.locator('#app-rail-panel-ventas');
    await expect(panel).toBeVisible();
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await sinDesborde(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(ventas).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`topnav-${width}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(menu).toBeHidden();
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    expect(await sinDesborde(page)).toBe(true);
  });

  test('el cajero ve un rail enfocado en venta y caja; sin costos, configuración ni administración', async ({ page }) => {
    await preparar(page, { rol: 'CAJERO' });
    await page.goto('/');
    expect(await etiquetasRail(page)).toEqual(['Inicio', 'Caja', 'Mi caja', 'Más']);
    await rail(page).getByRole('button', { name: 'Más' }).click();
    const accesos = await page.locator('#app-rail-panel-mas a').evaluateAll(links => links.map(a => a.getAttribute('href')));
    for (const prohibido of ['/precios', '/usuarios', '/reportes', '/inventario', '/ordenes-compra', '/admin', '/configuracion', '/clientes']) expect(accesos).not.toContain(prohibido);
  });

  test('el vendedor accede solo a sus operaciones comerciales', async ({ page }) => {
    await preparar(page, { rol: 'VENDEDOR' });
    await page.goto('/');
    const etiquetas = await etiquetasRail(page);
    expect(etiquetas[0]).toBe('Inicio');
    expect(etiquetas).toContain('Ventas');
    for (const ajeno of ['Inventario', 'Compras', 'Logística']) expect(etiquetas).not.toContain(ajeno);
    await rail(page).getByRole('button', { name: 'Ventas', exact: true }).click();
    const accesos = await page.locator('#app-rail-panel-ventas a').evaluateAll(links => links.map(a => a.getAttribute('href')));
    expect(accesos).toContain('/pos');
    for (const prohibido of ['/inventario', '/precios', '/usuarios', '/reportes']) expect(accesos).not.toContain(prohibido);
    await page.goto('/inventario');
    await expect(page.getByRole('heading', { name: /Acceso Denegado/i, exact: true })).toBeVisible();
  });

  test('el bodeguero accede a inventario y logística, sin ventas ni caja', async ({ page }) => {
    await preparar(page, { rol: 'BODEGUERO' });
    await page.goto('/');
    const etiquetas = await etiquetasRail(page);
    expect(etiquetas).toContain('Inventario');
    expect(etiquetas).toContain('Compras');
    expect(etiquetas).not.toContain('Ventas');
    await rail(page).getByRole('button', { name: 'Inventario', exact: true }).click();
    const accesos = await page.locator('#app-rail-panel-inventario a').evaluateAll(links => links.map(a => a.getAttribute('href')));
    expect(accesos).toContain('/inventario');
    expect(accesos).toContain('/levantamiento');
    await page.goto('/pos');
    await expect(page.getByRole('heading', { name: /Acceso Denegado/i, exact: true })).toBeVisible();
  });

  test('módulos deshabilitados por el Super Admin desaparecen del rail y siguen bloqueados por URL', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN', modulos: ['clientes'] });
    await page.goto('/');
    const etiquetas = await etiquetasRail(page);
    expect(etiquetas[0]).toBe('Inicio');
    expect(etiquetas).toContain('Clientes');
    for (const apagado of ['Ventas', 'Inventario', 'Compras']) expect(etiquetas).not.toContain(apagado);
    await page.goto('/inventario');
    await expect(page.getByRole('heading', { name: /Acceso Denegado/i, exact: true })).toBeVisible();
  });

  test('con todos los módulos apagados Inicio sigue siendo accesible', async ({ page }) => {
    await preparar(page, { rol: 'VENDEDOR', modulos: [] });
    await page.goto('/');
    expect(await etiquetasRail(page)).toEqual(['Inicio']);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('la búsqueda de tareas vive en la barra superior y solo ofrece lo autorizado', async ({ page }) => {
    await preparar(page, { rol: 'VENDEDOR' });
    await page.goto('/');
    await page.locator('.admin-topbar .task-finder-toggle').click();
    await page.locator('#task-search').fill('inventario');
    await expect(page.locator('.task-search-results a[href="/inventario"]')).toHaveCount(0);
    await page.locator('#task-search').fill('vender');
    await expect(page.locator('.task-search-results a[href="/pos"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#task-search')).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#task-search')).toBeFocused();
  });
});

test.describe('Configuración de navegación por negocio', () => {
  test('Super Admin configura TOPNAV/SIDEBAR por negocio', async ({ page }) => {
    const sim = await preparar(page, { rol: 'SUPERADMIN', modoLegado: 'TOPNAV' });
    await page.goto('/admin/negocios/ux-company/configuracion');
    await expect(page.locator('#business-name')).toBeVisible();
    await expect(page.locator('#navigation-mode')).toHaveValue('TOPNAV');
    await page.locator('#navigation-mode').selectOption('SIDEBAR');
    await page.locator('#business-name').fill('Empresa guardada');
    await page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
    await expect.poll(() => sim.escrituras.some(w => w.ruta.endsWith('/settings'))).toBe(true);
    const guardado = sim.escrituras.find(w => w.ruta.endsWith('/settings'))!.cuerpo as Record<string, unknown>;
    expect(guardado.modoNavegacion).toBe('SIDEBAR');
    expect(guardado.nombreComercial).toBe('Empresa guardada');
  });

  test('Marca del negocio no ofrece selector de navegación y no envía modoNavegacion', async ({ page }) => {
    const sim = await preparar(page, { rol: 'SUPERADMIN', modoLegado: 'TOPNAV' });
    await page.goto('/admin/negocios/ux-company/marca');
    await expect(page.getByRole('heading', { name: 'Marca', exact: true })).toBeVisible();
    for (const texto of [/TOPNAV/, /SIDEBAR/, /menú lateral/i, /menú superior/i, /navegación/i]) await expect(page.locator('main')).not.toContainText(texto);
    await page.getByRole('button', { name: 'Guardar marca' }).click();
    await expect.poll(() => sim.escrituras.some(w => w.ruta.endsWith('/settings'))).toBe(true);
    expect('modoNavegacion' in (sim.escrituras.find(w => w.ruta.endsWith('/settings'))!.cuerpo as object)).toBe(false);
  });

  test('Resumen del negocio y lista de empresas no mencionan la navegación', async ({ page }) => {
    await preparar(page, { rol: 'SUPERADMIN', modoLegado: 'TOPNAV' });
    await page.goto('/admin/negocios/ux-company');
    await expect(page.locator('main')).toContainText('Plan:');
    await expect(page.locator('main')).not.toContainText(/Navegación|TOPNAV|SIDEBAR/);
    await page.goto('/admin?seccion=negocios');
    await expect(page.locator('.empresa-card').first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/TOPNAV|SIDEBAR|Navegación/);
    await page.getByRole('button', { name: /Gestionar empresa: Ferretería El Tornillo Feliz/ }).click();
    await expect(page.getByRole('menu')).not.toContainText(/TOPNAV|SIDEBAR|Navegación/);
    await page.keyboard.press('Escape');
  });

  test('editar la marca de una empresa no ofrece el modo de navegación y no lo envía', async ({ page }) => {
    const sim = await preparar(page, { rol: 'SUPERADMIN', modoLegado: 'TOPNAV' });
    await page.goto('/admin?seccion=negocios');
    await page.getByRole('button', { name: /Gestionar empresa: Ferretería El Tornillo Feliz/ }).click();
    await page.getByRole('menuitem', { name: 'MARCA', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'CONFIGURAR MARCA Y DATOS DE EMPRESA', exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/TOPNAV|SIDEBAR|MODO DE NAVEGACIÓN/i);
    await page.getByRole('button', { name: 'GUARDAR CONFIGURACIÓN', exact: true }).click();
    await expect.poll(() => sim.escrituras.some(w => w.metodo === 'PATCH' && w.ruta === '/admin/tenants/emp-1')).toBe(true);
    expect('modoNavegacion' in (sim.escrituras.find(w => w.metodo === 'PATCH' && w.ruta === '/admin/tenants/emp-1')!.cuerpo as object)).toBe(false);
  });
});

test.describe('Dashboard ADMIN fluido', () => {
  for (const [ancho, alto] of [[1920, 1080], [1600, 900], [1366, 768]]) {
    test(`${ancho}×${alto}: cuatro indicadores, sin franja vacía a la derecha ni scroll horizontal`, async ({ page }) => {
      await preparar(page, { rol: 'ADMIN' });
      await page.setViewportSize({ width: ancho, height: alto });
      await page.goto('/');
      await expect(page.locator('.admin-home__kpi')).toHaveCount(4);
      const cajas = await page.locator('.admin-home__kpi').evaluateAll(n => n.map(x => { const r = x.getBoundingClientRect(); return { top: Math.round(r.top), left: r.left, right: r.right, width: r.width }; }));
      // Una sola fila de cuatro, anchos iguales.
      expect(new Set(cajas.map(c => c.top)).size).toBe(1);
      expect(Math.max(...cajas.map(c => c.width)) - Math.min(...cajas.map(c => c.width))).toBeLessThan(2);
      // El contenido llega hasta el margen derecho: no queda una franja vacía.
      const ultimo = Math.max(...cajas.map(c => c.right));
      expect(ancho - ultimo).toBeLessThanOrEqual(Math.max(48, ancho * 0.03));
      // Tabla de últimas ventas aprovecha el espacio de su columna.
      const tabla = await page.locator('.admin-home__tabla').boundingBox();
      const contenedor = await page.locator('[aria-labelledby="home-ventas"]').boundingBox();
      expect(tabla!.width).toBeGreaterThanOrEqual(contenedor!.width - 40);
      const lateral = await page.locator('.admin-home__columna--lateral').boundingBox();
      expect(lateral!.x + lateral!.width).toBeGreaterThan(ancho - 60);
      expect(await sinDesborde(page)).toBe(true);
      // Se conservan los bloques del dashboard.
      for (const nombre of ['Necesita tu atención', 'Acciones frecuentes', 'Últimas ventas']) await expect(page.getByRole('heading', { name: nombre })).toBeVisible();
      await expect(page.locator('header.admin-topbar .app-caja-estado')).toBeVisible();
    });
  }

  test('820×1180: indicadores 2×2, una columna y sin scroll horizontal', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN' });
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/');
    await expect(page.locator('.admin-home__kpi')).toHaveCount(4);
    const tops = await page.locator('.admin-home__kpi').evaluateAll(n => n.map(x => Math.round(x.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(2);
    expect(await sinDesborde(page)).toBe(true);
    await expect(page.locator('header.admin-topbar')).toBeVisible();
  });

  test('390×844: móvil sin rail, barra inferior y sin scroll horizontal', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(rail(page)).toBeHidden();
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    expect(await sinDesborde(page)).toBe(true);
  });
});

test.describe('Logotipo del negocio en el rail', () => {
  const casos: { nombre: string; svg: string; fondo: string }[] = [
    { nombre: 'oscuro y transparente', svg: LOGOS.oscuro, fondo: 'claro' },
    { nombre: 'claro y transparente', svg: LOGOS.claro, fondo: 'oscuro' },
    { nombre: 'horizontal 4:1', svg: LOGOS.horizontal, fondo: 'claro' },
    { nombre: 'cuadrado con fondo propio', svg: LOGOS.cuadradoOpaco, fondo: 'claro' },
  ];
  for (const caso of casos) {
    test(`${caso.nombre}: contenido, sin deformar ni recortar y sobre un marco ${caso.fondo}`, async ({ page }) => {
      await preparar(page, { rol: 'ADMIN', logo: caso.svg });
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto('/');
      const imagen = page.locator('nav.app-rail .logo-marco-imagen');
      await expect(imagen).toBeVisible();
      await expect(page.locator('nav.app-rail .logo-marco')).toHaveAttribute('data-fondo', caso.fondo);
      expect(await imagen.evaluate(n => getComputedStyle(n).objectFit)).toBe('contain');
      const marco = await page.locator('nav.app-rail .logo-marco').boundingBox();
      const caja = await imagen.boundingBox();
      // El marco es un cuadrado de 56 px dentro del rail de 84 y la imagen queda dentro de él.
      expect(Math.round(marco!.width)).toBe(56);
      expect(Math.round(marco!.height)).toBe(56);
      expect(caja!.x).toBeGreaterThanOrEqual(marco!.x);
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(marco!.x + marco!.width + 0.5);
      expect(caja!.y + caja!.height).toBeLessThanOrEqual(marco!.y + marco!.height + 0.5);
      // La imagen no se deforma: el contenido pintado conserva la proporción natural (object-fit: contain).
      const { natural, pintado } = await imagen.evaluate((n: HTMLImageElement) => ({
        natural: n.naturalWidth / n.naturalHeight,
        pintado: n.clientWidth / n.clientHeight,
      }));
      expect(pintado).toBeCloseTo(1, 1); // la caja es cuadrada; contain la ajusta sin estirarla
      expect(natural).toBeGreaterThan(0);
      // El enlace sigue llevando a Inicio y el archivo original no se reemplaza por uno genérico.
      await expect(page.locator('nav.app-rail a.app-rail-brand')).toHaveAttribute('href', '/');
      await expect(imagen).toHaveAttribute('src', /^data:image\/svg\+xml/);
    });
  }

  test('sin logotipo el negocio muestra sus iniciales con el color de marca', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN' });
    await page.goto('/');
    await expect(page.locator('nav.app-rail .logo-marco-iniciales')).toHaveText('FR');
  });

  test('el cajero usa el mismo marco de logotipo', async ({ page }) => {
    await preparar(page, { rol: 'CAJERO', logo: LOGOS.oscuro });
    await page.goto('/');
    await expect(page.locator('nav.cajero-rail .logo-marco-imagen')).toBeVisible();
  });
});

test.describe('Super Admin: administración de empresas', () => {
  test('rail de herramientas globales, tarjetas compactas y sin selector de navegación', async ({ page }) => {
    await preparar(page, { rol: 'SUPERADMIN' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/admin?seccion=negocios');
    const navegacion = page.getByRole('navigation', { name: 'Áreas de la plataforma' });
    await expect(navegacion.getByRole('list').getByRole('link')).toHaveText(['Inicio', 'Empresas', 'Módulos', 'Usuarios y soporte', 'Auditoría']);
    await expect(navegacion.getByRole('link', { name: 'Empresas' })).toHaveAttribute('aria-current', 'page');
    const tarjetas = page.locator('.empresa-card');
    await expect(tarjetas).toHaveCount(4);
    // Altura según el contenido: sin espacios en blanco (ninguna tarjeta alta de más) y alineadas en fila.
    const medidas = await tarjetas.evaluateAll(n => n.map(x => { const r = x.getBoundingClientRect(); return { alto: r.height, top: Math.round(r.top) }; }));
    for (const m of medidas) expect(m.alto).toBeLessThan(190);
    expect(medidas[0].top).toBe(medidas[1].top);
    await expect(tarjetas.first().getByRole('button', { name: /Gestionar empresa/ })).toBeVisible();
    await expect(tarjetas.first().getByRole('button', { name: /soporte/i })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/TOPNAV|SIDEBAR/);
    expect(await sinDesborde(page)).toBe(true);
  });

  test('el menú «Gestionar empresa» se abre completo, se usa con teclado y navega', async ({ page }) => {
    await preparar(page, { rol: 'SUPERADMIN' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/admin?seccion=negocios');
    const boton = page.getByRole('button', { name: /Gestionar empresa: Ferretería El Tornillo Feliz/ });
    await boton.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const items = menu.getByRole('menuitem');
    await expect(items).toHaveCount(7);
    // Completo dentro del viewport y por encima del contenido.
    const caja = await menu.boundingBox();
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.y).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(1366);
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(768);
    for (const i of [0, 3, 6]) await expect(items.nth(i)).toBeInViewport({ ratio: 1 });
    const encima = await items.last().evaluate(n => { const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && n.contains(e); });
    expect(encima).toBe(true);
    // Teclado: foco en la primera opción, flechas, Escape devuelve el foco al botón.
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(boton).toBeFocused();
    // Clic fuera lo cierra.
    await boton.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(menu).toHaveCount(0);
    // Elegir una opción navega y cierra.
    await boton.click();
    await menu.getByRole('menuitem', { name: 'Usuarios del negocio' }).click();
    await expect(page).toHaveURL(/\/admin\/negocios\/emp-1\/usuarios$/);
  });

  test('cerca del borde inferior el menú se abre hacia arriba y no se recorta', async ({ page }) => {
    await preparar(page, { rol: 'SUPERADMIN', empresas: 6 });
    await page.setViewportSize({ width: 1366, height: 600 });
    await page.goto('/admin?seccion=negocios');
    const botones = page.getByRole('button', { name: /Gestionar empresa:/ });
    const ultimo = botones.last();
    await ultimo.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await ultimo.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const caja = await menu.boundingBox();
    expect(caja!.y).toBeGreaterThanOrEqual(0);
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(600);
    // Todas las opciones se alcanzan (si no caben, el menú se desplaza por dentro).
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await expect(menu.getByRole('menuitem').last()).toBeInViewport();
  });

  test('móvil 390×844: el menú cabe en pantalla y es utilizable', async ({ page }) => {
    await preparar(page, { rol: 'SUPERADMIN' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin?seccion=negocios');
    await page.getByRole('button', { name: /Gestionar empresa: Ferretería El Tornillo Feliz/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const caja = await menu.boundingBox();
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(390);
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(844);
    await menu.getByRole('menuitem', { name: 'Auditoría' }).click();
    await expect(page).toHaveURL(/\/admin\/negocios\/emp-1\/auditoria$/);
    expect(await sinDesborde(page)).toBe(true);
  });

  for (const [ancho, alto] of [[1920, 1080], [1600, 900], [1366, 768], [820, 1180], [390, 844]]) {
    test(`${ancho}×${alto}: lista de empresas sin scroll horizontal y acciones accesibles`, async ({ page }) => {
      await preparar(page, { rol: 'SUPERADMIN' });
      await page.setViewportSize({ width: ancho, height: alto });
      await page.goto('/admin?seccion=negocios');
      await expect(page.locator('.empresa-card').first()).toBeVisible();
      expect(await sinDesborde(page)).toBe(true);
      await expect(page.getByRole('button', { name: /Gestionar empresa:/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /soporte/i }).first()).toBeVisible();
    });
  }
});

// Capturas de evidencia del PR (solo bajo demanda: CAPTURAS_HIBRIDA=1). No forman parte de la comprobación.
test.describe('Capturas de evidencia', () => {
  test.skip(!process.env.CAPTURAS_HIBRIDA, 'solo bajo demanda');
  const carpeta = 'artifacts/hibrida';
  test('dashboard ADMIN 1920×1080 y 1366×768', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN', logo: LOGOS.oscuro });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('.admin-home__kpi')).toHaveCount(4);
    await page.screenshot({ path: `${carpeta}/01-dashboard-admin-1920x1080.png` });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: `${carpeta}/02-dashboard-admin-1366x768.png` });
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.screenshot({ path: `${carpeta}/02b-dashboard-admin-820x1180.png`, fullPage: true });
  });
  test('Super Admin: empresas y menú', async ({ page }) => {
    await preparar(page, { rol: 'SUPERADMIN' });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/admin?seccion=negocios');
    await expect(page.locator('.empresa-card').first()).toBeVisible();
    await page.screenshot({ path: `${carpeta}/03-superadmin-empresas.png` });
    await page.getByRole('button', { name: /Gestionar empresa: Distribuidora Ferretera del Valle/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.screenshot({ path: `${carpeta}/04-menu-gestionar-empresa.png` });
  });
  test('rail con logotipo oscuro y claro', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN', logo: LOGOS.oscuro });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await expect(page.locator('nav.app-rail .logo-marco-imagen')).toBeVisible();
    await page.locator('nav.app-rail').screenshot({ path: `${carpeta}/05-rail-logotipo-oscuro.png` });
  });
  test('rail con logotipo claro y horizontal', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN', logo: LOGOS.claro });
    await page.goto('/');
    await expect(page.locator('nav.app-rail .logo-marco-imagen')).toBeVisible();
    await page.locator('nav.app-rail').screenshot({ path: `${carpeta}/05b-rail-logotipo-claro.png` });
  });
  test('móvil ADMIN', async ({ page }) => {
    await preparar(page, { rol: 'ADMIN' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    await page.screenshot({ path: `${carpeta}/06-movil-admin.png` });
  });
  test('cajero y bodeguero', async ({ page }) => {
    await preparar(page, { rol: 'CAJERO' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await expect(rail(page)).toBeVisible();
    await page.screenshot({ path: `${carpeta}/07-cajero-hibrida.png` });
  });
  test('bodeguero', async ({ page }) => {
    await preparar(page, { rol: 'BODEGUERO' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await expect(rail(page)).toBeVisible();
    await page.screenshot({ path: `${carpeta}/07b-bodeguero-hibrida.png` });
  });
});
