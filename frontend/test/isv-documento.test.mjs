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
const web = cargar('src/utils/isv-documento.ts');

test('espejo idéntico al servidor (salvo el import de redondeo)', () => {
  const quitar = (s) => s.replace(/^\/\/.*\n/gm, '').replace(/^import .*\n/m, '').replace(/^const mitadArriba.*\n/m, '').replace(/divisionMitadArriba/g, 'mitadArriba').trim();
  assert.equal(quitar(fs.readFileSync('src/utils/isv-documento.ts', 'utf8')), quitar(fs.readFileSync('../backend/src/common/isv-documento.ts', 'utf8')));
});

test('vista previa de cotización: ISV una vez sobre la base gravada', () => {
  const l = (c, exento = false) => ({ subtotalCentavos: c, exento });
  assert.equal(web.isvDocumentoCentavos([l(173465), l(165384), l(125625), l(95672), l(329690)], 53833, 15), 125400);
  assert.equal(web.isvDocumentoCentavos([l(201610)], 0, 15), 30242);
  assert.equal(web.isvDocumentoCentavos([l(10000), l(10000, true)], 2000, 15), 1350);
  assert.equal(web.isvDocumentoCentavos([], 0, 15), 0);
});
