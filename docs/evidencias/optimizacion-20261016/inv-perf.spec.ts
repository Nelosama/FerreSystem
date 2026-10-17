import { test } from '@playwright/test';
import fs from 'node:fs';
// Inventario como ADMIN con N productos: tiempo por tecla en el nombre del alta de producto y en la búsqueda.
const N = Number(process.env.PERF_N || 5000);
const tenant = { id: 't-perf', nombreComercial: 'Perf', colorPrimario: '#EA580C', modoNavegacion: 'SIDEBAR' };
const admin = { id: 'u-adm', nombre: 'Admin', email: 'a@p.invalid', rol: 'ADMIN' };
const productos = Array.from({ length: N }, (_, i) => ({ id: `p${i}`, codigo: `COD-${i}`, nombre: `Producto ${i}`, codigoBarras: String(7400000000000 + i), codigoFabricante: null,
  descripcion: null, categoria: { id: 'c', nombre: 'General' }, categoriaId: 'c', unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 10, precioCosto: 5, precioAprobado: true,
  stockActual: 5, stockReservado: 0, stockDisponible: 5, stockMinimo: 1, activo: true, imagenUrl: null, marca: null, version: 1 }));
test('Inventario con catálogo grande', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) { if (url.hostname === '127.0.0.1') return route.continue(); return route.abort(); }
    const path = url.pathname.slice(4); const json = (b: unknown) => route.fulfill({ status: 200, json: b });
    if (path === '/tenant/settings') return json(tenant);
    if (path === '/auth/me') return json({ user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], descuentoMaximo: 100 } });
    if (path === '/auth/login') return json({ type: 'tenant', accessToken: 'tok', user: admin, tenant });
    if (path === '/productos') return json(productos);
    if (path === '/dashboard') return json({ ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 }, tendenciaSemanal: [], ultimasVentas: [] });
    return json([]);
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('a@p.invalid');
  await page.locator('input[type="password"]').fill('x');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  await page.goto('/inventario');
  await page.waitForSelector('tbody tr:nth-child(100)');
  await page.getByRole('button', { name: /NUEVO PRODUCTO/i }).first().click();
  await page.waitForSelector('#create-name');
  const medir = (sel: string, v: string) => page.evaluate(async ([sel, v]) => {
    const el = document.querySelector(sel) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const t = performance.now(); setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t);
  }, [sel, v]);
  const alta: number[] = []; for (const v of ['T', 'Ta', 'Tal', 'Tala', 'Talad']) alta.push(await medir('#create-name', v));
  const out = { altaNombreMsPorTecla: alta, filas: await page.locator('tbody tr').count() };
  fs.writeFileSync(process.env.PERF_OUT || 'inv.json', JSON.stringify(out));
  console.log(JSON.stringify(out));
});
