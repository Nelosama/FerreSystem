import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const API = process.env.E2E_API_URL!;
const PSQL = `${process.env.PG_BIN}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', DB, '-c', consulta], { encoding: 'utf8' }).trim();

// Navegador, API NestJS y PostgreSQL reales. Sin interceptar respuestas ni cálculos.
test('POS: los cinco casos de redondeo coinciden en pantalla, payload, factura y caja', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { email: 'admin.a@e2e.invalid', password: process.env.E2E_PASSWORD } });
  expect(login.status()).toBe(200);
  const { accessToken, user } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const apertura = await request.post(`${API}/operaciones/caja/abrir`, { headers, data: { solicitudId: randomUUID(), monto: 100 } });
  expect([201, 409]).toContain(apertura.status());

  const casos = [
    { precios: [4.02], cantidades: [0.25], porcentaje: 0, bruto: '1.01', isv: '0.15', descuento: '0.00', total: '1.16' },
    { precios: [1.50], cantidades: [1], porcentaje: 0, bruto: '1.50', isv: '0.23', descuento: '0.00', total: '1.73' },
    { precios: [0.05], cantidades: [1], porcentaje: 70, bruto: '0.05', isv: '0.00', descuento: '0.04', total: '0.01' },
    { precios: [0.29], cantidades: [1], porcentaje: 50, bruto: '0.29', isv: '0.02', descuento: '0.15', total: '0.16' },
    { precios: [4.02, 1.50], cantidades: [0.25, 1], porcentaje: 0, bruto: '2.51', isv: '0.38', descuento: '0.00', total: '2.89' },
  ];
  const productos: { id: string; nombre: string }[][] = [];
  for (const [index, caso] of casos.entries()) {
    productos[index] = [];
    for (const [linea, precio] of caso.precios.entries()) {
      const nombre = `Precision166-${index}-${linea}`;
      const alta = await request.post(`${API}/productos`, { headers, data: { solicitudId: randomUUID(), codigo: nombre, nombre, precioVenta: precio, precioCosto: 0.01, stockActual: 20, stockMinimo: 0 } });
      expect(alta.status(), await alta.text()).toBe(201);
      const p = await alta.json();
      expect(p.precioAprobado).toBe(true);
      productos[index].push({ id: p.id, nombre });
    }
  }

  await page.goto('/login');
  await page.locator('input[type="email"]').fill('admin.a@e2e.invalid');
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/pos');
  for (const [index, caso] of casos.entries()) {
    for (const [linea, p] of productos[index].entries()) {
      await page.locator('.industrial-card').filter({ hasText: p.nombre }).click();
      await page.getByLabel(`Cantidad ${p.nombre}`, { exact: true }).fill(String(caso.cantidades[linea]));
    }
    await page.locator('input[max="100"]').fill(String(caso.porcentaje));
    const fila = (label: string) => page.getByText(label, { exact: true }).locator('..');
    await expect(fila('SUBTOTAL BRUTO:')).toContainText(`L. ${caso.bruto}`);
    await expect(fila('ISV (15%):')).toContainText(`L. ${caso.isv}`);
    await expect(fila('TOTAL A PAGAR:')).toContainText(`L. ${caso.total}`);
    const respuesta = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ventas' && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Procesar Venta/ }).click();
    const res = await respuesta;
    expect(res.status(), await res.text()).toBe(201);
    expect(res.request().postDataJSON().descuento).toBe(Number(caso.descuento));
    const venta = await res.json();
    expect(Number(venta.total)).toBe(Number(caso.total));
    expect(Number(venta.isv)).toBe(Number(caso.isv));
    expect(sql(`SELECT subtotal::text || '|' || descuento::text || '|' || isv::text || '|' || total::text FROM ventas WHERE id='${venta.id}'`)).toBe(`${caso.bruto}|${caso.descuento}|${caso.isv}|${caso.total}`);
    expect(sql(`SELECT monto::text FROM movimientos_caja WHERE referencia='${venta.id}' AND usuario_id='${user.id}'`)).toBe(caso.total);
    await expect(page.getByRole('button', { name: 'NUEVA VENTA' })).toBeVisible();
    await page.getByRole('button', { name: 'NUEVA VENTA' }).click();
  }
});
