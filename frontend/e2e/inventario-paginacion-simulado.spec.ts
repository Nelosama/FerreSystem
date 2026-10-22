import { expect, test, type Page } from '@playwright/test';

// E2E CON BACKEND SIMULADO: con un catálogo grande, Inventario pinta 200 filas a la vez; «Mostrar más» amplía y
// cualquier búsqueda o cambio de categoría busca en todo el catálogo y vuelve a la primera página.

const tenant = { id: 'tenant-inv-pag-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'user-ADMIN', nombre: 'Admin de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };
const productos = Array.from({ length: 450 }, (_, i) => ({
  id: `p-${i}`, codigo: `COD-${String(i).padStart(4, '0')}`, nombre: `Producto ${i}`, codigoBarras: null, codigoFabricante: null,
  descripcion: null, marca: null, categoria: { id: i % 2 ? 'c2' : 'c1', nombre: i % 2 ? 'Plomería' : 'Electricidad' }, categoriaId: i % 2 ? 'c2' : 'c1',
  unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 10, precioCosto: 5, margen: null, precioAprobado: true,
  stockActual: 10, stockReservado: 0, stockDisponible: 10, stockMinimo: 1, activo: true, imagenUrl: null, version: 1,
}));

async function abrirInventario(page: Page, baseURL: string | undefined, errores: string[]) {
  const origen = new URL(baseURL!).origin;
  const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
  page.on('pageerror', e => errores.push(e.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
    const method = request.method();
    const path = url.pathname.slice(4);
    const responder = (body: unknown) => route.fulfill({ status: 200, json: body, headers: cabeceras });
    if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
    if (method === 'GET' && path === '/tenant/settings') return responder(tenant);
    if (method === 'GET' && path === '/auth/me') return responder({ user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], descuentoMaximo: 100 } });
    if (method === 'POST' && path === '/auth/login') return responder({ type: 'tenant', accessToken: 'inv-pag-token', user: admin, tenant });
    if (method === 'GET' && path === '/productos') return responder(productos);
    if (method === 'GET') return responder([]);
    return responder({});
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  await page.goto('/inventario');
}

test('Inventario pagina 450 productos de 200 en 200 y la búsqueda recorre todo el catálogo', async ({ page, baseURL }) => {
  const errores: string[] = [];
  await abrirInventario(page, baseURL, errores);
  const filas = page.locator('table.industrial-table tbody tr');
  await expect(filas).toHaveCount(200);
  await expect(page.getByText('Mostrando 200 de 450 productos.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar más' }).click();
  await expect(filas).toHaveCount(400);
  await page.getByRole('button', { name: 'Mostrar más' }).click();
  await expect(filas).toHaveCount(450);
  await expect(page.getByRole('button', { name: 'Mostrar más' })).toHaveCount(0);

  // Un producto fuera de la primera página se encuentra al buscar; borrar la búsqueda vuelve a 200.
  await page.getByPlaceholder(/Buscar por código o nombre/).fill('COD-0449');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Producto 449');
  await page.getByPlaceholder(/Buscar por código o nombre/).fill('');
  await expect(filas).toHaveCount(200);

  await page.getByRole('button', { name: 'Plomería', exact: true }).click();
  await expect(filas).toHaveCount(200);
  await expect(page.getByText('Mostrando 200 de 225 productos.', { exact: false })).toBeVisible();
  expect(errores).toEqual([]);
});
