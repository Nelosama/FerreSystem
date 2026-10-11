import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

// FARO — auditoría integral de la rama integrada (NEXUS). Backend NestJS real + PostgreSQL temporal, sin mocks.
// Cada operación crítica se comprueba además en base de datos. Los defectos se marcan con test.fail y su ID:
// el test describe el comportamiento correcto; mientras el defecto exista, el fallo es el esperado.
// Las funciones no implementadas se marcan con test.skip y un motivo (PENDIENTE), nunca como FAIL.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const TENANT_A = 'e2e-empresa-a';
const RUN = (process.env.FARO_RUN ??= randomUUID().slice(0, 8));
// El backend guarda códigos, facturas y referencias en mayúsculas: las búsquedas SQL usan el mismo formato.
const RU = RUN.toUpperCase();

const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();
const num = (consulta: string) => Number(sql(consulta));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type Sesion = { token: string; id: string; rol: string };

const EM = {
  admin: 'admin.a@e2e.invalid',
  bodeguero: `faro.bodeguero.${RUN}@e2e.invalid`,
  vendedor: `faro.vendedor.${RUN}@e2e.invalid`,
  cajero: `faro.cajero.${RUN}@e2e.invalid`,
  cajero2: `faro.cajero2.${RUN}@e2e.invalid`,
};

async function login(request: APIRequestContext, email: string): Promise<Sesion> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { token: body.accessToken, id: body.user.id, rol: body.user.rol };
}

// Usuario de prueba con permisos explícitos. Idempotente: si ya existe, solo se inicia sesión.
async function asegurarUsuario(request: APIRequestContext, admin: Sesion, email: string, nombre: string, rol: string, permisos: string[]) {
  if (num(`SELECT COUNT(*) FROM usuarios WHERE email='${email}' AND tenant_id='${TENANT_A}'`) === 0) {
    const res = await request.post(`${API}/usuarios`, {
      headers: auth(admin.token),
      data: { nombre, email, password: PASSWORD, rol, permisos, descuentoMaximo: 10 },
    });
    expect([200, 201], `crear ${email}: ${await res.text()}`).toContain(res.status());
  }
  const lista = permisos.map((p) => `'${p}'`).join(',');
  sql(`UPDATE usuarios SET permisos_configurados=true, permisos=ARRAY[${lista}]::text[], activo=true WHERE email='${email}' AND tenant_id='${TENANT_A}'`);
  return login(request, email);
}

async function abrirCaja(request: APIRequestContext, sesion: Sesion) {
  const res = await request.post(`${API}/operaciones/caja/abrir`, { headers: auth(sesion.token), data: { solicitudId: randomUUID(), monto: 500 } });
  expect([200, 201, 409]).toContain(res.status());
}

async function crearProducto(request: APIRequestContext, sesion: Sesion, codigo: string, data: Record<string, unknown>) {
  const res = await request.post(`${API}/productos`, { headers: auth(sesion.token), data: { codigo, nombre: `FARO ${codigo}`, stockActual: 0, stockMinimo: 0, ...data } });
  expect([200, 201], `producto ${codigo}: ${await res.text()}`).toContain(res.status());
  return (await res.json()) as { id: string; version: number };
}

async function aprobarPrecio(request: APIRequestContext, admin: Sesion, id: string, precioVenta: number, precioCosto: number) {
  // Si el alta del administrador ya dejó el precio aprobado, no hay cambio que guardar.
  if (num(`SELECT COUNT(*) FROM productos WHERE id='${id}' AND precio_aprobado=true`) === 1) return;
  const version = num(`SELECT version FROM productos WHERE id='${id}'`);
  const res = await request.patch(`${API}/productos/${id}/precios`, {
    headers: auth(admin.token), data: { version, precioVenta, precioCosto, aprobar: true, motivo: 'Aprobación QA FARO' },
  });
  expect(res.status(), `aprobar ${id}: ${await res.text()}`).toBe(200);
}

async function ajustarStock(request: APIRequestContext, admin: Sesion, id: string, stock: number) {
  const res = await request.post(`${API}/operaciones/productos/${id}/ajuste`, {
    headers: auth(admin.token), data: { solicitudId: randomUUID(), stockAnterior: num(`SELECT stock_actual::float FROM productos WHERE id='${id}'`), stock, motivo: 'Inventario inicial QA FARO' },
  });
  expect([200, 201], await res.text()).toContain(res.status());
}

function venta(request: APIRequestContext, sesion: Sesion, data: unknown) {
  return request.post(`${API}/ventas`, { headers: auth(sesion.token), data });
}

// Claves que no deben llegar a roles no administrativos (costo, margen, costo vigente).
const CLAVES_COSTO = ['precioCosto', 'precio_costo', 'costoVigente', 'costo_vigente', 'costoUnitario', 'costo_unitario',
  'costo', 'costos', 'margen', 'margenCalculado', 'ultimo_costo', 'ultimoCosto'];
function clavesDeCosto(valor: unknown, ruta = '$'): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => clavesDeCosto(v, `${ruta}[${i}]`));
  if (!valor || typeof valor !== 'object') return [];
  return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) =>
    (CLAVES_COSTO.includes(k) ? [`${ruta}.${k}`] : []).concat(clavesDeCosto(v, `${ruta}.${k}`)));
}

// Estado compartido entre pruebas. Playwright reinicia el worker tras un fallo: la preparación es idempotente.
let admin: Sesion, bodeguero: Sesion, vendedor: Sesion, cajero: Sesion, cajero2: Sesion;
let pAprob: string; // precio aprobado, costo 60, stock 20
let pPend: string; // alta de bodeguero sin precio: pendiente de aprobación
let pStock1: string; // stock 1: concurrencia
let proveedor: string;
let cCred: string;

test.beforeAll(async ({ request }) => {
  admin = await login(request, EM.admin);
  bodeguero = await asegurarUsuario(request, admin, EM.bodeguero, 'FARO Bodeguero', 'BODEGUERO', ['inventario.ver', 'inventario.editar']);
  vendedor = await asegurarUsuario(request, admin, EM.vendedor, 'FARO Vendedor', 'VENDEDOR', ['pos.vender', 'cotizaciones.crear']);
  cajero = await asegurarUsuario(request, admin, EM.cajero, 'FARO Cajero', 'CAJERO', ['pos.vender', 'cotizaciones.crear', 'cotizaciones.convertir_venta', 'caja.movimientos_manuales']);
  cajero2 = await asegurarUsuario(request, admin, EM.cajero2, 'FARO Cajero 2', 'CAJERO', ['pos.vender']);
  await abrirCaja(request, admin);
  await abrirCaja(request, cajero);
  await abrirCaja(request, cajero2);
  await abrirCaja(request, vendedor);
  // Preparación idempotente por producto: un reinicio de worker repite beforeAll sin duplicar datos.
  const existe = (codigo: string) => sql(`SELECT id FROM productos WHERE codigo='${codigo}' AND tenant_id='${TENANT_A}'`);
  if (!existe(`FARO-APR-${RU}`)) {
    const a = await crearProducto(request, admin, `FARO-APR-${RU}`, { precioVenta: 100, precioCosto: 60 });
    await aprobarPrecio(request, admin, a.id, 100, 60);
    await ajustarStock(request, admin, a.id, 20);
  }
  if (!existe(`FARO-STK-${RU}`)) {
    const s1 = await crearProducto(request, admin, `FARO-STK-${RU}`, { precioVenta: 100, precioCosto: 60 });
    await aprobarPrecio(request, admin, s1.id, 100, 60);
    await ajustarStock(request, admin, s1.id, 1);
  }
  if (!existe(`FARO-PEND-${RU}`)) {
    const pe = await crearProducto(request, bodeguero, `FARO-PEND-${RU}`, {});
    await ajustarStock(request, admin, pe.id, 5);
  }
  if (num(`SELECT COUNT(*) FROM proveedores WHERE nombre='FARO Proveedor ${RUN}' AND tenant_id='${TENANT_A}'`) === 0) {
    const prov = await request.post(`${API}/operaciones/proveedores`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), nombre: `FARO Proveedor ${RUN}` } });
    expect([200, 201], await prov.text()).toContain(prov.status());
  }
  if (num(`SELECT COUNT(*) FROM clientes WHERE nombre='FARO Cliente crédito ${RUN}' AND tenant_id='${TENANT_A}'`) === 0) {
    const cli = await request.post(`${API}/clientes`, { headers: auth(admin.token), data: { nombre: `FARO Cliente crédito ${RUN}` } });
    expect([200, 201], await cli.text()).toContain(cli.status());
    sql(`UPDATE clientes SET credito_habilitado=true, limite_credito=5000, saldo_pendiente=0 WHERE id='${(await cli.json()).id}'`);
  }
  pAprob = sql(`SELECT id FROM productos WHERE codigo='FARO-APR-${RU}' AND tenant_id='${TENANT_A}'`);
  pStock1 = sql(`SELECT id FROM productos WHERE codigo='FARO-STK-${RU}' AND tenant_id='${TENANT_A}'`);
  pPend = sql(`SELECT id FROM productos WHERE codigo='FARO-PEND-${RU}' AND tenant_id='${TENANT_A}'`);
  proveedor = sql(`SELECT id FROM proveedores WHERE nombre='FARO Proveedor ${RUN}' AND tenant_id='${TENANT_A}'`);
  cCred = sql(`SELECT id FROM clientes WHERE nombre='FARO Cliente crédito ${RUN}' AND tenant_id='${TENANT_A}'`);
});

test.describe('1. Matriz de roles: costos, márgenes y permisos por endpoint', () => {
  test('ningún rol no administrativo recibe costo ni margen; cada rol obtiene solo lo que su rol permite', async ({ request }) => {
    // Fixtures que las lecturas necesitan: venta, devolución, cotización y compra existentes.
    const cot = await request.post(`${API}/cotizaciones`, { headers: auth(admin.token), data: { clienteNombre: 'FARO cotización', detalles: [{ productoId: pAprob, cantidad: 2, precioUnitario: 100 }] } });
    expect([200, 201], await cot.text()).toContain(cot.status());
    const cotId = (await cot.json()).id;
    const numeroVenta = `FARO-M-${RU}`;
    const vr = await venta(request, cajero, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] });
    expect(vr.status()).toBe(201);
    const ventaId = (await vr.json()).id;
    const numero = sql(`SELECT numero_venta FROM ventas WHERE id='${ventaId}'`);
    const dev = await request.post(`${API}/operaciones/ventas/${ventaId}/devoluciones`, {
      headers: auth(admin.token),
      data: { solicitudId: randomUUID(), motivo: numeroVenta, metodo: 'EFECTIVO', items: [{ detalleId: sql(`SELECT id FROM detalles_venta WHERE venta_id='${ventaId}'`), cantidad: 1, destino: 'NO_ENTREGADO' }] },
    });
    expect([200, 201], await dev.text()).toContain(dev.status());
    const devId = (await dev.json()).id;

    const roles = { ADMIN: admin, CAJERO: cajero, VENDEDOR: vendedor, BODEGUERO: bodeguero };
    // Expectativa de estado según los decoradores @Roles de cada ruta (ADMIN siempre permitido).
    const matriz: { ruta: string; permitidos: string[] }[] = [
      { ruta: '/productos', permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'] },
      { ruta: `/productos/${pAprob}`, permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'] },
      { ruta: '/productos/comercial', permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: '/cotizaciones', permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: `/cotizaciones/${cotId}`, permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: `/ventas/${ventaId}`, permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: `/operaciones/ventas/buscar?numero=${numero}`, permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: '/operaciones/entregas', permitidos: ['ADMIN', 'CAJERO', 'BODEGUERO'] },
      { ruta: `/operaciones/devoluciones/${devId}`, permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: '/operaciones/solicitudes-devolucion', permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: '/operaciones/compras', permitidos: ['ADMIN', 'BODEGUERO'] },
      { ruta: `/operaciones/productos/${pAprob}/historial`, permitidos: ['ADMIN', 'BODEGUERO'] },
      { ruta: `/operaciones/productos/${pAprob}/proveedores`, permitidos: ['ADMIN', 'BODEGUERO'] },
      { ruta: '/dashboard', permitidos: ['ADMIN', 'VENDEDOR', 'BODEGUERO'] },
      { ruta: '/operaciones/caja', permitidos: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
      { ruta: '/operaciones/cuentas?tipo=CXC', permitidos: ['ADMIN', 'CAJERO'] },
      { ruta: '/operaciones/cuentas?tipo=CXP', permitidos: ['ADMIN'] },
      { ruta: `/operaciones/resumen?desde=2026-01-01&hasta=2026-12-31`, permitidos: ['ADMIN'] },
    ];

    const incumplimientos: string[] = [];
    for (const { ruta, permitidos } of matriz) {
      for (const [rol, sesion] of Object.entries(roles)) {
        const res = await request.get(`${API}${ruta}`, { headers: auth(sesion.token) });
        // Una devolución de otro usuario responde 404 para CAJERO y VENDEDOR: alcance por propietario, no fuga.
        const alcance = ruta.startsWith('/operaciones/devoluciones/') && rol !== 'ADMIN' && res.status() === 404;
        const esperado = permitidos.includes(rol) ? 'OK' : 'DENEGADO';
        const obtenido = alcance ? 'OK' : res.status() === 403 ? 'DENEGADO' : res.status() < 300 ? 'OK' : `HTTP ${res.status()}`;
        if (alcance) continue;
        if (obtenido !== esperado) {
          incumplimientos.push(`${rol} ${ruta}: esperado ${esperado}, obtenido ${obtenido}`);
          continue;
        }
        if (rol !== 'ADMIN' && obtenido === 'OK') {
          const claves = clavesDeCosto(await res.json());
          if (claves.length) incumplimientos.push(`${rol} ${ruta}: expone costo en ${claves.slice(0, 4).join(', ')}`);
        }
      }
    }
    expect(incumplimientos, incumplimientos.join('\n')).toEqual([]);
  });
});

test.describe('2. Inventario, precios y aprobación', () => {
  test('bodeguero da de alta sin precio; con precio se rechaza y no se crea el producto', async ({ request }) => {
    const sinPrecio = await request.post(`${API}/productos`, { headers: auth(bodeguero.token), data: { codigo: `FARO-B1-${RU}`, nombre: 'FARO alta sin precio', stockActual: 0, stockMinimo: 0 } });
    expect(sinPrecio.status()).toBe(201);
    expect(num(`SELECT precio_venta::float FROM productos WHERE codigo='FARO-B1-${RU}'`)).toBe(0);
    const conPrecio = await request.post(`${API}/productos`, { headers: auth(bodeguero.token), data: { codigo: `FARO-B2-${RU}`, nombre: 'FARO alta con precio', precioVenta: 5, precioCosto: 1, stockActual: 0, stockMinimo: 0 } });
    expect(conPrecio.status()).toBe(403);
    expect(num(`SELECT COUNT(*) FROM productos WHERE codigo='FARO-B2-${RU}'`)).toBe(0);
  });

  test('el producto pendiente no aparece en el catálogo comercial del cajero y sí en el del administrador', async ({ request }) => {
    const comercial = await (await request.get(`${API}/productos/comercial`, { headers: auth(cajero.token) })).json();
    expect(comercial.map((p: { id: string }) => p.id)).toContain(pAprob);
    expect(comercial.map((p: { id: string }) => p.id)).not.toContain(pPend);
    const todos = await (await request.get(`${API}/productos`, { headers: auth(admin.token) })).json();
    expect(todos.find((p: { id: string }) => p.id === pPend)?.precioAprobado).toBe(false);
  });

  test('aprobación con versión vencida se rechaza; precio de venta cero no se aprueba; bodeguero no cambia precios', async ({ request }) => {
    const version = num(`SELECT version FROM productos WHERE id='${pAprob}'`);
    const vencida = await request.patch(`${API}/productos/${pAprob}/precios`, { headers: auth(admin.token), data: { version: version - 1, precioVenta: 100, precioCosto: 60, aprobar: true } });
    expect([400, 409]).toContain(vencida.status());
    const cero = await request.patch(`${API}/productos/${pPend}/precios`, { headers: auth(admin.token), data: { version: num(`SELECT version FROM productos WHERE id='${pPend}'`), precioVenta: 0, precioCosto: 0, aprobar: true } });
    expect(cero.status()).toBe(400);
    expect(num(`SELECT COUNT(*) FROM productos WHERE id='${pPend}' AND precio_aprobado=true`)).toBe(0);
    const bod = await request.patch(`${API}/productos/${pPend}/precios`, { headers: auth(bodeguero.token), data: { version: version, precioVenta: 100, precioCosto: 60, aprobar: true } });
    expect(bod.status()).toBe(403);
  });
});

test.describe('3. Compras, costos y cuentas por pagar', () => {
  const crearCompra = async (request: APIRequestContext, numeroFactura: string, costo: number, cantidad: number, productoId = pAprob, prov = proveedor) => {
    const res = await request.post(`${API}/operaciones/compras`, {
      headers: auth(admin.token),
      data: { solicitudId: randomUUID(), proveedorId: prov, numeroFactura, isv: 0, items: [{ productoId, cantidad, costo }] },
    });
    expect([200, 201], await res.text()).toContain(res.status());
    return sql(`SELECT id FROM ordenes_compra WHERE numero_factura='${numeroFactura}' AND tenant_id='${TENANT_A}'`);
  };
  const detalle = (ordenId: string) => sql(`SELECT id FROM detalles_orden_compra WHERE orden_id='${ordenId}' LIMIT 1`);
  const recibir = (request: APIRequestContext, sesion: Sesion, ordenId: string, detalleId: string, cantidad: number) =>
    request.post(`${API}/operaciones/compras/${ordenId}/recepciones`, { headers: auth(sesion.token), data: { solicitudId: randomUUID(), items: [{ detalleId, cantidad }] } });

  test('recepción parcial suma solo lo recibido, fija el costo vigente y no duplica la CXP', async ({ request }) => {
    const f = `FARO-F1-${RU}`;
    const orden = await crearCompra(request, f, 60, 10);
    expect(num(`SELECT COUNT(*) FROM cuentas_operativas WHERE documento_id='${orden}' AND tipo='CXP'`)).toBe(1);
    const stockAntes = num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`);
    expect((await recibir(request, bodeguero, orden, detalle(orden), 4)).status()).toBeLessThan(300);
    expect(num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`) - stockAntes).toBe(4);
    expect(num(`SELECT precio_costo::float FROM productos WHERE id='${pAprob}'`)).toBe(60);
    expect(num(`SELECT COUNT(*) FROM cuentas_operativas WHERE documento_id='${orden}' AND tipo='CXP'`)).toBe(1);
    expect(num(`SELECT monto::float FROM cuentas_operativas WHERE documento_id='${orden}' AND tipo='CXP'`)).toBe(600);
  });

  test('recibir más de lo pendiente se rechaza sin cambios; el restante se recibe al completar', async ({ request }) => {
    const orden = sql(`SELECT id FROM ordenes_compra WHERE numero_factura='FARO-F1-${RU}' AND tenant_id='${TENANT_A}' AND proveedor_id='${proveedor}'`);
    const stockAntes = num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`);
    expect((await recibir(request, bodeguero, orden, detalle(orden), 7)).status()).toBe(400);
    expect(num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`)).toBe(stockAntes);
    expect((await recibir(request, bodeguero, orden, detalle(orden), 6)).status()).toBeLessThan(300);
    expect(num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`) - stockAntes).toBe(6);
  });

  test('factura repetida con otras mayúsculas o espacios no crea otra deuda; la misma factura con otro proveedor sí', async ({ request }) => {
    const otro = await request.post(`${API}/operaciones/proveedores`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), nombre: `FARO Proveedor B ${RUN}` } });
    const provB = (await otro.json()).id;
    const repetida = await request.post(`${API}/operaciones/compras`, {
      headers: auth(admin.token),
      data: { solicitudId: randomUUID(), proveedorId: proveedor, numeroFactura: `  faro-f1-${RUN} `, isv: 0, items: [{ productoId: pAprob, cantidad: 1, costo: 60 }] },
    });
    expect([400, 409]).toContain(repetida.status());
    expect(num(`SELECT COUNT(*) FROM ordenes_compra WHERE upper(trim(numero_factura))='FARO-F1-${RU}' AND proveedor_id='${proveedor}'`)).toBe(1);
    const otraEmpresa = await crearCompra(request, `FARO-F1-${RU}`, 60, 1, pAprob, provB);
    expect(otraEmpresa).not.toBe('');
  });

  test('cambio de costo en la recepción actualiza costo vigente y queda en la auditoría', async ({ request }) => {
    const orden = await crearCompra(request, `FARO-F2-${RU}`, 75, 2);
    expect((await recibir(request, bodeguero, orden, detalle(orden), 2)).status()).toBeLessThan(300);
    expect(num(`SELECT precio_costo::float FROM productos WHERE id='${pAprob}'`)).toBe(75);
    expect(num(`SELECT costo_vigente::float FROM productos WHERE id='${pAprob}'`)).toBe(75);
    expect(num(`SELECT COUNT(*) FROM auditoria_operaciones WHERE operacion='COMPRA_RECIBIR' AND datos->>'orderId'='${orden}' AND datos::text LIKE '%75%'`)).toBeGreaterThanOrEqual(1);
  });

  test('dos recepciones simultáneas del mismo saldo: solo una suma existencias', async ({ request }) => {
    const orden = await crearCompra(request, `FARO-F3-${RU}`, 60, 3);
    const d = detalle(orden);
    const antes = num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`);
    const [a, b] = await Promise.all([recibir(request, bodeguero, orden, d, 3), recibir(request, bodeguero, orden, d, 3)]);
    const estados = [a.status(), b.status()].sort();
    expect(estados[0], `estados ${estados}`).toBe(201);
    expect(estados[1], `estados ${estados}`).toBeGreaterThanOrEqual(400);
    expect(num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`) - antes).toBe(3);
  });

  test('pago electrónico a proveedor exige referencia, no se reutiliza en la misma cuenta y sí en otra factura', async ({ request }) => {
    const orden = sql(`SELECT id FROM ordenes_compra WHERE numero_factura='FARO-F1-${RU}' AND tenant_id='${TENANT_A}' AND proveedor_id='${proveedor}'`);
    const cuenta = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${orden}' AND tipo='CXP'`);
    const sinRef = await request.post(`${API}/operaciones/cuentas/${cuenta}/pagos`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), monto: 100, metodo: 'TRANSFERENCIA' } });
    expect(sinRef.status(), await sinRef.text()).toBe(400);
    const ok = await request.post(`${API}/operaciones/cuentas/${cuenta}/pagos`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), monto: 100, metodo: 'TRANSFERENCIA', referencia: `REF-${RU}-A` } });
    expect(ok.status()).toBe(201);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuenta}'`)).toBe(500);
    const repetida = await request.post(`${API}/operaciones/cuentas/${cuenta}/pagos`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), monto: 50, metodo: 'TRANSFERENCIA', referencia: `ref-${RUN}-a` } });
    expect([400, 409]).toContain(repetida.status());
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuenta}'`)).toBe(500);
    const otraFactura = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${sql(`SELECT id FROM ordenes_compra WHERE numero_factura='FARO-F2-${RU}' AND tenant_id='${TENANT_A}'`)}' AND tipo='CXP'`);
    const otra = await request.post(`${API}/operaciones/cuentas/${otraFactura}/pagos`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), monto: 50, metodo: 'TRANSFERENCIA', referencia: `REF-${RU}-A` } });
    expect(otra.status()).toBe(201);
  });

  test('cajero y vendedor no crean compras, no reciben mercancía y no pagan proveedores', async ({ request }) => {
    const orden = sql(`SELECT id FROM ordenes_compra WHERE numero_factura='FARO-F1-${RU}' AND tenant_id='${TENANT_A}' AND proveedor_id='${proveedor}'`);
    const compra = await request.post(`${API}/operaciones/compras`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), proveedorId: proveedor, numeroFactura: `FARO-X-${RU}`, isv: 0, items: [{ productoId: pAprob, cantidad: 1, costo: 1 }] } });
    expect(compra.status()).toBe(403);
    expect((await recibir(request, cajero, orden, detalle(orden), 1)).status()).toBe(403);
    const cuenta = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${orden}' AND tipo='CXP'`);
    const pago = await request.post(`${API}/operaciones/cuentas/${cuenta}/pagos`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } });
    expect(pago.status(), await pago.text()).toBe(403);
  });
});

test.describe('4. Ventas, cotizaciones y POS', () => {
  test('contado en efectivo: total con ISV, reserva de stock y movimiento de caja', async ({ request }) => {
    const sid = randomUUID();
    const antes = num(`SELECT stock_reservado::float FROM productos WHERE id='${pAprob}'`);
    const res = await venta(request, cajero, { solicitudId: sid, metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 2, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    expect((await res.json()).total).toBe(230);
    expect(num(`SELECT stock_reservado::float FROM productos WHERE id='${pAprob}'`) - antes).toBe(2);
    expect(sql(`SELECT metodo||'|'||monto::float FROM movimientos_caja WHERE referencia='${sid}'`)).toBe('EFECTIVO|230');
  });

  test('un producto sin precio aprobado no se vende en línea', async ({ request }) => {
    const res = await venta(request, cajero, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: pPend, cantidad: 1, precioUnitario: 0 }] });
    expect(res.status()).toBe(400);
    expect(num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${pPend}'`)).toBe(0);
  });

  test('tarjeta exige autorización bancaria y la misma autorización no se reutiliza', async ({ request }) => {
    const base = { metodoPago: 'TARJETA', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] };
    const sinAut = await venta(request, cajero, { solicitudId: randomUUID(), ...base });
    expect(sinAut.status()).toBe(400);
    const aut = { referencia: `AUT-${RU}-1`, terminal: 'T01' };
    const primera = await venta(request, cajero, { solicitudId: randomUUID(), ...base, pagoElectronico: aut });
    expect(primera.status()).toBe(201);
    expect(num(`SELECT COUNT(*) FROM aprobaciones_bancarias WHERE tenant_id='${TENANT_A}' AND referencia='AUT-${RU}-1'`)).toBe(1);
    const reutilizada = await venta(request, cajero2, { solicitudId: randomUUID(), ...base, pagoElectronico: aut });
    expect(reutilizada.status()).toBe(409);
    expect(num(`SELECT COUNT(*) FROM aprobaciones_bancarias WHERE tenant_id='${TENANT_A}' AND referencia='AUT-${RU}-1'`)).toBe(1);
  });

  test('cotización convertida una sola vez; la segunda conversión se rechaza', async ({ request }) => {
    const cot = await request.post(`${API}/cotizaciones`, { headers: auth(admin.token), data: { clienteNombre: 'FARO conversión', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] } });
    const cotId = (await cot.json()).id;
    const primera = await request.post(`${API}/cotizaciones/${cotId}/convertir`, { headers: auth(cajero.token), data: { metodoPago: 'EFECTIVO' } });
    expect(primera.status(), await primera.text()).toBe(201);
    const segunda = await request.post(`${API}/cotizaciones/${cotId}/convertir`, { headers: auth(cajero.token), data: { metodoPago: 'EFECTIVO' } });
    expect(segunda.status()).toBe(400);
    expect(num(`SELECT COUNT(*) FROM cotizaciones WHERE id='${cotId}' AND estado='CONVERTIDA'`)).toBe(1);
  });

  test('crédito: suma saldo, crea cuenta por cobrar y respeta el límite', async ({ request }) => {
    const res = await venta(request, cajero, { solicitudId: randomUUID(), clienteId: cCred, metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(201);
    expect(num(`SELECT saldo_pendiente::float FROM clientes WHERE id='${cCred}'`)).toBe(115);
    const excede = await venta(request, cajero, { solicitudId: randomUUID(), clienteId: cCred, metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId: pAprob, cantidad: 60, precioUnitario: 100 }] });
    expect(excede.status()).toBe(400);
  });

  test('entrega completa libera reserva y descuenta existencia una sola vez', async ({ request }) => {
    const res = await venta(request, cajero, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 3, precioUnitario: 100 }] });
    const id = (await res.json()).id;
    const fisico = num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`);
    expect((await request.post(`${API}/operaciones/ventas/${id}/entregar`, { headers: auth(cajero.token) })).status()).toBe(201);
    expect((await request.post(`${API}/operaciones/ventas/${id}/entregar`, { headers: auth(cajero.token) })).status()).toBe(201);
    expect(num(`SELECT stock_actual::float FROM productos WHERE id='${pAprob}'`)).toBe(fisico - 3);
  });

  test.skip('entrega parcial de una venta — PENDIENTE: no implementada; POS_VENTA_ENTREGA_DECISION.md deja la decisión al propietario', async () => {});

  test('devolución parcial acredita solo lo devuelto; devolver más de lo vendido se rechaza', async ({ request }) => {
    const res = await venta(request, cajero, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 3, precioUnitario: 100 }] });
    const id = (await res.json()).id;
    const det = sql(`SELECT id FROM detalles_venta WHERE venta_id='${id}'`);
    const parcial = await request.post(`${API}/operaciones/ventas/${id}/devoluciones`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), motivo: 'QA parcial', metodo: 'EFECTIVO', items: [{ detalleId: det, cantidad: 1, destino: 'NO_ENTREGADO' }] } });
    expect([200, 201], await parcial.text()).toContain(parcial.status());
    expect(Number((await parcial.json()).monto)).toBe(115);
    const exceso = await request.post(`${API}/operaciones/ventas/${id}/devoluciones`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), motivo: 'QA exceso', metodo: 'EFECTIVO', items: [{ detalleId: det, cantidad: 3, destino: 'NO_ENTREGADO' }] } });
    expect(exceso.status()).toBe(400);
  });

  test('dos cajeros por el último producto: una sola venta; el reintento de la ganadora no duplica', async ({ request }) => {
    const linea = [{ productoId: pStock1, cantidad: 1, precioUnitario: 100 }];
    const dataA = { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: linea };
    const dataB = { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: linea };
    const [a, b] = await Promise.all([venta(request, cajero, dataA), venta(request, cajero2, dataB)]);
    expect([a.status(), b.status()].sort()).toEqual([201, 400]);
    // El reintento de la venta ganadora devuelve la misma venta y no crea otra.
    const [ganador, sesionGanador] = a.status() === 201 ? [dataA, cajero] : [dataB, cajero2];
    const reintento = await venta(request, sesionGanador, ganador);
    expect(reintento.status()).toBeLessThan(300);
    expect(num(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${pStock1}'`)).toBe(1);
  });

  // DEF-03 (FAIL): solicitudId es opcional en CreateVentaDto; un reintento sin clave crea otra venta.
  test('DEF-03: venta sin solicitudId debe rechazarse', async ({ request }) => {
    const res = await venta(request, cajero, { metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] });
    expect(res.status()).toBe(400);
  });
});

test.describe('5. Contingencia offline: operación, reinicio, reconexión y conflictos', () => {
  // Secuencias únicas por ejecución: el dispositivo puede venir de otra suite con secuencias ya usadas.
  const base = (Date.now() % 90000000) + 1000;
  let dispositivoId = '';
  let ventanaId = '';
  let productosVentana: { id: string }[] = [];

  // Dispositivo y ventana se preparan aquí para que sobrevivan a un reinicio de worker tras un fallo.
  test.beforeAll(async ({ request }) => {
    expect((await request.patch(`${API}/contingencia/configuracion`, { headers: auth(admin.token), data: { habilitada: true } })).status()).toBe(200);
    // dispositivosMax = 1 por empresa: si ya hay un dispositivo activo (p. ej. tras un reinicio de worker), se reutiliza.
    const lista = await (await request.get(`${API}/contingencia/dispositivos`, { headers: auth(admin.token) })).json();
    const activo = (Array.isArray(lista) ? lista : lista.dispositivos ?? []).find((d: { activo?: boolean }) => d.activo !== false);
    if (activo) {
      dispositivoId = activo.dispositivoId ?? activo.id;
    } else {
      dispositivoId = randomUUID();
      const reg = await request.post(`${API}/contingencia/dispositivos`, { headers: auth(cajero.token), data: { dispositivoId, nombre: `FARO POS ${RUN}` } });
      expect([200, 201], await reg.text()).toContain(reg.status());
    }
    const ven = await request.post(`${API}/contingencia/ventanas`, { headers: auth(cajero.token), data: { dispositivoId } });
    expect([200, 201], await ven.text()).toContain(ven.status());
    const cuerpo = await ven.json();
    ventanaId = cuerpo.ventana?.id ?? cuerpo.id;
    productosVentana = cuerpo.catalogo?.productos ?? cuerpo.productos ?? [];
  });

  test('la ventana offline incluye productos aprobados', async ({ request }) => {
    expect(ventanaId, 'ventana emitida en beforeAll').toMatch(/^[0-9a-f-]{36}$/);
    expect(productosVentana.map((p) => p.id)).toContain(pAprob);
  });

  // DEF-01 (FAIL): construirCatalogo no filtra precio aprobado; la ventana offline ofrece productos sin precio.
  test('DEF-01: el catálogo offline no debe incluir productos sin precio aprobado', async ({ request }) => {
    const ven = await request.post(`${API}/contingencia/ventanas`, { headers: auth(cajero.token), data: { dispositivoId } });
    expect([200, 201]).toContain(ven.status());
    const cuerpo = await ven.json();
    const productos: { id: string }[] = cuerpo.catalogo?.productos ?? cuerpo.productos ?? [];
    expect(productos.map((p) => p.id)).toContain(pAprob);
    expect(productos.map((p) => p.id)).not.toContain(pPend);
  });

  test('operación offline con efectivo inconsistente (efectivo − cambio ≠ total) queda en revisión, no aplicada', async ({ request }) => {
    const opId = randomUUID();
    const lote = {
      dispositivoId,
      pendientesRestantes: 0,
      operaciones: [{
        operacionId: opId, dispositivoId, ventanaId, secuenciaLocal: base + 1, correlativoLocal: `CT-01-${String(base + 1).padStart(8, '0')}`,
        ocurridoAtLocal: new Date().toISOString(), cajeroId: cajero.id,
        lineas: [{ productoId: pAprob, cantidadCentesimas: 100, precioCentavos: 10000 }],
        totalCentavos: 11500, subtotalCentavos: 10000, isvCentavos: 1500,
        efectivoRecibidoCentavos: 12000, cambioCentavos: 0, esquemaVersion: 1,
      }],
    };
    const res = await request.post(`${API}/contingencia/operaciones`, { headers: auth(cajero.token), data: lote });
    expect([200, 201], await res.text()).toContain(res.status());
    // La operación debe quedar registrada y en revisión: una fila vacía no significa que esté bien.
    expect(sql(`SELECT estado||'|'||requiere_revision FROM operaciones_contingencia WHERE id='${opId}'`)).toBe('REVISION|true');
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${opId}' AND origen='CONTINGENCIA'`)).toBe(0);
    expect(sql(`SELECT COUNT(*) FROM operaciones_contingencia WHERE id='${opId}' AND tenant_id='${TENANT_A}'`)).toBe('1');
  });

  test('precio distinto al autorizado: la venta ya cobrada se aplica con revisión obligatoria y conflicto registrado', async ({ request }) => {
    const opId = randomUUID();
    const operacion = {
      operacionId: opId, dispositivoId, ventanaId, secuenciaLocal: base + 3, correlativoLocal: `CT-01-${String(base + 3).padStart(8, '0')}`,
      ocurridoAtLocal: new Date().toISOString(), cajeroId: cajero.id,
      lineas: [{ productoId: pAprob, cantidadCentesimas: 100, precioCentavos: 9000 }],
      totalCentavos: 10350, subtotalCentavos: 9000, isvCentavos: 1350,
      efectivoRecibidoCentavos: 10350, cambioCentavos: 0, esquemaVersion: 1,
    };
    const res = await request.post(`${API}/contingencia/operaciones`, { headers: auth(cajero.token), data: { dispositivoId, pendientesRestantes: 0, operaciones: [operacion] } });
    expect(res.status(), await res.text()).toBeLessThan(300);
    // Diseño: la venta offline ya se cobró; se aplica y queda marcada. El conflicto debe quedar registrado.
    expect(sql(`SELECT estado||'|'||requiere_revision FROM operaciones_contingencia WHERE id='${opId}'`)).toBe('APLICADA|true');
    expect(num(`SELECT COUNT(*) FROM operaciones_contingencia WHERE id='${opId}' AND conflictos::text LIKE '%PRECIO_NO_AUTORIZADO%'`)).toBe(1);
  });

  // DEF-01 (consecuencia, FAIL): un producto sin precio aprobado llega a la venta offline y se aplica.
  test('DEF-01: una venta offline de producto sin precio aprobado no debe aplicarse', async ({ request }) => {
    const opId = randomUUID();
    const operacion = {
      operacionId: opId, dispositivoId, ventanaId, secuenciaLocal: base + 4, correlativoLocal: `CT-01-${String(base + 4).padStart(8, '0')}`,
      ocurridoAtLocal: new Date().toISOString(), cajeroId: cajero.id,
      lineas: [{ productoId: pPend, cantidadCentesimas: 100, precioCentavos: 10000 }],
      totalCentavos: 11500, subtotalCentavos: 10000, isvCentavos: 1500,
      efectivoRecibidoCentavos: 11500, cambioCentavos: 0, esquemaVersion: 1,
    };
    const res = await request.post(`${API}/contingencia/operaciones`, { headers: auth(cajero.token), data: { dispositivoId, pendientesRestantes: 0, operaciones: [operacion] } });
    expect(res.status(), await res.text()).toBeLessThan(300);
    expect(sql(`SELECT estado FROM operaciones_contingencia WHERE id='${opId}'`)).not.toBe('APLICADA');
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${opId}' AND origen='CONTINGENCIA'`)).toBe(0);
  });

  test('operación offline consistente se aplica una sola vez; reenviarla no duplica la venta', async ({ request }) => {
    const opId = randomUUID();
    const operacion = {
      operacionId: opId, dispositivoId, ventanaId, secuenciaLocal: base + 2, correlativoLocal: `CT-01-${String(base + 2).padStart(8, '0')}`,
      ocurridoAtLocal: new Date().toISOString(), cajeroId: cajero.id,
      lineas: [{ productoId: pAprob, cantidadCentesimas: 100, precioCentavos: 10000 }],
      totalCentavos: 11500, subtotalCentavos: 10000, isvCentavos: 1500,
      efectivoRecibidoCentavos: 12000, cambioCentavos: 500, esquemaVersion: 1,
    };
    const lote = { dispositivoId, pendientesRestantes: 0, operaciones: [operacion] };
    const primera = await request.post(`${API}/contingencia/operaciones`, { headers: auth(cajero.token), data: lote });
    const reenvio = await request.post(`${API}/contingencia/operaciones`, { headers: auth(cajero.token), data: lote });
    expect(primera.status(), await primera.text()).toBeLessThan(300);
    expect(reenvio.status(), await reenvio.text()).toBeLessThan(500);
    expect(sql(`SELECT estado FROM operaciones_contingencia WHERE id='${opId}'`)).toBe('APLICADA');
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${opId}'`)).toBe(1);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE correlativo_local='${operacion.correlativoLocal}'`)).toBe(1);
  });
});

test.describe('6. Finanzas: CXC, abonos y reintentos', () => {
  test('abono parcial, reintento idempotente y abono mayor al saldo', async ({ request }) => {
    const res = await venta(request, cajero, { solicitudId: randomUUID(), clienteId: cCred, metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] });
    const sid = (await res.json()).id;
    const cuenta = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${sid}' AND tipo='CXC'`);
    const solicitud = randomUUID();
    const datos = { solicitudId: solicitud, monto: 50, metodo: 'EFECTIVO' };
    expect(
      (await request.post(`${API}/operaciones/cuentas/${cuenta}/pagos`, { headers: auth(cajero.token), data: datos })).status()).toBe(201);
    expect(
      (await request.post(`${API}/operaciones/cuentas/${cuenta}/pagos`, { headers: auth(cajero.token), data: datos })).status()).toBeLessThan(300);
    expect(num(`SELECT COUNT(*) FROM pagos_cuenta WHERE solicitud_id='${solicitud}'`)).toBe(1);
    expect(num(`SELECT saldo::float FROM cuentas_operativas WHERE id='${cuenta}'`)).toBe(65);
    const mayor = await request.post(`${API}/operaciones/cuentas/${cuenta}/pagos`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), monto: 999, metodo: 'EFECTIVO' } });
    expect(mayor.status()).toBe(400);
  });
});

test.describe('7. Seguridad funcional: denegaciones por rol', () => {
  test('cada rol recibe 403 en las operaciones que no le corresponden', async ({ request }) => {
    const casos: [string, Sesion, string, string, unknown][] = [
      ['VENDEDOR crea producto', vendedor, 'POST', '/productos', { codigo: `FARO-D1-${RU}`, nombre: 'x', stockActual: 0, stockMinimo: 0 }],
      ['CAJERO aprueba precio', cajero, 'PATCH', `/productos/${pPend}/precios`, { version: 1, precioVenta: 1, precioCosto: 1, aprobar: true }],
      ['BODEGUERO cobra abono', bodeguero, 'POST', `/operaciones/cuentas/${sql(`SELECT id FROM cuentas_operativas WHERE tipo='CXC' AND cliente_id='${cCred}' LIMIT 1`)}/pagos`, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' }],
      ['VENDEDOR devuelve directo', vendedor, 'POST', `/operaciones/ventas/${sql(`SELECT id FROM ventas WHERE tenant_id='${TENANT_A}' LIMIT 1`)}/devoluciones`, { solicitudId: randomUUID(), motivo: 'x', metodo: 'EFECTIVO', items: [] }],
      ['CAJERO cambia configuración POS', cajero, 'PATCH', '/contingencia/configuracion', { habilitada: false }],
      ['BODEGUERO vende', bodeguero, 'POST', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] }],
      ['CAJERO ve conciliaciones bancarias', cajero, 'GET', '/operaciones/conciliaciones-bancarias', undefined],
      ['BODEGUERO ve dispositivos POS', bodeguero, 'GET', '/contingencia/dispositivos', undefined],
    ];
    const noDenegados: string[] = [];
    for (const [nombre, sesion, metodo, ruta, data] of casos) {
      const res = await request.fetch(`${API}${ruta}`, { method: metodo, headers: auth(sesion.token), data: data as any });
      if (res.status() !== 403) noDenegados.push(`${nombre}: HTTP ${res.status()}`);
    }
    expect(noDenegados, noDenegados.join('\n')).toEqual([]);
  });
});

test.describe('8. Omitidas heredadas (decisión de FARO)', () => {
  test.skip('1.2 vuelto en el POS en línea — PENDIENTE: el cálculo de cambio existe solo en el POS de contingencia (sección 5)', async () => {});
  test.skip('12.2 canal web para cliente final — PENDIENTE: sin canal en el código; alcance sin confirmar', async () => {});
  test.skip('13.3 reporte por cajero — PENDIENTE: /operaciones/resumen sin dimensión por cajero', async () => {});
  test.skip('14.4 respuesta tardía del servidor en el POS — PENDIENTE: requiere inyección de latencia no automatizada aquí', async () => {});
});
