/**
 * color-hex.test.mjs
 *
 * Validación del color de marca (src/utils/colorHex.ts): solo #RRGGBB con seis dígitos hexadecimales.
 * Función pura; la prueba no usa navegador.
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

const { errorColorHex } = load('src/utils/colorHex.ts');

test('acepta colores #RRGGBB en mayúsculas o minúsculas, con espacios laterales', () => {
  assert.equal(errorColorHex('#EA580C'), null);
  assert.equal(errorColorHex('#ea580c'), null);
  assert.equal(errorColorHex('  #0284C7 '), null);
});

test('rechaza formatos incompletos, con caracteres no hexadecimales o sin numeral', () => {
  for (const malo of ['#EA58', '#EA580', '#EA580CC', 'EA580C', '#GG0000', '#12345G', 'red', 'rgb(1,2,3)', '#12 456']) {
    assert.notEqual(errorColorHex(malo), null, `debía rechazar ${malo}`);
  }
});

test('un campo vacío pide un color en lugar de aceptarlo', () => {
  assert.notEqual(errorColorHex(''), null);
  assert.notEqual(errorColorHex('   '), null);
});
