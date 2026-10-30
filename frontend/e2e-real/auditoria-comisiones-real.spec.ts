import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

// Auditoría de producción 2026-10-30 (AUD-COM-01). Navegador real → API NestJS compilada → PostgreSQL temporal. Sin mocks.
// Comisiones de venta está activo por defecto, pero calcula en el navegador con `fecha` y `vendedorNombre`, campos que
// GET /ventas no devuelve. `test.fail()` documenta el defecto: la aserción expresa el comportamiento CORRECTO y la
// prueba solo se aprueba mientras el defecto exista. Al corregirlo, retirar `test.fail()`.

const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

async function ingresar(page: Page, email: string, ruta: string) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(email);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test('DEFECTO AUD-COM-01: Comisiones muestra las ventas reales del vendedor en el periodo', async ({ page }) => {
  test.fail();
  // Ventas sembradas del ADMIN del negocio A el 2026-10-01 (día de negocio en Tegucigalpa).
  const totalBd = Number(sql(`SELECT COALESCE(SUM(v.total),0) FROM ventas v JOIN usuarios u ON u.id=v.usuario_id
    WHERE u.email='admin.a@e2e.invalid' AND ((v.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Tegucigalpa')::date='2026-10-01'`));
  expect(totalBd).toBeGreaterThan(0);

  await ingresar(page, 'admin.a@e2e.invalid', '/comisiones');
  const fechas = page.locator('input[type="date"]');
  await fechas.nth(0).fill('2026-10-01');
  await fechas.nth(1).fill('2026-10-01');
  const fila = page.getByRole('row').filter({ hasText: 'Administrador E2E' });
  await expect(fila).toBeVisible();
  const celdas = fila.getByRole('cell');
  const totalPantalla = (await celdas.nth(3).innerText()).trim();
  const comisionPantalla = (await celdas.nth(4).innerText()).trim();
  test.info().annotations.push({ type: 'observado', description: `BD=${totalBd.toFixed(2)} pantalla total=${totalPantalla} comisión=${comisionPantalla}` });
  // «L. 1,234.50» → 1234.5: el prefijo «L.» contiene un punto, así que se toma el último número del texto.
  const aNumero = (texto: string) => Number((texto.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? ['NaN']).at(-1)!.replace(/,/g, ''));
  expect(aNumero(totalPantalla)).toBeCloseTo(totalBd, 2);
  expect(aNumero(comisionPantalla)).toBeGreaterThan(0);
});
