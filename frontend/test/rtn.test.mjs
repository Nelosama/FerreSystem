import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const cargar = (file) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, () => { throw new Error('sin dependencias'); });
  return exports;
};
const web = cargar('src/utils/rtn.ts');

// Etapa 4: la pantalla y el servidor aplican la misma regla de RTN.
test('RTN válido con o sin separadores; vacío es «no pedido»', () => {
  for (const v of ['08011999000001', '0801-1999-000001', ' 0801 1999 000001 ']) assert.deepEqual(web.revisarRtn(v), { valido: true, digitos: '08011999000001' });
  for (const v of ['', '   ', null, undefined]) assert.deepEqual(web.revisarRtn(v), { valido: true, digitos: null });
});

test('RTN mal escrito: 13 o 15 dígitos, letras u otros separadores', () => {
  for (const v of ['0801199900000', '080119990000011', 'abc', '0801199900000A', '0801.1999.000001', '- -']) assert.equal(web.rtnValidoOVacio(v), false);
});
