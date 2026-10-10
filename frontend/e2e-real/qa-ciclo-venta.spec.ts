import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// QA independiente del ciclo de venta (backend NestJS real + PostgreSQL temporal, sin mocks).
// Cada resultado de negocio se comprueba además en la base de datos. Las funciones no implementadas
// se marcan como PENDIENTE con test.skip; los defectos confirmados se marcan con test.fail y su ID.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const TENANT_A = 'e2e-empresa-a';
const TENANT_B = 'e2e-empresa-b';
const requireBackend = createRequire(path.resolve('../backend/package.json'));
// Identidad de esta ejecución: Playwright reinicia el worker tras un fallo y vuelve a ejecutar beforeAll.
// La preparación debe ser idempotente y reutilizar los mismos datos (correos, códigos y IDs).
const RUN = (process.env.QA_RUN ??= randomUUID().slice(0, 8));
const ESTADO_PATH = path.join(os.tmpdir(), `ferre-qa-ciclo-${RUN}.json`);
const EM = {
  admin: 'admin.a@e2e.invalid',
  adminB: 'admin.b@e2e.invalid',
  cajero1: `qa.cajero1.${RUN}@e2e.invalid`,
  cajero2: `qa.cajero2.${RUN}@e2e.invalid`,
  cajero3: `qa.cajero3.${RUN}@e2e.invalid`,
};
const COD = { con: `QA-CON-${RUN}`, stk: `QA-STK-${RUN}`, cre: `QA-CRE-${RUN}`, dbl: `QA-DBL-${RUN}`, ent: `QA-ENT-${RUN}`, ui: `QA-UI-${RUN}` };
type Estado = { ids: Record<string, string>; cuentaC1?: string; ventaContado?: string };
const leerEstado = (): Estado => (existsSync(ESTADO_PATH) ? JSON.parse(readFileSync(ESTADO_PATH, 'utf8')) : { ids: {} });
let est: Estado;
const guardarEstado = () => writeFileSync(ESTADO_PATH, JSON.stringify(est));
// Solo se usa para firmar un token vencido o alterado; la librería es la del backend.
const jwt = requireBackend('jsonwebtoken') as { sign: (payload: object, secret: string) => string };

const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();
const num = (consulta: string) => Number(sql(consulta));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type Sesion = { token: string; id: string };

async function login(request: APIRequestContext, email: string): Promise<Sesion> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { token: body.accessToken, id: body.user.id };
}

async function crearCajero(request: APIRequestContext, admin: Sesion, email: string, nombre: string, permisos: string[]): Promise<Sesion> {
  const res = await request.post(`${API}/usuarios`, {
    headers: auth(admin.token),
    data: { nombre, email, password: PASSWORD, rol: 'CAJERO', permisos, descuentoMaximo: 10 },
  });
  expect([200, 201], `crear ${email}: ${await res.text()}`).toContain(res.status());
  // El permiso efectivo se fija en base de datos, igual que la prueba de contingencia existente.
  const lista = permisos.map((p) => `'${p}'`).join(',');
  sql(`UPDATE usuarios SET permisos_configurados=true, permisos=ARRAY[${lista}]::text[], descuento_maximo=10 WHERE email='${email}' AND tenant_id='${TENANT_A}'`);
  const sesion = await login(request, email);
  const caja = await request.post(`${API}/operaciones/caja/abrir`, {
    headers: auth(sesion.token), data: { solicitudId: randomUUID(), monto: 500 },
  });
  expect([200, 201], `abrir caja ${email}: ${await caja.text()}`).toContain(caja.status());
  return sesion;
}

async function crearProducto(request: APIRequestContext, admin: Sesion, codigo: string, precio: number, stock: number): Promise<string> {
  const res = await request.post(`${API}/productos`, {
    headers: auth(admin.token),
    data: { codigo, nombre: `QA ${codigo}`, precioVenta: precio, precioCosto: precio * 0.6, stockActual: stock, stockMinimo: 1 },
  });
  expect([200, 201], `producto ${codigo}: ${await res.text()}`).toContain(res.status());
  return (await res.json()).id as string;
}

async function crearCliente(request: APIRequestContext, admin: Sesion, nombre: string, credito: boolean, limite: number): Promise<string> {
  const res = await request.post(`${API}/clientes`, { headers: auth(admin.token), data: { nombre } });
  expect([200, 201], `cliente ${nombre}: ${await res.text()}`).toContain(res.status());
  const id = (await res.json()).id as string;
  sql(`UPDATE clientes SET credito_habilitado=${credito}, limite_credito=${credito ? limite : 'NULL'}, saldo_pendiente=0 WHERE id='${id}'`);
  return id;
}

function venta(request: APIRequestContext, token: string, data: unknown) {
  return request.post(`${API}/ventas`, { headers: auth(token), data });
}

async function ingresar(page: Page, email: string, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

// Estado compartido entre pruebas (mismo clúster temporal que las demás suites E2E).
let admin: Sesion;
let adminB: Sesion;
let cajero1: Sesion;
let cajero2: Sesion;
let cajero3: Sesion;
let P1: string; // contado, stock amplio
let P2: string; // stock 1: prueba de concurrencia entre dos cajeros
let P3: string; // crédito
let P5: string; // doble clic en UI
let P6: string; // entrega
let PUI: string; // venta por UI
let C1: string; // cliente con crédito, límite 1000
let C2: string; // cliente sin crédito
let ventaContado: string; // venta de referencia para aislamiento y entrega
let cuentaC1: string; // cuenta por cobrar de C1

test.beforeAll(async ({ request }) => {
  est = leerEstado();
  admin = await login(request, EM.admin);
  adminB = await login(request, EM.adminB);
  // El administrador de cada empresa cobra en el POS: necesita caja abierta (openCash).
  for (const sesion of [admin, adminB]) {
    const caja = await request.post(`${API}/operaciones/caja/abrir`, { headers: auth(sesion.token), data: { solicitudId: randomUUID(), monto: 0 } });
    expect([200, 201, 409]).toContain(caja.status());
  }
  const permisosVenta = ['pos.vender', 'cotizaciones.convertir_venta', 'caja.movimientos_manuales'];
  if (!est.ids.cajero1) {
    await crearCajero(request, admin, EM.cajero1, 'QA Cajero 1', permisosVenta);
    await crearCajero(request, admin, EM.cajero2, 'QA Cajero 2', permisosVenta);
    await crearCajero(request, admin, EM.cajero3, 'QA Cajero 3', permisosVenta);
    est.ids.cajero1 = 'creado';
  }
  cajero1 = await login(request, EM.cajero1);
  cajero2 = await login(request, EM.cajero2);
  // 9.3 desactiva a cajero3; si la ejecución se reanuda tras un fallo, se reactiva antes de iniciar sesión.
  sql(`UPDATE usuarios SET activo=true WHERE email='${EM.cajero3}' AND tenant_id='${TENANT_A}'`);
  cajero3 = await login(request, EM.cajero3);
  if (!est.ids.P1) {
    est.ids.P1 = await crearProducto(request, admin, COD.con, 100, 50);
    est.ids.P2 = await crearProducto(request, admin, COD.stk, 100, 1);
    est.ids.P3 = await crearProducto(request, admin, COD.cre, 100, 50);
    est.ids.P5 = await crearProducto(request, admin, COD.dbl, 100, 20);
    est.ids.P6 = await crearProducto(request, admin, COD.ent, 100, 20);
    est.ids.PUI = await crearProducto(request, admin, COD.ui, 250, 20);
    est.ids.C1 = await crearCliente(request, admin, `QA Cliente crédito ${RUN}`, true, 1000);
    est.ids.C2 = await crearCliente(request, admin, `QA Cliente contado ${RUN}`, false, 0);
    guardarEstado();
  }
  P1 = est.ids.P1; P2 = est.ids.P2; P3 = est.ids.P3; P5 = est.ids.P5; P6 = est.ids.P6; PUI = est.ids.PUI;
  C1 = est.ids.C1; C2 = est.ids.C2;
  ventaContado = est.ventaContado ?? '';
  cuentaC1 = est.cuentaC1 ?? '';
});

test.describe('1. Venta de contado con efectivo', () => {
  test('1.1 contado efectivo: total con ISV 15 %, stock reservado y cobro en efectivo en caja', async ({ request }) => {
    const sid = randomUUID();
    const res = await venta(request, cajero1.token, { solicitudId: sid, metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 2, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect({ subtotal: body.subtotal, isv: body.isv, total: body.total }).toEqual({ subtotal: 200, isv: 30, total: 230 });
    ventaContado = body.id;
    est.ventaContado = body.id;
    guardarEstado();
    expect(sql(`SELECT metodo_pago||'|'||tipo_pago||'|'||estado FROM ventas WHERE id='${sid}'`)).toBe('EFECTIVO|CONTADO|COMPLETADA');
    expect(num(`SELECT stock_reservado::float FROM productos WHERE id='${P1}'`)).toBe(2);
    expect(sql(`SELECT tipo||'|'||metodo||'|'||monto::float FROM movimientos_caja WHERE referencia='${sid}'`)).toBe('VENTA_POS|EFECTIVO|230');
  });

  test.skip('1.2 cambio (vuelto): el cajero registra el efectivo recibido y el sistema calcula el cambio — PENDIENTE: no hay campo de efectivo recibido ni cálculo de cambio en POSPage', async () => {});
});

test.describe('2. Venta con tarjeta (POS bancario externo)', () => {
  test('2.1 tarjeta: se registra como tarjeta y no suma al efectivo esperado de la caja', async ({ request }) => {
    const antes = num(`SELECT COALESCE(SUM(monto),0)::float FROM movimientos_caja WHERE usuario_id='${cajero1.id}' AND metodo='EFECTIVO'`);
    const sid = randomUUID();
    const res = await venta(request, cajero1.token, { solicitudId: sid, metodoPago: 'TARJETA', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    expect(sql(`SELECT metodo||'|'||monto::float FROM movimientos_caja WHERE referencia='${sid}'`)).toBe('TARJETA|115');
    const despues = num(`SELECT COALESCE(SUM(monto),0)::float FROM movimientos_caja WHERE usuario_id='${cajero1.id}' AND metodo='EFECTIVO'`);
    expect(despues).toBe(antes);
  });

  test.skip('2.2 datáfono: la venta guarda la referencia de autorización del POS bancario — PENDIENTE: no hay integración ni campo de autorización', async () => {});
});

test.describe('3. Venta al crédito para cliente registrado', () => {
  test('3.1 crédito: suma saldo del cliente y crea la cuenta por cobrar', async ({ request }) => {
    const sid = randomUUID();
    const res = await venta(request, cajero1.token, { solicitudId: sid, clienteId: C1, metodoPago: 'CREDITO', tipoPago: 'CREDITO', vencimiento: '2026-12-31', detalles: [{ productoId: P3, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    expect(num(`SELECT saldo_pendiente::float FROM clientes WHERE id='${C1}'`)).toBe(115);
    cuentaC1 = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${sid}' AND tipo='CXC'`);
    expect(cuentaC1).not.toBe('');
    est.cuentaC1 = cuentaC1;
    guardarEstado();
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaC1}'`)).toBe(115);
  });

  test('3.2 crédito rechazado: sin cliente, cliente sin crédito y sobre el límite no crean venta', async ({ request }) => {
    const antes = num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT_A}'`);
    const sinCliente = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId: P3, cantidad: 1, precioUnitario: 100 }] });
    const sinCredito = await venta(request, cajero1.token, { solicitudId: randomUUID(), clienteId: C2, metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId: P3, cantidad: 1, precioUnitario: 100 }] });
    const sobreLimite = await venta(request, cajero1.token, { solicitudId: randomUUID(), clienteId: C1, metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId: P3, cantidad: 9, precioUnitario: 100 }] });
    expect([sinCliente.status(), sinCredito.status(), sobreLimite.status()]).toEqual([400, 400, 400]);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT_A}'`)).toBe(antes);
  });
});

test.describe('4. Abonos parciales y totales de clientes', () => {
  test('4.1 abono parcial reduce el saldo de la cuenta, del cliente y del crédito de la venta', async ({ request }) => {
    const sid = randomUUID();
    const res = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data: { solicitudId: sid, monto: 50, metodo: 'EFECTIVO' } });
    expect(res.status()).toBe(201);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaC1}'`)).toBe(65);
    expect(num(`SELECT saldo_pendiente::float FROM clientes WHERE id='${C1}'`)).toBe(65);
  });

  test('4.2 mismo abono reenviado (mismo solicitudId) no registra un segundo pago', async ({ request }) => {
    const sid = randomUUID();
    const data = { solicitudId: sid, monto: 10, metodo: 'EFECTIVO' };
    const primero = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data });
    const segundo = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data });
    expect(primero.status()).toBe(201);
    expect(segundo.status()).toBeLessThan(300);
    expect(num(`SELECT COUNT(*) FROM pagos_cuenta WHERE solicitud_id='${sid}'`)).toBe(1);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaC1}'`)).toBe(55);
  });

  test('4.3 mismo solicitudId con otro importe se rechaza con 409', async ({ request }) => {
    const sid = randomUUID();
    await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data: { solicitudId: sid, monto: 5, metodo: 'EFECTIVO' } });
    const otro = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data: { solicitudId: sid, monto: 6, metodo: 'EFECTIVO' } });
    expect(otro.status()).toBe(409);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaC1}'`)).toBe(50);
  });

  test('4.4 abono mayor al saldo o con más de dos decimales se rechaza', async ({ request }) => {
    const mayor = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data: { solicitudId: randomUUID(), monto: 999, metodo: 'EFECTIVO' } });
    const decimales = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data: { solicitudId: randomUUID(), monto: 1.001, metodo: 'EFECTIVO' } });
    expect([mayor.status(), decimales.status()]).toEqual([400, 400]);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaC1}'`)).toBe(50);
  });

  test('4.5 abono total deja el saldo en cero y un abono adicional se rechaza', async ({ request }) => {
    const total = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data: { solicitudId: randomUUID(), monto: 50, metodo: 'TARJETA' } });
    expect(total.status()).toBe(201);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaC1}'`)).toBe(0);
    expect(num(`SELECT saldo_pendiente::float FROM clientes WHERE id='${C1}'`)).toBe(0);
    const extra = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(cajero1.token), data: { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } });
    expect(extra.status()).toBe(400);
  });
  test('4.6 abono por doble clic en la interfaz: se registra un solo pago', async ({ page, request }) => {
    const cliente = await crearCliente(request, admin, `QA Cliente abono ${RUN}`, true, 5000);
    const sid = randomUUID();
    const res = await venta(request, cajero1.token, { solicitudId: sid, clienteId: cliente, metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId: P3, cantidad: 2, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    const cuenta = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${sid}' AND tipo='CXC'`);
    page.on('dialog', (dialogo) => void dialogo.accept());
    await ingresar(page, EM.cajero1, '/cuentas');
    const seccion = page.locator('section.operation-card', { has: page.getByRole('heading', { name: new RegExp(`QA Cliente abono ${RUN}`) }) });
    await seccion.getByRole('button', { name: 'Registrar abono', exact: true }).click();
    const formulario = page.locator('form.operation-form', { has: page.getByRole('heading', { name: new RegExp(`QA Cliente abono ${RUN}`) }) });
    await formulario.getByLabel('Monto').fill('20');
    await formulario.getByRole('button', { name: 'Registrar', exact: true }).dblclick();
    await expect.poll(() => num(`SELECT COUNT(*) FROM pagos_cuenta WHERE cuenta_id='${cuenta}'`), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1500);
    expect(num(`SELECT COUNT(*) FROM pagos_cuenta WHERE cuenta_id='${cuenta}' AND monto=20`)).toBe(1);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuenta}'`)).toBe(210);
  });
});

test.describe('5. Cotización convertida a venta', () => {
  test('5.1 cotización se convierte una sola vez; la segunda conversión se rechaza', async ({ request }) => {
    const cot = await request.post(`${API}/cotizaciones`, {
      headers: auth(admin.token),
      data: { clienteNombre: 'QA cotización', detalles: [{ productoId: P1, cantidad: 3, precioUnitario: 100 }] },
    });
    expect([200, 201], await cot.text()).toContain(cot.status());
    const cotId = (await cot.json()).id as string;
    const primera = await request.post(`${API}/cotizaciones/${cotId}/convertir`, { headers: auth(cajero1.token), data: { metodoPago: 'EFECTIVO' } });
    expect(primera.status(), await primera.text()).toBe(201);
    const ventaId = (await primera.json()).ventaId as string;
    const segunda = await request.post(`${API}/cotizaciones/${cotId}/convertir`, { headers: auth(cajero1.token), data: { metodoPago: 'EFECTIVO' } });
    expect(segunda.status()).toBe(400);
    expect(sql(`SELECT estado||'|'||venta_id FROM cotizaciones WHERE id='${cotId}'`)).toBe(`CONVERTIDA|${ventaId}`);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${ventaId}'`)).toBe(1);
  });
});

test.describe('6. Descuentos sujetos a autorización', () => {
  test('6.1 cajero sin permiso de descuento no puede aplicarlo y no se crea venta', async ({ request }) => {
    const antes = num(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero1.id}'`);
    const res = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 5, detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(403);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero1.id}'`)).toBe(antes);
  });

  test('6.2 cajero con permiso aplica descuento hasta su límite; por encima exige administrador', async ({ request }) => {
    sql(`UPDATE usuarios SET permisos=ARRAY['pos.vender','pos.aplicar_descuento']::text[] WHERE id='${cajero2.id}'`);
    const dentro = await venta(request, cajero2.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 10, detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(dentro.status()).toBe(201);
    const fuera = await venta(request, cajero2.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 15, detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(fuera.status()).toBe(403);
  });

  test('6.3 administrador aplica descuento sin tope de cajero', async ({ request }) => {
    const res = await venta(request, admin.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 50, detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    expect((await res.json()).total).toBe(57.5);
  });
});

test.describe('7. Manipulación de importes desde el cliente', () => {
  test('7.1 precio alterado por el cajero se rechaza', async ({ request }) => {
    const res = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 1 }] });
    expect(res.status()).toBe(409);
  });

  test('7.2 total, subtotal e ISV enviados por el cliente se ignoran; el servidor recalcula', async ({ request }) => {
    const res = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', total: 1, subtotal: 1, isv: 0, detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    expect((await res.json()).total).toBe(115);
  });

  test('7.3 cantidades negativas, fraccionarias excesivas o inventadas se rechazan', async ({ request }) => {
    const negativa = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: -1, precioUnitario: 100 }] });
    const fraccion = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 0.001, precioUnitario: 100 }] });
    const enorme = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1e12, precioUnitario: 100 }] });
    expect([negativa.status(), fraccion.status(), enorme.status()]).toEqual([400, 400, 400]);
  });

  test('7.4 descuento negativo, método inventado o tipo de pago que no coincide se rechazan', async ({ request }) => {
    const negativo = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: -50, detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    const inventado = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'BITCOIN', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    const noCoincide = await venta(request, cajero1.token, { solicitudId: randomUUID(), tipoPago: 'CREDITO', metodoPago: 'EFECTIVO', clienteId: C1, detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect([negativo.status(), inventado.status(), noCoincide.status()]).toEqual([400, 400, 400]);
  });
});

test.describe('8. Aislamiento entre empresas', () => {
  test('8.1 la empresa B no ve ni opera datos de la empresa A', async ({ request }) => {
    const verVenta = await request.get(`${API}/ventas/${ventaContado}`, { headers: auth(adminB.token) });
    const abonar = await request.post(`${API}/operaciones/cuentas/${cuentaC1}/pagos`, { headers: auth(adminB.token), data: { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } });
    const cotizacion = await request.get(`${API}/cotizaciones`, { headers: auth(adminB.token) });
    const ventaConClienteAjeno = await venta(request, adminB.token, { solicitudId: randomUUID(), clienteId: C1, metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    const listaB = await request.get(`${API}/ventas?limit=500`, { headers: auth(adminB.token) });
    expect(verVenta.status()).toBe(404);
    expect(abonar.status()).toBe(404);
    expect(ventaConClienteAjeno.status()).toBe(404);
    expect(JSON.stringify(await listaB.json())).not.toContain(ventaContado);
    expect(cotizacion.status()).toBeLessThan(300);
    expect(num(`SELECT COUNT(*) FROM pagos_cuenta WHERE cuenta_id='${cuentaC1}' AND monto=1`)).toBe(0);
  });
});

test.describe('9. Sesiones vencidas y revocadas', () => {
  test('9.1 token vencido no registra venta', async ({ request }) => {
    const antes = num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT_A}'`);
    const vencido = jwt.sign(
      { sub: cajero1.id, tenantId: TENANT_A, rol: 'CAJERO', type: 'tenant', exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET!,
    );
    const res = await venta(request, vencido, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(401);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT_A}'`)).toBe(antes);
  });

  test('9.2 token alterado no registra venta', async ({ request }) => {
    const res = await venta(request, cajero1.token.slice(0, -4) + 'AAAA', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(401);
  });

  test('9.3 usuario desactivado pierde el acceso aunque conserve un token vigente', async ({ request }) => {
    const antes = num(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero3.id}'`);
    sql(`UPDATE usuarios SET activo=false WHERE id='${cajero3.id}'`);
    const res = await venta(request, cajero3.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    // La sesión revocada se rechaza en el guard (401); cualquier 4xx sin venta es aceptable.
    expect([401, 403]).toContain(res.status());
    expect(num(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero3.id}'`)).toBe(antes);
  });
});

test.describe('10. Concurrencia: dos cajeros, mismo producto', () => {
  test('10.1 último producto vendido por dos cajeros a la vez: solo una venta', async ({ request }) => {
    const [a, b] = await Promise.all([
      venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P2, cantidad: 1, precioUnitario: 100 }] }),
      venta(request, cajero2.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P2, cantidad: 1, precioUnitario: 100 }] }),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([201, 400]);
    expect(num(`SELECT stock_reservado::float FROM productos WHERE id='${P2}'`)).toBe(1);
    expect(num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${P2}'`)).toBe(1);
  });
});

test.describe('11. Doble envío y pérdida de respuesta', () => {
  test('11.1 mismo solicitudId enviado dos veces a la vez: una sola venta y mismo número', async ({ request }) => {
    const sid = randomUUID();
    const data = { solicitudId: sid, metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] };
    const [a, b] = await Promise.all([venta(request, cajero1.token, data), venta(request, cajero1.token, data)]);
    expect(a.status()).toBeLessThan(300);
    expect(b.status()).toBeLessThan(300);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${sid}'`)).toBe(1);
    expect((await a.json()).numeroVenta).toBe((await b.json()).numeroVenta);
  });

  test('11.2 mismo solicitudId con líneas distintas se rechaza', async ({ request }) => {
    const sid = randomUUID();
    await venta(request, cajero1.token, { solicitudId: sid, metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    const otro = await venta(request, cajero1.token, { solicitudId: sid, metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 2, precioUnitario: 100 }] });
    expect(otro.status()).toBe(409);
  });

  // Defecto DEF-02: solicitudId es opcional en CreateVentaDto. Sin clave, un reintento crea otra venta.
  // test.fail mantiene la suite verde mientras queda registrado; al corregirlo, este test pasará a FAIL y debe pasarse a test.
  test.fail('11.3 DEF-02: venta sin solicitudId debe rechazarse; hoy un reintento crea otra venta', async ({ request }) => {
    const res = await venta(request, cajero1.token, { metodoPago: 'EFECTIVO', detalles: [{ productoId: P1, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(400);
  });
});

test.describe('12. Entrega y reserva de stock', () => {
  test('12.1 entrega descuenta existencia física una sola vez; repetir la entrega no la descuenta de nuevo', async ({ request }) => {
    const res = await venta(request, cajero1.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: P6, cantidad: 4, precioUnitario: 100 }] });
    const id = (await res.json()).id as string;
    expect(num(`SELECT stock_reservado::float FROM productos WHERE id='${P6}'`)).toBe(4);
    const primera = await request.post(`${API}/operaciones/ventas/${id}/entregar`, { headers: auth(cajero1.token) });
    const segunda = await request.post(`${API}/operaciones/ventas/${id}/entregar`, { headers: auth(cajero1.token) });
    expect([primera.status(), segunda.status()]).toEqual([201, 201]);
    expect(num(`SELECT stock_actual::float FROM productos WHERE id='${P6}'`)).toBe(16);
    expect(num(`SELECT stock_reservado::float FROM productos WHERE id='${P6}'`)).toBe(0);
  });

  test.skip('12.2 canal web para cliente final (compra desde tienda) — PENDIENTE: no existe en el código y su alcance no está confirmado; la venta en línea con reserva y entrega está en 12.1', async () => {});
});

test.describe('13. Reportes de ventas', () => {
  test('13.1 resumen del día por método coincide con la base de datos (solo administrador)', async ({ request }) => {
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' });
    const siguiente = new Date(`${dia}T12:00:00Z`);
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    const res = await request.get(`${API}/operaciones/resumen?desde=${dia}&hasta=${dia}`, { headers: auth(admin.token) });
    expect(res.status()).toBe(200);
    const cuerpo = await res.json();
    const porMetodo = Object.fromEntries((cuerpo.metodos as { metodo_pago: string; total: string }[]).map((m) => [m.metodo_pago, Math.round(Number(m.total) * 100) / 100]));
    const enBD = sql(`SELECT metodo_pago||'|'||ROUND(SUM(total)::numeric,2) FROM ventas WHERE tenant_id='${TENANT_A}' AND estado='COMPLETADA' AND created_at>=('${dia}T06:00:00Z'::timestamptz) AND created_at<('${siguiente.toISOString().slice(0, 10)}T06:00:00Z'::timestamptz) GROUP BY metodo_pago ORDER BY 1`);
    const esperado = Object.fromEntries(enBD.split('\n').filter(Boolean).map((l) => l.split('|')).map(([m, t]) => [m, Number(t)]));
    expect(porMetodo).toEqual(esperado);
  });

  test('13.2 cajero no accede al resumen administrativo', async ({ request }) => {
    const res = await request.get(`${API}/operaciones/resumen?desde=2026-10-01&hasta=2026-10-01`, { headers: auth(cajero1.token) });
    expect(res.status()).toBe(403);
  });

  test.skip('13.3 reporte por cajero: ventas agrupadas por cajero, método y fecha — PENDIENTE: /operaciones/resumen no tiene dimensión por cajero', async () => {});
});

test.describe('14. Operación de la interfaz POS', () => {
  test('14.1 contado en el POS: cobra en efectivo y la venta queda en base de datos', async ({ page }) => {
    await ingresar(page, EM.cajero1, '/pos');
    const buscar = page.getByPlaceholder('Buscar por código o nombre de producto...');
    await buscar.fill(COD.ui);
    await buscar.press('Enter');
    await expect(page.getByLabel(new RegExp('^Cantidad QA ' + COD.ui))).toBeVisible();
    await page.getByRole('button', { name: 'EFECTIVO', exact: true }).click();
    await page.getByRole('button', { name: /Procesar Venta/ }).click();
    await expect.poll(() => num(`SELECT COUNT(*) FROM detalles_venta d JOIN ventas v ON v.id=d.venta_id WHERE d.producto_id='${PUI}' AND v.usuario_id='${cajero1.id}'`), { timeout: 20000 }).toBe(1);
    expect(sql(`SELECT metodo_pago||'|'||total::float FROM ventas v JOIN detalles_venta d ON d.venta_id=v.id WHERE d.producto_id='${PUI}'`)).toBe('EFECTIVO|287.5');
  });

  test('14.2 doble clic en Procesar Venta registra una sola venta', async ({ page }) => {
    await ingresar(page, EM.cajero1, '/pos');
    const buscar = page.getByPlaceholder('Buscar por código o nombre de producto...');
    await buscar.fill(COD.dbl);
    await buscar.press('Enter');
    await expect(page.getByLabel(new RegExp('^Cantidad QA ' + COD.dbl))).toBeVisible();
    const antes = num(`SELECT stock_reservado::float FROM productos WHERE id='${P5}'`);
    await page.getByRole('button', { name: /Procesar Venta/ }).dblclick();
    await expect.poll(() => num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${P5}'`), { timeout: 20000 }).toBe(1);
    await page.waitForTimeout(1500);
    expect(num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${P5}'`)).toBe(1);
    expect(num(`SELECT stock_reservado::float FROM productos WHERE id='${P5}'`)).toBe(antes + 1);
  });

  test('14.3 pérdida de respuesta tras enviar: la UI pide revisar, no reenvía y no duplica la venta', async ({ page }) => {
    let intentos = 0;
    // Inyección de red: la venta llega al servidor, pero la respuesta se pierde en el primer envío.
    await page.route(/\/api\/ventas$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      intentos += 1;
      if (intentos === 1) {
        await route.fetch();
        return route.abort('connectionaborted');
      }
      return route.continue();
    });
    await ingresar(page, EM.cajero1, '/pos');
    const buscar = page.getByPlaceholder('Buscar por código o nombre de producto...');
    await buscar.fill(COD.ui);
    await buscar.press('Enter');
    await expect(page.getByLabel(new RegExp('^Cantidad QA ' + COD.ui))).toBeVisible();
    const antes = num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${PUI}'`);
    await page.getByRole('button', { name: /Procesar Venta/ }).click();
    await expect(page.getByText('No recibimos confirmación')).toBeVisible({ timeout: 20000 });
    expect(num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${PUI}'`) - antes).toBe(1);
    await page.getByRole('button', { name: /Revisar venta y continuar/ }).click();
    await page.waitForTimeout(1500);
    // La revisión consulta la venta por solicitudId: no vuelve a enviar y no crea otra.
    expect(intentos).toBe(1);
    expect(num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${PUI}'`) - antes).toBe(1);
  });

  test.skip('14.4 respuesta tardía del servidor: el POS no reintenta mientras la venta sigue en curso — PENDIENTE: no automatizado (requiere inyección de latencia controlada)', async () => {});
});

test.describe('15. Cierre de caja', () => {
  test('15.1 cierre: el efectivo esperado solo suma efectivo; diferencias exigen explicación', async ({ request }) => {
    const fondo = num(`SELECT monto_apertura::float FROM cajas WHERE usuario_id='${cajero1.id}' AND estado='ABIERTA'`);
    const efectivo = num(`SELECT COALESCE(SUM(m.monto),0)::float FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.usuario_id='${cajero1.id}' AND c.estado='ABIERTA' AND m.metodo='EFECTIVO'`);
    const esperado = Math.round((fondo + efectivo) * 100) / 100;
    const cajaId = sql(`SELECT id FROM cajas WHERE usuario_id='${cajero1.id}' AND estado='ABIERTA'`);
    const sinNota = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero1.token), data: { monto: esperado + 5 } });
    expect(sinNota.status()).toBe(400);
    const conNota = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero1.token), data: { monto: esperado + 5, notas: 'Sobrante QA' } });
    expect(conNota.status()).toBe(201);
    expect(sql(`SELECT estado||'|'||monto_esperado::float||'|'||diferencia::float FROM cajas WHERE id='${cajaId}'`)).toBe(`CERRADA|${esperado}|5`);
    const repetido = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero1.token), data: { monto: esperado + 5, notas: 'Sobrante QA' } });
    expect(repetido.status()).toBeLessThan(300);
    const distinto = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero1.token), data: { monto: esperado, notas: 'otro' } });
    expect(distinto.status()).toBe(409);
  });
});
