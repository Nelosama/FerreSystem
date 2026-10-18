import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Carga el módulo puro de formatos sin dependencias de React ni del navegador.
const cargar = (archivo) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: () => { throw new Error('dependencia inesperada'); } });
  return exports;
};
const f = cargar('src/utils/formatoImpresion.ts');

test('ofrece exactamente A4, rollo 80 mm y rollo 58 mm', () => {
  assert.equal(JSON.stringify(f.FORMATOS_IMPRESION.map(x => x.valor)), '["A4","ROLLO_80MM","ROLLO_58MM"]');
});

test('A4 usa la hoja estándar; el rollo usa el ancho físico del papel', () => {
  assert.equal(f.tamanoPaginaRecibo('A4', 10), 'A4');
  assert.equal(f.tamanoPaginaRecibo(undefined, 10), 'A4');
  const [ancho80] = f.tamanoPaginaRecibo('ROLLO_80MM', 5);
  const [ancho58] = f.tamanoPaginaRecibo('ROLLO_58MM', 5);
  assert.ok(Math.abs(ancho80 - 226.77) < 0.01);
  assert.ok(Math.abs(ancho58 - 164.41) < 0.01);
});

test('el alto del rollo crece con las líneas y nunca baja del mínimo', () => {
  const [, pocas] = f.tamanoPaginaRecibo('ROLLO_80MM', 1);
  const [, muchas] = f.tamanoPaginaRecibo('ROLLO_80MM', 40);
  assert.equal(pocas, 360);
  assert.ok(muchas > pocas);
});

test('el ticket en pantalla respeta el ancho del papel', () => {
  assert.equal(JSON.stringify(f.anchoTicketCss('ROLLO_80MM')), '{"width":"80mm","maxWidth":"80mm"}');
  assert.equal(JSON.stringify(f.anchoTicketCss('ROLLO_58MM')), '{"width":"58mm","maxWidth":"58mm"}');
  assert.equal(f.anchoTicketCss('A4').maxWidth, '210mm');
});

test('CSS térmico usa dos longitudes válidas y comparte la estimación de alto del PDF', () => {
  for (const [formato, ancho] of [['ROLLO_80MM', 80], ['ROLLO_58MM', 58]]) {
    const size = f.tamanoPaginaImpresion(formato, 3);
    assert.match(size, new RegExp(`^${ancho}mm [0-9.]+mm$`));
    const [, alto] = f.tamanoPaginaRecibo(formato, 25);
    assert.equal(size, `${ancho}mm ${(alto * 25.4 / 72).toFixed(2)}mm`);
    assert.notEqual(f.tamanoPaginaImpresion(formato, 3), f.tamanoPaginaImpresion(formato, 100));
  }
  assert.equal(f.tamanoPaginaImpresion('A4', 100), 'A4');
});
