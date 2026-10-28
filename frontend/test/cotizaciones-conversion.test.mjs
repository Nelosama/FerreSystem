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
// Mismas funciones que la página: el manejador usa la utilidad real de reconocimiento del 409 de precio.
const utilFile = new URL('../src/utils/excepcionPrecio.ts', import.meta.url);
const utilContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(utilFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, utilContext);
const { esRechazoPorPrecio, motivoExcepcionValido } = utilContext.exports;

// excepcionConversion: motivo recortado que la página calcula (null si no aplica o el usuario no tiene el permiso).
function setup(post, refresh = async () => {}, metodoConversion = 'EFECTIVO', excepcionConversion = null) {
  const quotation = { id: 'cot-123', numero: 17, estado: 'APROBADA', clienteId: 'client-1', total: 69 };
  const state = { quotations: [quotation], modal: quotation, busy: false, notices: [], rechazoPrecio: false };
  const conversionElectronica = metodoConversion === 'TARJETA' || metodoConversion === 'TRANSFERENCIA';
  const context = { exports: {}, api: { post }, metodoConversion, conversionElectronica, autConversion: { referencia: 'AUT-PRUEBA', terminal: 'POS-01' }, conversionEnCurso: { current: false },
    setConvirtiendo: value => { state.busy = value; },
    setCotizaciones: fn => { state.quotations = fn(state.quotations); },
    setModalConvertir: value => { state.modal = value; },
    fetchCotizacionesYProductos: refresh,
    excepcionConversion, motivoConversionValido: excepcionConversion === null || motivoExcepcionValido(excepcionConversion),
    esRechazoPorPrecio, setRechazoPrecioConversion: value => { state.rechazoPrecio = value; },
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
  // Transferencia envía su autorización bancaria (sin terminal).
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['/cotizaciones/cot-123/convertir', { metodoPago: 'TRANSFERENCIA', pagoElectronico: { referencia: 'AUT-PRUEBA' } }]]);
});

test('doble confirmación simultánea emite un solo POST', async () => {
  let finish, calls = 0;
  const h = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = h.convert();
  assert.equal(h.state.busy, true);
  await h.convert();
  assert.equal(calls, 1);
  assert.match(source, /onClick=\{\(\) => handleConfirmarConvertir\(modalConvertir\)\}[\s\n]*disabled=\{convirtiendo \|\| !autorizacionConversionValida \|\| !motivoConversionValido\}/);
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

test('convertir con tarjeta envía la autorización bancaria y terminal', async () => {
  const llamadas = [];
  const { convert } = setup(async (url, body) => { llamadas.push({ url, body }); return { data: {} }; }, async () => {}, 'TARJETA');
  await convert();
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas[0].body)), { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-PRUEBA', terminal: 'POS-01' } });
});

// Excepción de precio (backend/src/ventas/politica-precio.ts): 409 sin excepción, 400 motivo inválido, 403 sin permiso.
const rechazo = (status, message) => { throw { response: { status, data: { message } } }; };

test('un 409 por precio distinto marca la excepción, conserva la cotización y no envía motivo', async () => {
  const llamadas = [];
  const h = setup(async (url, body) => { llamadas.push(body); rechazo(409, 'El precio cambió; actualice el catálogo o solicite al administrador'); });
  await h.convert();
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas)), [{ metodoPago: 'EFECTIVO' }]);
  assert.equal(h.state.rechazoPrecio, true);
  assert.equal(h.state.quotations[0].estado, 'APROBADA');
  assert.ok(h.state.modal);
  assert.deepEqual(h.state.notices[0], ['El precio cambió; actualice el catálogo o solicite al administrador', 'error']);
});

test('otro 409 (caja cerrada) no se confunde con el rechazo de precio', async () => {
  const h = setup(async () => rechazo(409, 'Abra su caja antes de registrar ventas o pagos'));
  await h.convert();
  assert.equal(h.state.rechazoPrecio, false);
});

test('con el permiso, envía el motivo recortado y la conversión se completa', async () => {
  const llamadas = [];
  const h = setup(async (url, body) => { llamadas.push({ url, body }); return { data: {} }; }, undefined, 'EFECTIVO', 'Precio pactado con el cliente');
  await h.convert();
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas)), [{ url: '/cotizaciones/cot-123/convertir', body: { metodoPago: 'EFECTIVO', excepcionPrecio: { motivo: 'Precio pactado con el cliente' } } }]);
  assert.equal(h.state.quotations[0].estado, 'CONVERTIDA');
  assert.equal(h.state.modal, null);
});

test('un motivo demasiado corto no se envía', async () => {
  let llamadas = 0;
  const h = setup(async () => { llamadas++; }, undefined, 'EFECTIVO', 'corto');
  await h.convert();
  assert.equal(llamadas, 0);
  assert.equal(h.state.quotations[0].estado, 'APROBADA');
});

for (const [status, message] of [[403, 'Cobrar un precio distinto del vigente requiere el permiso explícito de excepción de precio'], [400, 'Explique el motivo de la excepción de precio (entre 10 y 300 caracteres)']]) {
  test(`un ${status} de la excepción se muestra y deja la cotización sin convertir`, async () => {
    const h = setup(async () => rechazo(status, message), undefined, 'EFECTIVO', 'Precio pactado con el cliente');
    await h.convert();
    assert.deepEqual(h.state.notices[0], [message, 'error']);
    assert.equal(h.state.quotations[0].estado, 'APROBADA');
    assert.ok(h.state.modal);
    assert.equal(h.state.busy, false);
    assert.equal(h.state.rechazoPrecio, false);
  });
}
