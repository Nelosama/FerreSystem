import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/pages/CotizacionesPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleConfirmarConvertir') handler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const code = ts.transpileModule(`exports.convert = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(post, refresh = async () => {}, metodoConversion = 'EFECTIVO') {
  const quotation = { id: 'cot-123', numero: 17, estado: 'APROBADA', clienteId: 'client-1', total: 69 };
  const state = { quotations: [quotation], modal: quotation, busy: false, notices: [] };
  const context = { exports: {}, api: { post }, metodoConversion, conversionEnCurso: { current: false },
    setConvirtiendo: value => { state.busy = value; },
    setCotizaciones: fn => { state.quotations = fn(state.quotations); },
    setModalConvertir: value => { state.modal = value; },
    fetchCotizacionesYProductos: refresh,
    mostrarNotificacion: (...args) => state.notices.push(args), console: { error() {} } };
  vm.runInNewContext(code, context);
  return { convert: () => context.exports.convert(state.quotations[0]), state };
}

test('usa ID y ruta canónica; el backend obtiene cliente, líneas e importes guardados', async () => {
  const calls = [];
  const h = setup(async (...args) => { calls.push(args); });
  await h.convert();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['/cotizaciones/cot-123/convertir', { metodoPago: 'EFECTIVO' }]]);
  assert.equal(h.state.modal, null);
  assert.equal(h.state.quotations[0].estado, 'CONVERTIDA');
  assert.equal(h.state.busy, false);
  await h.convert();
  assert.equal(calls.length, 1);
});

test('la conversión envía el método elegido en vez de registrar siempre efectivo', async () => {
  const calls = [];
  const h = setup(async (...args) => { calls.push(args); }, undefined, 'TRANSFERENCIA');
  await h.convert();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['/cotizaciones/cot-123/convertir', { metodoPago: 'TRANSFERENCIA' }]]);
});

test('doble confirmación simultánea emite un solo POST', async () => {
  let finish, calls = 0;
  const h = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = h.convert();
  assert.equal(h.state.busy, true);
  await h.convert();
  assert.equal(calls, 1);
  assert.match(source, /onClick=\{\(\) => handleConfirmarConvertir\(modalConvertir\)\}[\s\n]*disabled=\{convirtiendo\}/);
  finish(); await pending;
  assert.equal(h.state.busy, false);
});

test('error visible conserva cotización, libera bloqueo y no reintenta automáticamente', async () => {
  let calls = 0;
  const h = setup(async () => { calls++; throw { response: { data: { message: 'Stock insuficiente' } } }; });
  await h.convert();
  assert.equal(calls, 1);
  assert.equal(h.state.busy, false);
  assert.equal(h.state.quotations[0].estado, 'APROBADA');
  assert.ok(h.state.modal);
  assert.deepEqual(h.state.notices[0], ['Stock insuficiente', 'error']);
  await h.convert();
  assert.equal(calls, 2);
});

test('éxito seguido de fallo de recarga conserva estado convertido y evita otro POST', async () => {
  let calls = 0;
  const h = setup(async () => { calls++; }, async () => { throw new Error('network'); });
  await h.convert(); await h.convert();
  assert.equal(calls, 1);
  assert.equal(h.state.quotations[0].estado, 'CONVERTIDA');
  assert.equal(h.state.modal, null);
});
