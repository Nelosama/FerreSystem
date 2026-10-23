import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { confirmarAlerta } from '../e2e/helpers/alertas';

// Compras y proveedores en NAVEGADOR REAL (Chromium) contra backend NestJS y PostgreSQL temporales (run.sh). Sin page.route.
// Desde la pantalla /ordenes-compra se registra el proveedor, la factura de compra y la recepción de mercancía; también se intenta
// repetir la factura. Cada efecto (proveedor, saldo, existencias, costo vigente, trazabilidad del usuario) se verifica en PostgreSQL.
// El producto se prepara por la API porque esta pantalla no crea productos; eso no forma parte del flujo que se prueba.
const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

const ADMIN = 'admin.a@e2e.invalid';
const EMPRESA = 'Ferretería Central E2E';

async function ingresar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test('compras en navegador real: proveedor, factura, recepción con costo vigente, factura duplicada y trazabilidad verificados en PostgreSQL', async ({ page, request }) => {
  const codigo = `UI${randomUUID().slice(0, 6).toUpperCase()}`;
  const nombreProducto = `Compra ${codigo}`;
  const nombreProveedor = `Proveedor ${codigo}`;
  const factura = `FAC-${codigo}`;

  // Preparación por API: producto sin existencias y con un costo anterior distinto al de la compra.
  const login = await request.post(`${API}/auth/login`, { data: { email: ADMIN, password: PASSWORD } });
  expect(login.status()).toBe(200);
  const { accessToken, user } = await login.json();
  const alta = await request.post(`${API}/productos`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { solicitudId: randomUUID(), codigo, nombre: nombreProducto, precioVenta: 20, precioCosto: 6, stockActual: 0, stockMinimo: 1 },
  });
  expect(alta.status(), await alta.text()).toBeLessThan(300);
  const productoId = (await alta.json()).id as string;
  const tenantId = sql(`SELECT id FROM tenants WHERE nombre_comercial='${EMPRESA}' LIMIT 1`);

  await ingresar(page, '/ordenes-compra');

  // 1) Proveedor desde la pantalla.
  const formProveedor = page.locator('form', { has: page.getByRole('heading', { name: 'Registrar proveedor' }) });
  await formProveedor.getByLabel('Nombre').fill(nombreProveedor);
  await formProveedor.getByLabel('Teléfono').fill('2200-0000');
  await formProveedor.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect.poll(() => sql(`SELECT COUNT(*) FROM proveedores WHERE tenant_id='${tenantId}' AND nombre='${nombreProveedor}'`), { timeout: 15_000 }).toBe('1');
  const proveedorId = sql(`SELECT id FROM proveedores WHERE tenant_id='${tenantId}' AND nombre='${nombreProveedor}'`);

  // 2) Factura de compra con un producto, 4 unidades a costo 7.
  const formFactura = page.locator('form', { has: page.getByRole('heading', { name: 'Registrar factura de compra' }) });
  const registrarFactura = async () => {
    await formFactura.getByLabel('Proveedor').selectOption({ label: nombreProveedor });
    await formFactura.getByLabel('Número de factura').fill(factura);
    await formFactura.getByLabel('Producto').selectOption({ value: productoId });
    await formFactura.getByLabel('Cantidad').fill('4');
    await formFactura.getByLabel('Costo de esta compra').fill('7');
    await formFactura.getByRole('button', { name: 'Agregar producto' }).click();
    await formFactura.getByRole('button', { name: 'Registrar factura' }).click();
  };
  await registrarFactura();
  await expect.poll(() => sql(`SELECT COUNT(*) FROM ordenes_compra WHERE tenant_id='${tenantId}' AND numero_factura='${factura}'`), { timeout: 15_000 }).toBe('1');
  const ordenId = sql(`SELECT id FROM ordenes_compra WHERE tenant_id='${tenantId}' AND numero_factura='${factura}'`);

  // Trazabilidad: la orden queda ligada al proveedor y al usuario que la registró. Registrar la factura no mueve existencias.
  expect(sql(`SELECT proveedor_id||'|'||usuario_id FROM ordenes_compra WHERE id='${ordenId}'`)).toBe(`${proveedorId}|${user.id}`);
  expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`))).toBe(0);
  expect(Number(sql(`SELECT cantidad FROM detalles_orden_compra WHERE orden_id='${ordenId}' AND producto_id='${productoId}'`))).toBe(4);

  // 3) Recepción desde la pantalla (la pantalla pide confirmar con window.confirm; se acepta como lo haría la persona).
  const tarjeta = page.locator('section.operation-card').filter({ hasText: factura });
  await expect(tarjeta).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta).toContainText(nombreProveedor);
  await tarjeta.getByRole('button', { name: 'Confirmar recepción' }).click();
  await confirmarAlerta(page);

  // Existencias y costo vigente actualizados en PostgreSQL; el movimiento de inventario apunta a la compra y al usuario.
  await expect.poll(() => Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`)), { timeout: 15_000 }).toBe(4);
  expect(Number(sql(`SELECT precio_costo FROM productos WHERE id='${productoId}'`))).toBe(7);
  expect(Number(sql(`SELECT cantidad_recibida FROM detalles_orden_compra WHERE orden_id='${ordenId}' AND producto_id='${productoId}'`))).toBe(4);
  expect(sql(`SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id='${productoId}' AND tipo='COMPRA' AND cantidad=4 AND motivo='Factura ${factura}' AND usuario_id='${user.id}'`)).toBe('1');

  // 4) La pantalla refleja la recepción leyendo del backend.
  await page.reload();
  const tarjetaRecargada = page.locator('section.operation-card').filter({ hasText: factura });
  await expect(tarjetaRecargada).toBeVisible({ timeout: 15_000 });
  await expect(tarjetaRecargada.getByRole('button', { name: 'Confirmar recepción' })).toHaveCount(0);

  // 5) Factura duplicada del mismo proveedor: la pantalla muestra el rechazo y la base no cambia.
  await registrarFactura();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  expect(sql(`SELECT COUNT(*) FROM ordenes_compra WHERE tenant_id='${tenantId}' AND proveedor_id='${proveedorId}' AND numero_factura='${factura}'`)).toBe('1');
  expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`))).toBe(4);
  expect(sql(`SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id='${productoId}' AND tipo='COMPRA'`)).toBe('1');
});
