import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import * as icons from 'lucide-react';

const tenant = { id: 'test', nombreComercial: 'Test' };
let user = { id: 'admin', rol: 'ADMIN' };
const load = (file) => {
  const exports = {};
  const require = name => {
    if (name === 'react') return React;
    if (name === 'lucide-react') return icons;
    if (name === 'react-router-dom') return router;
    if (name.endsWith('I18nContext')) return { useI18n: () => ({ t: path => { let value = JSON.parse(fs.readFileSync('src/locales/es.json', 'utf8')); for (const key of path.split('.')) value = value?.[key]; return value || path; } }) };
    if (name.endsWith('modulesCatalog')) return load('src/config/modulesCatalog.ts');
    if (name.endsWith('TenantContext')) return { useTenant: () => ({ user, tenant }) };
    if (name.endsWith('navigation')) return load('src/config/navigation.ts');
    if (name.endsWith('taskNavigation')) return load('src/utils/taskNavigation.ts');
    throw new Error(`Unexpected import ${name}`);
  };
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require });
  return exports;
};
const { availableTasks, searchTasks, priorityTasks, canNavigate, groupNavigation } = load('src/utils/taskNavigation.ts');

test('roles comparten categorías, excluyen pendientes y reciben hasta cuatro tareas', () => {
  for (const rol of ['SUPERADMIN', 'ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO']) {
    const tasks = availableTasks({ rol }, tenant);
    assert.ok(priorityTasks({ rol }, tenant).length <= 4);
    assert.deepEqual(groupNavigation(tasks).flatMap(group => group.items.map(item => item.key)), tasks.map(item => item.key));
    assert.ok(tasks.every(item => !['apartados', 'transferencias', 'garantias', 'pedidos_especiales', 'listas_precio'].includes(item.key)));
    if (rol === 'SUPERADMIN') assert.deepEqual(Array.from(tasks, item => item.key), ['superadmin']);
  }
  assert.deepEqual(Array.from(priorityTasks({ rol: 'CAJERO' }, tenant), item => item.key), ['arqueo_caja', 'pos', 'cuentas', 'clientes']);
  assert.ok(availableTasks({ rol: 'BODEGUERO' }, tenant).every(item => !['pos', 'clientes', 'usuarios'].includes(item.key)));
});

test('permiso ausente se rechaza y Clientes y Caja son funciones base', () => {
  const item = { allowedRoles: ['VENDEDOR'], requiredPermiso: 'special.read' };
  assert.equal(canNavigate(item, { rol: 'VENDEDOR' }, tenant), false);
  assert.equal(canNavigate(item, { rol: 'VENDEDOR', permisos: ['special.read'] }, tenant), true);
  const keys = availableTasks({ rol: 'CAJERO' }, { ...tenant, modulosHabilitados: [] }).map(item => item.key);
  assert.ok(keys.includes('clientes') && keys.includes('arqueo_caja'));
  assert.ok(!keys.includes('pos'));
});

test('búsqueda encuentra títulos ingleses traducidos', () => {
  const en = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));
  const translate = path => path.split('.').reduce((value, key) => value?.[key], en) || path;
  assert.equal(searchTasks(availableTasks({ rol: 'ADMIN' }, tenant), 'receive goods', translate)[0].key, 'ordenes_compra');
});

test('admin encuentra compras, personal y reportes sin una lista de permisos explícita', () => {
  const tasks = availableTasks({ rol: 'ADMIN' }, tenant);
  assert.equal(searchTasks(tasks, 'comprar')[0].key, 'ordenes_compra');
  assert.equal(searchTasks(tasks, 'personal')[0].key, 'usuarios');
  assert.equal(searchTasks(tasks, 'reportes')[0].key, 'reportes');
});
test('cajero no recibe accesos de administrador ni módulos deshabilitados', () => {
  const tasks = availableTasks({ rol: 'CAJERO' }, { ...tenant, modulosHabilitados: [] });
  assert.equal(searchTasks(tasks, 'comprar').length, 0);
  assert.equal(searchTasks(tasks, 'personal').length, 0);
  assert.equal(searchTasks(tasks, 'vender').length, 0);
  assert.equal(searchTasks(tasks, 'caja')[0].key, 'arqueo_caja');
});
test('buscador tolera acentos, mayúsculas, espacios y combina palabras', () => {
  const tasks = availableTasks({ rol: 'ADMIN' }, tenant);
  assert.equal(searchTasks(tasks, '  COTIZACIÓN  ')[0].key, 'cotizaciones');
  assert.equal(searchTasks(tasks, 'recibir mercaderia')[0].key, 'ordenes_compra');
  assert.equal(searchTasks(tasks, 'xyz inexistente').length, 0);
});
test('tareas pendientes y sesiones sin usuario no ofrecen operaciones', () => {
  assert.equal(availableTasks(null, tenant).length, 0);
  assert.equal(availableTasks({ rol: 'ADMIN' }, tenant).some(item => item.key === 'apartados'), false);
});
test('inicio renderiza accesos por rol con React y enlaces reales del router', () => {
  const { TaskShortcuts, TaskFinder } = load('src/components/TaskFinder.tsx');
  user = { id: 'admin', rol: 'ADMIN' };
  const render = component => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(component)));
  const admin = render(TaskShortcuts);
  assert.match(admin, /Administrar el personal/);
  assert.match(admin, /href="\/ordenes-compra"/);
  assert.match(render(TaskFinder), /Buscar una pantalla o tarea/);
  user = { id: 'cashier', rol: 'CAJERO' };
  const cashier = render(TaskShortcuts);
  assert.match(cashier, /Primero abre la caja/);
  assert.doesNotMatch(cashier, /Administrar el personal/);
  assert.doesNotMatch(cashier, /href="\/inventario"/);
});
test('todas las rutas de App están dentro de Routes para evitar el fallo de arranque', () => {
  const source = ts.createSourceFile('App.tsx', fs.readFileSync('src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let routes = 0;
  const walk = node => {
    const tag = ts.isJsxSelfClosingElement(node) ? node.tagName.getText(source) : null;
    if (tag === 'Route') {
      routes++;
      assert.ok(ts.isJsxElement(node.parent));
      assert.equal(node.parent.openingElement.tagName.getText(source), 'Routes');
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  assert.ok(routes > 15);
});
