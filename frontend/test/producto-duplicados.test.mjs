/**
 * producto-duplicados.test.mjs
 *
 * Advertencia de nombres de producto posiblemente duplicados (src/utils/productoDuplicados.ts).
 * Función pura: ignora mayúsculas, acentos y espacios repetidos; no bloquea nada.
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

const { posiblesDuplicados } = load('src/utils/productoDuplicados.ts');
const catalogo = [
  { codigo: 'MAR-001', nombre: 'Martillo de uña 16 oz' },
  { codigo: 'TOR-001', nombre: 'Tornillo 2"' },
  { codigo: 'MAR-002', nombre: 'Martillo de Uña 16 oz' },
];

test('encuentra nombres iguales sin distinguir mayúsculas, acentos ni espacios repetidos', () => {
  const encontrados = posiblesDuplicados('  MARTILLO   de uña 16  OZ ', catalogo);
  assert.equal(encontrados.map(p => p.codigo).join(','), 'MAR-001,MAR-002');
});

test('no advierte por nombres distintos ni por texto vacío', () => {
  assert.equal(posiblesDuplicados('Martillo', catalogo).length, 0);
  assert.equal(posiblesDuplicados('   ', catalogo).length, 0);
});

test('limita la lista de coincidencias mostradas', () => {
  const muchos = Array.from({ length: 5 }, (_, i) => ({ codigo: `X-${i}`, nombre: 'Clavo' }));
  assert.equal(posiblesDuplicados('clavo', muchos).length, 3);
});
