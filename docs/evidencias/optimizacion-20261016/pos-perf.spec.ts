import { test, type Page } from '@playwright/test';
import fs from 'node:fs';
// Benchmark reproducible: backend simulado, catálogo de N productos. Mide bytes JS, peticiones API y tiempos.
const N = Number(process.env.PERF_N || 5000);
const tenant = { id: 't-perf', nombreComercial: 'Perf', colorPrimario: '#EA580C', modoNavegacion: 'SIDEBAR' };
const cajero = { id: 'u-perf', nombre: 'Cajero', email: 'c@p.invalid', rol: 'CAJERO' };
const productos = Array.from({ length: N }, (_, i) => ({ id: `p${i}`, codigo: `COD-${i}`, nombre: `Producto ${i} ${['tornillo','clavo','pintura','tubo','cable'][i % 5]}`,
  codigoBarras: String(7400000000000 + i), codigoFabricante: `F${i}`, descripcion: `Descripción ${i}`, categoria: { nombre: 'General' },
  unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 10 + (i % 90), stockActual: 50, stockMinimo: 1, activo: true, imagenUrl: null }));
const out: Record<string, unknown> = {};
async function prepare(page: Page, api: string[], js: { url: string; bytes: number }[]) {
  page.on('response', async r => { const u = new URL(r.url()); if (u.pathname.endsWith('.js')) { try { js.push({ url: u.pathname, bytes: (await r.body()).length }); } catch {} } });
  await page.route('**/*', async route => {
    const req = route.request(); const url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) { if (url.hostname === '127.0.0.1') return route.continue(); return route.abort(); }
    const path = url.pathname.slice(4); const m = req.method(); api.push(`${m} ${path}`);
    const json = (b: unknown) => route.fulfill({ status: 200, json: b });
    if (path === '/tenant/settings') return json(tenant);
    if (path === '/auth/me') return json({ user: { sub: cajero.id, tenantId: tenant.id, rol: 'CAJERO', permisos: [], descuentoMaximo: 0 } });
    if (path === '/auth/login') return json({ type: 'tenant', accessToken: 'tok', user: cajero, tenant });
    if (path === '/productos/comercial') return json(productos);
    if (path === '/operaciones/caja') return json([{ id: 'c1', estado: 'ABIERTA', usuario_id: cajero.id, totales: {}, movimientos: [] }]);
    if (path === '/dashboard') return json({ ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } });
    return json([]);
  });
}
test('POS con catálogo grande', async ({ page }) => {
  test.setTimeout(180_000);
  const api: string[] = []; const js: { url: string; bytes: number }[] = [];
  await prepare(page, api, js);
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]');
  out.loginJsBytes = js.reduce((s, x) => s + x.bytes, 0); out.loginJsFiles = js.length;
  await page.locator('input[type="email"]').fill('c@p.invalid');
  await page.locator('input[type="password"]').fill('x');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');
  const jsAntes = js.length; const bytesAntes = js.reduce((s, x) => s + x.bytes, 0); api.length = 0;
  const t0 = Date.now();
  await page.getByRole('link', { name: /Punto de Venta|POS/i }).first().click().catch(async () => { await page.goto('/pos'); });
  await page.waitForSelector('.ferre-pos-catalog .industrial-card');
  out.posFirstProductMs = Date.now() - t0;
  await page.waitForLoadState('networkidle');
  out.posJsBytesAdicionales = js.reduce((s, x) => s + x.bytes, 0) - bytesAntes; out.posJsArchivos = js.slice(jsAntes).map(x => `${x.url}:${x.bytes}`);
  out.posApi = [...api];
  out.posCardsRendered = await page.locator('.ferre-pos-catalog .industrial-card').count();
  const search = page.getByPlaceholder(/buscar|search/i).first();
  // Tiempo de tecleo: cada carácter hasta que el navegador pinta (doble rAF).
  const tiempos: number[] = [];
  for (const texto of ['t', 'to', 'tor', 'torn', '']) {
    const ms = await page.evaluate(async (v) => {
      const el = document.querySelector('.ferre-pos-main input[type="text"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const t = performance.now(); setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t;
    }, texto);
    tiempos.push(Math.round(ms));
  }
  out.busquedaMsPorTecla = tiempos;
  // Agregar al carrito: clic en una tarjeta hasta pintar.
  const add: number[] = [];
  for (let i = 0; i < 5; i++) {
    add.push(Math.round(await page.evaluate(async (i) => {
      const el = document.querySelectorAll('.ferre-pos-catalog .industrial-card')[i] as HTMLElement;
      const t = performance.now(); el.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t;
    }, i)));
  }
  out.agregarCarritoMs = add;
  // Escritura en el nombre del cliente (re-render del POS completo).
  const cli: number[] = [];
  for (const v of ['A', 'An', 'Ana']) {
    cli.push(Math.round(await page.evaluate(async (v) => {
      const el = document.querySelector('input[placeholder]') && [...document.querySelectorAll('.ferre-pos-main input[type="text"]')][1] as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const t = performance.now(); setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t;
    }, v)));
  }
  out.clienteMsPorTecla = cli;
  const mem = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize);
  out.heapBytes = mem; out.domNodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  fs.writeFileSync(process.env.PERF_OUT || 'perf.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
});
