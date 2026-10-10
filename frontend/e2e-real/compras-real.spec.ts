import { execFileSync } from 'node:child_process';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// E2E REAL: backend NestJS compilado + PostgreSQL temporal + frontend real. Sin mocks.
// Flujo de compras: proveedor → factura y productos → confirmar → recepción parcial → recepción total → deuda.

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

const BODEGUERO = 'bodeguero.a@e2e.invalid';
let nombre = '';
let productoId = '';
let proveedorId = '';
let factura = '';

test.describe.serial('Compras con backend real', () => {
  test.beforeAll(async ({ request }) => {
    // El personal del seed no tiene permisos de compras: se conceden solo para esta prueba y se restauran.
    sql(`UPDATE usuarios SET permisos=ARRAY['inventario.editar','inventario.ver','ordenes_compra'] WHERE email='${BODEGUERO}'`);
    const admin = await tokenDe(request, 'admin.a@e2e.invalid');
    nombre = `Tornillo E2E ${Date.now()}`;
    factura = `FAC-E2E-${Date.now()}`;
    const prod = await request.post(`${API}/productos`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { codigo: `TOR-${Date.now()}`, nombre, categoria: 'Ferretería', stockActual: 0, stockMinimo: 0, precioVenta: 8, precioCosto: 0 },
    });
    expect(prod.status()).toBe(201);
    productoId = (await prod.json()).id;
    const prov = await request.post(`${API}/operaciones/proveedores`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { solicitudId: crypto.randomUUID(), nombre: `Proveedor E2E ${Date.now()}` },
    });
    expect(prov.status()).toBe(201);
    proveedorId = (await prov.json()).id;
  });

  test.afterAll(() => {
    sql(`UPDATE usuarios SET permisos=ARRAY[]::text[] WHERE email='${BODEGUERO}'`);
  });

  test('administrador: confirma la compra, recibe parcial y luego el resto; existencias, costo y deuda quedan en base de datos', async ({ page }) => {
    // La recepción aumenta existencias: la interfaz pide confirmación.
    page.on('dialog', (d) => void d.accept());
    await ingresar(page, 'admin.a@e2e.invalid', '/ordenes-compra');
    if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/compras-inicio.png`, fullPage: true });
    await page.getByLabel(/^Proveedor/).selectOption({ value: proveedorId });
    await page.getByLabel('Número de factura', { exact: true }).fill(factura);
    await page.getByLabel(/^Producto/).selectOption({ value: productoId });
    await page.getByLabel('Cantidad', { exact: true }).fill('10');
    await page.getByLabel('Costo unitario', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Agregar producto' }).click();
    await expect(page.getByText('L. 50.00').first()).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar compra' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Compra registrada' })).toBeVisible({ timeout: 20000 });

    const tarjeta = page.getByRole('article').filter({ hasText: factura });
    await expect(tarjeta.getByText('Pendiente de recibir')).toBeVisible();
    await expect(tarjeta.getByText('Saldo por pagar')).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Recibir mercancía' }).click();
    await tarjeta.getByLabel(`Recibir ahora ${nombre}`).fill('4');
    await tarjeta.getByRole('button', { name: 'Confirmar recepción' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Recepción registrada' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('article').filter({ hasText: factura }).getByText('Recepción parcial')).toBeVisible();

    // Recepción total del resto: "Recibir todo" llena lo pendiente.
    await page.getByRole('article').filter({ hasText: factura }).getByRole('button', { name: 'Recibir mercancía' }).click();
    await page.getByRole('article').filter({ hasText: factura }).getByRole('button', { name: 'Recibir todo' }).click();
    await page.getByRole('article').filter({ hasText: factura }).getByRole('button', { name: 'Confirmar recepción' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Recepción registrada' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('article').filter({ hasText: factura }).getByText('Recibida', { exact: true })).toBeVisible();

    // Base de datos: existencias y costo vigente de la última recepción; una sola deuda por el total.
    expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`))).toBe(10);
    expect(Number(sql(`SELECT costo_vigente FROM productos WHERE id='${productoId}'`))).toBe(5);
    expect(sql(`SELECT COUNT(*) FROM cuentas_operativas c JOIN ordenes_compra o ON o.id=c.documento_id WHERE o.numero_factura='${factura}' AND c.tipo='CXP'`)).toBe('1');
    expect(Number(sql(`SELECT c.saldo FROM cuentas_operativas c JOIN ordenes_compra o ON o.id=c.documento_id WHERE o.numero_factura='${factura}' AND c.tipo='CXP'`))).toBe(50);
  });

  test('personal de bodega: recibe la mercancía sin ver costos', async ({ page, request }) => {
    page.on('dialog', (d) => void d.accept());
    const admin = await tokenDe(request, 'admin.a@e2e.invalid');
    const otra = `FAC-BOD-${Date.now()}`;
    const res = await request.post(`${API}/operaciones/compras`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { solicitudId: crypto.randomUUID(), proveedorId, numeroFactura: otra, isv: 0, items: [{ productoId, cantidad: 3, costo: 6 }] },
    });
    expect(res.status()).toBe(201);
    await ingresar(page, BODEGUERO, '/ordenes-compra');
    const tarjeta = page.getByRole('article').filter({ hasText: otra });
    await expect(tarjeta).toBeVisible({ timeout: 20000 });
    await tarjeta.getByRole('button', { name: 'Recibir mercancía' }).click();
    await expect(tarjeta.getByText(/Costo unitario:/)).toHaveCount(0);
    await expect(tarjeta.getByText(/Saldo por pagar/)).toHaveCount(0);
    await tarjeta.getByLabel(`Recibir ahora ${nombre}`).fill('3');
    await tarjeta.getByRole('button', { name: 'Confirmar recepción' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Recepción registrada' })).toBeVisible({ timeout: 20000 });
    expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`))).toBe(13);
    expect(Number(sql(`SELECT costo_vigente FROM productos WHERE id='${productoId}'`))).toBe(6);
  });
});
