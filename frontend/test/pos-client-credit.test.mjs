import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

const evaluate = (file, mocks, globals = {}) => {
  const filePath = fs.existsSync(file) ? file : `frontend/${file}`;
  const context = { exports: {}, console, ...globals, require: (name) => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('/unidadMedida')) return evaluate('src/utils/unidadMedida.ts', {});
    if (name.endsWith('/numeroCliente')) return evaluate('src/utils/numeroCliente.ts', {});
    if (name.endsWith('/tenantSettings')) return evaluate('src/utils/tenantSettings.ts', {}, globals);
    if (name.endsWith('/storage')) return evaluate('src/utils/storage.ts', {}, globals);
    if (name.endsWith('/posRecovery')) return evaluate('src/utils/posRecovery.ts', {}, globals);
    return new Proxy({}, { get: (_, key) => String(key) });
  } };
  const source = fs.readFileSync(filePath, 'utf8');
  const code = ts.transpileModule(source, { fileName: filePath, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, context);
  return context.exports;
};

const harness = (file, name, overrides = {}, sharedStorage = storage()) => {
  let cursor = 0, root;
  const windowListeners = new Map();
  const states = [], dependencies = [], effects = [];
  const react = {
    createContext() { return { Provider: 'ContextProvider' }; },
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return states[i] ?? (states[i] = { current: initial }); },
    useEffect(fn, deps) { const i = cursor++; if (!dependencies[i] || deps?.some((value, index) => value !== dependencies[i][index])) { dependencies[i] = deps; effects.push([i, fn]); } },
    useCallback(fn) { cursor++; return fn; },
    useMemo(fn) { cursor++; return fn(); },
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; },
  };
  const t = (key) => key;
  const mocks = {
    react: { ...react, default: react, __esModule: true },
    '../context/TenantContext': { useTenant: () => ({ tenant: { id: 'tenant-A', nombreComercial: 'Test' }, user: { id: 'user-A', rol: 'ADMIN', descuentoMaximo: 100 } }) },
    '../context/I18nContext': { useI18n: () => ({ t, locale: 'es' }) },
    '../utils/format': { formatLempiras: String },
    '../utils/api': { api: { get: async () => ({ data: [] }), post: async () => ({ data: {} }) } },
    ...overrides,
  };
  const component = evaluate(file, mocks, { localStorage: sharedStorage, crypto: webcrypto, alert() {},
    window: { addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: (name) => windowListeners.delete(name) },
    document: { documentElement: { dataset: {}, classList: { add() {}, remove() {} }, style: { setProperty() {} } } },
    setTimeout: (fn, delay) => setTimeout(fn, delay).unref(), clearTimeout })[name];
  const nodes = () => {
    const found = [];
    const walk = (node) => { if (!node || typeof node !== 'object') return; found.push(node); (node.children || []).forEach(walk); };
    walk(root); return found;
  };
  return {
    render(props = {}) { cursor = 0; root = component(props); return nodes(); },
    find(predicate) { return nodes().find(predicate); },
    async effects() { const queued = effects.splice(0); for (const [, fn] of queued) { await fn(); } await new Promise((resolve) => setImmediate(resolve)); },
  };
};

const catalog = [{ id: 'p1', codigo: 'P1', nombre: 'Martillo', precioVenta: 100, stockActual: 10, stockMinimo: 0 }];

test('Selección de cliente registrado en POS conserva clienteId y lo envía en la venta', async () => {
  const saved = storage();
  const sent = [];
  const api = {
    get: async (url) => ({ data: url.includes('/solicitudes/') ? { estado: 'NO_REGISTRADA' } : catalog }),
    post: async (url, body) => { sent.push(body); return { data: { id: 'v1', numeroVenta: 1, total: 115, detalles: [] } }; },
  };
  const page = harness('src/pages/POSPage.tsx', 'POSPage', { '../utils/api': { api } }, saved);
  page.render(); await page.effects(); page.render();

  // Agregar producto al carrito
  page.find(n => n.props.className === 'industrial-card' && n.props.onClick).props.onClick();
  page.render();

  // Seleccionar cliente desde ClientePicker
  const picker = page.find(n => n.props.onSelect);
  picker.props.onSelect({ id: 'client-123', nombre: 'Cliente Registrado', rtn: '08011999123456' });
  page.render();

  // Cambiar método de pago a CREDITO y cobrar
  page.find(n => n.props.onClick && n.children?.includes('CREDITO')).props.onClick();
  page.render();

  await page.find(n => n.props.onClick?.name === 'handleCobrar').props.onClick();
  page.render();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].clienteId, 'client-123');
  assert.equal(sent[0].clienteNombre, 'Cliente Registrado');
  assert.equal(sent[0].clienteRtn, '08011999123456');
  assert.equal(sent[0].metodoPago, 'CREDITO');
});

test('Venta a crédito sin cliente registrado es rechazada con mensaje de error', async () => {
  const saved = storage();
  const sent = [];
  const api = {
    get: async () => ({ data: catalog }),
    post: async (url, body) => { sent.push(body); return { data: {} }; },
  };
  const page = harness('src/pages/POSPage.tsx', 'POSPage', { '../utils/api': { api } }, saved);
  page.render(); await page.effects(); page.render();

  // Agregar producto
  page.find(n => n.props.className === 'industrial-card' && n.props.onClick).props.onClick();
  page.render();

  // Seleccionar CREDITO sin seleccionar cliente registrado
  page.find(n => n.props.onClick && n.children?.includes('CREDITO')).props.onClick();
  page.render();

  await page.find(n => n.props.onClick?.name === 'handleCobrar').props.onClick();
  page.render();

  assert.equal(sent.length, 0); // No se envía la petición
  assert.ok(page.find(n => n.children?.includes('Seleccione un cliente registrado para vender a crédito')));
});

test('Venta de contado sin cliente registrado se procesa sin clienteId', async () => {
  const saved = storage();
  const sent = [];
  const api = {
    get: async () => ({ data: catalog }),
    post: async (url, body) => { sent.push(body); return { data: { id: 'v2', numeroVenta: 2, total: 115, detalles: [] } }; },
  };
  const page = harness('src/pages/POSPage.tsx', 'POSPage', { '../utils/api': { api } }, saved);
  page.render(); await page.effects(); page.render();

  // Agregar producto y cobrar en EFECTIVO
  page.find(n => n.props.className === 'industrial-card' && n.props.onClick).props.onClick();
  page.render();

  await page.find(n => n.props.onClick?.name === 'handleCobrar').props.onClick();
  page.render();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].clienteId, undefined);
  assert.equal(sent[0].clienteNombre, 'Consumidor Final');
  assert.equal(sent[0].metodoPago, 'EFECTIVO');
});

test('Desvincular cliente registrado restablece estado a Consumidor Final', async () => {
  const saved = storage();
  const page = harness('src/pages/POSPage.tsx', 'POSPage', {}, saved);
  page.render(); await page.effects(); page.render();

  // Seleccionar cliente
  page.find(n => n.props.onSelect).props.onSelect({ id: 'c-456', nombre: 'Constructora S.A.', rtn: '05011990000111' });
  page.render();

  assert.ok(page.find(n => n.children?.includes('✓ Cliente registrado seleccionado.')));

  // Desvincular cliente con el botón de desvinculación
  const desvincularBtn = page.find(n => n.type === 'button' && n.props.title?.includes('desvincular'));
  assert.ok(desvincularBtn);
  desvincularBtn.props.onClick();
  page.render();

  assert.equal(page.find(n => n.children?.includes('✓ Cliente registrado seleccionado.')), undefined);
});
