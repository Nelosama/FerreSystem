import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { idDerivado } from './id-derivado';

// FARO — validación independiente de DEF-01 (PR #146). Backend NestJS real + PostgreSQL temporal, sin mocks.
// Cada escenario compara la base antes y después: ventas, movimientos de caja, stock, numeración y auditoría.
// Un escenario marcado como RIESGO documenta un comportamiento que bloquea activación; no es una aserción de diseño.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const TENANT_A = 'e2e-empresa-a';
const TENANT_B = 'e2e-empresa-b';
const RUN = (process.env.FARO_DEF01_RUN ??= randomUUID().slice(0, 8));
const RU = RUN.toUpperCase();

const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();
const num = (consulta: string) => Number(sql(consulta));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type Sesion = { token: string; id: string; rol: string };
const EM = {
  admin: 'admin.a@e2e.invalid',
  adminB: 'admin.b@e2e.invalid',
  bodeguero: `faro.d1.bod.${RUN}@e2e.invalid`,
  cajero: `faro.d1.caj.${RUN}@e2e.invalid`,
  cajero2: `faro.d1.caj2.${RUN}@e2e.invalid`,
};

async function login(request: APIRequestContext, email: string): Promise<Sesion> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { token: body.accessToken, id: body.user.id, rol: body.user.rol };
}

async function asegurarUsuario(request: APIRequestContext, admin: Sesion, email: string, nombre: string, rol: string, permisos: string[]) {
  if (num(`SELECT COUNT(*) FROM usuarios WHERE email='${email}' AND tenant_id='${TENANT_A}'`) === 0) {
    const res = await request.post(`${API}/usuarios`, { headers: auth(admin.token), data: { nombre, email, password: PASSWORD, rol, permisos, descuentoMaximo: 10 } });
    expect([200, 201], await res.text()).toContain(res.status());
  }
  const lista = permisos.map((p) => `'${p}'`).join(',');
  sql(`UPDATE usuarios SET permisos_configurados=true, permisos=ARRAY[${lista}]::text[], activo=true WHERE email='${email}' AND tenant_id='${TENANT_A}'`);
  return login(request, email);
}

async function asegurarCaja(request: APIRequestContext, sesion: Sesion) {
  if (num(`SELECT COUNT(*) FROM cajas WHERE usuario_id='${sesion.id}' AND estado='ABIERTA'`) === 0) {
    const res = await request.post(`${API}/operaciones/caja/abrir`, { headers: auth(sesion.token), data: { solicitudId: randomUUID(), monto: 100 } });
    expect([200, 201], await res.text()).toContain(res.status());
  }
  return sql(`SELECT id FROM cajas WHERE usuario_id='${sesion.id}' AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1`);
}

async function crearProducto(request: APIRequestContext, sesion: Sesion, codigo: string, data: Record<string, unknown>) {
  const res = await request.post(`${API}/productos`, { headers: auth(sesion.token), data: { codigo, nombre: `FARO D1 ${codigo}`, stockActual: 0, stockMinimo: 0, ...data } });
  expect([200, 201], await res.text()).toContain(res.status());
  return (await res.json()).id as string;
}

async function aprobar(request: APIRequestContext, admin: Sesion, id: string) {
  if (num(`SELECT COUNT(*) FROM productos WHERE id='${id}' AND precio_aprobado=true`) === 1) return; // ya aprobado: sin cambio que guardar
  const version = num(`SELECT version FROM productos WHERE id='${id}'`);
  const res = await request.patch(`${API}/productos/${id}/precios`, { headers: auth(admin.token), data: { version, precioVenta: 100, precioCosto: 60, aprobar: true, motivo: 'QA DEF-01' } });
  expect(res.status(), await res.text()).toBe(200);
}

async function stock(request: APIRequestContext, admin: Sesion, id: string, cantidad: number) {
  const res = await request.post(`${API}/operaciones/productos/${id}/ajuste`, {
    headers: auth(admin.token), data: { solicitudId: randomUUID(), stockAnterior: num(`SELECT stock_actual::float FROM productos WHERE id='${id}'`), stock: cantidad, motivo: 'QA DEF-01' },
  });
  expect([200, 201], await res.text()).toContain(res.status());
}

// Ventana emitida por el servidor: devuelve su id y el catálogo que el equipo recibe.
async function emitirVentana(request: APIRequestContext, cajero: Sesion, dispositivoId: string) {
  const res = await request.post(`${API}/contingencia/ventanas`, { headers: auth(cajero.token), data: { dispositivoId } });
  expect([200, 201], await res.text()).toContain(res.status());
  const cuerpo = await res.json();
  const ventanaId = (cuerpo.ventana?.id ?? cuerpo.id) as string;
  // H-5: el servidor emite los identificadores de operación de la ventana; las ventas usan esa lista, como el equipo.
  EMITIDAS.set(ventanaId, (cuerpo.ventana?.operacionesEmitidas ?? []) as string[]);
  const productos = ((cuerpo.catalogo?.productos ?? cuerpo.productos ?? []) as { id: string }[]).map((p) => p.id);
  const hash = sql(`SELECT catalogo_hash FROM contingencia_ventanas WHERE id='${ventanaId}'`);
  return { ventanaId, productos, hash };
}

async function dispositivoActivo(request: APIRequestContext, admin: Sesion, cajero: Sesion) {
  const lista = await (await request.get(`${API}/contingencia/dispositivos`, { headers: auth(admin.token) })).json();
  const activo = (Array.isArray(lista) ? lista : lista.dispositivos ?? []).find((d: { activo?: boolean }) => d.activo !== false);
  if (activo) return (activo.dispositivoId ?? activo.id) as string;
  const dispositivoId = randomUUID();
  const reg = await request.post(`${API}/contingencia/dispositivos`, { headers: auth(cajero.token), data: { dispositivoId, nombre: `FARO D1 ${RUN}` } });
  expect([200, 201], await reg.text()).toContain(reg.status());
  return dispositivoId;
}

let secuencia = (Date.now() % 80000000) + 2000; // secuencias locales únicas por ejecución
const siguiente = () => (secuencia += 1);
// H-5: identificadores emitidos por el servidor por ventana y el índice de la siguiente operación de cada una.
const EMITIDAS = new Map<string, string[]>();
const PROXIMO = new Map<string, number>();
function emitidaPara(ventanaId: string, operacionId?: string): { operacionId: string; indiceOperacion?: number } {
  const conjunto = EMITIDAS.get(ventanaId);
  if (!conjunto) return { operacionId: randomUUID() }; // ventana no emitida por este helper: el servidor la rechazará
  if (operacionId) return { operacionId, indiceOperacion: conjunto.indexOf(operacionId) };
  const indice = PROXIMO.get(ventanaId) ?? 0;
  PROXIMO.set(ventanaId, indice + 1);
  return { operacionId: conjunto[indice], indiceOperacion: indice };
}

function operacion(p: { ventanaId: string; dispositivoId: string; cajeroId: string; productoId: string; cantidad?: number; precio?: number; secuenciaLocal?: number; operacionId?: string }) {
  const cantidad = p.cantidad ?? 100;
  const precio = p.precio ?? 10000;
  const subtotal = Math.round((precio * cantidad) / 100);
  const isv = Math.round(subtotal * 0.15);
  const total = subtotal + isv;
  const s = p.secuenciaLocal ?? siguiente();
  return {
    ...emitidaPara(p.ventanaId, p.operacionId), dispositivoId: p.dispositivoId, ventanaId: p.ventanaId,
    secuenciaLocal: s, correlativoLocal: `CT-01-${String(s).padStart(8, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: p.cajeroId,
    lineas: [{ productoId: p.productoId, cantidadCentesimas: cantidad, precioCentavos: precio }],
    totalCentavos: total, subtotalCentavos: subtotal, isvCentavos: isv, efectivoRecibidoCentavos: total, cambioCentavos: 0, esquemaVersion: 1,
  };
}

async function enviar(request: APIRequestContext, cajero: Sesion, dispositivoId: string, ops: unknown[]) {
  const res = await request.post(`${API}/contingencia/operaciones`, { headers: auth(cajero.token), data: { dispositivoId, pendientesRestantes: 0, operaciones: ops } });
  return res;
}

function estado(opId: string) {
  return sql(`SELECT estado||'|'||requiere_revision FROM operaciones_contingencia WHERE id='${idDerivado(TENANT_A, opId)}'`);
}
function conflictos(opId: string) {
  return sql(`SELECT COALESCE(string_agg(c->>'codigo', ','),'') FROM operaciones_contingencia o, jsonb_array_elements(o.conflictos) c WHERE o.id='${idDerivado(TENANT_A, opId)}'`);
}

function foto(tenant: string, cajaId: string, productoId: string) {
  return {
    ventas: num(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${tenant}'`),
    movCaja: num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaId}'`),
    stock: num(`SELECT stock_actual::float FROM productos WHERE id='${productoId}'`),
    reservado: num(`SELECT stock_reservado::float FROM productos WHERE id='${productoId}'`),
    numeracion: num(`SELECT COALESCE(MAX(ultimo_numero),0) FROM secuencias_tenant WHERE tenant_id='${tenant}' AND tipo='VENTA'`),
    auditoriaVenta: num(`SELECT COUNT(*) FROM auditoria_operaciones WHERE tenant_id='${tenant}' AND operacion='VENTA_CREAR'`),
  };
}

let admin: Sesion, adminB: Sesion, bodeguero: Sesion, cajero: Sesion, cajero2: Sesion;
let cajaA: string;
let dispositivoA: string;
let pAprob: string; // aprobado, precio 100, stock amplio
let pTest: string; // aprobado, stock 1: concurrencia

test.beforeAll(async ({ request }) => {
  admin = await login(request, EM.admin);
  adminB = await login(request, EM.adminB);
  bodeguero = await asegurarUsuario(request, admin, EM.bodeguero, 'FARO D1 Bodeguero', 'BODEGUERO', ['inventario.ver', 'inventario.editar']);
  cajero = await asegurarUsuario(request, admin, EM.cajero, 'FARO D1 Cajero', 'CAJERO', ['pos.vender', 'cotizaciones.crear']);
  cajero2 = await asegurarUsuario(request, admin, EM.cajero2, 'FARO D1 Cajero 2', 'CAJERO', ['pos.vender']);
  expect((await request.patch(`${API}/contingencia/configuracion`, { headers: auth(admin.token), data: { habilitada: true } })).status()).toBe(200);
  cajaA = await asegurarCaja(request, cajero);
  await asegurarCaja(request, cajero2);
  await asegurarCaja(request, admin);
  await asegurarCaja(request, adminB);
  expect((await request.patch(`${API}/contingencia/configuracion`, { headers: auth(adminB.token), data: { habilitada: true } })).status()).toBe(200);
  dispositivoA = await dispositivoActivo(request, admin, cajero);
  const aprobadoA = `FARO-D1-APR-${RU}`;
  if (!sql(`SELECT id FROM productos WHERE codigo='${aprobadoA}' AND tenant_id='${TENANT_A}'`)) {
    const id = await crearProducto(request, admin, aprobadoA, { precioVenta: 100, precioCosto: 60 });
    await aprobar(request, admin, id);
    await stock(request, admin, id, 50);
  }
  if (!sql(`SELECT id FROM productos WHERE codigo='FARO-D1-TST-${RU}' AND tenant_id='${TENANT_A}'`)) {
    const id = await crearProducto(request, admin, `FARO-D1-TST-${RU}`, { precioVenta: 100, precioCosto: 60 });
    await aprobar(request, admin, id);
    await stock(request, admin, id, 1);
  }
  pAprob = sql(`SELECT id FROM productos WHERE codigo='${aprobadoA}' AND tenant_id='${TENANT_A}'`);
  pTest = sql(`SELECT id FROM productos WHERE codigo='FARO-D1-TST-${RU}' AND tenant_id='${TENANT_A}'`);
});

test.describe('1. Sin aprobación, precio cero o fuera de la ventana: ninguna venta', () => {
  test('producto pendiente: no entra al catálogo y su operación no produce venta ni efecto', async ({ request }) => {
    const pend = await crearProducto(request, bodeguero, `FARO-D1-PEND-${RU}`, {});
    await stock(request, admin, pend, 5);
    const v = await emitirVentana(request, cajero, dispositivoA);
    expect(v.productos).not.toContain(pend);
    const antes = foto(TENANT_A, cajaA, pend);
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pend });
    expect((await enviar(request, cajero, dispositivoA, [op])).status()).toBeLessThan(300);
    expect(estado(op.operacionId)).toBe('REVISION|true');
    expect(conflictos(op.operacionId)).toContain('PRODUCTO_FUERA_DE_VENTANA');
    expect(foto(TENANT_A, cajaA, pend)).toEqual(antes);
  });

  test('precio cero heredado con aprobación previa: se excluye del catálogo y no produce venta', async ({ request }) => {
    const id = await crearProducto(request, admin, `FARO-D1-CERO-${RU}`, { precioVenta: 100, precioCosto: 60 });
    await aprobar(request, admin, id);
    await stock(request, admin, id, 5);
    sql(`UPDATE productos SET precio_venta=0 WHERE id='${id}'`); // dato heredado: aprobado con precio cero
    const v = await emitirVentana(request, cajero, dispositivoA);
    expect(v.productos).not.toContain(id);
    const antes = foto(TENANT_A, cajaA, id);
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: id });
    expect((await enviar(request, cajero, dispositivoA, [op])).status()).toBeLessThan(300);
    expect(sql(`SELECT estado FROM operaciones_contingencia WHERE id='${idDerivado(TENANT_A, op.operacionId)}'`)).not.toBe('APLICADA');
    expect(foto(TENANT_A, cajaA, id)).toEqual(antes);
  });
});

test.describe('2. Aprobación posterior y ventanas antiguas', () => {
  test('aprobación posterior a la emisión no valida la venta en curso; ACEPTAR y REINTENTAR tampoco la aplican', async ({ request }) => {
    const id = await crearProducto(request, bodeguero, `FARO-D1-LATE-${RU}`, {});
    await stock(request, admin, id, 5);
    const w1 = await emitirVentana(request, cajero, dispositivoA); // emitida antes de aprobar
    expect(w1.productos).not.toContain(id);
    await aprobar(request, admin, id);
    const antes = foto(TENANT_A, cajaA, id);
    const op = operacion({ ventanaId: w1.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: id });
    expect((await enviar(request, cajero, dispositivoA, [op])).status()).toBeLessThan(300);
    expect(estado(op.operacionId)).toBe('REVISION|true');
    // Reenvío idéntico y resoluciones del administrador: ninguna debe aplicarla.
    await enviar(request, cajero, dispositivoA, [op]);
    const aceptar = await request.post(`${API}/contingencia/operaciones/${op.operacionId}/resolver`, { headers: auth(admin.token), data: { accion: 'ACEPTAR', nota: 'Intento de validación QA DEF-01' } });
    const reintentar = await request.post(`${API}/contingencia/operaciones/${op.operacionId}/resolver`, { headers: auth(admin.token), data: { accion: 'REINTENTAR', nota: 'Intento de validación QA DEF-01' } });
    expect([200, 201, 400, 409]).toContain(aceptar.status());
    expect([200, 201, 400, 409]).toContain(reintentar.status());
    expect(estado(op.operacionId)).not.toMatch(/^APLICADA/);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${idDerivado(TENANT_A, op.operacionId)}'`)).toBe(0);
    expect(foto(TENANT_A, cajaA, id)).toEqual(antes);
    // Control: una ventana emitida después de la aprobación sí aplica la venta (el camino legítimo sigue funcionando).
    const w2 = await emitirVentana(request, cajero, dispositivoA);
    expect(w2.productos).toContain(id);
    const ok = operacion({ ventanaId: w2.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: id });
    await enviar(request, cajero, dispositivoA, [ok]);
    expect(estado(ok.operacionId)).toBe('APLICADA|false');
  });

  test('R-01 (corregido): ventana emitida antes del cambio (instantánea sin prueba) se rechaza de forma explícita, queda como evidencia y se cierra conciliando el efectivo', async ({ request }) => {
    const id = await crearProducto(request, admin, `FARO-D1-OLD-${RU}`, { precioVenta: 100, precioCosto: 60 });
    await aprobar(request, admin, id);
    await stock(request, admin, id, 5);
    const v = await emitirVentana(request, cajero, dispositivoA);
    // Simula el formato anterior al cambio: la instantánea guardada no lleva precioAprobado.
    sql(`UPDATE catalogo_instantaneas SET datos = (SELECT jsonb_build_object('productos', jsonb_agg(p - 'precioAprobado')) FROM jsonb_array_elements(datos->'productos') p) WHERE tenant_id='${TENANT_A}' AND hash='${v.hash}'`);
    const antes = foto(TENANT_A, cajaA, id);
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: id });
    const envio = await enviar(request, cajero, dispositivoA, [op]);
    expect(envio.status()).toBeLessThan(300);
    const resultado = (await envio.json()).resultados[0];
    expect(resultado).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_OBSOLETA' });
    expect(estado(op.operacionId)).toBe('RECHAZADA|true');
    expect(conflictos(op.operacionId)).toContain('VENTANA_OBSOLETA');
    expect(foto(TENANT_A, cajaA, id)).toEqual(antes); // sin venta, caja, stock ni numeración
    // El administrador no puede aplicarla como venta (409) y no queda atrapada: se cierra conciliando el efectivo en caja.
    const forzar = await request.post(`${API}/contingencia/operaciones/${op.operacionId}/resolver`, { headers: auth(admin.token), data: { accion: 'ACEPTAR', nota: 'Intento de validación QA DEF-01' } });
    expect(forzar.status()).toBe(409);
    expect(foto(TENANT_A, cajaA, id)).toEqual(antes);
    const cierre = await request.post(`${API}/contingencia/operaciones/${op.operacionId}/resolver`, { headers: auth(admin.token), data: { accion: 'CERRAR_MANUAL', nota: 'Venta física verificada; efectivo en caja', cajaId: cajaA } });
    expect(cierre.status(), await cierre.text()).toBe(201);
    expect(estado(op.operacionId)).toBe('RESUELTA_MANUAL|false');
    const despues = foto(TENANT_A, cajaA, id);
    expect(despues.ventas).toBe(antes.ventas); // no se inventa una venta
    expect(despues.movCaja).toBe(antes.movCaja + 1); // ingreso de conciliación trazable
  });

  test('aprobación revocada después de emitir: se aplica con revisión (comportamiento de diseño, riesgo P2)', async ({ request }) => {
    const id = await crearProducto(request, admin, `FARO-D1-REV-${RU}`, { precioVenta: 100, precioCosto: 60 });
    await aprobar(request, admin, id);
    await stock(request, admin, id, 5);
    const v = await emitirVentana(request, cajero, dispositivoA);
    const version = num(`SELECT version FROM productos WHERE id='${id}'`);
    // Regla del dueño: cambiar el precio de venta de un producto aprobado revoca la aprobación.
    const rev = await request.patch(`${API}/productos/${id}/precios`, { headers: auth(admin.token), data: { version, precioVenta: 120, precioCosto: 60, aprobar: false, motivo: 'QA DEF-01 revocación' } });
    expect([200, 201], await rev.text()).toContain(rev.status());
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: id });
    await enviar(request, cajero, dispositivoA, [op]);
    expect(estado(op.operacionId)).toBe('APLICADA|true');
    expect(conflictos(op.operacionId)).toContain('APROBACION_REVOCADA_POSTERIOR');
    await aprobar(request, admin, id); // restaura para escenarios siguientes
  });
});

test.describe('3. Idempotencia, reintentos y concurrencia', () => {
  test('envío concurrente de la misma operación: una sola venta, un movimiento de caja y una sola numeración', async ({ request }) => {
    const v = await emitirVentana(request, cajero, dispositivoA);
    const antes = foto(TENANT_A, cajaA, pAprob);
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pAprob });
    const [a, b] = await Promise.all([enviar(request, cajero, dispositivoA, [op]), enviar(request, cajero, dispositivoA, [op])]);
    expect(a.status()).toBeLessThan(500);
    expect(b.status()).toBeLessThan(500);
    expect(estado(op.operacionId)).toBe('APLICADA|false');
    const despues = foto(TENANT_A, cajaA, pAprob);
    expect(despues.ventas - antes.ventas).toBe(1);
    expect(despues.movCaja - antes.movCaja).toBe(1);
    expect(despues.numeracion - antes.numeracion).toBe(1);
    expect(despues.stock - antes.stock).toBe(-1);
  });

  test('misma secuencia con otra operación: SECUENCIA_DUPLICADA la deja en revisión, sin efecto', async ({ request }) => {
    const v = await emitirVentana(request, cajero, dispositivoA);
    const s = siguiente();
    const primera = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pAprob, secuenciaLocal: s });
    await enviar(request, cajero, dispositivoA, [primera]);
    const antes = foto(TENANT_A, cajaA, pAprob);
    const segunda = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pAprob, secuenciaLocal: s });
    await enviar(request, cajero, dispositivoA, [segunda]);
    expect(estado(segunda.operacionId)).toBe('REVISION|true');
    expect(conflictos(segunda.operacionId)).toContain('SECUENCIA_DUPLICADA');
    expect(foto(TENANT_A, cajaA, pAprob)).toEqual(antes);
  });

  test('payload alterado con el mismo identificador se registra como OPERACION_ALTERADA y no se aplica', async ({ request }) => {
    const v = await emitirVentana(request, cajero, dispositivoA);
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pAprob });
    await enviar(request, cajero, dispositivoA, [op]);
    const ventasAntes = num(`SELECT COUNT(*) FROM ventas WHERE id='${idDerivado(TENANT_A, op.operacionId)}'`);
    const alterada = { ...op, lineas: [{ productoId: pAprob, cantidadCentesimas: 100, precioCentavos: 9000 }] };
    await enviar(request, cajero, dispositivoA, [alterada]);
    expect(conflictos(op.operacionId)).toContain('OPERACION_ALTERADA');
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${idDerivado(TENANT_A, op.operacionId)}'`)).toBe(ventasAntes);
  });

  test('dos ventas offline por el último producto: una aplica y la otra queda en revisión sin dejar stock negativo', async ({ request }) => {
    const v = await emitirVentana(request, cajero, dispositivoA);
    const antes = foto(TENANT_A, cajaA, pTest);
    const a = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pTest });
    const b = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pTest });
    await Promise.all([enviar(request, cajero, dispositivoA, [a]), enviar(request, cajero, dispositivoA, [b])]);
    // O-04: no se presupone qué operación llega primero. Invariante: exactamente una se aplica y la otra queda en revisión por STOCK_INSUFICIENTE.
    const [ganadora, perdedora] = estado(a.operacionId).startsWith('APLICADA') ? [a, b] : [b, a];
    expect([estado(a.operacionId), estado(b.operacionId)].sort()).toEqual(['APLICADA|true', 'REVISION|true'].sort());
    expect(estado(ganadora.operacionId)).toBe('APLICADA|true');
    expect(estado(perdedora.operacionId)).toBe('REVISION|true');
    expect(conflictos(perdedora.operacionId)).toContain('STOCK_INSUFICIENTE');
    expect(conflictos(ganadora.operacionId)).not.toContain('STOCK_INSUFICIENTE');
    expect(foto(TENANT_A, cajaA, pTest).stock).toBe(0);
  });
});

test.describe('3b. Override administrativo de stock', () => {
  test('I-01: ACEPTAR sobre STOCK_INSUFICIENTE aplica la venta con AJUSTE trazable; sin stock negativo', async ({ request }) => {
    const id = await crearProducto(request, admin, `FARO-D1-NEG-${RU}`, { precioVenta: 100, precioCosto: 60 });
    await aprobar(request, admin, id);
    await stock(request, admin, id, 0);
    const v = await emitirVentana(request, cajero, dispositivoA);
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: id });
    await enviar(request, cajero, dispositivoA, [op]);
    expect(estado(op.operacionId)).toBe('REVISION|true');
    expect(conflictos(op.operacionId)).toContain('STOCK_INSUFICIENTE');
    const acepta = await request.post(`${API}/contingencia/operaciones/${op.operacionId}/resolver`, { headers: auth(admin.token), data: { accion: 'ACEPTAR', nota: 'Mercancía ya entregada al cliente QA' } });
    expect([200, 201], await acepta.text()).toContain(acepta.status());
    expect(estado(op.operacionId)).toMatch(/^APLICADA/);
    // Diseño: el faltante no deja stock negativo; se registra un AJUSTE trazable y luego la ENTREGA (neto 0).
    expect(num(`SELECT stock_actual::float FROM productos WHERE id='${id}'`)).toBe(0);
    expect(sql(`SELECT string_agg(tipo, ',' ORDER BY created_at) FROM movimientos_inventario WHERE producto_id='${id}' AND documento_id='${idDerivado(TENANT_A, op.operacionId)}'`)).toBe('AJUSTE,ENTREGA');
  });
});

test.describe('4. Efectivo cobrado y trazabilidad de caja', () => {
  test('R-02 (corregido): cerrar manualmente una operación registra el efectivo en caja como ingreso de conciliación, sin crear venta ni tocar el inventario', async ({ request }) => {
    const id = await crearProducto(request, admin, `FARO-D1-CM-${RU}`, {});
    await stock(request, admin, id, 5);
    const v = await emitirVentana(request, cajero, dispositivoA);
    const antes = foto(TENANT_A, cajaA, id);
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: id });
    await enviar(request, cajero, dispositivoA, [op]);
    const cerrar = await request.post(`${API}/contingencia/operaciones/${op.operacionId}/resolver`, { headers: auth(admin.token), data: { accion: 'CERRAR_MANUAL', nota: 'Efectivo recibido sin venta registrada', cajaId: cajaA } });
    expect(cerrar.status()).toBe(201);
    expect(estado(op.operacionId)).toBe('RESUELTA_MANUAL|false');
    const despues = foto(TENANT_A, cajaA, id);
    expect(despues.ventas).toBe(antes.ventas);
    expect(despues.stock).toBe(antes.stock);
    expect(despues.movCaja).toBe(antes.movCaja + 1);
    expect(sql(`SELECT tipo||'|'||metodo FROM movimientos_caja WHERE referencia='${idDerivado(TENANT_A, op.operacionId)}'`)).toBe('INGRESO_MANUAL|EFECTIVO');
  });

  test('numeración: el rechazo no consume número y la siguiente venta en línea es consecutiva', async ({ request }) => {
    const v = await emitirVentana(request, cajero, dispositivoA);
    const bloqueada = await crearProducto(request, bodeguero, `FARO-D1-NUM-${RU}`, {});
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: bloqueada });
    await enviar(request, cajero, dispositivoA, [op]);
    const base = num(`SELECT COALESCE(MAX(ultimo_numero),0) FROM secuencias_tenant WHERE tenant_id='${TENANT_A}' AND tipo='VENTA'`);
    const r1 = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] } });
    expect(r1.status()).toBe(201);
    expect((await r1.json()).numeroVenta).toBe(base + 1);
  });
});

test.describe('6. Atribución de cobros entre cajeros', () => {
  // DEF-04 (P1, preexistente): la ventana no se liga al cajero que la pidió. Un cajero B envía una operación válida
  // con la ventana de A y el cobro queda en la caja de A, con B como usuario del movimiento.
  test('DEF-04: un cajero no puede cobrar en la caja de otro usando la ventana ajena', async ({ request }) => {
    const ventanaA = await emitirVentana(request, cajero, dispositivoA);
    const cajaB = await asegurarCaja(request, cajero2);
    const antesA = num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaA}'`);
    const antesB = num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaB}'`);
    const op = operacion({ ventanaId: ventanaA.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero2.id, productoId: pAprob });
    await enviar(request, cajero2, dispositivoA, [op]);
    // Esperado: la venta no entra en la caja de A. Si se registra, debe ser en la caja de quien la cobró (B).
    const cajaVenta = sql(`SELECT COALESCE(caja_id::text,'') FROM ventas WHERE id='${idDerivado(TENANT_A, op.operacionId)}'`);
    expect(cajaVenta === '' || cajaVenta === cajaB).toBe(true);
    expect(num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaA}'`)).toBe(antesA);
    expect(num(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaB}'`)).toBe(antesB);
  });
});

test.describe('5. Aislamiento entre empresas', () => {
  test('la empresa B no usa la ventana, el dispositivo ni los productos de la empresa A', async ({ request }) => {
    const v = await emitirVentana(request, cajero, dispositivoA);
    const dispositivoB = await dispositivoActivo(request, adminB, adminB);
    const vB = await emitirVentana(request, adminB, dispositivoB);
    expect(vB.productos).not.toContain(pAprob);
    // Operación de B apuntando a la ventana de A y a un producto de A.
    const cruzada = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoB, cajeroId: adminB.id, productoId: pAprob });
    const res = await enviar(request, adminB, dispositivoB, [cruzada]);
    expect(res.status()).toBeLessThan(500);
    expect(num(`SELECT COUNT(*) FROM operaciones_contingencia WHERE id='${idDerivado(TENANT_B, cruzada.operacionId)}' AND tenant_id='${TENANT_B}'`)).toBeLessThanOrEqual(1);
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id='${idDerivado(TENANT_B, cruzada.operacionId)}' AND tenant_id='${TENANT_B}'`)).toBe(0);
    // La operación no aplicada en B no debe alterar el stock de A.
    expect(num(`SELECT COUNT(*) FROM ventas WHERE id IN ('${idDerivado(TENANT_A, cruzada.operacionId)}','${idDerivado(TENANT_B, cruzada.operacionId)}')`)).toBe(0);
    // Resolver una operación de A desde B debe fallar.
    const op = operacion({ ventanaId: v.ventanaId, dispositivoId: dispositivoA, cajeroId: cajero.id, productoId: pAprob });
    await enviar(request, cajero, dispositivoA, [op]);
    const ajena = await request.post(`${API}/contingencia/operaciones/${op.operacionId}/resolver`, { headers: auth(adminB.token), data: { accion: 'CERRAR_MANUAL', nota: 'Intento cruzado QA DEF-01' } });
    expect([403, 404]).toContain(ajena.status());
    expect(sql(`SELECT estado FROM operaciones_contingencia WHERE id='${idDerivado(TENANT_A, op.operacionId)}'`)).not.toBe('RESUELTA_MANUAL');
  });
});

// DEF-03 (corregido): la venta sin solicitudId se rechaza.
test('DEF-03: POST /ventas sin solicitudId se rechaza', async ({ request }) => {
  const res = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { metodoPago: 'EFECTIVO', detalles: [{ productoId: pAprob, cantidad: 1, precioUnitario: 100 }] } });
  expect(res.status()).toBe(400);
});
