import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// E2E REAL: backend NestJS compilado + PostgreSQL temporal + frontend real. Sin mocks.
// Flujo del dueño: el personal captura un producto sin precio; el administrador lo fija y lo aprueba.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;

const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

async function tokenDe(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { token: body.accessToken as string, id: body.user.id as string };
}

async function ingresar(page: Page, email: string, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

// El personal del seed no tiene permisos de inventario: se conceden solo para esta prueba y se restauran al final.
test.beforeAll(() => {
  sql("UPDATE usuarios SET permisos=ARRAY['inventario.editar','inventario.ver'] WHERE email='bodeguero.a@e2e.invalid'");
});
test.afterAll(() => {
  sql("UPDATE usuarios SET permisos=ARRAY[]::text[] WHERE email='bodeguero.a@e2e.invalid'");
});

test('el personal captura sin precio; el dueño fija margen, aprueba y queda registrado', async ({ page, request }) => {
  const nombre = `Tubo PVC E2E ${Date.now()}`;
  const bodeguero = await tokenDe(request, 'bodeguero.a@e2e.invalid');
  const admin = await tokenDe(request, 'admin.a@e2e.invalid');

  // 1. Personal: alta sin precio. El API rechaza precio desde su rol.
  const conPrecio = await request.post(`${API}/productos`, {
    headers: { Authorization: `Bearer ${bodeguero.token}` },
    data: { codigo: `E2E-${Date.now()}`, nombre: `${nombre} X`, precioVenta: 5, precioCosto: 1, stockActual: 0, stockMinimo: 0 },
  });
  expect(conPrecio.status()).toBe(403);
  const alta = await request.post(`${API}/productos`, {
    headers: { Authorization: `Bearer ${bodeguero.token}` },
    data: { codigo: `PVC-${Date.now()}`, nombre, categoria: 'Plomería', stockActual: 12, stockMinimo: 2 },
  });
  expect(alta.status()).toBe(201);
  const producto = await alta.json();
  expect(Number(sql(`SELECT precio_venta FROM productos WHERE id='${producto.id}'`))).toBe(0);

  // 2. Personal: la lista de inventario muestra el producto como pendiente de precio.
  await ingresar(page, 'bodeguero.a@e2e.invalid', '/inventario');
  await expect(page.locator('tr', { hasText: nombre }).getByText(/pendiente de precio|price pending/i)).toBeVisible({ timeout: 20000 });

  // 3. Dueño: pantalla de precios, filtro de pendientes, margen calculado y aprobación.
  await ingresar(page, 'admin.a@e2e.invalid', '/precios');
  await page.getByRole('button', { name: /^Pendientes de precio$/ }).click();
  await page.getByRole('searchbox').fill(nombre);
  await page.getByRole('button', { name: new RegExp(nombre) }).click();
  await page.getByLabel('Costo', { exact: true }).fill('8');
  await page.getByLabel('Precio de venta', { exact: true }).fill('12');
  await expect(page.getByText('33.33 %')).toBeVisible();
  // Capturas opcionales para revisión: E2E_SCREENSHOT_DIR=<carpeta>.
  const capturas = process.env.E2E_SCREENSHOT_DIR;
  if (capturas) await page.screenshot({ path: join(capturas, 'precios-antes-de-aprobar.png'), fullPage: true });
  await page.getByRole('button', { name: 'Aprobar para venta' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto aprobado para venta.' })).toBeVisible({ timeout: 20000 });

  if (capturas) await page.screenshot({ path: join(capturas, 'precios-aprobado.png'), fullPage: true });
  // 4. Base de datos: precio, aprobación y responsable persistidos.
  const fila = sql(`SELECT precio_costo, precio_venta, precio_aprobado, precio_aprobado_por FROM productos WHERE id='${producto.id}'`);
  expect(fila).toBe(`8.00|12.00|t|${admin.id}`);
  expect(sql(`SELECT COUNT(*) FROM auditoria_operaciones WHERE entidad_id='${producto.id}' AND operacion='PRECIO_APROBAR' AND usuario_id='${admin.id}'`)).toBe('1');

  // 5. Personal: ya no puede cambiar precio, ni siquiera de un producto aprobado.
  const cambio = await request.patch(`${API}/productos/${producto.id}/precios`, {
    headers: { Authorization: `Bearer ${bodeguero.token}` },
    data: { version: 2, precioVenta: 99 },
  });
  expect(cambio.status()).toBe(403);
  expect(Number(sql(`SELECT precio_venta FROM productos WHERE id='${producto.id}'`))).toBe(12);
});
