import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// La regla de longitud mínima (nota, motivo) es el mismo archivo en backend y frontend. Estos vectores se comparten con la prueba del
// backend (backend/test/contingencia-texto-minimo.postgres.integration.ts lee este mismo archivo) para que la interfaz aplique exactamente
// la validación del servidor.
const codigo = ts.transpileModule(fs.readFileSync('src/utils/textoMinimo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} };
new Function('exports', 'module', codigo)(modulo.exports, modulo);
const { validarTextoMinimo, mensajeTextoMinimo, VISIBLES_MINIMOS } = modulo.exports;
const vectores = JSON.parse(fs.readFileSync('test/fixtures/texto-minimo-vectores.json', 'utf8'));

for (const v of vectores.casos) {
  test(`texto mínimo: ${v.descripcion}`, () => {
    const r = validarTextoMinimo(v.texto, v.minimo);
    assert.equal(r.ok, v.ok, JSON.stringify(r));
  });
}

test('texto mínimo: el mensaje es el mismo que devuelve el servidor y nombra la regla completa', () => {
  assert.equal(VISIBLES_MINIMOS, 3);
  assert.equal(mensajeTextoMinimo(10), 'Escriba al menos 10 caracteres (los espacios cuentan) y al menos 3 letras, números o símbolos visibles.');
});

test('texto mínimo: la página de administración usa la regla compartida y no un recuento propio', () => {
  const pagina = fs.readFileSync('src/pages/ContingenciaAdminPage.tsx', 'utf8');
  assert.match(pagina, /validarTextoMinimo\(nota, 10\)/);
  assert.match(pagina, /validarTextoMinimo\(reg\.motivo, 20\)/);
  assert.doesNotMatch(pagina, /nota\.length|motivo\.trim\(\)\.length/);
});
