import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = fs.existsSync('src/utils/compraCosto.ts') ? 'src/utils/compraCosto.ts' : 'frontend/src/utils/compraCosto.ts';
const ctx = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, ctx);
const { validarLineaCompra, costoSugerido } = ctx.exports;

test('FS-08: costo vacío se rechaza con mensaje (no se convierte en 0)', () => {
  assert.match(validarLineaCompra('1', '').error, /costo/i);
  assert.match(validarLineaCompra('1', '  ').error, /costo/i);
});
test('FS-08: costo 0 explícito, decimales y cantidades válidas', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(validarLineaCompra('2.5', '0'))), { linea: { cantidad: 2.5, costo: 0 } });
  assert.deepEqual(JSON.parse(JSON.stringify(validarLineaCompra('3', '12.34'))), { linea: { cantidad: 3, costo: 12.34 } });
});
test('FS-08: rechaza >2 decimales, negativos y cantidad no positiva', () => {
  assert.ok(validarLineaCompra('1', '12.345').error);
  assert.ok(validarLineaCompra('1', '-1').error);
  assert.ok(validarLineaCompra('0', '5').error);
  assert.ok(validarLineaCompra('abc', '5').error);
});
test('FS-08: costo sugerido se redondea a centavos y es vacío si no existe', () => {
  assert.equal(costoSugerido('12.5000'), '12.5');
  assert.equal(costoSugerido(10.126), '10.13');
  assert.equal(costoSugerido(null), '');
  assert.equal(costoSugerido(undefined), '');
});
