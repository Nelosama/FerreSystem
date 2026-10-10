/**
 * compras-flujo.test.mjs
 *
 * Flujo de compras: reglas puras de src/utils/compras.ts (node:test, mismo cargador que producto-edicion).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Math, Number, String, Array, Object, Set, Boolean, require: () => { throw new Error('import no esperado'); } });
  return exports;
};
const m = load('src/utils/compras.ts');
const plano = (v) => JSON.parse(JSON.stringify(v));

const linea = (cantidad, costo, productoId = 'p1') => ({ productoId, nombre: 'Tornillo', cantidad, costo });

test('totales en centavos: sin errores de punto flotante y con ISV', () => {
  assert.deepEqual(plano(m.totalesCompra([linea(3, 0.1), linea(2, 0.2)], 0)), { subtotal: 0.7, total: 0.7 });
  assert.deepEqual(plano(m.totalesCompra([linea(10, 4.5)], 4.5)), { subtotal: 45, total: 49.5 });
});

test('estado de recepción: pendiente, parcial y recibida', () => {
  assert.equal(m.estadoRecepcion({ estado: 'SOLICITADA', items: [{ cantidad: 10, cantidad_recibida: 0 }] }), 'PENDIENTE');
  assert.equal(m.estadoRecepcion({ estado: 'SOLICITADA', items: [{ cantidad: 10, cantidad_recibida: 4 }] }), 'PARCIAL');
  assert.equal(m.estadoRecepcion({ estado: 'RECIBIDA', items: [{ cantidad: 10, cantidad_recibida: 10 }] }), 'RECIBIDA');
  assert.equal(m.estadoRecepcion({ estado: 'SOLICITADA', items: [{ cantidad: 10, cantidad_recibida: 10 }] }), 'RECIBIDA');
});

test('validación de compra: proveedor, factura, productos, ISV, cantidad y costo', () => {
  const base = { proveedorId: 'prov', factura: 'FAC-1', lineas: [linea(2, 5)], isv: '0' };
  assert.equal(m.validarCompra(base), null);
  assert.equal(m.validarCompra({ ...base, proveedorId: '' }), 'seleccione_proveedor');
  assert.equal(m.validarCompra({ ...base, factura: '  ' }), 'factura_requerida');
  assert.equal(m.validarCompra({ ...base, lineas: [] }), 'agregue_productos');
  assert.equal(m.validarCompra({ ...base, isv: '' }), 'isv_invalido');
  assert.equal(m.validarCompra({ ...base, lineas: [linea(0, 5)] }), 'cantidad_invalida');
  assert.equal(m.validarCompra({ ...base, lineas: [linea(2, -1)] }), 'costo_invalido');
  assert.equal(m.validarCompra({ ...base, lineas: [linea(2, 5.555)] }), 'costo_invalido');
});

test('recepción: no vacía, no excede lo pendiente, sin cantidades negativas', () => {
  assert.equal(m.validarRecepcion([{ detalleId: 'a', pedida: 10, recibida: 0 }]), 'recepcion_vacia');
  assert.equal(m.validarRecepcion([{ detalleId: 'a', pedida: 10, recibida: 4 }]), null);
  assert.equal(m.validarRecepcion([{ detalleId: 'a', pedida: 10, recibida: 11 }]), 'excede_pendiente');
  assert.equal(m.validarRecepcion([{ detalleId: 'a', pedida: 10, recibida: -1 }]), 'cantidad_invalida');
});
