/**
 * producto-edicion.test.mjs
 *
 * FS-07: reglas de la edición de productos sobre src/utils/productoEdicion.ts.
 * Mismo cargador que format-fecha.test.mjs (node:test, sin dependencias extra).
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
  vm.runInNewContext(code, { exports, Date, Intl, Number, String, Boolean, require: () => { throw new Error('import no esperado'); } });
  return exports;
};

const modulo = load('src/utils/productoEdicion.ts');
// El módulo se ejecuta en otro contexto de vm: sus objetos tienen otro prototipo y deepStrictEqual los rechazaría.
const plano = (valor) => JSON.parse(JSON.stringify(valor));
const formularioDesde = (p) => plano(modulo.formularioDesde(p));
const construirCambiosProducto = (...args) => plano(modulo.construirCambiosProducto(...args));
const validarFormularioProducto = (...args) => plano(modulo.validarFormularioProducto(...args));

const producto = {
  id: 'p1', version: 4, nombre: 'Cable metro', codigo: 'CAB-1', codigoBarras: '7701234', codigoFabricante: null,
  descripcion: null, marca: 'Truper', categoria: { id: 'c1', nombre: 'Electricidad' }, unidadMedida: 'METRO',
  usaMedida: true, precioVenta: 12.5, precioCosto: 8, margen: null, stockActual: 40, stockMinimo: 5, activo: true, imagenUrl: null,
};

test('una edición de solo el nombre envía únicamente nombre y versión', () => {
  const form = { ...formularioDesde(producto), nombre: 'Cable metro reforzado' };
  const { payload, cambiados, sensibles } = construirCambiosProducto(producto, form);
  assert.deepEqual(payload, { nombre: 'Cable metro reforzado', version: 4 });
  assert.deepEqual(cambiados, ['nombre']);
  assert.deepEqual(sensibles, []);
});

test('sin cambios no se envían campos y no hay nada que guardar', () => {
  const { payload, cambiados } = construirCambiosProducto(producto, formularioDesde(producto));
  assert.deepEqual(cambiados, []);
  assert.deepEqual(payload, { version: 4 });
});

test('existencias sin cambio nunca se envían (evita revertir un valor leído antes)', () => {
  const form = { ...formularioDesde(producto), stockActual: '40' };
  const { payload } = construirCambiosProducto(producto, form);
  assert.equal('stockActual' in payload, false);
  assert.equal('motivo' in payload, false);
});

test('la ficha nunca envía precio, costo ni margen aunque cambien (los fija el administrador)', () => {
  const form = { ...formularioDesde(producto), precioVenta: '14', precioCosto: '9', margen: '40', nombre: 'Cable 12 AWG' };
  const { payload, cambiados } = construirCambiosProducto(producto, form);
  assert.equal('precioVenta' in payload, false);
  assert.equal('precioCosto' in payload, false);
  assert.equal('margen' in payload, false);
  assert.deepEqual(cambiados, ['nombre']);
});

test('cambiar existencias exige motivo y lo envía junto con el nuevo valor', () => {
  const form = { ...formularioDesde(producto), stockActual: '35', motivo: 'Conteo de mostrador' };
  const { payload, sensibles } = construirCambiosProducto(producto, form);
  assert.equal(payload.stockActual, 35);
  assert.equal(payload.stockAnterior, 40);
  assert.equal(payload.motivo, 'Conteo de mostrador');
  assert.deepEqual(sensibles, ['stockActual']);
});

test('cambiar el código de barras se marca como sensible', () => {
  const form = { ...formularioDesde(producto), codigoBarras: '999' };
  const { sensibles } = construirCambiosProducto(producto, form);
  assert.deepEqual(sensibles, ['codigoBarras']);
});

test('marca y categoría vacías no borran el dato existente', () => {
  const form = { ...formularioDesde(producto), marca: '', categoria: '' };
  const { payload, cambiados } = construirCambiosProducto(producto, form);
  assert.equal('marca' in payload, false);
  assert.equal('categoria' in payload, false);
  assert.deepEqual(cambiados, []);
});

test('cambiar marca y categoría se envía y no altera existencias', () => {
  const form = { ...formularioDesde(producto), marca: 'Stanley', categoria: 'Herramientas' };
  const { payload, cambiados } = construirCambiosProducto(producto, form);
  assert.equal(payload.marca, 'Stanley');
  assert.equal(payload.categoria, 'Herramientas');
  assert.equal('stockActual' in payload, false);
  assert.deepEqual(cambiados, ['marca', 'categoria']);
});

test('código interno y de barras cambiados: códigos en mayúsculas y barcode vacío como borrado explícito', () => {
  const form = { ...formularioDesde(producto), codigo: 'cab-2', codigoBarras: '' };
  const { payload, sensibles } = construirCambiosProducto(producto, form);
  assert.equal(payload.codigo, 'CAB-2');
  assert.equal(payload.codigoBarras, '');
  assert.deepEqual(sensibles, ['codigo', 'codigoBarras']);
});

test('código en minúsculas que equivale al actual no es un cambio', () => {
  const { cambiados } = construirCambiosProducto(producto, { ...formularioDesde(producto), codigo: 'cab-1' });
  assert.deepEqual(cambiados, []);
});

test('desactivar un producto requiere confirmación y se envía activo=false', () => {
  const { payload, sensibles } = construirCambiosProducto(producto, { ...formularioDesde(producto), activo: false });
  assert.equal(payload.activo, false);
  assert.deepEqual(sensibles, ['activo']);
});

test('cambiar la unidad de medida es sensible', () => {
  const { payload, sensibles } = construirCambiosProducto(producto, { ...formularioDesde(producto), unidadMedida: 'PIE' });
  assert.equal(payload.unidadMedida, 'PIE');
  assert.deepEqual(sensibles, ['unidadMedida']);
});

test('la versión leída siempre viaja en el payload para detectar ediciones concurrentes', () => {
  const { payload } = construirCambiosProducto(producto, { ...formularioDesde(producto), nombre: 'Otro' });
  assert.equal(payload.version, 4);
});

test('validación: nombre, código y existencias (sin precio)', () => {
  const base = formularioDesde(producto);
  assert.deepEqual(validarFormularioProducto({ ...base, nombre: '  ' }, producto), [{ campo: 'nombre', motivo: 'requerido' }]);
  assert.deepEqual(validarFormularioProducto({ ...base, codigo: '' }, producto), [{ campo: 'codigo', motivo: 'requerido' }]);
  assert.deepEqual(validarFormularioProducto({ ...base, stockActual: 'abc' }, producto), [{ campo: 'stockActual', motivo: 'numero' }]);
  assert.deepEqual(validarFormularioProducto(base, producto), []);
});

test('regresión: el listado de inventario conserva la versión y la categoría real; "General" no se guarda como categoría', () => {
  // Forma del producto tal como lo mapea InventarioPage: 'categoria' es solo texto de visualización.
  const mapeado = { id: 'p2', version: 3, nombre: 'Tuerca', codigo: 'T-1', categoria: 'General', categoriaNombre: '', marca: null,
    categoriaId: null, precioVenta: 1, precioCosto: 0.5, margen: undefined, stockActual: 10, stockMinimo: 0,
    unidadMedida: 'UNIDAD', usaMedida: false, activo: true, stockReservado: 0, stockDisponible: 10, imagenUrl: null, descripcion: null, codigoBarras: null, codigoFabricante: null };
  const form = formularioDesde(mapeado);
  assert.equal(form.categoria, '');
  const { payload, cambiados } = construirCambiosProducto(mapeado, form);
  assert.deepEqual(cambiados, []);
  assert.equal(payload.version, 3);
  assert.equal('categoria' in payload, false);
});
