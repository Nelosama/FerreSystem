/**
 * pos-catalogo.test.mjs
 *
 * Índice del catálogo del POS (src/utils/posCatalogo.ts). Comprueba que el filtro de texto y la búsqueda
 * por código exacto (Enter o escáner) devuelven exactamente lo mismo que el filtrado lineal que usaba
 * POSPage antes de indexar, en el mismo orden. Función pura; no usa red ni navegador.
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

const { indexarCatalogo, filtrarCatalogo, buscarPorCodigo } = load('src/utils/posCatalogo.ts');
// Los arreglos del módulo viven en otro contexto de vm: se copian para compararlos.
const ids = (productos) => Array.from(productos, (p) => p.id);

// Referencias: copia literal de las expresiones que tenía POSPage.tsx.
const filtroAnterior = (productos, search) => productos.filter((p) =>
  p.nombre.toLowerCase().includes(search.toLowerCase()) ||
  p.codigo.toLowerCase().includes(search.toLowerCase()) ||
  p.codigoBarras?.includes(search) || p.codigoFabricante?.toLowerCase().includes(search.toLowerCase()) || p.descripcion?.toLowerCase().includes(search.toLowerCase()));
const codigoAnterior = (productos, code) => productos.filter((p) =>
  [p.codigo, p.codigoBarras, p.codigoFabricante].some((c) => c?.toUpperCase() === code.toUpperCase()));

const catalogo = [
  { id: '1', codigo: 'MAR-01', nombre: 'Martillo de uña', codigoBarras: '7401234567890', codigoFabricante: 'Tr-16', descripcion: 'Mango de FIBRA' },
  { id: '2', codigo: 'cla-2', nombre: 'Clavo 2"', codigoBarras: null, codigoFabricante: undefined, descripcion: null },
  { id: '3', codigo: 'PIN-5', nombre: 'Pintura blanca', codigoBarras: 'ABC-pin', codigoFabricante: 'PIN-5', descripcion: 'Galón' },
  { id: '4', codigo: 'DUP', nombre: 'Tubo PVC', codigoBarras: 'X1', codigoFabricante: null, descripcion: undefined },
  { id: '5', codigo: 'X1', nombre: 'Codo PVC', codigoBarras: null, codigoFabricante: null, descripcion: 'Codo 90' },
];

test('el filtro de texto coincide con el filtrado anterior en contenido y orden', () => {
  const indice = indexarCatalogo(catalogo);
  for (const s of ['', 'm', 'MAR', 'mar-01', 'uña', 'fibra', 'tr-16', '7401', 'abc-PIN', 'ABC-pin', 'pvc', 'x1', '2"', 'galón', 'sin coincidencias']) {
    assert.deepEqual(ids(filtrarCatalogo(indice, s)), filtroAnterior(catalogo, s).map((p) => p.id), `búsqueda «${s}»`);
  }
});

test('la búsqueda por código exacto coincide con la anterior, sin duplicar un producto con códigos repetidos', () => {
  const indice = indexarCatalogo(catalogo);
  for (const c of ['MAR-01', 'mar-01', '7401234567890', 'tr-16', 'CLA-2', 'pin-5', 'abc-PIN', 'X1', 'x1', 'DUP', '7401', '']) {
    assert.deepEqual(ids(buscarPorCodigo(indice, c)), codigoAnterior(catalogo, c).map((p) => p.id), `código «${c}»`);
  }
  // PIN-5 es a la vez código y código de fabricante del mismo producto: un solo resultado, no «código ambiguo».
  assert.equal(buscarPorCodigo(indice, 'PIN-5').length, 1);
  // X1 es código de barras de un producto y código interno de otro: sigue siendo ambiguo.
  assert.equal(buscarPorCodigo(indice, 'x1').length, 2);
});

test('catálogo grande: misma respuesta que el filtrado lineal', () => {
  const grande = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), codigo: `C-${i}`, nombre: `Producto ${i % 7 ? 'tornillo' : 'Clavo'}`,
    codigoBarras: i % 3 ? String(7400000000000 + i) : null, codigoFabricante: i % 5 ? `F${i}` : null, descripcion: i % 2 ? `Desc ${i}` : null }));
  const indice = indexarCatalogo(grande);
  for (const s of ['clavo', 'C-29', '74000000001', 'f12', 'desc 9']) {
    assert.deepEqual(ids(filtrarCatalogo(indice, s)), filtroAnterior(grande, s).map((p) => p.id));
  }
  for (const c of ['c-2999', '7400000000001', 'F14', 'no-existe']) {
    assert.deepEqual(ids(buscarPorCodigo(indice, c)), codigoAnterior(grande, c).map((p) => p.id));
  }
});
