import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = fs.readFileSync('src/utils/unidadMedida.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { normalizarUnidadMedida, unidadCsvValida, UNIDADES_INVENTARIO } = exports;

test('CSV admite las doce unidades del inventario y conserva cada identidad', () => {
  assert.equal(UNIDADES_INVENTARIO.length, 12);
  for (const unidad of UNIDADES_INVENTARIO) {
    assert.equal(unidadCsvValida(unidad.toLowerCase()), true, unidad);
    assert.equal(normalizarUnidadMedida(unidad), unidad);
  }
});
test('galón, galon y aliases previos se normalizan sin reinterpretar cantidades', () => {
  for (const [entrada, api] of [['galón', 'GALON'], ['galon', 'GALON'], ['Gallon', 'GALON'], ['foot', 'PIE'], ['lb', 'LIBRA'], ['metro_cúbico', 'METRO_CUBICO']]) {
    assert.equal(unidadCsvValida(entrada), true);
    assert.equal(normalizarUnidadMedida(entrada), api);
  }
});
test('unidad desconocida y vacía no pasan la validación', () => {
  for (const valor of ['tonelada', '', 'm2', '1']) assert.equal(unidadCsvValida(valor), false);
});

const modalHarness = (rawRows = []) => {
  let cursor = 0;
  const states = [], posts = [], blobs = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], next => { states[i] = next; }]; },
    useEffect() {},
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; },
  };
  const mocks = {
    react,
    papaparse: { parse(file, config) { config.complete({ data: rawRows, errors: [] }); } },
    'lucide-react': {},
    '../hooks/useRubroConfig': { useRubroConfig: () => ({ unidadesMedida: ['unidad', 'caja', 'metro', 'kg', 'galón'], categoriasDefault: ['General'] }) },
    '../context/I18nContext': { useI18n: () => ({ t: key => key }) },
    '../utils/unidadMedida': exports,
    '../utils/api': { api: { post: async (url, data) => { posts.push(data); return { data: { id: 'p', version: 1, stockActual: data.stockActual } }; } } },
  };
  const context = { exports: {}, console, require: name => mocks[name],
    Blob: class { constructor(parts) { blobs.push(parts.join('')); } },
    URL: { createObjectURL: () => 'test:blob' },
    document: { createElement: () => ({ setAttribute() {}, click() {} }), body: { appendChild() {}, removeChild() {} } },
  };
  const file = 'src/components/ImportarProductosModal.tsx';
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context);
  const render = () => {
    cursor = 0; const nodes = [];
    const walk = node => { if (node && typeof node === 'object') { nodes.push(node); node.children.forEach(walk); } };
    walk(context.exports.ImportarProductosModal({ isOpen: true, onClose() {} }));
    return nodes;
  };
  const contenido = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(contenido).join('');
  return { render, posts, blobs, contenido };
};

test('el modal importa las doce unidades aunque el rubro tenga solo cinco, conservando cantidades', async () => {
  const h = modalHarness(UNIDADES_INVENTARIO.map((unidad, i) => ({ nombre: 'Producto real', codigo: `REAL-${i}`,
    categoria: 'General', precioCosto: '8', precioVenta: '12', stockActual: '0', stockMinimo: '5', unidadMedida: unidad })));
  h.render().find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [{ name: 'inventario.csv', size: 100 }] } });
  const boton = h.render().find(node => node.type === 'button' && h.contenido(node).includes('Importar 12 productos válidos'));
  assert.ok(boton);
  await boton.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.posts.length, 12);
  for (let i = 0; i < 12; i++) {
    assert.equal(h.posts[i].unidadMedida, UNIDADES_INVENTARIO[i]);
    assert.equal(h.posts[i].stockActual, 0);
  }
});

test('la plantilla descargada tiene solo encabezados y ninguna fila ficticia', () => {
  const h = modalHarness();
  h.render().find(node => node.type === 'button' && h.contenido(node).includes('inventory.download_template')).props.onClick();
  assert.equal(h.blobs.length, 1);
  assert.equal(h.blobs[0].trim().split('\n').length, 1);
  assert.ok(h.blobs[0].includes('stockActual'));
  assert.ok(!h.blobs[0].includes('COD-001'));
});
