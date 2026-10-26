import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = 'src/utils/preciosCarrito.ts';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { aplicarPreciosVigentes } = context.exports;

const carrito = [
  { productoId: 'a', nombre: 'Martillo', precioUnitario: 100, cantidad: 2 },
  { productoId: 'b', nombre: 'Clavos', precioUnitario: 12.5, cantidad: 10 },
];

test('un cambio de precio del Admin actualiza la línea y conserva cantidades', () => {
  const r = aplicarPreciosVigentes(carrito, [{ id: 'a', precioVenta: 110.25 }, { id: 'b', precioVenta: 12.5 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(r.cambios)), [{ productoId: 'a', nombre: 'Martillo', anterior: 100, nuevo: 110.25 }]);
  assert.equal(r.carrito[0].precioUnitario, 110.25);
  assert.equal(r.carrito[0].cantidad, 2);
  assert.equal(r.carrito[1], carrito[1]);
  assert.deepEqual(carrito[0].precioUnitario, 100, 'no muta el carrito original');
});

test('sin cambios devuelve el mismo arreglo (no reescribe el borrador)', () => {
  const r = aplicarPreciosVigentes(carrito, [{ id: 'a', precioVenta: 100.001 }, { id: 'b', precioVenta: 12.5 }]);
  assert.equal(r.carrito, carrito);
  assert.equal(r.cambios.length, 0);
  assert.equal(r.noDisponibles.length, 0);
});

test('un producto que salió del catálogo de venta se informa y no recibe precio', () => {
  const r = aplicarPreciosVigentes(carrito, [{ id: 'b', precioVenta: 13 }]);
  assert.deepEqual([...r.noDisponibles], ['Martillo']);
  assert.equal(r.carrito[0].precioUnitario, 100);
  assert.equal(r.carrito[1].precioUnitario, 13);
});
