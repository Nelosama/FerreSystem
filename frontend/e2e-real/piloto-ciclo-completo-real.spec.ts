import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

// PILOTO DE LA FERRETERÍA, de extremo a extremo (backend NestJS real + PostgreSQL temporal, sin mocks): producto con código, descripción, costo y
// precio; inventario inicial; apertura de caja; ventas de contado en EFECTIVO, TARJETA y TRANSFERENCIA; reintentos y doble envío; entrega; descuento
// de inventario; consulta de ventas; auditoría; cierre de caja. Verifica además que no haya ventas, cobros ni descuentos duplicados y que cada
// movimiento sea trazable. Solo verifica; no cambia el comportamiento del producto.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();
const num = (consulta: string) => Number(sql(consulta));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const RUN = randomUUID().slice(0, 8).toUpperCase(); // el sistema normaliza los códigos a mayúsculas
const ADMIN = 'admin.a@e2e.invalid';
const ADMIN_B = 'admin.b@e2e.invalid';
const CAJERO = `piloto.cajero.${RUN}@e2e.invalid`;
const TENANT = 'e2e-empresa-a';
const CODIGO = `PIL-${RUN}`;

type Sesion = { token: string; id: string; rol: string };
async function login(request: APIRequestContext, email: string): Promise<Sesion> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const b = await res.json();
  return { token: b.accessToken, id: b.user.id, rol: b.user.rol };
}

test.describe.configure({ mode: 'serial' });

let admin: Sesion;
let adminB: Sesion;
let cajero: Sesion;
let productoId = '';
let cajaId = '';
const ventas: Record<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA', { sid: string; id: string; total: number; cantidad: number }> = {} as any;
const PLAN = [
  { metodo: 'EFECTIVO' as const, cantidad: 2, pago: undefined },
  { metodo: 'TARJETA' as const, cantidad: 1, pago: { referencia: `AUT-${RUN}-T`, terminal: 'POS-1' } },
  { metodo: 'TRANSFERENCIA' as const, cantidad: 1, pago: { referencia: `TRF-${RUN}-1`, terminal: 'BANCO' } },
];
const STOCK_INICIAL = 50;
const venta = (token: string, data: unknown) => ({ post: (request: APIRequestContext) => request.post(`${API}/ventas`, { headers: auth(token), data }) });

test('1. el administrador inicia sesión y registra un producto con código, descripción, costo, precio e inventario inicial', async ({ request, page }) => {
  admin = await login(request, ADMIN);
  adminB = await login(request, ADMIN_B);
  expect(admin.rol).toBe('ADMIN');
  const alta = await request.post(`${API}/usuarios`, { headers: auth(admin.token), data: { nombre: `Cajero piloto ${RUN}`, email: CAJERO, password: PASSWORD, rol: 'CAJERO', permisos: ['pos.vender'], descuentoMaximo: 0 } });
  expect([200, 201], await alta.text()).toContain(alta.status());
  sql(`UPDATE usuarios SET permisos_configurados=true, permisos=ARRAY['pos.vender']::text[] WHERE email='${CAJERO}' AND tenant_id='${TENANT}'`);
  cajero = await login(request, CAJERO);
  expect(cajero.rol).toBe('CAJERO');

  const p = await request.post(`${API}/productos`, { headers: auth(admin.token), data: { codigo: CODIGO, nombre: `Taladro de piloto ${RUN}`, categoria: 'Herramientas Manuales', unidadMedida: 'UNIDAD', stockActual: STOCK_INICIAL, stockMinimo: 5 } });
  expect([200, 201], await p.text()).toContain(p.status());
  productoId = (await p.json()).id;
  expect(sql(`SELECT precio_aprobado FROM productos WHERE id='${productoId}'`)).toBe('f');
  const movimientosAntes = sql(`SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id='${productoId}'`);
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/precios');
  await page.getByRole('searchbox').fill(CODIGO);
  await page.getByRole('button', { name: new RegExp(CODIGO) }).click();
  await page.getByLabel('Costo', { exact: true }).fill('60');
  await page.getByLabel('Precio de venta', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Aprobar para venta' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto aprobado para venta.' })).toBeVisible();
  expect(sql(`SELECT costo_vigente::float FROM productos WHERE id='${productoId}'`)).toBe('60');
  expect(sql(`SELECT COUNT(*) FROM auditoria_operaciones WHERE entidad_id='${productoId}' AND operacion='COSTO_INICIALIZAR'`)).toBe('1');
  expect(sql(`SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id='${productoId}'`)).toBe(movimientosAntes);

  expect(sql(`SELECT codigo||'|'||precio_venta::float||'|'||precio_costo::float||'|'||stock_actual::float||'|'||stock_reservado::float FROM productos WHERE id='${productoId}'`)).toBe(`${CODIGO}|100|60|${STOCK_INICIAL}|0`);
});

test('2. consulta de existencias y precios: el administrador ve costo; el cajero ve precio y existencias pero NO el costo', async ({ request }) => {
  const buscar = async (token: string) => {
    const res = await request.get(`${API}/productos?search=${CODIGO}`, { headers: auth(token) });
    expect(res.status()).toBe(200);
    const cuerpo = await res.json();
    const lista = Array.isArray(cuerpo) ? cuerpo : (cuerpo.data ?? cuerpo.productos ?? cuerpo.items ?? []);
    const producto = lista.find((p: any) => p.codigo === CODIGO);
    expect(producto, `el producto ${CODIGO} aparece en la consulta`).toBeTruthy();
    return producto as Record<string, unknown>;
  };
  const vistoPorAdmin = await buscar(admin.token);
  const vistoPorCajero = await buscar(cajero.token);
  // La comprobación puede fallar: el administrador SÍ recibe una clave de costo; el cajero ninguna.
  expect(Object.keys(vistoPorAdmin).some((k) => /cost/i.test(k)), 'el administrador ve el costo').toBe(true);
  expect(Object.keys(vistoPorCajero).filter((k) => /cost/i.test(k)), 'el cajero no debe ver ningún costo').toEqual([]);
  expect(Number(vistoPorCajero.precioVenta)).toBe(100);
  expect(Number(vistoPorCajero.stockActual)).toBe(STOCK_INICIAL);
});

test('3. el cajero abre caja con un fondo', async ({ request }) => {
  const abiertas = await request.get(`${API}/operaciones/caja`, { headers: auth(cajero.token) });
  for (const c of ((await abiertas.json()) as any[]).filter((x) => x.estado === 'ABIERTA')) {
    await request.post(`${API}/operaciones/caja/${c.id}/cerrar`, { headers: auth(cajero.token), data: { monto: Number(c.efectivoEsperado) } });
  }
  const r = await request.post(`${API}/operaciones/caja/abrir`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), monto: 500 } });
  expect([200, 201], await r.text()).toContain(r.status());
  cajaId = (await r.json()).id;
  expect(sql(`SELECT estado||'|'||monto_apertura::float FROM cajas WHERE id='${cajaId}'`)).toBe('ABIERTA|500');
});

test('4. ventas de contado en efectivo, tarjeta y transferencia: total con ISV, cobro trazable y existencia reservada', async ({ request }) => {
  for (const p of PLAN) {
    const sid = randomUUID();
    const res = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { solicitudId: sid, metodoPago: p.metodo, tipoPago: 'CONTADO', ...(p.pago ? { pagoElectronico: p.pago } : {}), detalles: [{ productoId, cantidad: p.cantidad, precioUnitario: 100 }] } });
    expect(res.status(), `${p.metodo}: ${await res.text()}`).toBe(201);
    const b = await res.json();
    const total = Math.round(p.cantidad * 100 * 1.15 * 100) / 100;
    expect(Number(b.total)).toBe(total);
    ventas[p.metodo] = { sid, id: b.id, total, cantidad: p.cantidad };
    expect(sql(`SELECT metodo_pago||'|'||estado||'|'||usuario_id FROM ventas WHERE id='${b.id}'`)).toBe(`${p.metodo}|COMPLETADA|${cajero.id}`);
    expect(sql(`SELECT metodo||'|'||monto::float||'|'||tipo||'|'||usuario_id FROM movimientos_caja WHERE referencia='${b.id}'`)).toBe(`${p.metodo}|${total}|VENTA_POS|${cajero.id}`);
  }
  // Existencia: reservada hasta entregar; la física no cambia todavía.
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${productoId}'`)).toBe(`${STOCK_INICIAL}/4`);
});

test('5. la transferencia y la tarjeta exigen su referencia bancaria y no se reutiliza', async ({ request }) => {
  const sinReferencia = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), metodoPago: 'TRANSFERENCIA', tipoPago: 'CONTADO', detalles: [{ productoId, cantidad: 1, precioUnitario: 100 }] } });
  expect(sinReferencia.status(), 'transferencia sin referencia').toBe(400);
  const reutilizada = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), metodoPago: 'TRANSFERENCIA', tipoPago: 'CONTADO', pagoElectronico: PLAN[2].pago, detalles: [{ productoId, cantidad: 1, precioUnitario: 100 }] } });
  expect(reutilizada.status(), 'misma referencia en otra venta').toBe(409);
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${productoId}'`)).toBe(`${STOCK_INICIAL}/4`);
});

test('6. reintento y doble envío: no se duplican ventas, cobros ni reservas', async ({ request }) => {
  const antes = { ventas: num(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero.id}'`), mov: num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaId}'`) };
  for (const p of PLAN) {
    const v = ventas[p.metodo];
    const otra = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { solicitudId: v.sid, metodoPago: p.metodo, tipoPago: 'CONTADO', ...(p.pago ? { pagoElectronico: p.pago } : {}), detalles: [{ productoId, cantidad: p.cantidad, precioUnitario: 100 }] } });
    expect(otra.status(), `reintento ${p.metodo}`).toBeLessThan(300);
    expect((await otra.json()).id).toBe(v.id);
  }
  // Doble envío simultáneo de una venta nueva (doble clic): una sola venta.
  const sid = randomUUID();
  const cuerpo = { solicitudId: sid, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId, cantidad: 1, precioUnitario: 100 }] };
  const [a, b] = await Promise.all([request.post(`${API}/ventas`, { headers: auth(cajero.token), data: cuerpo }), request.post(`${API}/ventas`, { headers: auth(cajero.token), data: cuerpo })]);
  expect([a.status(), b.status()].every((s) => s < 300)).toBe(true);
  const idDoble = (await a.json()).id;
  expect((await b.json()).id).toBe(idDoble);
  expect(num(`SELECT COUNT(*) FROM ventas WHERE usuario_id='${cajero.id}'`)).toBe(antes.ventas + 1);
  expect(num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaId}'`)).toBe(antes.mov + 1);
  ventas.EFECTIVO = { ...ventas.EFECTIVO };
  (ventas as any).DOBLE = { sid, id: idDoble, total: 115, cantidad: 1 };
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${productoId}'`)).toBe(`${STOCK_INICIAL}/5`);
});

test('7. entrega: el cajero no puede; el administrador sí; el inventario se descuenta una sola vez aunque se repita', async ({ request }) => {
  const todas = [ventas.EFECTIVO, ventas.TARJETA, ventas.TRANSFERENCIA, (ventas as any).DOBLE];
  const noPuede = await request.post(`${API}/operaciones/ventas/${todas[0].id}/entregar`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), receptorNombre: 'Cliente' } });
  expect(noPuede.status()).toBe(403);
  expect(sql(`SELECT stock_actual::float FROM productos WHERE id='${productoId}'`)).toBe(String(STOCK_INICIAL));
  for (const v of todas) {
    const entrega = { solicitudId: randomUUID(), receptorNombre: 'Cliente del piloto' };
    const primera = await request.post(`${API}/operaciones/ventas/${v.id}/entregar`, { headers: auth(admin.token), data: entrega });
    const repetida = await request.post(`${API}/operaciones/ventas/${v.id}/entregar`, { headers: auth(admin.token), data: entrega });
    expect([primera.status(), repetida.status()], `entrega ${v.id}`).toEqual([201, 201]);
  }
  // 50 iniciales - (2 + 1 + 1 + 1) entregadas = 45 físicas; reserva liberada; nunca negativo.
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${productoId}'`)).toBe(`${STOCK_INICIAL - 5}/0`);
});

test('7b. mostrador: el cajero NO puede entregar al cobrar (separación de funciones); el administrador sí cobra y entrega a la vez, y el inventario baja una sola vez', async ({ request }) => {
  const antes = Number(sql(`SELECT stock_actual::float FROM productos WHERE id='${productoId}'`));
  const ventasAntes = num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}'`);
  const cuerpo = (sid: string) => ({ solicitudId: sid, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId, cantidad: 1, precioUnitario: 100, modoEntrega: 'MOSTRADOR' }] });
  // Regla vigente (CENTINELA D1): solo administración o bodega registran entregas físicas. El cajero recibe un mensaje claro y no se crea nada.
  const rechazada = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: cuerpo(randomUUID()) });
  expect(rechazada.status()).toBe(403);
  expect(await rechazada.text()).toContain('Cobrar y dejar en bodega');
  expect(num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}'`)).toBe(ventasAntes);
  // El administrador (dueño) vende con entrega inmediata desde su propia caja.
  const lista = await request.get(`${API}/operaciones/caja`, { headers: auth(admin.token) });
  let cajaAdmin = ((await lista.json()) as any[]).find((c) => c.estado === 'ABIERTA');
  if (!cajaAdmin) {
    const abrir = await request.post(`${API}/operaciones/caja/abrir`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), monto: 0 } });
    expect([200, 201], await abrir.text()).toContain(abrir.status());
    cajaAdmin = await abrir.json();
  }
  const sid = randomUUID();
  const a = await request.post(`${API}/ventas`, { headers: auth(admin.token), data: cuerpo(sid) });
  expect(a.status(), await a.text()).toBe(201);
  const id = (await a.json()).id;
  const repetida = await request.post(`${API}/ventas`, { headers: auth(admin.token), data: cuerpo(sid) });
  expect((await repetida.json()).id).toBe(id);
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${productoId}'`)).toBe(`${antes - 1}/0`);
  expect(num(`SELECT COUNT(*) FROM movimientos_caja WHERE referencia='${id}'`)).toBe(1);
  expect(num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}'`)).toBe(ventasAntes + 1);
  // Cierra la caja del administrador para no dejar estado a otras pruebas.
  const estado = await request.get(`${API}/operaciones/caja`, { headers: auth(admin.token) });
  const c = ((await estado.json()) as any[]).find((x) => x.id === (cajaAdmin.id ?? cajaAdmin));
  if (c) expect((await request.post(`${API}/operaciones/caja/${c.id}/cerrar`, { headers: auth(admin.token), data: { monto: Number(c.efectivoEsperado) } })).status()).toBeLessThan(300);
});

test('8. el administrador consulta las ventas y la auditoría; cada operación es trazable a su usuario', async ({ request }) => {
  const lista = await request.get(`${API}/ventas?limit=100`, { headers: auth(admin.token) });
  expect(lista.status()).toBe(200);
  const texto = JSON.stringify(await lista.json());
  for (const v of [ventas.EFECTIVO, ventas.TARJETA, ventas.TRANSFERENCIA]) expect(texto).toContain(v.id);
  const aud = await request.get(`${API}/operaciones/auditoria?page=0`, { headers: auth(admin.token) });
  expect(aud.status()).toBe(200);
  const filas = (await aud.json()) as any[];
  for (const v of [ventas.EFECTIVO, ventas.TARJETA, ventas.TRANSFERENCIA]) {
    expect(filas.filter((f) => f.operacion === 'VENTA_CREAR' && f.entidad_id === v.id && f.usuario_id === cajero.id)).toHaveLength(1);
  }
  expect(num(`SELECT COUNT(*) FROM auditoria_operaciones WHERE tenant_id='${TENANT}' AND operacion='VENTA_ENTREGAR' AND usuario_id='${admin.id}' AND (${[ventas.EFECTIVO, ventas.TARJETA, ventas.TRANSFERENCIA, (ventas as any).DOBLE].map((v) => `datos::text LIKE '%${v.id}%'`).join(' OR ')})`)).toBe(4);
  // Sin duplicados ni movimientos huérfanos: 4 ventas = 4 cobros con referencia a su venta; ningún cobro sin venta en esta caja.
  expect(num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaId}' AND tipo='VENTA_POS'`)).toBe(4);
  expect(num(`SELECT COUNT(*) FROM movimientos_caja m WHERE m.caja_id='${cajaId}' AND m.tipo='VENTA_POS' AND NOT EXISTS (SELECT 1 FROM ventas v WHERE v.id=m.referencia)`)).toBe(0);
  expect(num(`SELECT COUNT(*) FROM (SELECT referencia FROM movimientos_caja WHERE caja_id='${cajaId}' AND tipo='VENTA_POS' GROUP BY referencia HAVING COUNT(*)>1) d`)).toBe(0);
});

test('9. cierre de caja: el efectivo esperado suma solo el efectivo; sin diferencia cierra; se rechaza la diferencia sin explicación y el cierre repetido no duplica', async ({ request }) => {
  const efectivo = ventas.EFECTIVO.total + (ventas as any).DOBLE.total; // 230 + 115 (el cobro de mostrador del administrador va a su propia caja)
  const esperado = Math.round((500 + efectivo) * 100) / 100;
  const estado = await request.get(`${API}/operaciones/caja`, { headers: auth(cajero.token) });
  const caja = ((await estado.json()) as any[]).find((c) => c.id === cajaId);
  expect(Number(caja.efectivoEsperado)).toBeCloseTo(esperado, 2); // tarjeta y transferencia NO suman al efectivo
  const sinNota = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero.token), data: { monto: esperado + 7 } });
  expect(sinNota.status()).toBe(400);
  expect(sql(`SELECT estado FROM cajas WHERE id='${cajaId}'`)).toBe('ABIERTA');
  const cierre = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero.token), data: { monto: esperado } });
  expect(cierre.status()).toBeLessThan(300);
  expect(sql(`SELECT estado||'|'||monto_esperado::float||'|'||monto_cierre_fisico::float||'|'||diferencia::float FROM cajas WHERE id='${cajaId}'`)).toBe(`CERRADA|${esperado}|${esperado}|0`);
  const repetido = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero.token), data: { monto: esperado } });
  expect(repetido.status()).toBeLessThan(300);
  const distinto = await request.post(`${API}/operaciones/caja/${cajaId}/cerrar`, { headers: auth(cajero.token), data: { monto: esperado + 1, notas: 'otro' } });
  expect(distinto.status()).toBe(409);
  // Con la caja cerrada no se puede vender.
  const cerrada = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId, cantidad: 1, precioUnitario: 100 }] } });
  expect(cerrada.status()).toBeGreaterThanOrEqual(400);
  expect(sql(`SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='${productoId}'`)).toBe(`${STOCK_INICIAL - 6}/0`);
});

test('10. aislamiento: otra empresa no ve ni opera estas ventas', async ({ request }) => {
  const lista = await request.get(`${API}/ventas?limit=500`, { headers: auth(adminB.token) });
  expect(JSON.stringify(await lista.json())).not.toContain(ventas.EFECTIVO.id);
  expect((await request.get(`${API}/ventas/${ventas.EFECTIVO.id}`, { headers: auth(adminB.token) })).status()).toBe(404);
  expect((await request.post(`${API}/operaciones/ventas/${ventas.EFECTIVO.id}/entregar`, { headers: auth(adminB.token), data: { solicitudId: randomUUID(), receptorNombre: 'X' } })).status()).toBe(404);
});
