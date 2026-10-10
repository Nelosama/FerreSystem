import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const key = 'ferre_pending_return:tenant-A:user-A';
const storage = () => {
  const values = new Map();
  return { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) };
};
const request = (id = 'request-A', estado = 'AUTORIZADA') => ({
  id, estado, solicitante_id: 'user-A', numero_venta: 1, created_at: '2026-10-05T10:00:00Z',
  comando: { motivo: 'Devolver', metodo: 'EFECTIVO' }, monto_estimado: 10, total_venta: 10,
});
const receipt = { id: 'request-A', monto: 10, credito_cancelado: 0, reembolso: 10, metodo: 'EFECTIVO' };
const rejected = status => ({ response: { status, data: { message: 'Operación rechazada' } } });

// Ejecuta los handlers reales con hooks, transporte y almacenamiento en memoria.
const harness = (saved, api, role = 'ADMIN') => {
  let cursor = 0, root;
  const states = [], dependencies = [], queued = [], cleanups = [];
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; return states[i] ?? (states[i] = { current: initial }); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!dependencies[i] || deps.some((value, index) => value !== dependencies[i][index])) {
        dependencies[i] = deps; queued.push([i, fn]);
      }
    },
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; },
  };
  const mocks = {
    react: { ...react, default: react, __esModule: true },
    '../components/TopBar': { TopBar: 'TopBar' },
    '../context/TenantContext': { useTenant: () => ({ tenant: { id: 'tenant-A' }, user: { id: 'user-A', rol: role }, isReadOnly: false }) },
    '../utils/api': { api }, '../utils/format': { formatLempiras: String, formatInstanteNegocio: String }, './OperacionesPage.css': {},
  };
  const source = fs.readFileSync('src/pages/DevolucionesPage.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const context = { exports: {}, localStorage: saved, crypto: webcrypto, require: name => {
    assert.ok(name in mocks, `Dependencia inesperada: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(code, context);
  const component = context.exports.DevolucionesPage;
  const nodes = () => {
    const found = [];
    const walk = node => { if (!node || typeof node !== 'object') return; found.push(node); (node.children || []).forEach(walk); };
    walk(root); return found;
  };
  return {
    render() { cursor = 0; root = component(); },
    find(text) { return nodes().find(node => node.children.includes(text)); },
    async settle() {
      this.render();
      for (const [i, fn] of queued.splice(0)) { cleanups[i]?.(); cleanups[i] = fn(); }
      await new Promise(resolve => setImmediate(resolve));
      this.render();
    },
    async click(text) { this.find(text).props.onClick(); await new Promise(resolve => setImmediate(resolve)); await this.settle(); },
  };
};

test('una decisión concurrente recupera al ganador y permite revisar otras solicitudes', async () => {
  const saved = storage();
  saved.setItem(key, JSON.stringify({ kind: 'DECIDIR', requestId: 'request-A', dto: { decision: 'AUTORIZADA', motivo: 'Aprobar' } }));
  let posts = 0;
  const page = harness(saved, {
    get: async url => ({ data: url.endsWith('/request-A') ? { ...request(), administrador_id: 'other-admin' } : [request('request-B', 'PENDIENTE')] }),
    post: async () => { posts++; throw rejected(409); },
  });
  await page.settle(); await page.click('Consultar y confirmar pendiente');
  assert.equal(posts, 1);
  assert.equal(saved.getItem(key), null);
  assert.equal(page.find('Autorizar estos productos y cantidades').props.disabled, false);
});

test('una decisión inválida comprobada permite corregir el motivo con el mismo identificador', async () => {
  const saved = storage();
  saved.setItem(key, JSON.stringify({ kind: 'DECIDIR', requestId: 'request-A', dto: { decision: 'AUTORIZADA', motivo: ' ' } }));
  const urls = [];
  const page = harness(saved, {
    get: async url => ({ data: url.endsWith('/request-A') ? request('request-A', 'PENDIENTE') : [request('request-A', 'PENDIENTE')] }),
    post: async url => { urls.push(url); throw rejected(400); },
  });
  await page.settle(); await page.click('Consultar y confirmar pendiente');
  assert.equal(saved.getItem(key), null);
  assert.equal(page.find('Autorizar estos productos y cantidades').props.disabled, false);
  assert.deepEqual(urls, ['/operaciones/solicitudes-devolucion/request-A/decision']);
});

test('una ejecución rechazada conserva la solicitud durable y el siguiente intento usa su identidad', async () => {
  const saved = storage(), urls = [];
  saved.setItem(key, JSON.stringify({ kind: 'EJECUTAR', requestId: 'request-A' }));
  const page = harness(saved, {
    get: async url => ({ data: url.endsWith('/request-A') ? { ...request(), resultado: null } : [request()] }),
    post: async url => { urls.push(url); if (urls.length === 1) throw rejected(400); return { data: receipt }; },
  }, 'CAJERO');
  await page.settle(); await page.click('Consultar y confirmar pendiente');
  assert.equal(saved.getItem(key), null);
  assert.equal(page.find('Buscar venta').props.disabled, false);
  await page.click('Confirmar devolución y reembolso');
  assert.deepEqual(urls, Array(2).fill('/operaciones/solicitudes-devolucion/request-A/ejecutar'));
  assert.equal(JSON.parse(saved.getItem(key)).requestId, 'request-A');
  assert.ok(page.find('Devolución registrada'));
});

test('un rechazo del reintento recupera la ejecución anterior antes de liberar el pendiente', async () => {
  const saved = storage(); saved.setItem(key, JSON.stringify({ kind: 'EJECUTAR', requestId: 'request-A' }));
  let lookups = 0, posts = 0;
  const page = harness(saved, {
    get: async url => ({ data: url.endsWith('/request-A')
      ? { ...request(), estado: ++lookups === 1 ? 'AUTORIZADA' : 'EJECUTADA', resultado: lookups === 1 ? null : receipt }
      : [] }),
    post: async () => { posts++; throw rejected(403); },
  });
  await page.settle(); await page.click('Consultar y confirmar pendiente');
  assert.equal(posts, 1);
  assert.ok(saved.getItem(key));
  assert.ok(page.find('Devolución registrada'));
  await page.click('Cerrar comprobante');
  assert.equal(saved.getItem(key), null);
});

test('si la consulta posterior no permite comprobar el estado conserva el comando íntegro', async () => {
  for (const status of [403, 404, 500]) {
    const saved = storage();
    const command = { kind: 'DECIDIR', requestId: 'request-A', dto: { decision: 'AUTORIZADA', motivo: 'Aprobar' } };
    saved.setItem(key, JSON.stringify(command));
    let posts = 0;
    const page = harness(saved, {
      get: async url => { if (url.endsWith('/request-A')) throw rejected(status); return { data: [request('other', 'PENDIENTE')] }; },
      post: async () => { posts++; throw rejected(409); },
    });
    await page.settle(); await page.click('Consultar y confirmar pendiente');
    assert.equal(posts, 1);
    assert.equal(saved.getItem(key), JSON.stringify(command));
    assert.equal(page.find('Autorizar estos productos y cantidades').props.disabled, true);
  }
});

test('errores de red o servidor mantienen identidad y no se tratan como rechazo definitivo', async () => {
  for (const error of [new Error('Network Error'), rejected(500)]) {
    const saved = storage();
    const command = { kind: 'EJECUTAR', requestId: 'request-A' }; saved.setItem(key, JSON.stringify(command));
    let lookups = 0, posts = 0;
    const page = harness(saved, {
      get: async url => { if (url.endsWith('/request-A')) { lookups++; return { data: { ...request(), resultado: null } }; } return { data: [] }; },
      post: async () => { posts++; throw error; },
    });
    await page.settle(); await page.click('Consultar y confirmar pendiente');
    assert.equal(posts, 1); assert.equal(lookups, 1);
    assert.equal(saved.getItem(key), JSON.stringify(command));
  }
});

test('cerrar un comprobante histórico durante la corrección conserva el pendiente distinto', async () => {
  const saved = storage();
  const command = { kind: 'SOLICITAR', requestId: 'request-B', saleId: 'sale-B', dto: { solicitudId: 'request-B', motivo: 'Cambio', metodo: 'EFECTIVO', items: [] } };
  saved.setItem(key, JSON.stringify(command));
  let posts = 0;
  const page = harness(saved, {
    get: async url => {
      if (url.endsWith('/request-B')) throw rejected(404);
      return { data: url.endsWith('/request-A') ? { resultado: receipt } : [request('request-A', 'EJECUTADA')] };
    },
    post: async () => { posts++; },
  });
  await page.settle(); await page.click('Corregir solo si no está registrada');
  assert.equal(page.find('Ver comprobante').props.disabled, false);
  await page.click('Ver comprobante'); await page.click('Cerrar comprobante');
  assert.equal(posts, 0);
  assert.equal(saved.getItem(key), JSON.stringify(command));
  assert.ok(page.find('Consultar y confirmar pendiente'));
  assert.equal(page.find('Buscar venta').props.disabled, false);
});

test('cerrar un comprobante no borra el comando que otra pestaña guardó después', async () => {
  const saved = storage(); saved.setItem(key, JSON.stringify({ kind: 'EJECUTAR', requestId: 'request-A' }));
  const page = harness(saved, {
    get: async url => ({ data: url.endsWith('/request-A') ? { ...request('request-A', 'EJECUTADA'), resultado: receipt } : [] }),
    post: async () => { assert.fail('El comprobante confirmado no necesita POST'); },
  });
  await page.settle(); await page.click('Consultar y confirmar pendiente');
  const other = { kind: 'EJECUTAR', requestId: 'request-B' }; saved.setItem(key, JSON.stringify(other));
  await page.click('Cerrar comprobante');
  assert.equal(saved.getItem(key), JSON.stringify(other));
  assert.ok(page.find('Consultar y confirmar pendiente'));
});
