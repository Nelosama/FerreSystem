import { execFileSync } from 'node:child_process';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// E2E REAL: backend NestJS compilado + PostgreSQL temporal + frontend real. Sin mocks.
// Cada resultado de persistencia se comprueba además en la base de datos.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;

const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

const USUARIOS = {
  adminA: 'admin.a@e2e.invalid',
  cajeroA: 'cajero.a@e2e.invalid',
  bodegueroA: 'bodeguero.a@e2e.invalid',
  adminB: 'admin.b@e2e.invalid',
};

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

async function buscarFactura(page: Page, numero: string) {
  await page.getByPlaceholder('Número de factura, ej. 1043').fill(numero);
  await page.getByRole('button', { name: 'Buscar factura', exact: true }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Garantías — backend real y PostgreSQL', () => {
  test('administrador: busca factura, guarda 90 días, ve vencimiento, recarga y queda persistido y auditado', async ({ page, request }) => {
    const admin = await tokenDe(request, USUARIOS.adminA);
    await ingresar(page, USUARIOS.adminA, '/garantias');
    await buscarFactura(page, '1043');
    await expect(page.getByText('Constructora del Norte E2E')).toBeVisible();
    await page.getByRole('button', { name: /Taladro percutor/ }).click();
    await page.locator('#gar-dias').fill('90');
    // Factura del 1 oct 2026 + 90 días = 30 dic 2026 (día de negocio, no del navegador).
    await expect(page.getByText('30 dic 2026').first()).toBeVisible();
    await page.getByRole('button', { name: /Guardar garantía/ }).click();
    await expect(page.getByText('Garantía registrada. Vence el 30 dic 2026')).toBeVisible();

    const fila = sql(`SELECT id, dias_garantia, fecha_vencimiento::text, fecha_venta::text, creado_por FROM coberturas_garantia WHERE creado_por='${admin.id}'`);
    const [id, dias, vence, inicio, creadoPor] = fila.split('|');
    expect({ dias, vence, inicio, creadoPor }).toEqual({ dias: '90', vence: '2026-12-30', inicio: '2026-10-01', creadoPor: admin.id });

    const auditoria = sql(`SELECT operacion, usuario_id FROM auditoria_operaciones WHERE entidad_id='${id}' ORDER BY created_at`);
    expect(auditoria).toBe(`GARANTIA_CREAR|${admin.id}`);

    // Persistencia tras recargar: la garantía sigue en la lista, leída del backend.
    await page.reload();
    await expect(page.getByText('Taladro percutor 1/2" E2E').first()).toBeVisible();
    await expect(page.getByText('VIGENTE').first()).toBeVisible();
    await expect(page.getByText('90 DÍAS').or(page.getByText('90 días')).first()).toBeVisible();
  });

  test('factura inexistente: mensaje claro y ningún envío', async ({ page }) => {
    const antes = sql(`SELECT count(*) FROM coberturas_garantia`);
    await ingresar(page, USUARIOS.adminA, '/garantias');
    await buscarFactura(page, '999999');
    await expect(page.getByRole('alert').filter({ hasText: 'No existe una factura' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Guardar garantía/ })).toHaveCount(0);
    expect(sql(`SELECT count(*) FROM coberturas_garantia`)).toBe(antes);
  });

  test('días no válidos: no se puede guardar y la base no cambia', async ({ page }) => {
    const antes = sql(`SELECT count(*) FROM coberturas_garantia`);
    await ingresar(page, USUARIOS.adminA, '/garantias');
    await buscarFactura(page, '1044');
    await page.getByRole('button', { name: /Inversor soldadora/ }).click();
    for (const malo of ['0', '30.5', '3651']) {
      await page.locator('#gar-dias').fill(malo);
      await expect(page.getByRole('button', { name: /Guardar garantía/ })).toBeDisabled();
    }
    expect(sql(`SELECT count(*) FROM coberturas_garantia`)).toBe(antes);
  });

  test('vencimiento de 30 días desde la factura del 1 oct: 31 oct 2026', async ({ page }) => {
    await ingresar(page, USUARIOS.adminA, '/garantias');
    await buscarFactura(page, '1044');
    await page.getByRole('button', { name: /Inversor soldadora/ }).click();
    await page.locator('#gar-dias').fill('30');
    await expect(page.getByText('31 oct 2026').first()).toBeVisible();
    await page.getByRole('button', { name: /Guardar garantía/ }).click();
    await expect(page.getByText('Garantía registrada. Vence el 31 oct 2026')).toBeVisible();
    expect(sql(`SELECT fecha_vencimiento::text FROM coberturas_garantia d JOIN detalles_venta dv ON dv.id=d.detalle_venta_id WHERE dv.producto_id=(SELECT id FROM productos WHERE codigo='INV-E2E-2')`)).toBe('2026-10-31');
  });

  test('duplicado: la misma línea ya garantizada queda bloqueada en la interfaz y responde 409 en la API', async ({ page, request }) => {
    await ingresar(page, USUARIOS.adminA, '/garantias');
    await buscarFactura(page, '1043');
    await expect(page.getByRole('button', { name: /Taladro percutor/ })).toBeDisabled();
    await expect(page.getByText('Ya tiene garantía').first()).toBeVisible();

    const admin = await tokenDe(request, USUARIOS.adminA);
    const factura = await (await request.get(`${API}/garantias/facturas/1043`, { headers: { Authorization: `Bearer ${admin.token}` } })).json();
    const linea = factura.items.find((i: any) => i.codigo === 'TAL-E2E-1');
    const dup = await request.post(`${API}/garantias/coberturas`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { ventaId: factura.id, detalleVentaId: linea.detalleVentaId, diasGarantia: 30, solicitudId: crypto.randomUUID() },
    });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).code).toBe('GARANTIA_DUPLICADA');
  });

  test('solicitudes simultáneas por API: exactamente una garantía para la línea', async ({ request }) => {
    const admin = await tokenDe(request, USUARIOS.adminA);
    const factura = await (await request.get(`${API}/garantias/facturas/1044`, { headers: { Authorization: `Bearer ${admin.token}` } })).json();
    const linea = factura.items.find((i: any) => i.codigo === 'TAL-E2E-1');
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => request.post(`${API}/garantias/coberturas`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { ventaId: factura.id, detalleVentaId: linea.detalleVentaId, diasGarantia: 180, solicitudId: crypto.randomUUID() },
    })));
    const estados = respuestas.map((r) => r.status()).sort();
    expect(estados.filter((s) => s === 201)).toHaveLength(1);
    expect(estados.filter((s) => s === 409)).toHaveLength(4);
    expect(sql(`SELECT count(*) FROM coberturas_garantia WHERE detalle_venta_id='${linea.detalleVentaId}'`)).toBe('1');
  });

  test('cajero: consulta sin alta ni edición y no puede escribir por API', async ({ page, request }) => {
    await ingresar(page, USUARIOS.cajeroA, '/garantias');
    await expect(page.getByText('Solo el administrador puede registrar garantías.')).toBeVisible();
    await expect(page.getByText('Garantías registradas')).toBeVisible();
    await expect(page.getByText('Taladro percutor 1/2" E2E').first()).toBeVisible();
    await buscarFactura(page, '1043');
    await expect(page.getByRole('button', { name: /Guardar garantía/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar días' })).toHaveCount(0);

    const cajero = await tokenDe(request, USUARIOS.cajeroA);
    // Factura real y línea real, sin garantía: el 403 debe llegar por el rol, no por datos inexistentes.
    const factura = await (await request.get(`${API}/garantias/facturas/1045`, { headers: { Authorization: `Bearer ${cajero.token}` } })).json();
    const linea = factura.items[0];
    expect(linea.cobertura).toBeNull();
    const escritura = await request.post(`${API}/garantias/coberturas`, {
      headers: { Authorization: `Bearer ${cajero.token}` },
      data: { ventaId: factura.id, detalleVentaId: linea.detalleVentaId, diasGarantia: 30, solicitudId: crypto.randomUUID() },
    });
    expect(escritura.status()).toBe(403);
    expect(sql(`SELECT count(*) FROM coberturas_garantia WHERE detalle_venta_id='${linea.detalleVentaId}'`)).toBe('0');
  });

  test('bodeguero no accede a garantías por API', async ({ request }) => {
    const bodeguero = await tokenDe(request, USUARIOS.bodegueroA);
    const res = await request.get(`${API}/garantias/coberturas`, { headers: { Authorization: `Bearer ${bodeguero.token}` } });
    expect(res.status()).toBe(403);
  });

  test('aislamiento: la empresa B no ve ni garantiza facturas de la empresa A', async ({ request }) => {
    const a = await tokenDe(request, USUARIOS.adminA);
    const b = await tokenDe(request, USUARIOS.adminB);
    const facturaA = await (await request.get(`${API}/garantias/facturas/1043`, { headers: { Authorization: `Bearer ${a.token}` } })).json();
    const facturaB = await (await request.get(`${API}/garantias/facturas/1043`, { headers: { Authorization: `Bearer ${b.token}` } })).json();
    expect(facturaB.id).not.toBe(facturaA.id);
    const lineaA = facturaA.items[0];
    const ajena = await request.post(`${API}/garantias/coberturas`, {
      headers: { Authorization: `Bearer ${b.token}` },
      data: { ventaId: facturaA.id, detalleVentaId: lineaA.detalleVentaId, diasGarantia: 30, solicitudId: crypto.randomUUID() },
    });
    expect(ajena.status()).toBe(404);
    const listaB = await (await request.get(`${API}/garantias/coberturas`, { headers: { Authorization: `Bearer ${b.token}` } })).json();
    expect(listaB.every((g: any) => g.ventaId !== facturaA.id)).toBe(true);
  });

  test('administrador cambia días desde la lista: el vencimiento se recalcula desde la factura y queda auditado', async ({ page, request }) => {
    const admin = await tokenDe(request, USUARIOS.adminA);
    const id = sql(`SELECT id FROM coberturas_garantia WHERE creado_por='${admin.id}' AND dias_garantia=90 LIMIT 1`);
    await ingresar(page, USUARIOS.adminA, '/garantias');
    const tarjeta = page.getByRole('listitem').filter({ hasText: 'Factura #1043' }).filter({ hasText: 'Taladro percutor 1/2" E2E' }).first();
    await tarjeta.getByRole('button', { name: 'Cambiar días' }).click();
    await tarjeta.getByRole('spinbutton').fill('365');
    await tarjeta.getByRole('button', { name: 'Guardar días' }).click();
    await expect(tarjeta.getByText('1 oct 2027')).toBeVisible();
    expect(sql(`SELECT fecha_vencimiento::text FROM coberturas_garantia WHERE id='${id}'`)).toBe('2027-10-01');
    expect(sql(`SELECT operacion FROM auditoria_operaciones WHERE entidad_id='${id}' ORDER BY created_at`).split('\n')).toEqual(['GARANTIA_CREAR', 'GARANTIA_EDITAR']);
  });

  test('móvil 390 px: sin desbordamiento horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ingresar(page, USUARIOS.adminA, '/garantias');
    await buscarFactura(page, '1043');
    await page.getByRole('button', { name: /Taladro percutor/ }).waitFor();
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde).toBeLessThanOrEqual(0);
  });
});
