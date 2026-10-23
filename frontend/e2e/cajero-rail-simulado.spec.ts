import { test, expect, type Page } from '@playwright/test';

// Rail del cajero y shell del Super Admin: resoluciones de PWA (con escalado de Windows), un solo cierre de sesión
// por contexto y contraste del estado activo con cualquier color de negocio.
async function setup(page: Page, role: string, color = '#1D4ED8') {
  const company = { id: 'ux-company', nombreComercial: 'Ferretería El Roble', colorPrimario: color, modoNavegacion: 'SIDEBAR', idioma: 'es' };
  const user = { id: 'ux-user', nombre: 'María Castro', rol: role, permisos: [] };
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
    if (url.pathname === '/api/tenant/settings' || /^\/api\/admin\/tenants\/[^/]+\/settings$/.test(url.pathname)) { await route.fulfill({ json: company }); return; }
    if (/\/logo$/.test(url.pathname)) { await route.fulfill({ status: 404, json: {} }); return; }
    const data: Record<string, unknown> = {
      '/api/auth/me': { user: { ...user, sub: user.id, tenantId: company.id, type: role === 'SUPERADMIN' ? 'super_admin' : 'tenant' } },
      '/api/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
      '/api/maintenance/backup': { configured: false },
      '/api/admin/dashboard': {},
    };
    await route.fulfill({ json: data[url.pathname] ?? [] });
  });
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

// Pantallas de PWA habituales: 1366×768 y 1920×1080, más 1920×1080 con escalado de Windows al 125 % y al 150 %.
const pantallas = [
  { nombre: '1366×768', width: 1366, height: 768 },
  { nombre: '1920×1080', width: 1920, height: 1080 },
  { nombre: '1920×1080 al 125 %', width: 1536, height: 864 },
  { nombre: '1920×1080 al 150 %', width: 1280, height: 720 },
];

for (const pantalla of pantallas) {
  test(`cajero ${pantalla.nombre}: rail legible, sin desbordes y «Más» dentro de la pantalla`, async ({ page }) => {
    await setup(page, 'CAJERO');
    await page.setViewportSize({ width: pantalla.width, height: pantalla.height });
    await page.goto('/pos');
    const rail = page.locator('nav.cajero-rail');
    await expect(rail).toBeVisible();
    expect((await rail.boundingBox())!.width).toBeCloseTo(84, 0);
    for (const nombre of ['Inicio', 'Caja', 'Mi caja']) await expect(rail.getByRole('link', { name: new RegExp(`^${nombre}`) })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Más' })).toBeVisible();
    // Etiquetas de al menos 12 px y sin desborde horizontal de la página.
    const tamanos = await rail.locator('.app-rail-item > span:last-child').evaluateAll(nodos => nodos.map(n => parseFloat(getComputedStyle(n).fontSize)));
    expect(Math.min(...tamanos)).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // «Más» abre el resto de accesos y el panel cabe en la pantalla.
    await rail.getByRole('button', { name: 'Más' }).click();
    const panel = page.locator('#app-rail-panel-mas');
    await expect(panel).toBeVisible();
    expect(await panel.getByRole('link').count()).toBeGreaterThan(0);
    const caja = (await panel.boundingBox())!;
    expect(caja.y).toBeGreaterThanOrEqual(0);
    expect(caja.y + caja.height).toBeLessThanOrEqual(pantalla.height);
  });
}

test('cajero: «Más» solo ofrece accesos que existen y llevan a su pantalla', async ({ page }) => {
  await setup(page, 'CAJERO');
  await page.goto('/pos');
  await page.locator('nav.cajero-rail').getByRole('button', { name: 'Más' }).click();
  const enlaces = page.locator('#app-rail-panel-mas a');
  const rutas = await enlaces.evaluateAll(links => links.map(a => a.getAttribute('href')));
  expect(rutas.length).toBeGreaterThan(0);
  expect(rutas).not.toContain('/pos');
  expect(rutas).not.toContain('/arqueo-caja');
  // Cada acceso del panel navega a su ruta y la deja marcada como activa en una sola pantalla.
  await enlaces.first().click();
  await expect(page).toHaveURL(new RegExp(`${rutas[0]}$`));
  await expect(page.locator('#app-rail-panel-mas')).toHaveCount(0);
});

for (const contexto of [{ rol: 'CAJERO', inicio: '/pos' }, { rol: 'SUPERADMIN', inicio: '/admin' }]) {
  test(`${contexto.rol}: un solo cierre de sesión accesible y funciona`, async ({ page }) => {
    await setup(page, contexto.rol);
    await page.goto(contexto.inicio);
    const cerrar = page.getByTitle(/^(Cerrar Sesión|Log Out)$/);
    await expect(cerrar).toHaveCount(1);
    await expect(page.getByRole('button', { name: /cerrar sesi[oó]n|salir|log out/i })).toHaveCount(1);
    await cerrar.click();
    await expect(page).toHaveURL(/\/login$/);
  });
}

for (const color of ['#F5C400', '#FDE68A', '#FFFFFF', '#EA580C', '#0F172A', '#000000']) {
  test(`cajero: el estado activo del rail se distingue con el color de negocio ${color}`, async ({ page }) => {
    await setup(page, 'CAJERO', color);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/pos');
    await expect(page.locator('nav.cajero-rail a.is-active')).toHaveCount(1);
    const medidas = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const g = canvas.getContext('2d')!;
      const rgba = (c: string) => { g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const rail = document.querySelector('nav.cajero-rail')!;
      const activo = rail.querySelector('a.is-active')!;
      const pastilla = activo.querySelector('.app-rail-pill')!;
      const icono = pastilla.querySelector('svg')!;
      const anillo = /(color\([^)]*\)|rgba?\([^)]*\))/.exec(getComputedStyle(pastilla).boxShadow)?.[1] ?? 'transparent';
      return {
        fondoRail: rgba(getComputedStyle(rail).backgroundColor),
        pastilla: rgba(getComputedStyle(pastilla).backgroundColor),
        anillo: rgba(anillo),
        icono: rgba(getComputedStyle(icono).color),
        etiqueta: rgba(getComputedStyle(activo).color),
      };
    });
    const sobre = (c: number[], fondo: number[]) => [0, 1, 2].map(i => c[i] * c[3] + fondo[i] * (1 - c[3]));
    const pastillaSobreRail = sobre(medidas.pastilla, medidas.fondoRail);
    // El icono activo se lee sobre su pastilla (3:1, componente de interfaz) y la etiqueta sobre el rail (4.5:1, texto).
    expect(contraste(medidas.icono, pastillaSobreRail)).toBeGreaterThanOrEqual(3);
    expect(contraste(medidas.etiqueta, medidas.fondoRail)).toBeGreaterThanOrEqual(4.5);
    // La pastilla activa se distingue del rail aunque el color del negocio sea muy oscuro: contorno de 3:1.
    expect(contraste(sobre(medidas.anillo, medidas.fondoRail), medidas.fondoRail)).toBeGreaterThanOrEqual(3);
  });
}
