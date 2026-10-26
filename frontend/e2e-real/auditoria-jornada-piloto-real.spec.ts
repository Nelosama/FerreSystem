import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { confirmarAlerta } from '../e2e/helpers/alertas';
import { activateTestUser } from './activation.fixture';

// AUDITORÍA DE PILOTO — jornada completa de una ferretería contra backend NestJS y PostgreSQL temporales (run.sh), sin mocks.
// Login en el navegador → apertura de caja en la pantalla → ventas de contado (con descuento), tarjeta y crédito → abonos parciales →
// compra y pago a proveedor (no toca la caja) → arqueo con faltante que exige explicación → cierre desde la pantalla → conciliación en
// PostgreSQL. Incluye ataques HTTP (sin sesión, asignación masiva, otra empresa, rol insuficiente). Solo verifica; no cambia el producto.
const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const RUN = randomUUID().slice(0, 8).toUpperCase();
const ADMIN = 'admin.a@e2e.invalid';
const ADMIN_B = 'admin.b@e2e.invalid';
const CAJERO = `jornada.${RUN}@e2e.invalid`;
const TENANT = 'e2e-empresa-a';

type Sesion = { token: string; id: string };
async function login(request: APIRequestContext, email: string): Promise<Sesion> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const b = await res.json();
  return { token: b.accessToken, id: b.user.id };
}
const centavos = (v: number) => Math.round(v * 100);

test.describe.configure({ mode: 'serial' });

let admin: Sesion; let adminB: Sesion; let cajero: Sesion;
let producto = ''; let cableId = ''; let clienteId = ''; let cajaId = '';
let ventaCredito = ''; let cuentaCredito = '';
let efectivoEsperado = 0;
const post = (request: APIRequestContext, token: string, ruta: string, data: unknown) => request.post(`${API}${ruta}`, { headers: auth(token), data });

test('1. preparación: administrador crea cajero, productos aprobados y cliente con crédito', async ({ request }) => {
  admin = await login(request, ADMIN); adminB = await login(request, ADMIN_B);
  // Alta sin contraseña: el usuario la establece con su enlace privado (fixture compartido con el resto del piloto).
  const alta = await post(request, admin.token, '/usuarios', { nombre: `Cajero jornada ${RUN}`, email: CAJERO, rol: 'CAJERO', permisos: ['pos.vender', 'pos.aplicar_descuento'], descuentoMaximo: 10 });
  expect([200, 201], await alta.text()).toContain(alta.status());
  await activateTestUser(request, (await alta.json()).id);
  sql(`UPDATE usuarios SET permisos_configurados=true, permisos=ARRAY['pos.vender','pos.aplicar_descuento']::text[], descuento_maximo=10 WHERE email='${CAJERO}' AND tenant_id='${TENANT}'`);
  cajero = await login(request, CAJERO);
  for (const [clave, codigo, nombre, stock] of [['p', `JOR-${RUN}-A`, 'Martillo jornada', 40], ['c', `JOR-${RUN}-B`, 'Cable jornada', 10]] as const) {
    const r = await post(request, admin.token, '/productos', { codigo, nombre: `${nombre} ${RUN}`, categoria: 'Herramientas Manuales', unidadMedida: 'UNIDAD', stockActual: stock, stockMinimo: 1 });
    expect([200, 201], await r.text()).toContain(r.status());
    const id = (await r.json()).id as string;
    sql(`UPDATE productos SET precio_aprobado=true, precio_costo=${clave === 'p' ? 60 : 8}, costo_vigente=${clave === 'p' ? 60 : 8}, precio_venta=${clave === 'p' ? 100 : 12.5} WHERE id='${id}'`);
    if (clave === 'p') producto = id; else cableId = id;
  }
  const c = await post(request, admin.token, '/clientes', { nombre: `Constructora ${RUN}` });
  expect([200, 201], await c.text()).toContain(c.status());
  clienteId = (await c.json()).id;
  const cred = await request.patch(`${API}/clientes/${clienteId}/credito`, { headers: auth(admin.token), data: { creditoHabilitado: true, limiteCredito: 500, plazoCreditoDias: 30 } });
  expect(cred.status(), await cred.text()).toBeLessThan(300);
});

test('2. el cajero inicia sesión en el navegador y abre caja desde la pantalla (fondo 300)', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#login-correo').fill(CAJERO);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/arqueo-caja');
  await page.getByLabel('Fondo inicial').fill('300');
  await page.getByRole('button', { name: 'Abrir caja' }).click();
  await expect.poll(() => sql(`SELECT estado FROM cajas WHERE usuario_id='${cajero.id}' ORDER BY fecha_apertura DESC LIMIT 1`), { timeout: 15_000 }).toBe('ABIERTA');
  cajaId = sql(`SELECT id FROM cajas WHERE usuario_id='${cajero.id}' AND estado='ABIERTA'`);
  expect(Number(sql(`SELECT monto_apertura FROM cajas WHERE id='${cajaId}'`))).toBe(300);
});

test('3. ventas: contado con descuento, tarjeta y crédito calculan ISV al centavo y mueven la caja correcta', async ({ request }) => {
  // 2 × 100 con 10 % de descuento (20): base 180, ISV 27, total 207.
  const ef = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), descuento: 20, detalles: [{ productoId: producto, cantidad: 2 }] });
  expect(ef.status(), await ef.text()).toBe(201);
  const e = await ef.json();
  expect([e.subtotal, e.descuento, e.isv, e.total, e.metodoPago]).toEqual([200, 20, 27, 207, 'EFECTIVO']);
  // El 10,01 % requiere administración.
  const exceso = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), descuento: 20.01, detalles: [{ productoId: producto, cantidad: 2 }] });
  expect(exceso.status()).toBe(403);
  // Tarjeta (3 cables decimales: 2.5 × 12.5 = 31.25 + ISV 4.69 = 35.94).
  const sinRef = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), metodoPago: 'TARJETA', detalles: [{ productoId: cableId, cantidad: 2.5 }] });
  expect(sinRef.status()).toBe(400);
  const tj = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), metodoPago: 'TARJETA', pagoElectronico: { referencia: `AUT-${RUN}`, terminal: 'POS-1' }, detalles: [{ productoId: cableId, cantidad: 2.5 }] });
  expect(tj.status(), await tj.text()).toBe(201);
  expect((await tj.json()).total).toBe(35.94);
  // Crédito 2 × 100 = 230 (límite 500).
  const cr = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId, detalles: [{ productoId: producto, cantidad: 2 }] });
  expect(cr.status(), await cr.text()).toBe(201);
  const c = await cr.json();
  ventaCredito = c.id;
  expect([c.total, c.saldoPendiente]).toEqual([230, 230]);
  // Un segundo crédito que excede el límite (230 + 345 = 575 > 500) se rechaza sin dejar rastro.
  const antes = sql(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero.id}'`);
  const sobre = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId, detalles: [{ productoId: producto, cantidad: 3 }] });
  expect(sobre.status()).toBe(400);
  expect(sql(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero.id}'`)).toBe(antes);
  expect(sql(`SELECT COALESCE(SUM(monto) FILTER (WHERE metodo='EFECTIVO'),0)::float||'|'||COALESCE(SUM(monto) FILTER (WHERE metodo='TARJETA'),0)::float||'|'||COALESCE(SUM(monto) FILTER (WHERE metodo='CREDITO'),0)::float FROM movimientos_caja WHERE caja_id='${cajaId}'`)).toBe('207|35.94|230');
  cuentaCredito = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${ventaCredito}' AND tipo='CXC'`);
  expect(sql(`SELECT monto::float||'|'||saldo::float||'|'||(vencimiento IS NOT NULL) FROM cuentas_operativas WHERE id='${cuentaCredito}'`)).toBe('230|230|true');
});

test('4. abonos parciales del cliente: se aplican una vez (reintento idempotente), no exceden el saldo y suben el efectivo de la caja', async ({ request }) => {
  const abono = { solicitudId: randomUUID(), monto: 100.5, metodo: 'EFECTIVO' };
  for (let i = 0; i < 2; i++) expect((await post(request, cajero.token, `/operaciones/cuentas/${cuentaCredito}/pagos`, abono)).status()).toBeLessThan(300);
  expect(sql(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaCredito}'`)).toBe('129.5');
  expect(sql(`SELECT saldo_pendiente::float FROM clientes WHERE id='${clienteId}'`)).toBe('129.5');
  expect(sql(`SELECT saldo_credito::float FROM ventas WHERE id='${ventaCredito}'`)).toBe('129.5');
  expect(sql(`SELECT COUNT(*) FROM pagos_cuenta WHERE cuenta_id='${cuentaCredito}'`)).toBe('1');
  const exceso = await post(request, cajero.token, `/operaciones/cuentas/${cuentaCredito}/pagos`, { solicitudId: randomUUID(), monto: 129.51, metodo: 'EFECTIVO' });
  expect(exceso.status()).toBe(400);
  expect(sql(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuentaCredito}'`)).toBe('129.5');
  // Rutas heredadas: el abono directo al cliente está bloqueado.
  const heredado = await post(request, admin.token, `/clientes/${clienteId}/abonos`, { monto: 10, metodo: 'EFECTIVO' });
  expect(heredado.status()).toBeGreaterThanOrEqual(400);
  expect(sql(`SELECT saldo_pendiente::float FROM clientes WHERE id='${clienteId}'`)).toBe('129.5');
});

test('5. compra a proveedor y pago por el administrador: la CxP no toca la caja del cajero; el cajero no ve ni paga cuentas por pagar', async ({ request }) => {
  const prov = await post(request, admin.token, '/operaciones/proveedores', { solicitudId: randomUUID(), nombre: `Proveedor ${RUN}` });
  expect(prov.status(), await prov.text()).toBeLessThan(300);
  const provId = (await prov.json()).id;
  const compra = await post(request, admin.token, '/operaciones/compras', { solicitudId: randomUUID(), proveedorId: provId, numeroFactura: `FAC-${RUN}`, isv: 0, items: [{ productoId: producto, cantidad: 10, costo: 55 }] });
  expect(compra.status(), await compra.text()).toBeLessThan(300);
  const ordenId = (await compra.json()).id;
  const dup = await post(request, admin.token, '/operaciones/compras', { solicitudId: randomUUID(), proveedorId: provId, numeroFactura: ` fac-${RUN.toLowerCase()} `, isv: 0, items: [{ productoId: producto, cantidad: 10, costo: 55 }] });
  expect(dup.status()).toBe(409);
  const cuenta = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${ordenId}' AND tipo='CXP'`);
  const efectivoAntes = sql(`SELECT COALESCE(SUM(monto),0)::float FROM movimientos_caja WHERE caja_id='${cajaId}'`);
  const pago = { solicitudId: randomUUID(), monto: 200, metodo: 'EFECTIVO' };
  for (let i = 0; i < 2; i++) expect((await post(request, admin.token, `/operaciones/cuentas/${cuenta}/pagos`, pago)).status()).toBeLessThan(300);
  expect(sql(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuenta}'`)).toBe('350');
  expect(sql(`SELECT COALESCE(SUM(monto),0)::float FROM movimientos_caja WHERE caja_id='${cajaId}'`)).toBe(efectivoAntes);
  expect(sql(`SELECT COUNT(*) FROM movimientos_caja WHERE tipo='PAGO_CXP' AND caja_id='${cajaId}'`)).toBe('0');
  expect((await post(request, cajero.token, `/operaciones/cuentas/${cuenta}/pagos`, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' })).status()).toBe(403);
  expect((await request.get(`${API}/operaciones/cuentas?tipo=CXP`, { headers: auth(cajero.token) })).status()).toBe(403);
  const recibir = await request.get(`${API}/operaciones/compras`, { headers: auth(cajero.token) });
  expect(recibir.status()).toBe(403);
});

test('6. ataques HTTP: sin sesión, asignación masiva, otra empresa y roles insuficientes', async ({ request }) => {
  expect((await request.get(`${API}/ventas`)).status()).toBe(401);
  expect((await request.post(`${API}/ventas`, { data: { solicitudId: randomUUID(), detalles: [{ productoId: producto, cantidad: 1 }] } })).status()).toBe(401);
  expect((await request.get(`${API}/operaciones/caja`, { headers: { Authorization: 'Bearer basura' } })).status()).toBe(401);
  // Asignación masiva: total, ISV, empresa, usuario y estado enviados por el cliente se ignoran.
  const masiva = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), total: 0.01, isv: 0, subtotal: 0.01, tenantId: 'e2e-empresa-b', usuarioId: admin.id, estado: 'ANULADA', cajaId: randomUUID(), detalles: [{ productoId: producto, cantidad: 1 }] });
  expect(masiva.status(), await masiva.text()).toBe(201);
  const m = await masiva.json();
  expect([m.total, m.isv, m.estado]).toEqual([115, 15, 'COMPLETADA']);
  expect(sql(`SELECT tenant_id||'|'||usuario_id||'|'||caja_id FROM ventas WHERE id='${m.id}'`)).toBe(`${TENANT}|${cajero.id}|${cajaId}`);
  // Precio manipulado por un cajero.
  expect((await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: producto, cantidad: 1, precioUnitario: 1 }] })).status()).toBe(409);
  // Otra empresa: no ve la venta, no paga la cuenta, no cierra la caja, no vende con el cliente ni el producto ajenos.
  expect((await request.get(`${API}/ventas/${ventaCredito}`, { headers: auth(adminB.token) })).status()).toBe(404);
  expect((await post(request, adminB.token, `/operaciones/cuentas/${cuentaCredito}/pagos`, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' })).status()).toBe(404);
  expect((await post(request, adminB.token, `/operaciones/caja/${cajaId}/cerrar`, { monto: 0 })).status()).toBe(404);
  expect((await post(request, adminB.token, '/ventas', { solicitudId: randomUUID(), tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId, detalles: [{ productoId: producto, cantidad: 1 }] })).status()).toBeGreaterThanOrEqual(400);
  // Un cajero no administra: ni resumen, ni cierres ajenos, ni devoluciones directas, ni usuarios.
  for (const ruta of ['/operaciones/resumen?desde=2026-01-01&hasta=2026-12-31', '/operaciones/caja/cierres', '/usuarios']) {
    expect((await request.get(`${API}${ruta}`, { headers: auth(cajero.token) })).status(), ruta).toBe(403);
  }
  expect((await post(request, cajero.token, `/operaciones/ventas/${ventaCredito}/devoluciones`, { solicitudId: randomUUID(), items: [] })).status()).toBe(403);
  // Entre cajeros de la misma empresa: cada uno ve solo sus ventas y su caja; el bodeguero no ve ventas.
  const CAJERO2 = `jornada2.${RUN}@e2e.invalid`;
  const alta2 = await post(request, admin.token, '/usuarios', { nombre: `Cajero 2 ${RUN}`, email: CAJERO2, rol: 'CAJERO', permisos: ['pos.vender'], descuentoMaximo: 0 });
  expect([200, 201], await alta2.text()).toContain(alta2.status());
  await activateTestUser(request, (await alta2.json()).id);
  const cajero2 = await login(request, CAJERO2);
  const visibles = await (await request.get(`${API}/ventas`, { headers: auth(cajero2.token) })).json() as any[];
  expect(visibles.filter((v) => v.usuarioId === cajero.id)).toEqual([]);
  expect((await request.get(`${API}/ventas/${ventaCredito}`, { headers: auth(cajero2.token) })).status()).toBe(404);
  expect((await request.get(`${API}/operaciones/caja/${cajaId}`, { headers: auth(cajero2.token) })).status()).toBe(404);
  expect((await post(request, cajero2.token, `/operaciones/caja/${cajaId}/cerrar`, { monto: 0 })).status()).toBe(404);
  const bodeguero = await login(request, 'bodeguero.a@e2e.invalid');
  expect((await request.get(`${API}/ventas`, { headers: auth(bodeguero.token) })).status()).toBe(403);
  // Falló todo lo anterior sin modificar la contabilidad de la empresa B.
  expect(sql(`SELECT COUNT(*) FROM ventas WHERE tenant_id='e2e-empresa-b' AND usuario_id='${cajero.id}'`)).toBe('0');
});

test('7. arqueo en pantalla: el faltante exige explicación; con nota la caja cierra y concilia contra PostgreSQL', async ({ page, request }) => {
  const cajas = await (await request.get(`${API}/operaciones/caja`, { headers: auth(cajero.token) })).json() as any[];
  efectivoEsperado = Number(cajas.find((c) => c.id === cajaId).efectivoEsperado);
  // 300 + 207 + 100.5 + 115 (venta de la prueba 6) = 722.50
  expect(efectivoEsperado).toBe(722.5);
  expect(sql(`SELECT (monto_apertura + COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE caja_id=c.id AND metodo='EFECTIVO'),0))::float FROM cajas c WHERE id='${cajaId}'`)).toBe('722.5');

  await page.goto('/login');
  await page.locator('#login-correo').fill(CAJERO);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/arqueo-caja');
  await page.getByLabel('Efectivo contado').fill('720');
  // Faltante de L 2.50: la pantalla marca la explicación como obligatoria (no abre la confirmación) y el servidor también la exige.
  await expect(page.getByText(/Faltante/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await expect(page.locator('.ferre-alerta')).toHaveCount(0);
  expect(sql(`SELECT estado FROM cajas WHERE id='${cajaId}'`)).toBe('ABIERTA');
  const sinNota = await post(request, cajero.token, `/operaciones/caja/${cajaId}/cerrar`, { monto: 720 });
  expect(sinNota.status()).toBe(400);
  expect(sql(`SELECT estado FROM cajas WHERE id='${cajaId}'`)).toBe('ABIERTA');
  // Con la explicación se cierra con la diferencia registrada.
  await page.getByLabel('Explique la diferencia').fill('Faltan L 2.50 por vuelto mal entregado');
  const conNota = page.waitForResponse((r) => r.request().method() === 'POST' && /\/cerrar$/.test(r.url()), { timeout: 15_000 });
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await confirmarAlerta(page);
  expect((await conNota).status()).toBeLessThan(300);
  await expect.poll(() => sql(`SELECT estado FROM cajas WHERE id='${cajaId}'`), { timeout: 15_000 }).toBe('CERRADA');
  expect(sql(`SELECT monto_esperado::float||'|'||monto_cierre_fisico::float||'|'||diferencia::float FROM cajas WHERE id='${cajaId}'`)).toBe('722.5|720|-2.5');
  await expect(page.getByText('Comprobante de cierre')).toBeVisible();
});

test('8. después del cierre: no se vende, no se cobra, un cierre distinto se rechaza y todo concilia', async ({ request }) => {
  const venta = await post(request, cajero.token, '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: producto, cantidad: 1 }] });
  expect(venta.status()).toBe(409);
  const abono = await post(request, cajero.token, `/operaciones/cuentas/${cuentaCredito}/pagos`, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' });
  expect(abono.status()).toBe(409);
  expect((await post(request, cajero.token, `/operaciones/caja/${cajaId}/cerrar`, { monto: 722.5 })).status()).toBe(409);
  expect(sql(`SELECT diferencia::float FROM cajas WHERE id='${cajaId}'`)).toBe('-2.5');
  // El administrador ve el cierre con su diferencia y responsable.
  const cierres = await (await request.get(`${API}/operaciones/caja/cierres?estado=CERRADA&usuarioId=${cajero.id}`, { headers: auth(admin.token) })).json() as any[];
  expect(cierres.map((c) => [c.id, Number(c.diferencia)])).toEqual([[cajaId, -2.5]]);
  // Conciliación global: stock reservado = unidades vendidas sin entregar (2 + 2 + 1 del producto; 2.5 del cable) y saldos no negativos.
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${producto}'`)).toBe('40/5');
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${cableId}'`)).toBe('10/2.5');
  expect(sql(`SELECT COUNT(*) FROM cuentas_operativas WHERE tenant_id='${TENANT}' AND saldo<0`)).toBe('0');
  expect(centavos(Number(sql(`SELECT SUM(total) FROM ventas WHERE usuario_id='${cajero.id}'`)))).toBe(centavos(207 + 35.94 + 230 + 115));
});
