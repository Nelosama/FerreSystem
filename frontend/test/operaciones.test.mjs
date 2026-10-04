import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

// Ejecuta los handlers actuales con hooks y transporte controlados, sin dependencias nuevas.
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

const evaluate = (file, mocks, globals = {}) => {
  const context = { exports: {}, console, ...globals, require: (name) => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('/unidadMedida')) return evaluate('src/utils/unidadMedida.ts', {});
    if (name.endsWith('/numeroCliente')) return evaluate('src/utils/numeroCliente.ts', {});
    if (name.endsWith('/storage')) return evaluate('src/utils/storage.ts', {}, globals);
    return new Proxy({}, { get: (_, key) => String(key) });
  } };
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, context);
  return context.exports;
};

const harness = (file, name, overrides = {}, sharedStorage = storage()) => {
  let cursor = 0, root;
  const states = [], dependencies = [], effects = [], cleanups = [];
  const react = {
    createContext() { return { Provider: 'ContextProvider' }; },
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return states[i] ?? (states[i] = { current: initial }); },
    useEffect(fn, deps) { const i = cursor++; if (!dependencies[i] || deps?.some((value, index) => value !== dependencies[i][index])) { dependencies[i] = deps; effects.push([i, fn]); } },
    useCallback(fn) { cursor++; return fn; },
    useMemo(fn) { cursor++; return fn(); },
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; },
  };
  const t = (key, values = {}) => key + ':' + Object.values(values).join(',');
  const mocks = {
    react: { ...react, default: react, __esModule: true },
    '../context/TenantContext': { useTenant: () => ({ tenant: { id: 'tenant-A', nombreComercial: 'Test' }, user: { id: 'user-A', rol: 'ADMIN', descuentoMaximo: 10 } }) },
    '../context/I18nContext': { useI18n: () => ({ t, locale: 'en' }) },
    '../context/NotificationContext': { useNotification: () => ({ solicitudes: [], solicitarDescuento() {} }) },
    '../hooks/useRubroConfig': { useRubroConfig: () => ({ categoriasDefault: ['General'], unidadesMedida: ['unidad', 'galón'], activarVencimientos: false, activarGarantiaSerie: false }) },
    '../utils/format': { formatLempiras: String },
    ...overrides,
  };
  const component = evaluate(file, mocks, { localStorage: sharedStorage, crypto: webcrypto, alert() {},
    document: { documentElement: { style: { setProperty() {} } } },
    setTimeout: (fn, delay) => setTimeout(fn, delay).unref(), clearTimeout })[name];
  const nodes = () => {
    const found = [];
    const walk = (node) => { if (!node || typeof node !== 'object') return; found.push(node); (node.children || []).forEach(walk); };
    walk(root); return found;
  };
  return {
    render(props = {}) { cursor = 0; root = component(props); return nodes(); },
    find(predicate) { return nodes().find(predicate); },
    async effects() { const queued = effects.splice(0); for (const [i, fn] of queued) { cleanups[i]?.(); cleanups[i] = await fn(); } await new Promise((resolve) => setImmediate(resolve)); },
  };
};

test('soporte instala el token real, restaura superadmin y limpia el estado al iniciar otra cuenta', async () => {
  const saved = storage();
  const admin = { id: 'sa1', nombre: 'Superadmin', rol: 'SUPERADMIN' };
  const tenant = { id: 'platform', nombreComercial: 'Portal' };
  saved.setItem('ferre_token', 'admin-token');
  saved.setItem('ferre_user', JSON.stringify(admin));
  saved.setItem('ferre_tenant', JSON.stringify(tenant));
  const api = { post: async () => ({ data: { accessToken: 'tenant-support-token', user: { id: 'u1', nombre: 'Cajero real', rol: 'CAJERO' } } }) };
  const page = harness('src/context/TenantContext.tsx', 'TenantProvider', { '../utils/api': { api } }, saved);
  const value = () => { page.render(); return page.find((node) => node.type === 'ContextProvider').props.value; };
  await value().impersonateTenantAdmin({ id: 't1', nombreComercial: 'Empresa' }, { id: 'u1', rol: 'ADMIN' }, 'support1');
  assert.equal(saved.getItem('ferre_token'), 'tenant-support-token');
  assert.equal(value().user.rol, 'CAJERO');
  assert.equal(value().isReadOnly, true);
  value().stopImpersonating();
  assert.equal(saved.getItem('ferre_token'), 'admin-token');
  assert.equal(value().user.id, 'sa1');
  assert.equal(value().isImpersonating, false);
  assert.equal(saved.getItem('ferre_support_target'), null);
  await value().impersonateTenantAdmin({ id: 't1' }, { id: 'u1' });
  value().login({ id: 'u2', rol: 'ADMIN' }, { id: 't2' });
  assert.equal(value().isImpersonating, false);
  assert.equal(saved.getItem('ferre_original_superadmin_token'), null);
});

test('un inicio fallido de soporte conserva la sesión de superadmin', async () => {
  const saved = storage();
  saved.setItem('ferre_token', 'admin-token');
  saved.setItem('ferre_user', JSON.stringify({ id: 'sa1', rol: 'SUPERADMIN' }));
  const page = harness('src/context/TenantContext.tsx', 'TenantProvider', { '../utils/api': { api: { post: async () => { throw new Error('API no disponible'); } } } }, saved);
  page.render();
  await assert.rejects(page.find((node) => node.type === 'ContextProvider').props.value.impersonateTenantAdmin({ id: 't1' }, { id: 'u1' }));
  assert.equal(saved.getItem('ferre_token'), 'admin-token');
  assert.equal(saved.getItem('ferre_original_superadmin_token'), null);
});

test('POS conserva identidad tras respuesta perdida/reload y bloquea doble envío', async () => {
  const saved = storage(), sent = [];
  let fail = true;
  const api = {
    get: async () => ({ data: [{ id: 'p1', codigo: 'P1', nombre: 'Cable', precioVenta: 10, precioCosto: 5, stockActual: 10, stockMinimo: 0 }] }),
    post: async (_, body) => {
      sent.push(body);
      if (fail) throw new Error('Respuesta perdida');
      return { data: { id: body.solicitudId, numeroVenta: 1, createdAt: '2026-10-02T10:00:00Z', subtotal: 10, descuento: 0, isv: 1.5, total: 11.5 } };
    },
  };
  const make = () => harness('src/pages/POSPage.tsx', 'POSPage', { '../utils/api': { api } }, saved);
  let page = make(); page.render(); await page.effects(); page.render();
  page.find((n) => n.props.onClick && n.props.className === 'industrial-card').props.onClick();
  page.render();
  const cobrar = page.find((n) => n.props.onClick?.name === 'handleCobrar').props.onClick;
  await Promise.all([cobrar(), cobrar()]);
  assert.equal(sent.length, 1);
  const pending = saved.getItem('ferre_pending_sale:tenant-A:user-A');
  assert.ok(pending);
  fail = false; page = make(); page.render(); await page.effects(); page.render();
  await page.find((n) => n.props.onClick?.name === 'handleCobrar').props.onClick();
  page.render();
  assert.equal(sent[1].solicitudId, sent[0].solicitudId);
  assert.equal(saved.getItem('ferre_pending_sale:tenant-A:user-A'), null);
  const checkout = page.find((n) => n.props.onClick?.name === 'handleCobrar');
  assert.equal(checkout.props.disabled, true);
  await checkout.props.onClick();
  assert.equal(sent.length, 2);
});

test('importación sobrescribe con PUT, salta duplicados si se solicita y cuenta errores reales', async () => {
  for (const overwrite of [true, false]) {
    const requests = [];
    const api = {
      get: async () => ({ data: [{ id: 'old-id', codigo: 'OLD' }] }),
      put: async (url, body) => { requests.push(['PUT', url, body]); return { data: {} }; },
      post: async (url, body) => { requests.push(['POST', url, body]); if (body.codigo === 'FAIL') throw new Error('No guardado'); return { data: { id: 'new-id' } }; },
    };
    const raw = ['OLD', 'NEW', 'FAIL'].map((codigo) => ({ codigo, nombre: codigo, categoria: 'General', precioVenta: '10', precioCosto: '5', stockActual: '2.75', stockMinimo: '0.5', unidadMedida: 'galón' }));
    const papa = { parse: (_, options) => options.complete({ data: raw }) };
    const page = harness('src/components/ImportarProductosModal.tsx', 'ImportarProductosModal', { '../utils/api': { api }, papaparse: papa });
    const props = { isOpen: true, onClose() {} };
    page.render(props); await page.effects(); page.render(props);
    page.find((n) => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [{ name: 'data.csv' }] } });
    page.render(props);
    page.find((n) => n.props.onClick?.name === 'handleIniciarImportacion').props.onClick();
    page.render(props);
    const action = page.find((n) => n.props.onClick?.toString().includes(`ejecutarImportacion(${overwrite})`));
    assert.ok(action);
    await action.props.onClick(); page.render(props);
    assert.equal(requests.filter((r) => r[0] === 'PUT').length, overwrite ? 1 : 0);
    assert.equal(requests.filter((r) => r[0] === 'POST').length, 2);
    assert.equal(requests[0][2].unidadMedida, 'GALON');
    const summary = page.find((n) => n.type === 'p' && n.children.some((c) => typeof c === 'string' && c.startsWith('inventory.import_summary_counts')));
    assert.ok(summary);
    assert.ok(summary.children.join('').endsWith(overwrite ? '1,1,1,0' : '1,0,1,1'));
  }
});

test('unidades de español/inglés siempre producen enums de API', () => {
  const { normalizarUnidadMedida } = evaluate('src/utils/unidadMedida.ts', {});
  for (const [value, expected] of [['galón', 'GALON'], ['gallon', 'GALON'], ['box', 'CAJA'], ['meter', 'METRO'], ['lb', 'LIBRA'], ['unit', 'UNIDAD']]) assert.equal(normalizarUnidadMedida(value), expected);
});

test('JSON corrupto de una sesión no bloquea el arranque', () => {
  const saved = storage();
  saved.setItem('ferre_user', '{broken');
  const { readStoredJson } = evaluate('src/utils/storage.ts', {}, { localStorage: saved });
  assert.equal(readStoredJson('ferre_user', null), null);
  assert.equal(readStoredJson('missing', true), true);
});

test('el límite del cajero proviene del usuario y no de aprobaciones locales', async () => {
  const sent=[];
  const page = harness('src/pages/POSPage.tsx', 'POSPage', {
    '../context/TenantContext': {useTenant:()=>({tenant:{id:'tenant-A'},user:{id:'user-A',rol:'CAJERO',descuentoMaximo:10}})},
    '../utils/api': {api:{get:async()=>({data:[{id:'p1',codigo:'P1',nombre:'Cable',precioVenta:10,stockActual:10,stockMinimo:0}]}),post:async(...args)=>{sent.push(args);return {data:{detalles:[]}};}}},
  });
  page.render();await page.effects();page.render();
  page.find(n=>n.props.className==='industrial-card').props.onClick();page.render();
  page.find(n=>n.type==='input'&&n.props.max==='100').props.onChange({target:{value:'20'}});page.render();
  assert.ok(page.find(n=>n.props.role==='alert'&&n.children.some(v=>typeof v==='string'&&v.includes('supera su límite'))));
  assert.equal(page.find(n=>n.props.onClick?.name==='handleSolicitarAutorizacion'),undefined);
  assert.equal(sent.length,0);
  page.find(n=>n.type==='input'&&n.props.max==='100').props.onChange({target:{value:'5'}});page.render();
  assert.ok(page.find(n=>n.props.onClick?.name==='handleCobrar'));
});

test('editar cotización recupera porcentajes desde los montos guardados', async () => {
  const cot = { id: 'cot-1', numeroCotizacion: 1, clienteNombre: 'Cliente', estado: 'BORRADOR', createdAt: '2026-10-02', fechaValidez: '2026-10-17', subtotal: 15, isv: 2.25, descuento: 6.5, descuentoGeneral: 1.5, tipoDescuentoGeneral: 'PORCENTAJE', total: 15.75,
    detalles: [{ id: 'line-1', productoId: 'p1', productoNombre: 'Cable', cantidad: 2, medida: 1, totalMedida: 2, precioUnitario: 10, descuento: 5, tipoDescuento: 'PORCENTAJE', subtotal: 15, isv: 2.25, totalLinea: 17.25 }] };
  const page = harness('src/pages/CotizacionesPage.tsx', 'CotizacionesPage', { '../utils/api': { api: { get: async (url) => ({ data: url === '/cotizaciones' ? [cot] : [] }) } } });
  page.render(); await page.effects(); page.render();
  page.find((n) => n.props.onClick?.toString().includes('handleAbrirEditar')).props.onClick();
  const nodes = page.render();
  const percentageInputs = nodes.filter((n) => n.type === 'input' && n.props.type === 'number').map((n) => n.props.value);
  assert.ok(percentageInputs.includes(25));
  assert.ok(percentageInputs.includes(10));
});

test('selector busca por teléfono y descarta respuestas de búsquedas anteriores', async () => {
  const pending = [];
  const selected = [];
  const page = harness('src/components/ClientePicker.tsx', 'ClientePicker', {
    '../utils/api': { api: { get: (url, config) => new Promise((resolve) => pending.push({ url, config, resolve })) } },
  });
  const props = { onSelect: (client) => selected.push(client) };
  page.render(props); await page.effects();
  await new Promise((resolve) => setTimeout(resolve, 280));
  page.find((node) => node.props.id === 'quotation-client-search').props.onChange({ target: { value: '99990000' } });
  page.render(props); await page.effects();
  await new Promise((resolve) => setTimeout(resolve, 280));
  assert.equal(pending[1].url, '/clientes');
  assert.equal(pending[1].config.params.search, '99990000');
  assert.equal(pending[1].config.params.limit, 12);
  const client = { id: 'client-2', numeroCliente: 12, nombre: 'Cliente correcto', telefono: '+504 9999-0000' };
  pending[1].resolve({ data: [client] }); await page.effects(); page.render(props);
  pending[0].resolve({ data: [{ id: 'old', nombre: 'Respuesta antigua' }] }); await page.effects();
  const nodes = page.render(props);
  assert.ok(nodes.some((node) => node.children.includes('CLI-000012')));
  assert.ok(!nodes.some((node) => node.children.includes('Respuesta antigua')));
  page.find((node) => node.type === 'button' && node.props.onClick?.toString().includes('onSelect(cliente)')).props.onClick();
  assert.equal(selected[0].id, client.id);
});

test('número de cliente se presenta sin exponer UUID y admite más de seis dígitos', () => {
  const { formatNumeroCliente } = evaluate('src/utils/numeroCliente.ts', {});
  assert.equal(formatNumeroCliente(1), 'CLI-000001');
  assert.equal(formatNumeroCliente(1000000), 'CLI-1000000');
  assert.equal(formatNumeroCliente(null), '—');
});

test('seleccionar cliente completa datos y guarda su ID; ingreso manual desvincula', async () => {
  const saved = [];
  const cot = { id: 'cot-client', numeroCotizacion: 2, clienteNombre: 'Anterior', clienteId: 'old-client', estado: 'BORRADOR', createdAt: '2026-10-02', fechaValidez: '2026-10-17', subtotal: 10, total: 11.5,
    detalles: [{ productoId: 'p1', cantidad: 1, medida: 1, totalMedida: 1, precioUnitario: 10, descuento: 0, tipoDescuento: 'MONTO', subtotal: 10 }] };
  const page = harness('src/pages/CotizacionesPage.tsx', 'CotizacionesPage', {
    '../utils/api': { api: { get: async (url) => ({ data: url === '/cotizaciones' ? [cot] : [] }), put: async (url, body) => { saved.push(body); } } },
  });
  page.render(); await page.effects(); page.render();
  const open = () => page.find((node) => node.props.onClick?.toString().includes('handleAbrirEditar')).props.onClick();
  open(); page.render();
  assert.ok(page.find((node) => node.props.value === 'Anterior' && node.props.readOnly));
  page.find((node) => node.type === 'button' && node.children.some((value) => typeof value === 'string' && value.startsWith('clientPicker.change'))).props.onClick();
  page.render();
  const client = { id: 'client-2', nombre: 'Ana', rtn: '08011999000001', telefono: '+504 9999-0000', email: 'ana@example.test', direccion: 'Centro' };
  page.find((node) => node.props.onSelect).props.onSelect(client);
  let nodes = page.render();
  for (const value of [client.nombre, client.rtn, client.telefono, client.email, client.direccion]) assert.ok(nodes.some((node) => node.props.value === value && node.props.readOnly));
  await page.find((node) => node.type === 'button' && node.props.onClick?.toString().includes("handleGuardarFormulario('BORRADOR')")).props.onClick();
  assert.equal(saved[0].clienteId, client.id);
  page.render(); open(); page.render();
  page.find((node) => node.type === 'button' && node.children.some((value) => typeof value === 'string' && value.startsWith('clientPicker.change'))).props.onClick();
  page.render();
  await page.find((node) => node.type === 'button' && node.props.onClick?.toString().includes("handleGuardarFormulario('BORRADOR')")).props.onClick();
  assert.equal(saved[1].clienteId, null);
});

