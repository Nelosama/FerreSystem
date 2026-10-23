import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { confirmarAlerta } from '../e2e/helpers/alertas';

// Caja en NAVEGADOR REAL (Chromium) contra backend NestJS y PostgreSQL temporales (run.sh). Sin page.route.
// La apertura y el cierre se hacen desde la pantalla /arqueo-caja. La venta del día se registra por API para no depender
// del POS en esta prueba; el POS en navegador está cubierto por otras suites.
const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

const CAJERO = 'cajero.a@e2e.invalid';
const TENANT = 'e2e-empresa-a';

async function login(request: APIRequestContext) {
  const res = await request.post(`${API}/auth/login`, { data: { email: CAJERO, password: PASSWORD } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return { token: body.accessToken as string, id: body.user.id as string };
}

async function ingresar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(CAJERO);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test('caja en navegador real: abrir desde la pantalla, registrar cobro, cerrar desde la pantalla y verificar la conciliación', async ({ page, request }) => {
  const cajero = await login(request);
  const auth = { Authorization: `Bearer ${cajero.token}` };

  // Estado limpio: si otras pruebas dejaron una caja abierta de este cajero, se cierra por API con su efectivo esperado.
  const previas = await (await request.get(`${API}/operaciones/caja`, { headers: auth })).json() as any[];
  for (const c of previas.filter((x) => x.estado === 'ABIERTA')) {
    const r = await request.post(`${API}/operaciones/caja/${c.id}/cerrar`, { headers: auth, data: { monto: Number(c.efectivoEsperado) } });
    expect(r.status()).toBeLessThan(300);
  }

  // 1. Apertura desde la pantalla.
  await ingresar(page, '/arqueo-caja');
  await page.getByLabel('Fondo inicial').fill('500');
  await page.getByRole('button', { name: 'Abrir caja' }).click();
  await expect.poll(() => sql(`SELECT estado FROM cajas WHERE tenant_id=(SELECT id FROM tenants WHERE nombre_comercial='Ferretería Central E2E') AND usuario_id='${cajero.id}' ORDER BY fecha_apertura DESC LIMIT 1`), { timeout: 15_000 }).toBe('ABIERTA');
  const cajaId = sql(`SELECT id FROM cajas WHERE usuario_id='${cajero.id}' AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1`);
  expect(Number(sql(`SELECT monto_apertura FROM cajas WHERE id='${cajaId}'`))).toBeCloseTo(500, 2);

  // 2. Venta de contado del turno (por API) para que el efectivo esperado incluya un cobro.
  const producto = sql(`SELECT id FROM productos WHERE tenant_id=(SELECT id FROM tenants WHERE nombre_comercial='Ferretería Central E2E') AND precio_aprobado=true AND stock_actual>=2 ORDER BY codigo LIMIT 1`);
  const venta = await request.post(`${API}/ventas`, { headers: auth, data: { solicitudId: randomUUID(), detalles: [{ productoId: producto, cantidad: 1 }], metodoPago: 'EFECTIVO', tipoPago: 'CONTADO' } });
  expect(venta.status()).toBeLessThan(300);
  const total = Number((await venta.json()).total);

  // 3. Cierre desde la pantalla con el efectivo contado igual al esperado.
  await page.reload();
  const esperado = Number((await (await request.get(`${API}/operaciones/caja`, { headers: auth })).json() as any[]).find((c) => c.id === cajaId)?.efectivoEsperado);
  expect(esperado).toBeCloseTo(500 + total, 2);
  await page.getByLabel('Efectivo contado').fill(String(esperado));
  // La pantalla pide confirmación antes de cerrar: se acepta en el modal de la aplicación.
  const cierreRespuesta = page.waitForResponse((r) => r.request().method() === 'POST' && /\/operaciones\/caja\/[^/]+\/cerrar$/.test(r.url()), { timeout: 15_000 });
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await confirmarAlerta(page);
  const cierre = await cierreRespuesta;
  expect(cierre.status(), await cierre.text()).toBeLessThan(300);
  await expect.poll(() => sql(`SELECT estado FROM cajas WHERE id='${cajaId}'`), { timeout: 15_000 }).toBe('CERRADA');

  // 4. Conciliación en PostgreSQL: monto de cierre igual al esperado, sin diferencia.
  expect(Number(sql(`SELECT monto_cierre_fisico FROM cajas WHERE id='${cajaId}'`))).toBeCloseTo(esperado, 2);
  expect(Number(sql(`SELECT diferencia FROM cajas WHERE id='${cajaId}'`))).toBeCloseTo(0, 2);
});
