import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/utils/montoEnLetras.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { montoEnLetras } = exports;
test('cantidad en letras de documentos de venta', () => {
  const casos = {
    0: 'CERO LEMPIRAS CON 00/100', 100: 'UN LEMPIRA CON 00/100', 2150: 'VEINTIÚN LEMPIRAS CON 50/100',
    11500: 'CIENTO QUINCE LEMPIRAS CON 00/100', 10000: 'CIEN LEMPIRAS CON 00/100', 10349: 'CIENTO TRES LEMPIRAS CON 49/100',
    231852: 'DOS MIL TRESCIENTOS DIECIOCHO LEMPIRAS CON 52/100', 100000: 'UN MIL LEMPIRAS CON 00/100',
    4599999: 'CUARENTA Y CINCO MIL NOVECIENTOS NOVENTA Y NUEVE LEMPIRAS CON 99/100',
    100000000: 'UN MILLÓN DE LEMPIRAS CON 00/100', 250010001: 'DOS MILLONES QUINIENTOS MIL CIEN LEMPIRAS CON 01/100',
  };
  for (const [c, texto] of Object.entries(casos)) assert.equal(montoEnLetras(Number(c)), texto, c);
  assert.throws(() => montoEnLetras(-1));
});
