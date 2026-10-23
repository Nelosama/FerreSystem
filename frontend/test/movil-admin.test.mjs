/**
 * movil-admin.test.mjs
 *
 * Regla de la interfaz móvil del administrador (src/utils/movilAdmin.ts): no se ofrecen ventas, facturación, cobros,
 * devoluciones ni cierres de caja; sí inventario, compras, clientes, reportes y supervisión. Función pura.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, Set });
  return module.exports;
}

const m = load('src/utils/movilAdmin.ts');
const todos = ['dashboard', 'pos', 'apartados', 'pedidos_especiales', 'devoluciones', 'arqueo_caja', 'cuentas', 'cotizaciones', 'inventario', 'levantamiento', 'ordenes_compra', 'clientes', 'estado_cuenta_clientes', 'reportes', 'usuarios', 'admin_movil', 'contingencia_admin', 'entregas']
  .map(key => ({ key }));

test('en móvil un ADMIN no recibe ventas, cobros, devoluciones ni cierres de caja', () => {
  const claves = m.filtrarAccesosMovilAdmin(todos, { rol: 'ADMIN' }, true).map(i => i.key);
  for (const prohibido of ['pos', 'apartados', 'pedidos_especiales', 'devoluciones', 'arqueo_caja', 'cuentas']) assert.ok(!claves.includes(prohibido), prohibido);
  for (const permitido of ['dashboard', 'cotizaciones', 'inventario', 'levantamiento', 'ordenes_compra', 'clientes', 'estado_cuenta_clientes', 'reportes', 'usuarios', 'admin_movil', 'contingencia_admin', 'entregas']) assert.ok(claves.includes(permitido), permitido);
});

test('en escritorio o con otro rol la lista no cambia', () => {
  assert.equal(m.filtrarAccesosMovilAdmin(todos, { rol: 'ADMIN' }, false).length, todos.length);
  assert.equal(m.filtrarAccesosMovilAdmin(todos, { rol: 'CAJERO' }, true).length, todos.length);
  assert.equal(m.filtrarAccesosMovilAdmin(todos, null, true).length, todos.length);
});

test('no modifica la lista original', () => {
  const copia = todos.map(i => i.key);
  m.filtrarAccesosMovilAdmin(todos, { rol: 'ADMIN' }, true);
  assert.deepEqual(todos.map(i => i.key), copia);
});
