/**
 * color-marca.test.mjs
 *
 * Variantes legibles del color de marca (src/utils/colorMarca.ts): el color del negocio se conserva en fondos;
 * el texto encima y el texto de marca sobre superficies claras cumplen 4.5:1. Función pura, sin navegador.
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
  vm.runInNewContext(out, { module, exports: module.exports, Math, Number, String, parseInt });
  return module.exports;
}

const { contraste, colorSobreMarca, colorMarcaTexto, variantesMarca, evaluarColorMarca, mezclar, TEXTO_CLARO, TEXTO_OSCURO } = load('src/utils/colorMarca.ts');

const MARCAS = ['#1D4ED8', '#F5C400', '#EA580C', '#16A34A', '#0284C7', '#DC2626', '#7C3AED', '#FFFFFF', '#000000', '#FDE047', '#22D3EE', '#0F766E'];

test('contraste WCAG: blanco/negro 21:1 y mismo color 1:1', () => {
  assert.equal(Math.round(contraste('#FFFFFF', '#000000')), 21);
  assert.equal(contraste('#1D4ED8', '#1D4ED8'), 1);
  // Valores medidos en la evaluación: blanco sobre azul 6.70 y sobre amarillo 1.64.
  assert.equal(Math.round(contraste('#FFFFFF', '#1D4ED8') * 100) / 100, 6.7);
  assert.equal(Math.round(contraste('#FFFFFF', '#F5C400') * 100) / 100, 1.64);
});

test('marcas oscuras conservan el texto blanco y su propio color para texto', () => {
  assert.equal(colorSobreMarca('#1D4ED8'), TEXTO_CLARO);
  assert.equal(colorMarcaTexto('#1D4ED8'), '#1D4ED8');
  assert.equal(colorMarcaTexto('#0f766e'), '#0F766E');
});

test('marcas claras usan texto oscuro encima y un tono oscurecido para texto', () => {
  assert.equal(colorSobreMarca('#F5C400'), TEXTO_OSCURO);
  const texto = colorMarcaTexto('#F5C400');
  assert.notEqual(texto, '#F5C400');
  assert.ok(contraste(texto, '#FFFFFF') >= 4.5);
});

test('naranja predeterminado (#EA580C): el blanco no alcanza 4.5:1 y se elige el texto de mayor contraste', () => {
  assert.ok(contraste(TEXTO_CLARO, '#EA580C') < 4.5);
  assert.equal(colorSobreMarca('#EA580C'), TEXTO_OSCURO);
});

test('para cualquier marca, texto encima y texto de marca cumplen el mínimo sobre las superficies claras', () => {
  for (const marca of MARCAS) {
    const v = variantesMarca(marca);
    assert.ok(contraste(v.sobrePrimario, v.primario) >= 4.5, `${marca}: texto encima ${v.sobrePrimario}`);
    for (const fondo of ['#FFFFFF', '#F4F5F7', mezclar(marca, '#FFFFFF', 0.12)]) {
      assert.ok(contraste(v.texto, fondo) >= 4.5, `${marca}: texto sobre ${fondo} = ${contraste(v.texto, fondo)}`);
    }
  }
});

test('hover y activo no pierden contraste con el texto encima', () => {
  for (const marca of MARCAS) {
    const v = variantesMarca(marca);
    assert.ok(contraste(v.sobrePrimario, v.hover) >= 4.5, `${marca}: hover ${v.hover}`);
  }
});

test('un color no válido usa el naranja predeterminado sin lanzar errores', () => {
  const v = variantesMarca('rojo');
  assert.equal(v.primario, '#EA580C');
  assert.equal(evaluarColorMarca('rojo'), null);
});

test('evaluación para el aviso de configuración', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(evaluarColorMarca('#1D4ED8'))), { contrasteBlanco: 6.7, textoOscuroEncima: false, textoDeMarcaAjustado: false, colorTexto: '#1D4ED8' });
  const amarillo = evaluarColorMarca('#F5C400');
  assert.equal(amarillo.textoOscuroEncima, true);
  assert.equal(amarillo.textoDeMarcaAjustado, true);
  assert.equal(amarillo.contrasteBlanco, 1.64);
});
