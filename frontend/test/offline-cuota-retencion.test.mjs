import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { modulos } from './helpers/cargar-ts.mjs';

// P1-1 y P1-5 (AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104): cuota en el alta real del diario, puertas de retención,
// ejecución atómica, resumen de auditoría y reinicio. IndexedDB simulada; la cuota real está en el E2E de Chromium.

const NOW = Date.now();
const sesion = { tenantId: 'empresa-1', usuarioId: 'cajero-1', rol: 'CAJERO', vigente: () => true };
const datosEvidencia = { tenantId: 'empresa-1', cajaId: 'caja-1', requiereRevision: false, payloadHashVersion: 'dto-json-v1' };
const cargar = () => modulos()('src/offline/retencion.ts');

function nuevaBase() {
  globalThis.indexedDB = new IDBFactory();
  const cargarFn = modulos();
  return {
    journal: cargarFn('src/offline/journal.ts'),
    db: cargarFn('src/offline/db.ts'),
    retencion: cargarFn('src/offline/retencion.ts'),
  };
}

const operacion = (id, extra = {}) => ({
  tenantId: 'empresa-1', operacionId: id, indiceOperacion: 0, dispositivoId: 'disp', ventanaId: 'v1', cajeroId: 'cajero-1', cajeroNombre: 'Ana Pérez',
  cajaId: 'caja-1', secuenciaLocal: 1, correlativoLocal: `CT-01-${id}`, creadaAt: '2026-11-04T10:00:00.000Z',
  ocurridoAtLocal: '2026-11-04T10:00:00.000Z', lineas: [{ productoId: 'p1', codigo: 'P1', nombre: 'Tornillo', cantidadCentesimas: 100, precioCentavos: 1000 }],
  subtotalCentavos: 1000, isvCentavos: 150, totalCentavos: 1150, efectivoRecibidoCentavos: 1200, cambioCentavos: 50,
  clienteNombre: 'Cliente Confidencial', clienteRtn: '08011990123456', esquemaVersion: 1,
  estado: 'SINCRONIZADA', intentos: 0, numeroVenta: 7, correlativoDefinitivo: 'V-00000007', sincronizadaAt: '2026-11-04T10:01:00.000Z',
  conflictos: [], requiereRevision: false, ...extra,
});

async function sembrar(db, ops) {
  await db.transaccion(['operaciones'], 'readwrite', (tx) => { for (const op of ops) tx.objectStore('operaciones').put(op); });
}
async function todas(db) {
  return db.transaccion(['operaciones'], 'readonly', (tx, salida) => {
    const p = tx.objectStore('operaciones').getAll();
    p.onsuccess = () => { salida.valor = p.result; };
  });
}
async function metaClave(db, clave) {
  return db.transaccion(['meta'], 'readonly', (tx, salida) => {
    const p = tx.objectStore('meta').get(clave);
    p.onsuccess = () => { salida.valor = p.result; };
  });
}

// ───── P1-1: cuota agotada en el alta real ─────
// Nota: fake-indexeddb entrega esta excepción como AbortError; el nombre QuotaExceededError se verifica en el E2E de Chromium.
test('cuota agotada en el alta: registrarOperacion rechaza y no guarda nada (ni contador ni operación)', async () => {
  const { journal, db } = nuevaBase();
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function () { throw new DOMException('Cuota excedida', 'QuotaExceededError'); };
  try {
    await assert.rejects(journal.registrarOperacion({
      tenantId: 'empresa-1', dispositivoId: 'd', ventanaId: 'v', cajeroId: 'u', cajeroNombre: 'Ana', cajaId: 'c', ocurridoAtLocal: '2026-11-04T10:00:00Z',
      lineas: [{ productoId: 'p', codigo: 'P', nombre: 'Producto', cantidadCentesimas: 100, precioCentavos: 1000 }],
      subtotalCentavos: 1000, isvCentavos: 150, totalCentavos: 1150, efectivoRecibidoCentavos: 1200, cambioCentavos: 50,
      clienteNombre: '', clienteRtn: '', esquemaVersion: 1,
    }, '01', ['uuid-0']));
  } finally { IDBObjectStore.prototype.add = add; }
  assert.deepEqual(await todas(db), []);
  assert.equal(await metaClave(db, 'secuencia'), undefined, 'el contador no debe avanzar si la venta no se guardó');
});
test('una venta guardada tras recuperarse de la cuota queda una sola vez, sin huecos en la secuencia', async () => {
  const { journal, db } = nuevaBase();
  const add = IDBObjectStore.prototype.add;
  let fallar = true;
  IDBObjectStore.prototype.add = function (...args) {
    if (fallar) throw new DOMException('Cuota excedida', 'QuotaExceededError');
    return add.apply(this, args);
  };
  const nueva = { tenantId: 'empresa-1', dispositivoId: 'd', ventanaId: 'v', cajeroId: 'u', cajeroNombre: 'Ana', cajaId: 'c', ocurridoAtLocal: '2026-11-04T10:00:00Z',
    lineas: [{ productoId: 'p', codigo: 'P', nombre: 'Producto', cantidadCentesimas: 100, precioCentavos: 1000 }],
    subtotalCentavos: 1000, isvCentavos: 150, totalCentavos: 1150, efectivoRecibidoCentavos: 1200, cambioCentavos: 50, clienteNombre: '', clienteRtn: '', esquemaVersion: 1 };
  try {
    await assert.rejects(journal.registrarOperacion(nueva, '01', ['uuid-0', 'uuid-1']));
    fallar = false;
    const guardada = await journal.registrarOperacion(nueva, '01', ['uuid-0', 'uuid-1']);
    assert.equal(guardada.secuenciaLocal, 1);
    assert.equal(guardada.operacionId, 'uuid-0');
  } finally { IDBObjectStore.prototype.add = add; }
  const ops = await todas(db);
  assert.equal(ops.length, 1);
  assert.equal(await metaClave(db, 'secuencia'), 1);
});

// ───── P1-5: puertas de la retención (decisión pura) ─────
test('PENDIENTE, ENVIANDO y REVISION nunca son eliminables, aunque haya evidencia perfecta', async () => {
  const r = cargar();
  const base = operacion('a');
  for (const estado of ['PENDIENTE', 'ENVIANDO', 'REVISION']) {
    const op = { ...base, estado };
    const hash = 'h';
    const ev = { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', payloadHash: hash, cajaCerrada: true, reconfirmadaAt: new Date(NOW).toISOString() };
    assert.deepEqual(r.evaluarRetencion(op, ev, hash, NOW), { eliminable: false, motivo: 'estado-intocable' }, estado);
  }
});
test('una SINCRONIZADA con requiereRevision no es eliminable', async () => {
  const r = cargar();
  const op = operacion('a', { requiereRevision: true });
  assert.deepEqual(r.evaluarRetencion(op, undefined, 'h', NOW), { eliminable: false, motivo: 'con-revision' });
});
test('sin evidencia del servidor, o de otra operación, no se elimina', async () => {
  const r = cargar();
  const op = operacion('a');
  assert.equal(r.evaluarRetencion(op, undefined, 'h', NOW).motivo, 'sin-evidencia');
  assert.equal(r.evaluarRetencion(op, { operacionId: 'otra', estado: 'APLICADA', reconfirmadaAt: new Date(NOW).toISOString() }, 'h', NOW).motivo, 'sin-evidencia');
});
test('una reconfirmación caducada (más de 5 min) o futura no vale', async () => {
  const r = cargar();
  const op = operacion('a');
  const viejo = new Date(NOW - 6 * 60_000).toISOString();
  const futuro = new Date(NOW + 5 * 60_000).toISOString();
  assert.equal(r.evaluarRetencion(op, { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', reconfirmadaAt: viejo }, 'h', NOW).motivo, 'evidencia-caducada');
  assert.equal(r.evaluarRetencion(op, { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', reconfirmadaAt: futuro }, 'h', NOW).motivo, 'evidencia-caducada');
});
test('RESUELTA_MANUAL del servidor no cuenta como aplicada', async () => {
  const r = cargar();
  const ev = { ...datosEvidencia, operacionId: 'a', estado: 'RESUELTA_MANUAL', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', payloadHash: 'h', cajaCerrada: true, reconfirmadaAt: new Date(NOW).toISOString() };
  assert.equal(r.evaluarRetencion(operacion('a'), ev, 'h', NOW).motivo, 'estado-servidor');
});
test('número, correlativo o hash distintos impiden eliminar', async () => {
  const r = cargar();
  const op = operacion('a');
  const base = { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', payloadHash: 'h', cajaCerrada: true, reconfirmadaAt: new Date(NOW).toISOString() };
  assert.equal(r.evaluarRetencion(op, { ...base, numeroVenta: 8 }, 'h', NOW).motivo, 'datos-no-coinciden');
  assert.equal(r.evaluarRetencion(op, { ...base, correlativoDefinitivo: 'V-00000099' }, 'h', NOW).motivo, 'datos-no-coinciden');
  assert.equal(r.evaluarRetencion(op, { ...base, payloadHash: 'otro' }, 'h', NOW).motivo, 'datos-no-coinciden');
});
test('sin hash del payload (contrato pendiente) no se elimina', async () => {
  const r = cargar();
  const op = operacion('a');
  const ev = { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', payloadHash: null, cajaCerrada: true, reconfirmadaAt: new Date(NOW).toISOString() };
  assert.equal(r.evaluarRetencion(op, ev, 'h', NOW).motivo, 'hash-no-disponible');
});
test('caja abierta o estado de caja desconocido impiden eliminar', async () => {
  const r = cargar();
  const op = operacion('a');
  const base = { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', payloadHash: 'h', reconfirmadaAt: new Date(NOW).toISOString() };
  assert.equal(r.evaluarRetencion(op, { ...base, cajaCerrada: false }, 'h', NOW).motivo, 'caja-abierta');
  assert.equal(r.evaluarRetencion(op, { ...base, cajaCerrada: undefined }, 'h', NOW).motivo, 'caja-desconocida');
  assert.equal(r.evaluarRetencion(op, { ...base, cajaCerrada: null }, 'h', NOW).motivo, 'caja-desconocida');
});
test('solo con todas las puertas cerradas es eliminable', async () => {
  const r = cargar();
  const op = operacion('a');
  const ev = { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', payloadHash: 'h', cajaCerrada: true, reconfirmadaAt: new Date(NOW).toISOString() };
  assert.deepEqual(r.evaluarRetencion(op, ev, 'h', NOW), { eliminable: true });
});
test('con la respuesta actual del servidor (sin hash ni cierre de caja) nada es eliminable', async () => {
  const r = cargar();
  const op = operacion('a');
  // Forma que devuelve hoy GET /contingencia/operaciones/estados: estado, numeroVenta, correlativo y mensaje; sin payloadHash ni cajaCerrada.
  const hoy = { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', reconfirmadaAt: new Date(NOW).toISOString() };
  const decision = r.evaluarRetencion(op, hoy, await r.hashPayload(op), NOW);
  assert.equal(decision.eliminable, false);
});

// ───── P1-5: hash, resumen y reconfirmación ─────
test('el hash es estable para la misma operación y cambia si cambia cualquier importe', async () => {
  const r = cargar();
  const a = operacion('a');
  assert.equal(await r.hashPayload(a), await r.hashPayload(structuredClone(a)));
  assert.notEqual(await r.hashPayload(a), await r.hashPayload({ ...a, totalCentavos: 1151 }));
  assert.match(await r.hashPayload(a), /^[0-9a-f]{64}$/);
});
test('el resumen de auditoría no contiene datos personales ni líneas de producto', async () => {
  const r = cargar();
  const resumen = r.resumenAuditoria(operacion('a'), 'h', new Date(NOW));
  const texto = JSON.stringify(resumen);
  for (const dato of ['Cliente Confidencial', '08011990123456', 'Ana Pérez', 'cajero-1', 'Tornillo', 'p1']) assert.ok(!texto.includes(dato), dato);
  for (const clave of ['lineas', 'clienteNombre', 'clienteRtn', 'cajeroNombre', 'cajeroId']) assert.ok(!(clave in resumen), clave);
  assert.equal(resumen.correlativoDefinitivo, 'V-00000007');
  assert.equal(resumen.payloadHash, 'h');
  assert.equal(resumen.motivo, 'retencion-reconfirmada');
});
test('reconfirmar con el servidor marca la hora de la respuesta y no inventa campos', async () => {
  const r = cargar();
  const api = { get: async (url, cfg) => { assert.equal(url, '/contingencia/operaciones/estados'); assert.equal(cfg.params.ids, 'a,b'); return { data: [{ ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7 }] }; } };
  const [ev] = await r.reconfirmarConServidor(api, ['a', 'b']);
  assert.equal(ev.reconfirmadaAt, undefined);
  assert.equal(ev.payloadHash, undefined);
  assert.equal(ev.cajaCerrada, undefined);
  assert.deepEqual(await r.reconfirmarConServidor({ get: async () => { throw new Error('no debe llamar'); } }, []), []);
});

// ───── P1-5: ejecutor atómico ─────
async function escenarioRetencion() {
  const { db, retencion } = nuevaBase();
  const eligible = operacion('a');
  const ops = [
    eligible,
    operacion('b', { estado: 'PENDIENTE', numeroVenta: undefined, correlativoDefinitivo: undefined }),
    operacion('c', { estado: 'REVISION', requiereRevision: true }),
    operacion('d', { requiereRevision: true }),
    operacion('e'),
  ];
  await sembrar(db, ops);
  const evidencia = (op, extra = {}) => ({ ...datosEvidencia, operacionId: op.operacionId, estado: 'APLICADA', numeroVenta: op.numeroVenta, correlativoDefinitivo: op.correlativoDefinitivo,
    payloadHash: null, cajaCerrada: true, reconfirmadaAt: new Date(NOW).toISOString(), ...extra });
  const candidata = async (op, extra = {}) => {
    const hash = await retencion.hashPayload(op);
    return { op, hash, canonico: retencion.payloadCanonico(op), evidencia: evidencia(op, { payloadHash: hash, ...extra }) };
  };
  return { db, retencion, ops, candidata, evidencia };
}

test('el ejecutor elimina solo la operación confirmada y deja el resto intacto', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  // «e» es SINCRONIZADA sin revisión, pero el servidor reconfirma otro número de venta: no debe eliminarse.
  const candidatas = [await candidata(ops[0]), await candidata(ops[1]), await candidata(ops[2]), await candidata(ops[3]), await candidata(ops[4], { numeroVenta: 99 })];
  const resultado = await retencion.eliminarConfirmadas(candidatas, NOW, sesion);
  assert.deepEqual(resultado.eliminadas, ['a']);
  assert.deepEqual(resultado.omitidas.sort(), ['b', 'c', 'd', 'e']);
  const restantes = (await todas(db)).map((o) => o.operacionId).sort();
  assert.deepEqual(restantes, ['b', 'c', 'd', 'e']);
});
test('el ejecutor escribe un resumen de auditoría sin datos personales', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  await retencion.eliminarConfirmadas([await candidata(ops[0])], NOW, sesion);
  const resumen = await metaClave(db, 'auditoria:a');
  assert.ok(resumen, 'debe existir el resumen');
  assert.ok(!JSON.stringify(resumen).includes('Cliente Confidencial'));
  assert.equal(resumen.correlativoDefinitivo, 'V-00000007');
});
test('si el registro cambió entre la evaluación y el borrado, se omite y se conserva', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  const c = await candidata(ops[0]);
  // Otra pestaña cambia la operación después de la reconfirmación: vuelve a revisión.
  await sembrar(db, [{ ...ops[0], estado: 'REVISION', requiereRevision: true }]);
  const resultado = await retencion.eliminarConfirmadas([c], NOW, sesion);
  assert.deepEqual(resultado.omitidas, ['a']);
  assert.equal((await todas(db)).find((o) => o.operacionId === 'a').estado, 'REVISION');
  assert.equal(await metaClave(db, 'auditoria:a'), undefined);
});
test('si la carga cambió (importe distinto al evaluado), se omite aunque el estado siga SINCRONIZADA', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  const c = await candidata(ops[0]);
  await sembrar(db, [{ ...ops[0], totalCentavos: 9999 }]);
  const resultado = await retencion.eliminarConfirmadas([c], NOW, sesion);
  assert.deepEqual(resultado.omitidas, ['a']);
  assert.equal((await todas(db)).length, 5, 'ninguna operación se elimina');
});
test('un fallo a mitad de la transacción no elimina nada ni deja resúmenes a medias', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  const c = await candidata(ops[0]);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (valor, clave) {
    if (typeof clave === 'string' && clave.startsWith('auditoria:')) throw new DOMException('Cuota excedida', 'QuotaExceededError');
    return put.call(this, valor, clave);
  };
  try { await assert.rejects(retencion.eliminarConfirmadas([c], NOW, sesion)); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.equal((await todas(db)).some((o) => o.operacionId === 'a'), true, 'la operación debe seguir');
  assert.equal(await metaClave(db, 'auditoria:a'), undefined);
});
test('reinicio: tras eliminar, otra instancia de los módulos ve el mismo estado', async () => {
  const { retencion, ops, candidata } = await escenarioRetencion();
  await retencion.eliminarConfirmadas([await candidata(ops[0])], NOW, sesion);
  const nuevo = modulos()('src/offline/retencion.ts');
  const dbNueva = modulos()('src/offline/db.ts');
  assert.equal((await todas(dbNueva)).some((o) => o.operacionId === 'a'), false);
  assert.ok(await metaClave(dbNueva, 'auditoria:a'));
  assert.equal(typeof nuevo.eliminarConfirmadas, 'function');
});

// Integración: sincronización real + reconfirmación HTTP simulada + transacciones de IndexedDB.
async function cicloOnline(respuesta, duranteRespuesta = () => {}) {
  globalThis.indexedDB = new IDBFactory();
  const cargarFn = modulos();
  const db = cargarFn('src/offline/db.ts');
  const sync = cargarFn('src/offline/sync.ts');
  const retencion = cargarFn('src/offline/retencion.ts');
  const op = operacion('a');
  await sembrar(db, [op]);
  const almacen = new Map();
  const anteriores = Object.fromEntries(['window', 'localStorage'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const redAnterior = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  globalThis.window = {};
  globalThis.localStorage = { getItem: k => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, v) };
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  const usuario = { id: 'cajero-1', tenantId: 'empresa-1', rol: 'CAJERO' };
  almacen.set('ferre_token', `x.${btoa(JSON.stringify({ sub: usuario.id, tenantId: usuario.tenantId, sid: 'sesion-1' }))}.x`);
  almacen.set('ferre_user', JSON.stringify(usuario));
  almacen.set('ferre_tenant', JSON.stringify({ id: usuario.tenantId }));
  const ev = { ...datosEvidencia, operacionId: 'a', estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007',
    payloadHash: await retencion.hashPayload(op), cajaCerrada: true, reconfirmadaAt: new Date().toISOString() };
  let peticiones = 0;
  try {
    const resultado = await sync.sincronizarPendientes({
      post: async () => { throw Error('No hay pendientes'); },
      get: async (_url, cfg) => {
        peticiones++;
        assert.match(cfg.headers.Authorization, /^Bearer /);
        assert.equal(cfg.timeout, 20_000);
        await duranteRespuesta(almacen, db, op);
        return { data: await respuesta(ev) };
      },
    }, 'disp', usuario);
    return { resultado, restantes: await todas(db), auditoria: await metaClave(db, 'auditoria:a'), peticiones };
  } finally {
    for (const [k, d] of Object.entries(anteriores)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
    if (redAnterior) Object.defineProperty(navigator, 'onLine', redAnterior); else delete navigator.onLine;
  }
}

test('ciclo online conectado: purga confirmada tras sincronizar y conserva testigo por empresa', async () => {
  const r = await cicloOnline(ev => [ev]);
  assert.equal(r.peticiones, 1);
  assert.deepEqual(r.restantes, []);
  assert.equal(r.auditoria.tenantId, 'empresa-1');
  assert.equal(r.resultado.pendientes, 0);
});
for (const [nombre, respuesta] of Object.entries({
  'caja abierta': ev => [{ ...ev, cajaCerrada: false }],
  'hash distinto': ev => [{ ...ev, payloadHash: 'distinto' }],
  'evidencia caducada': ev => [{ ...ev, reconfirmadaAt: new Date(Date.now() - 300_001).toISOString() }],
  'HTTP 503': () => { throw Object.assign(Error('HTTP'), { response: { status: 503 } }); },
  'timeout': () => { throw Object.assign(Error('timeout'), { code: 'ECONNABORTED' }); },
  'respuesta parcial vacía': () => [],
  'formato inválido': () => ({ resultados: [] }),
  'duplicados': ev => [ev, ev],
  'otra empresa': ev => [{ ...ev, tenantId: 'empresa-2' }],
  'otra caja': ev => [{ ...ev, cajaId: 'caja-ajena' }],
  'revisión servidor': ev => [{ ...ev, requiereRevision: true }],
  'número distinto': ev => [{ ...ev, numeroVenta: 99 }],
  'correlativo distinto': ev => [{ ...ev, correlativoDefinitivo: 'V-00000099' }],
  'sin fecha del servidor': ev => [{ ...ev, reconfirmadaAt: undefined }],
})) {
  test(`ciclo online conserva: ${nombre}`, async () => {
    const r = await cicloOnline(respuesta);
    assert.equal(r.restantes.length, 1);
    assert.equal(r.auditoria, undefined);
  });
}
test('cambio de empresa durante HTTP conserva operación y no crea testigo', async () => {
  const r = await cicloOnline(ev => [ev], almacen => almacen.set('ferre_tenant', JSON.stringify({ id: 'empresa-2' })));
  assert.equal(r.restantes.length, 1);
  assert.equal(r.auditoria, undefined);
});
test('cambio de payload durante HTTP conserva operación', async () => {
  const r = await cicloOnline(ev => [ev], (_almacen, db, op) => sembrar(db, [{ ...op, clienteNombre: 'Otro cliente' }]));
  assert.equal(r.restantes.length, 1);
});
test('cambio de sesión dentro de la transacción impide borrar', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  const c = await candidata(ops[0]);
  const r = await retencion.eliminarConfirmadas([c], Date.now(), { ...sesion, vigente: () => false });
  assert.deepEqual(r.eliminadas, []);
  assert.equal((await todas(db)).length, 5);
});
test('el índice emitido nunca se reutiliza después de retener la última venta de la ventana', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  const maxima = { ...ops[0], indiceOperacion: 8 };
  await sembrar(db, [maxima]);
  await retencion.eliminarConfirmadas([await candidata(maxima)], Date.now(), sesion);
  const journal = modulos()('src/offline/journal.ts');
  const nueva = await journal.registrarOperacion({ ...maxima }, '01', Array.from({ length: 11 }, (_, i) => `uuid-${i}`));
  assert.equal(nueva.indiceOperacion, 9);
  assert.equal(nueva.operacionId, 'uuid-9');
});

test('la evidencia se vuelve a fechar al decidir dentro de la transacción', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  const c = await candidata(ops[0], { reconfirmadaAt: new Date(Date.now() - 300_001).toISOString() });
  const r = await retencion.eliminarConfirmadas([c], Date.now() - 600_000, sesion);
  assert.deepEqual(r.eliminadas, []);
  assert.equal((await todas(db)).length, 5);
});
test('retener índices desordenados en un lote conserva el máximo', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  const altas = [{ ...ops[0], indiceOperacion: 20 }, { ...ops[4], indiceOperacion: 2 }];
  await sembrar(db, altas);
  await retencion.eliminarConfirmadas(await Promise.all(altas.map(o => candidata(o))), Date.now(), sesion);
  assert.equal(await metaClave(db, 'indice-retenido:v1'), 21);
});
test('una respuesta parcial nunca inventa evidencia para la operación ausente', async () => {
  const r = cargar();
  const evs = await r.reconfirmarConServidor({ get: async () => ({ data: [{ ...datosEvidencia, operacionId: 'a', estado: 'APLICADA' }] }) }, ['a', 'b']);
  assert.deepEqual(evs.map(e => e.operacionId), ['a']);
  assert.equal(r.evaluarRetencion(operacion('b'), evs.find(e => e.operacionId === 'b'), 'h').eliminable, false);
});

test('conserva la ventana local activa para no liberar cupos al purgar', async () => {
  const { db, retencion, ops, candidata } = await escenarioRetencion();
  await db.escribirClave('ventana', 'activa', { ventanaId: ops[0].ventanaId });
  const r = await retencion.eliminarConfirmadas([await candidata(ops[0])], Date.now(), sesion);
  assert.deepEqual(r.eliminadas, []);
  assert.equal((await todas(db)).length, 5);
  assert.equal(await metaClave(db, 'auditoria:a'), undefined);
});
