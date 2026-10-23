import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Inventario en NAVEGADOR REAL (Chromium) contra backend NestJS y PostgreSQL temporales (run.sh). Sin page.route.
// El alta de producto con existencias iniciales se hace desde /inventario; la persistencia se verifica en PostgreSQL.
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

const ADMIN = 'admin.a@e2e.invalid';

async function ingresar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(ADMIN);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test('inventario en navegador real: alta de producto con existencias desde la pantalla y persistencia verificada en PostgreSQL', async ({ page }) => {
  const nombre = `Taladro interfaz ${randomUUID().slice(0, 8)}`;
  await ingresar(page, '/inventario');
  await page.getByRole('button', { name: /NUEVO PRODUCTO/i }).click();
  await page.getByLabel(/Nombre y variante/).fill(nombre);
  await page.getByLabel(/PRECIO VENTA/).fill('150');
  await page.getByLabel(/PRECIO COSTO/).fill('80');
  await page.getByLabel(/STOCK INICIAL/).fill('7');
  await page.getByRole('button', { name: 'GUARDAR PRODUCTO' }).click();

  // Persistencia en PostgreSQL: el producto existe con sus existencias y precios.
  await expect.poll(() => sql(`SELECT COUNT(*) FROM productos p JOIN tenants t ON t.id=p.tenant_id WHERE t.nombre_comercial='Ferretería Central E2E' AND p.nombre='${nombre}'`), { timeout: 15_000 }).toBe('1');
  expect(Number(sql(`SELECT stock_actual FROM productos WHERE nombre='${nombre}'`))).toBe(7);
  expect(Number(sql(`SELECT precio_venta FROM productos WHERE nombre='${nombre}'`))).toBeCloseTo(150, 2);
  expect(Number(sql(`SELECT precio_costo FROM productos WHERE nombre='${nombre}'`))).toBeCloseTo(80, 2);

  // La pantalla lo muestra tras recargar, leyendo del backend.
  await page.reload();
  await page.getByPlaceholder('Buscar por código o nombre de producto...').fill(nombre);
  // Se comprueba la fila de la tabla (no las opciones de un selector que repiten el nombre).
  const fila = page.getByRole('table').getByRole('row').filter({ hasText: nombre });
  await expect(fila).toBeVisible({ timeout: 15_000 });
  await expect(fila).toContainText('7 físicos');
});
