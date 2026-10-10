/**
 * precios.test.mjs
 *
 * Precios y aprobación para venta: reglas de src/utils/precios.ts.
 * Mismo cargador que producto-edicion.test.mjs (node:test, sin dependencias extra).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file) => {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, Number, String, Boolean, Math, Object, Array, Set, require: () => { throw new Error('import no esperado'); } });
  return exports;
};

const modulo = load('src/utils/precios.ts');
// Otro contexto de vm: los objetos tienen otro prototipo; se normaliza con JSON antes de comparar.
const plano = (valor) => JSON.parse(JSON.stringify(valor));

const producto = {
  id: 'p1', codigo: 'CAB-1', nombre: 'Cable', descripcion: 'Rollo 100 m', categoriaNombre: 'Electricidad',
  precioCosto: 8, precioVenta: 12, precioAprobado: true, stockActual: 40, version: 3, activo: true, unidadMedida: 'METRO',
};

test('margen calculado sobre el precio de venta, con dos decimales', () => {
  assert.equal(modulo.margenCalculado(8, 12), 33.33);
  assert.equal(modulo.margenCalculado(0, 10), 100);
  assert.equal(modulo.margenCalculado(12, 10), -20);
});

test('sin precio de venta no hay margen (evita división entre cero)', () => {
  assert.equal(modulo.margenCalculado(5, 0), null);
  assert.equal(modulo.margenCalculado(5, -1), null);
});

test('aprobar exige precio de venta mayor que cero', () => {
  assert.equal(modulo.puedeAprobar('0'), false);
  assert.equal(modulo.puedeAprobar(''), false);
  assert.equal(modulo.puedeAprobar('abc'), false);
  assert.equal(modulo.puedeAprobar('0.01'), true);
});

test('validación de costo y precio: número y no negativo', () => {
  assert.deepEqual(plano(modulo.validarPrecios('8', '12')), []);
  assert.deepEqual(plano(modulo.validarPrecios('', '12')), [{ campo: 'costo', motivo: 'numero' }]);
  assert.deepEqual(plano(modulo.validarPrecios('8', '-1')), [{ campo: 'venta', motivo: 'negativo' }]);
  assert.deepEqual(plano(modulo.validarPrecios('x', 'y')), [{ campo: 'costo', motivo: 'numero' }, { campo: 'venta', motivo: 'numero' }]);
});

test('solo se envían los precios que cambiaron', () => {
  assert.deepEqual(plano(modulo.cambiosDePrecio(producto, '8', '12')), { payload: {}, hayCambios: false });
  assert.deepEqual(plano(modulo.cambiosDePrecio(producto, '9', '12')), { payload: { precioCosto: 9 }, hayCambios: true });
  assert.deepEqual(plano(modulo.cambiosDePrecio(producto, '8', '15')), { payload: { precioVenta: 15 }, hayCambios: true });
});

test('un precio vacío o inválido no genera cambio', () => {
  assert.deepEqual(plano(modulo.cambiosDePrecio(producto, '', '')), { payload: {}, hayCambios: false });
});

test('completo exige nombre, categoría y unidad; la descripción es opcional', () => {
  const sinDescripcion = { ...producto, descripcion: null, unidadMedida: 'METRO' };
  assert.equal(modulo.datosCompletos(producto), true);
  assert.equal(modulo.datosCompletos(sinDescripcion), true);
  assert.equal(modulo.datosCompletos({ ...producto, categoriaNombre: null, categoria: null }), false);
  assert.equal(modulo.datosCompletos({ ...producto, categoriaNombre: null, categoria: { nombre: 'Herramientas' } }), true);
  assert.equal(modulo.datosCompletos({ ...producto, unidadMedida: '' }), false);
  assert.equal(modulo.datosCompletos({ ...producto, nombre: '  ' }), false);
});

test('pendiente de precio es lo contrario de aprobado', () => {
  assert.equal(modulo.precioPendiente(producto), false);
  assert.equal(modulo.precioPendiente({ ...producto, precioAprobado: false }), true);
});
