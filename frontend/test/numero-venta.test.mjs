/**
 * numero-venta.test.mjs
 *
 * Identificador visible de venta (src/utils/numeroVenta.ts): «V-3» y variantes se convierten al
 * número que consulta el backend. Función pura; no usa red ni navegador.
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
  vm.runInNewContext(out, { module, exports: module.exports });
  return module.exports;
}

const { numeroVentaDesdeIdentificador: n } = load('src/utils/numeroVenta.ts');

test('acepta el identificador visible V-3 y sus variantes', () => {
  assert.equal(n('V-3'), '3');
  assert.equal(n('v-3'), '3');
  assert.equal(n('V3'), '3');
  assert.equal(n('V-00000003'), '3');
  assert.equal(n(' 3 '), '3');
  assert.equal(n('00000012'), '12');
});

test('deja sin cambios lo que no tiene formato de venta para que el backend responda', () => {
  assert.equal(n('V-0'), 'V-0');
  assert.equal(n('CT-01-0001'), 'CT-01-0001');
  assert.equal(n('abc'), 'ABC');
  assert.equal(n(''), '');
});
