import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = name => {
  const source = fs.readFileSync(new URL(`../src/utils/${name}.ts`, import.meta.url), 'utf8');
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
};
const { productCreation } = load('productCreation');
const { inventoryNumber } = load('inventoryNumber');
const storage = () => {
  const map = new Map();
  return { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
};
const draft = { nombre: 'Tornillo negro 1/2', precioVenta: 4, precioCosto: 2, stockActual: 12, stockMinimo: 0 };

test('doble envío guarda antes del POST y una respuesta perdida se recupera tras recargar con el mismo UUID y datos', async () => {
  const store = storage(); let fail; const calls = [];
  const first = productCreation('tenant:user', store, body => {
    assert.equal(JSON.parse(store.getItem('tenant:user')).solicitudId, body.solicitudId);
    calls.push(body); return new Promise((_, reject) => { fail = reject; });
  }, () => 'request-1');
  const saving = first.save(draft);
  assert.equal(await first.save({ ...draft, stockActual: 99 }), false);
  assert.equal(calls.length, 1);
  fail(new Error('lost response')); await assert.rejects(saving);
  const reload = productCreation('tenant:user', store, async body => { calls.push(body); }, () => 'must-not-be-used');
  assert.equal(await reload.save({ ...draft, stockActual: 99 }), true);
  assert.equal(JSON.stringify(calls[0]), JSON.stringify(calls[1]));
  assert.equal(reload.pending(), null);
});

test('aislamiento por tenant/usuario y mismo nombre con nueva intención no reutiliza una solicitud anterior', async () => {
  const store = storage(), calls = []; let n = 0;
  const make = key => productCreation(key, store, async body => calls.push(body), () => `request-${++n}`);
  store.setItem('tenantA:userA', JSON.stringify({ ...draft, solicitudId: 'pending' }));
  await make('tenantB:userA').save(draft);
  await make('tenantA:userB').save(draft);
  assert.equal(make('tenantA:userA').pending().solicitudId, 'pending');
  await make('tenantB:userA').save(draft);
  assert.equal(new Set(calls.map(c => c.solicitudId)).size, 3);
});

test('no envía si almacenamiento falla o está corrupto; libera bloqueo después del error', async () => {
  let calls = 0;
  const store = storage();
  store.setItem('scope', '{');
  const creator = productCreation('scope', store, async () => { calls++; }, () => 'id');
  await assert.rejects(creator.save(draft)); assert.equal(calls, 0);
  store.removeItem('scope');
  const write = store.setItem;
  store.setItem = () => { throw new Error('quota'); };
  await assert.rejects(creator.save(draft)); assert.equal(calls, 0);
  store.setItem = write;
  await creator.save(draft); assert.equal(calls, 1);
});

test('rechazo validado permite corregir; 401/5xx conserva la solicitud; fallo al limpiar tampoco repite una identidad nueva', async () => {
  for (const status of [400, 403, 404, 409, 422, 401, 500]) {
    const store = storage();
    const creator = productCreation('scope', store, async () => { throw { response: { status } }; }, () => 'id');
    await assert.rejects(creator.save(draft));
    assert.equal(!!creator.pending(), [401, 403, 500].includes(status));
  }
  const store = storage(), ids = [];
  store.removeItem = () => { throw new Error('storage unavailable'); };
  const creator = productCreation('scope', store, async body => ids.push(body.solicitudId), () => 'id');
  await assert.rejects(creator.save(draft));
  await assert.rejects(creator.save(draft));
  assert.deepEqual(ids, ['id', 'id']);
});

test('un rechazo del reintento conserva identidad y una respuesta tardía no borra otro pendiente', async () => {
  for (const status of [400, 403, 404, 409, 422]) {
    const store = storage(); store.setItem('scope', JSON.stringify({ ...draft, solicitudId: 'original' }));
    const creator = productCreation('scope', store, async () => { throw { response: { status } }; }, () => 'new');
    await assert.rejects(creator.save());
    assert.equal(creator.pending().solicitudId, 'original');
  }
  const store = storage(); let finish;
  const creator = productCreation('scope', store, () => new Promise(resolve => { finish = resolve; }), () => 'first');
  const saving = creator.save(draft);
  store.setItem('scope', JSON.stringify({ ...draft, solicitudId: 'second-tab' }));
  finish(); await saving;
  assert.equal(creator.pending().solicitudId, 'second-tab');
});

test('CSV rechaza prefijos, infinitos, escala y desbordamiento sin truncar ni redondear; conserva cero', () => {
  for (const input of ['12abc', 'Infinity', 'NaN', '1e3', '0x10', '1,5', '-1', '1.234', '10000000000']) assert.ok(Number.isNaN(inventoryNumber(input, 0)), input);
  for (const [input, expected] of [['0', 0], [' 2.75 ', 2.75], ['9999999999.99', 9999999999.99], ['', 5]]) assert.equal(inventoryNumber(input, 5), expected);
});
