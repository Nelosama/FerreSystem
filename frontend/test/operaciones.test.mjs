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
    if (name.endsWith('/tenantSettings')) return evaluate('src/utils/tenantSettings.ts', {}, globals);
    if (name.endsWith('/storage')) return evaluate('src/utils/storage.ts', {}, globals);
    if (name.endsWith('/posRecovery')) return evaluate('src/utils/posRecovery.ts', {}, globals);
    return new Proxy({}, { get: (_, key) => String(key) });
  } };
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, context);
  return context.exports;
};

const harness = (file, name, overrides = {}, sharedStorage = storage()) => {
  let cursor = 0, root;
  const windowListeners = new Map();
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
    '../utils/format': { formatLempiras: String, formatDateHN: String, formatDateOnlyHN: String },
    '../utils/api': { api: { get: async () => ({ data: {} }) } },
    '../utils/sessionSync': { startSessionSync: () => () => {} },
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
    fireFocus() { windowListeners.get('focus')?.(); },
    fireStorage(key) { windowListeners.get('storage')?.({ key }); },
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

test('configuración antigua del catálogo local no sobrescribe el servidor ni coincide por nombre', async () => {
  const saved = storage();
  saved.setItem('ferre_user', JSON.stringify({ id: 'user-A', rol: 'ADMIN' }));
  saved.setItem('ferre_tenant', JSON.stringify({ id: 'tenant-A', nombreComercial: 'Mismo nombre', colorPrimario: '#000000' }));
  saved.setItem('ferre_saas_tenants', JSON.stringify([{ id: 'tenant-B', nombreComercial: 'Mismo nombre', colorPrimario: '#FF0000', modoNavegacion: 'SIDEBAR', modulosHabilitados: [] }]));
  const page = harness('src/context/TenantContext.tsx', 'TenantProvider', {
    '../utils/api': { api: { get: async () => ({ data: { id: 'tenant-A', colorPrimario: '#0284C7', modoNavegacion: 'TOPNAV', modulosHabilitados: ['pos'] } }) } },
  }, saved);
  page.render(); await page.effects(); page.render();
  const value = page.find(node => node.type === 'ContextProvider').props.value;
  assert.equal(value.tenant.colorPrimario, '#0284C7');
  assert.equal(value.tenant.modoNavegacion, 'TOPNAV');
  assert.equal(value.tenant.modulosHabilitados[0], 'pos');
});

test('respuesta de configuración antigua no contamina el login de otra empresa', async () => {
  const saved = storage(); let resolve;
  saved.setItem('ferre_user', JSON.stringify({ id: 'user-A', rol: 'ADMIN' }));
  saved.setItem('ferre_tenant', JSON.stringify({ id: 'tenant-A', colorPrimario: '#000000' }));
  const page = harness('src/context/TenantContext.tsx', 'TenantProvider', {
    '../utils/api': { api: { get: () => new Promise(done => { resolve = done; }) } },
  }, saved);
  page.render(); await page.effects();
  saved.setItem('ferre_user', JSON.stringify({ id: 'user-B', rol: 'ADMIN' }));
  saved.setItem('ferre_tenant', JSON.stringify({ id: 'tenant-B', colorPrimario: '#FFFFFF' }));
  resolve({ data: { id: 'tenant-A', colorPrimario: '#FF0000' } });
  await new Promise(done => setImmediate(done));
  assert.equal(JSON.parse(saved.getItem('ferre_tenant')).id, 'tenant-B');
  assert.equal(JSON.parse(saved.getItem('ferre_tenant')).colorPrimario, '#FFFFFF');
});

test('lectura anterior del servidor no revierte una configuración recién guardada', async () => {
  const saved = storage(); let resolve;
  saved.setItem('ferre_user', JSON.stringify({ id: 'user-A', rol: 'ADMIN' }));
  saved.setItem('ferre_tenant', JSON.stringify({ id: 'tenant-A', colorPrimario: '#000000' }));
  const page = harness('src/context/TenantContext.tsx', 'TenantProvider', {
    '../utils/api': { api: { get: () => new Promise(done => { resolve = done; }) } },
  }, saved);
  page.render(); await page.effects();
  page.find(node => node.type === 'ContextProvider').props.value.updateTenantConfig({ id: 'tenant-A', colorPrimario: '#0284C7', modoNavegacion: 'TOPNAV' });
  resolve({ data: { id: 'tenant-A', colorPrimario: '#000000', modoNavegacion: 'SIDEBAR' } });
  await new Promise(done => setImmediate(done));
  assert.equal(JSON.parse(saved.getItem('ferre_tenant')).colorPrimario, '#0284C7');
  assert.equal(JSON.parse(saved.getItem('ferre_tenant')).modoNavegacion, 'TOPNAV');
});

test('cambiar sesión en otra pestaña invalida usuario y empresa locales sin borrar la cuenta nueva', async () => {
  const saved = storage();
  saved.setItem('ferre_user', JSON.stringify({ id: 'user-A', rol: 'ADMIN' }));
  saved.setItem('ferre_tenant', JSON.stringify({ id: 'tenant-A', nombreComercial: 'Empresa A' }));
  saved.setItem('ferre_token', 'token-A');
  saved.setItem('ferre_saas_tenants', JSON.stringify([{ id: 'tenant-C', nombreComercial: 'FerreSystem', colorPrimario: '#123456' }]));
  let boundIdentity;
  const page = harness('src/context/TenantContext.tsx', 'TenantProvider', {
    '../utils/sessionSync': { startSessionSync: (_, __, identity) => { boundIdentity = identity; return () => {}; } },
  }, saved);
  page.render(); await page.effects(); page.render();
  assert.equal(boundIdentity.userId, 'user-A'); assert.equal(boundIdentity.tenantId, 'tenant-A');
  saved.setItem('ferre_user', JSON.stringify({ id: 'user-B', rol: 'CAJERO' }));
  saved.setItem('ferre_tenant', JSON.stringify({ id: 'tenant-B', nombreComercial: 'Empresa B' }));
  saved.setItem('ferre_token', 'token-B');
  boundIdentity.onChanged(); page.render(); await page.effects(); page.render();
  const local = page.find(node => node.type === 'ContextProvider').props.value;
  assert.equal(local.isAuthenticated, false); assert.equal(local.user, null); assert.equal(local.tenant.id, '');
  assert.equal(local.isImpersonating, false);
  assert.equal(JSON.parse(saved.getItem('ferre_user')).id, 'user-B');
  assert.equal(JSON.parse(saved.getItem('ferre_tenant')).id, 'tenant-B');
  assert.equal(saved.getItem('ferre_token'), 'token-B');
});

test('POS conserva identidad tras respuesta perdida/reload y bloquea doble envío', async () => {
  const saved = storage(), sent = [];
  let fail = true;
  const api = {
    get: async (url) => ({ data: url.startsWith('/ventas/solicitudes/') ? { estado: 'NO_REGISTRADA' } : [{ id: 'p1', codigo: 'P1', nombre: 'Cable', precioVenta: 10, precioCosto: 5, stockActual: 10, stockMinimo: 0 }] }),
    post: async (_, body) => {
      sent.push(body);
      if (fail) throw new Error('Respuesta perdida');
      return { data: { id: body.solicitudId, numeroVenta: 1, createdAt: '2026-10-02T10:00:00Z', subtotal: 10, descuento: 0, isv: 1.5, total: 11.5, metodoPago: 'EFECTIVO', detalles: [{ productoId: 'p1', productoNombre: 'Cable', productoCodigo: 'P1', cantidad: 1, precioUnitario: 10 }] } };
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
  await page.find((n) => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render();
  await page.find((n) => n.props.onClick?.name === 'handleCobrar').props.onClick();
  page.render();
  assert.equal(sent[1].solicitudId, sent[0].solicitudId);
  assert.ok(saved.getItem('ferre_pending_sale:tenant-A:user-A'));
  const checkout = page.find((n) => n.props.onClick?.name === 'handleCobrar');
  assert.equal(checkout.props.disabled, true);
  await checkout.props.onClick();
  assert.equal(sent.length, 2);
  page.find((n) => n.props.onClick?.name === 'cerrarComprobante').props.onClick();
  assert.equal(saved.getItem('ferre_pending_sale:tenant-A:user-A'), null);
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


const recoveryKeys = {
  pending: 'ferre_pending_sale:tenant-A:user-A',
  draft: 'ferre_sale_draft:tenant-A:user-A',
};
const sampleSale = () => ({
  solicitudId: webcrypto.randomUUID(),
  cart: [{ productoId: 'p1', codigo: 'P1', nombre: 'Cable', cantidad: 2.5, precioUnitario: 10 }],
  clienteNombre: 'Ana', clienteRtn: '', metodoPago: 'TRANSFERENCIA', descuentoPorcentaje: 5,
});
const sampleReceipt = (pending) => ({
  id: pending.solicitudId, numeroVenta: 7, clienteNombre: pending.clienteNombre,
  subtotal: 23.75, isv: 3.56, total: 27.31, descuento: 1.25,
  metodoPago: pending.metodoPago, createdAt: '2026-10-05T12:00:00Z',
  detalles: pending.cart.map(i => ({ ...i, productoNombre: i.nombre, productoCodigo: i.codigo })),
});
const catalog = [{ id: 'p1', codigo: 'P1', nombre: 'Cable', precioVenta: 10, stockActual: 10, stockMinimo: 0 }];
const makePOS = (saved, getStatus, post = async () => { throw new Error('No debe enviar'); }, extra = {}) =>
  harness('src/pages/POSPage.tsx', 'POSPage', {
    '../utils/api': { api: {
      get: async url => ({ data: url.startsWith('/ventas/solicitudes/') ? await getStatus(url) : catalog }), post,
    } }, ...extra,
  }, saved);
const settlePOS = async page => {
  page.render(); await page.effects(); page.render(); await page.effects(); page.render();
};

test('POS autoguarda carrito antes de cobrar y restaura cantidades, cliente y pago al regresar', async () => {
  const saved = storage();
  let page = makePOS(saved, async () => ({ estado: 'NO_REGISTRADA' }));
  await settlePOS(page);
  page.find(n => n.props.className === 'industrial-card' && n.props.onClick).props.onClick();
  page.render();
  page.find(n => n.props['aria-label'] === 'Cantidad Cable').props.onChange({ target: { value: '2.5' } });
  page.render();
  page.find(n => n.props.onClick && n.children.includes('TRANSFERENCIA')).props.onClick();
  page.render(); await page.effects();
  const envelope = JSON.parse(saved.getItem(recoveryKeys.draft));
  assert.equal(envelope.sale.cart[0].cantidad, 2.5);
  assert.equal(envelope.sale.metodoPago, 'TRANSFERENCIA');
  assert.equal(saved.getItem(recoveryKeys.pending), null);
  page = makePOS(saved, async () => ({ estado: 'NO_REGISTRADA' }));
  await settlePOS(page);
  assert.equal(page.find(n => n.props['aria-label'] === 'Cantidad Cable').props.value, 2.5);
  assert.ok(page.find(n => n.children.some(c => typeof c === 'string' && c.includes('Recuperamos los productos'))));
});

test('POS recupera venta confirmada por consulta sin POST y conserva comprobante hasta cerrarlo', async () => {
  const saved = storage(), pending = sampleSale();
  saved.setItem(recoveryKeys.pending, JSON.stringify(pending));
  let posts = 0;
  const make = () => makePOS(saved, async () => ({ estado: 'REGISTRADA', venta: sampleReceipt(pending) }), async () => { posts++; });
  let page = make(); await settlePOS(page);
  await page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render();
  assert.equal(posts, 0);
  assert.ok(page.find(n => n.children.some(c => typeof c === 'string' && c.includes('Venta registrada.'))));
  assert.ok(saved.getItem(recoveryKeys.pending));
  page = make(); await settlePOS(page);
  await page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render();
  assert.equal(posts, 0);
  page.find(n => n.props.onClick?.name === 'cerrarComprobante').props.onClick();
  assert.equal(saved.getItem(recoveryKeys.pending), null);
});

test('sin conexión o con sesión vencida, consultar no envía otra venta ni borra pendiente', async () => {
  for (const status of [undefined, 401, 403]) {
    const saved = storage(), pending = sampleSale();
    saved.setItem(recoveryKeys.pending, JSON.stringify(pending));
    let posts = 0;
    const page = makePOS(saved, async () => { throw { response: { status } }; }, async () => { posts++; });
    await settlePOS(page);
    await page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render();
    assert.equal(posts, 0);
    assert.equal(JSON.parse(saved.getItem(recoveryKeys.pending)).solicitudId, pending.solicitudId);
    assert.equal(page.find(n => n.children.includes('Ya revisé el pago: continuar registro')), undefined);
  }
});

test('POS no mezcla recuperación al cambiar de usuario o empresa con una consulta en vuelo', async () => {
  const saved = storage(), pending = sampleSale();
  saved.setItem(recoveryKeys.pending, JSON.stringify(pending));
  let identity = { tenant: { id: 'tenant-A' }, user: { id: 'user-A', rol: 'ADMIN' } };
  let finish;
  const page = makePOS(saved, () => new Promise(resolve => { finish = resolve; }), undefined, {
    '../context/TenantContext': { useTenant: () => identity },
  });
  await settlePOS(page);
  const checking = page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick();
  identity = { tenant: { id: 'tenant-B' }, user: { id: 'user-B', rol: 'ADMIN' } };
  await settlePOS(page);
  finish({ estado: 'REGISTRADA', venta: sampleReceipt(pending) }); await checking;
  page.render();
  assert.equal(page.find(n => n.props['aria-label'] === 'Cantidad Cable'), undefined);
  assert.equal(page.find(n => n.props.onClick?.name === 'cerrarComprobante'), undefined);
  assert.equal(saved.getItem('ferre_sale_draft:tenant-B:user-B'), null);
  assert.ok(saved.getItem(recoveryKeys.pending));
});

test('pendiente corrupto bloquea cobro y no se elimina ni se reemplaza con un borrador', async () => {
  const saved = storage();
  saved.setItem(recoveryKeys.pending, '{broken');
  saved.setItem(recoveryKeys.draft, JSON.stringify({ version: 1, sale: sampleSale() }));
  const page = makePOS(saved, async () => ({ estado: 'NO_REGISTRADA' }));
  await settlePOS(page);
  assert.equal(saved.getItem(recoveryKeys.pending), '{broken');
  assert.ok(page.find(n => n.props.role === 'alert'));
  assert.equal(page.find(n => n.props.onClick?.name === 'handleCobrar').props.disabled, true);
});

test('si almacenamiento falla no se envía la venta; si falla el borrado tras confirmar sigue recuperable', async () => {
  const base = storage();
  let failWrite = false, failRemove = false, posts = 0;
  const saved = {
    ...base,
    setItem(key, value) { if (failWrite) throw new Error('Storage lleno'); base.setItem(key, value); },
    removeItem(key) { if (failRemove) throw new Error('Storage bloqueado'); base.removeItem(key); },
  };
  const page = makePOS(saved, async () => ({ estado: 'NO_REGISTRADA' }), async (_, body) => {
    posts++; return { data: sampleReceipt({ ...sampleSale(), solicitudId: body.solicitudId }) };
  });
  await settlePOS(page);
  page.find(n => n.props.className === 'industrial-card' && n.props.onClick).props.onClick(); page.render();
  failWrite = true;
  await page.find(n => n.props.onClick?.name === 'handleCobrar').props.onClick(); page.render();
  assert.equal(posts, 0);
  failWrite = false;
  const pending = sampleSale(); base.setItem(recoveryKeys.pending, JSON.stringify(pending));
  const recovered = makePOS(saved, async () => ({ estado: 'REGISTRADA', venta: sampleReceipt(pending) }));
  await settlePOS(recovered);
  await recovered.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); recovered.render();
  failRemove = true;
  recovered.find(n => n.props.onClick?.name === 'cerrarComprobante').props.onClick(); recovered.render();
  assert.ok(base.getItem(recoveryKeys.pending));
  assert.ok(recovered.find(n => n.props.onClick?.name === 'cerrarComprobante'));
});


test('corregir precio pendiente conserva identidad y una confirmación tardía se recupera sin POST', async () => {
  const saved = storage(), pending = sampleSale();
  saved.setItem(recoveryKeys.pending, JSON.stringify(pending));
  let confirmed = false, posts = 0;
  const page = makePOS(saved, async () => confirmed ? { estado: 'REGISTRADA', venta: sampleReceipt(pending) } : { estado: 'NO_REGISTRADA' }, async () => { posts++; });
  await settlePOS(page);
  await page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render();
  page.find(n => n.children.includes('Corregir datos de esta venta')).props.onClick(); page.render();
  page.find(n => n.props['aria-label'] === 'Cantidad Cable').props.onChange({ target: { value: '1.5' } });
  page.render(); await page.effects(); page.render();
  const corrected = JSON.parse(saved.getItem(recoveryKeys.pending));
  assert.equal(corrected.solicitudId, pending.solicitudId);
  assert.equal(corrected.cart[0].cantidad, 1.5);
  confirmed = true;
  await page.find(n => n.children.includes('Ya revisé el pago: continuar registro')).props.onClick(); page.render();
  assert.equal(posts, 0);
  assert.equal(page.find(n => n.props['aria-label'] === 'Cantidad Cable').props.value, 2.5);
  assert.ok(page.find(n => n.props.onClick?.name === 'cerrarComprobante'));
});


test('un pendiente borrado por otra pestaña no genera un identificador nuevo al reintentar', async () => {
  const saved = storage(), pending = sampleSale();
  saved.setItem(recoveryKeys.pending, JSON.stringify(pending));
  let confirmed = false, posts = 0;
  const page = makePOS(saved, async () => confirmed ? { estado: 'REGISTRADA', venta: sampleReceipt(pending) } : { estado: 'NO_REGISTRADA' }, async () => { posts++; });
  await settlePOS(page);
  await page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render();
  saved.removeItem(recoveryKeys.pending);
  confirmed = true;
  await page.find(n => n.children.includes('Ya revisé el pago: continuar registro')).props.onClick(); page.render();
  assert.equal(posts, 0);
  assert.ok(page.find(n => n.props.onClick?.name === 'cerrarComprobante'));
});

test('respuesta tardía del POST no reemplaza una venta pendiente posterior de la misma sesión', async () => {
  for (const notifyStorage of [false, true]) {
    const saved = storage(), original = sampleSale(), newer = sampleSale();
    newer.clienteNombre = 'Beatriz'; newer.cart[0].cantidad = 4;
    let finish;
    const page = makePOS(saved, async () => ({ estado: 'NO_REGISTRADA' }), (_, body) => new Promise(resolve => {
      original.solicitudId = body.solicitudId; finish = resolve;
    }));
    await settlePOS(page);
    page.find(n => n.props.className === 'industrial-card' && n.props.onClick).props.onClick(); page.render();
    const charging = page.find(n => n.props.onClick?.name === 'handleCobrar').props.onClick();
    saved.setItem(recoveryKeys.pending, JSON.stringify(newer));
    if (notifyStorage) page.fireStorage(recoveryKeys.pending);
    page.render();
    finish({ data: sampleReceipt(original) }); await charging; page.render();
    assert.equal(page.find(n => n.props.onClick?.name === 'cerrarComprobante'), undefined);
    if (notifyStorage) assert.equal(page.find(n => n.props['aria-label'] === 'Cantidad Cable').props.value, 4);
    assert.equal(JSON.parse(saved.getItem(recoveryKeys.pending)).solicitudId, newer.solicitudId);
  }
});

test('consulta tardía no confirma ni reenvía una venta anterior cuando cambió su identidad', async () => {
  for (const retry of [false, true]) {
    const saved = storage(), original = sampleSale(), newer = sampleSale();
    saved.setItem(recoveryKeys.pending, JSON.stringify(original));
    let delayed = false, finish, posts = 0;
    const page = makePOS(saved, () => delayed ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ estado: 'NO_REGISTRADA' }), async () => { posts++; });
    await settlePOS(page);
    if (retry) { await page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render(); }
    delayed = true;
    const checking = page.find(n => retry ? n.children.includes('Ya revisé el pago: continuar registro') : n.props.onClick?.name === 'comprobarVenta').props.onClick();
    saved.setItem(recoveryKeys.pending, JSON.stringify(newer));
    page.fireStorage(recoveryKeys.pending); page.render();
    finish(retry ? { estado: 'NO_REGISTRADA' } : { estado: 'REGISTRADA', venta: sampleReceipt(original) });
    await checking; page.render();
    assert.equal(posts, 0);
    assert.equal(page.find(n => n.props.onClick?.name === 'cerrarComprobante'), undefined);
    assert.equal(page.find(n => n.children.includes('Ya revisé el pago: continuar registro')), undefined);
    assert.equal(JSON.parse(saved.getItem(recoveryKeys.pending)).solicitudId, newer.solicitudId);
  }
});

test('cerrar comprobante antiguo conserva y recupera un pendiente o borrador posterior', async () => {
  for (const kind of ['pending', 'draft', 'draft-with-pending']) {
    const saved = storage(), original = sampleSale(), newer = sampleSale();
    newer.clienteNombre = 'Beatriz'; newer.cart[0].cantidad = 4;
    saved.setItem(recoveryKeys.pending, JSON.stringify(original));
    const page = makePOS(saved, async () => ({ estado: 'REGISTRADA', venta: sampleReceipt(original) }));
    await settlePOS(page);
    await page.find(n => n.props.onClick?.name === 'comprobarVenta').props.onClick(); page.render();
    const closeOldReceipt = page.find(n => n.props.onClick?.name === 'cerrarComprobante').props.onClick;
    if (kind === 'pending') saved.setItem(recoveryKeys.pending, JSON.stringify(newer));
    else {
      if (kind === 'draft') saved.removeItem(recoveryKeys.pending);
      saved.setItem(recoveryKeys.draft, JSON.stringify({ version: 1, sale: newer }));
    }
    const key = kind === 'pending' ? recoveryKeys.pending : recoveryKeys.draft;
    const expected = saved.getItem(key);
    closeOldReceipt(); page.render(); await page.effects(); page.render();
    const recovered = JSON.parse(saved.getItem(key));
    assert.equal(recovered.solicitudId ?? recovered.sale.clienteNombre, kind === 'pending' ? newer.solicitudId : newer.clienteNombre);
    if (kind === 'pending') assert.equal(saved.getItem(recoveryKeys.pending), expected);
    assert.equal(page.find(n => n.props['aria-label'] === 'Cantidad Cable').props.value, 4);
    assert.equal(page.find(n => n.props.onClick?.name === 'cerrarComprobante'), undefined);
  }
});

const returnKey = 'ferre_pending_return:tenant-A:user-A';
const returnCommand = { kind: 'EJECUTAR', requestId: 'request-A' };
const returnReceipt = { id: 'request-A', monto: 10, credito_cancelado: 0, reembolso: 10, metodo: 'EFECTIVO' };
const makeReturns = (saved, apiMock, overrides = {}) => harness('src/pages/DevolucionesPage.tsx', 'DevolucionesPage', { '../utils/api': { api: apiMock }, ...overrides }, saved);
const settleReturns = async page => { page.render(); await page.effects(); page.render(); await page.effects(); page.render(); };
const confirmReturn = async page => { page.find(n => n.children.includes('Consultar y confirmar pendiente')).props.onClick(); await new Promise(resolve => setImmediate(resolve)); };

test('devolución recupera respuesta confirmada sin POST y mantiene comprobante hasta cerrarlo', async () => {
  const saved = storage(); saved.setItem(returnKey, JSON.stringify(returnCommand)); let posts = 0;
  const page = makeReturns(saved, { get: async url => ({ data: url.endsWith('/request-A') ? { estado: 'EJECUTADA', resultado: returnReceipt } : [] }), post: async () => { posts++; } });
  await settleReturns(page); await confirmReturn(page); page.render();
  assert.equal(posts, 0); assert.ok(saved.getItem(returnKey));
  assert.ok(page.find(n => n.children.includes('Devolución registrada')));
  page.find(n => n.children.includes('Cerrar comprobante')).props.onClick(); page.render();
  assert.equal(saved.getItem(returnKey), null);
});

test('devolución sin conexión o sin autorización no envía ajustes y conserva identidad', async () => {
  for (const authorized of [false, null]) {
    const saved = storage(); saved.setItem(returnKey, JSON.stringify(returnCommand)); let posts = 0;
    const page = makeReturns(saved, { get: async url => {
      if (!url.endsWith('/request-A')) return { data: [] };
      if (authorized === null) throw new Error('Network Error');
      return { data: { estado: 'PENDIENTE', resultado: null } };
    }, post: async () => { posts++; } });
    await settleReturns(page); await confirmReturn(page); page.render();
    assert.equal(posts, 0); assert.equal(JSON.parse(saved.getItem(returnKey)).requestId, 'request-A');
    assert.ok(page.find(n => n.props.role === 'alert'));
  }
});

test('devolución no se envía si falla el almacenamiento y bloquea doble clic mientras consulta', async () => {
  const base = storage(); base.setItem(returnKey, JSON.stringify(returnCommand)); let posts = 0, resolveLookup;
  const saved = { ...base, setItem() { throw new Error('Storage lleno'); } };
  const api = { get: async () => ({ data: [] }), post: async () => { posts++; } };
  const blocked = makeReturns(saved, api); await settleReturns(blocked); await confirmReturn(blocked); blocked.render();
  assert.equal(posts, 0);
  const page = makeReturns(base, { get: url => url.endsWith('/request-A') ? new Promise(resolve => { resolveLookup = resolve; }) : Promise.resolve({ data: [] }), post: async () => { posts++; return { data: returnReceipt }; } });
  await settleReturns(page); const first = confirmReturn(page); await confirmReturn(page);
  resolveLookup({ data: { estado: 'AUTORIZADA', resultado: null } }); await first; await new Promise(resolve => setImmediate(resolve)); page.render();
  assert.equal(posts, 1); assert.ok(base.getItem(returnKey));
});

test('devolución descarta respuesta antigua al cambiar de usuario y no elimina su pendiente', async () => {
  const saved = storage(); saved.setItem(returnKey, JSON.stringify(returnCommand)); let resolveLookup, posts = 0;
  let user = { id: 'user-A', rol: 'CAJERO' };
  const page = makeReturns(saved, { get: url => url.endsWith('/request-A') ? new Promise(resolve => { resolveLookup = resolve; }) : Promise.resolve({ data: [] }), post: async () => { posts++; } }, { '../context/TenantContext': { useTenant: () => ({ tenant: { id: 'tenant-A' }, user }) } });
  await settleReturns(page); const first = confirmReturn(page);
  user = { id: 'user-B', rol: 'CAJERO' }; await settleReturns(page);
  resolveLookup({ data: { estado: 'AUTORIZADA', resultado: null } }); await first; await new Promise(resolve => setImmediate(resolve)); page.render();
  assert.equal(posts, 0); assert.ok(saved.getItem(returnKey));
  assert.equal(saved.getItem('ferre_pending_return:tenant-A:user-B'), null);
  assert.equal(page.find(n => n.children.includes('Cerrar comprobante')), undefined);
});

test('devolución antigua y pendiente corrupto se conservan sin crear una solicitud nueva', async () => {
  const saved = storage(); saved.setItem(returnKey, JSON.stringify({ saleId: 'sale-A', dto: { solicitudId: 'request-A', motivo: 'Anterior' } })); let posts = 0;
  const page = makeReturns(saved, { get: async url => ({ data: url.includes('/devoluciones/request-A') ? returnReceipt : [] }), post: async () => { posts++; } });
  await settleReturns(page); await confirmReturn(page); page.render();
  assert.equal(posts, 0); assert.ok(page.find(n => n.children.includes('Cerrar comprobante')));
  const corrupt = storage(); corrupt.setItem(returnKey, '{broken');
  const blocked = makeReturns(corrupt, { get: async () => ({ data: [] }), post: async () => { posts++; } });
  await settleReturns(blocked);
  assert.equal(corrupt.getItem(returnKey), '{broken');
  assert.equal(blocked.find(n => n.children.includes('Buscar venta')).props.disabled, true);
});

test('corregir solicitud no confirmada conserva UUID y una respuesta tardía se recupera sin otro POST', async () => {
  const saved = storage();
  const dto = { solicitudId: 'request-A', motivo: 'Original', metodo: 'EFECTIVO', items: [{ detalleId: 'line-A', cantidad: 1, destino: 'INVENTARIO' }] };
  saved.setItem(returnKey, JSON.stringify({ kind: 'SOLICITAR', requestId: 'request-A', saleId: 'sale-A', dto }));
  let registered = false, posts = 0;
  const page = makeReturns(saved, { get: async url => {
    if (!url.endsWith('/request-A')) return { data: [] };
    if (!registered) throw { response: { status: 404 } };
    return { data: { estado: 'PENDIENTE', venta_id: 'sale-A', comando: dto } };
  }, post: async () => { posts++; } });
  await settleReturns(page);
  page.find(n => n.children.includes('Corregir solo si no está registrada')).props.onClick();
  await new Promise(resolve => setImmediate(resolve)); page.render();
  assert.equal(JSON.parse(saved.getItem(returnKey)).requestId, 'request-A');
  assert.equal(page.find(n => n.children.includes('Buscar venta')).props.disabled, false);
  registered = true; await confirmReturn(page); page.render();
  assert.equal(posts, 0); assert.equal(saved.getItem(returnKey), null);
});

test('respuesta tardía con datos originales distintos recupera la solicitud sin sobrescribirla', async () => {
  const saved = storage();
  const original = { solicitudId: 'request-A', motivo: 'Original', metodo: 'EFECTIVO', items: [{ detalleId: 'line-A', cantidad: 1, destino: 'INVENTARIO' }] };
  saved.setItem(returnKey, JSON.stringify({ kind: 'SOLICITAR', requestId: 'request-A', saleId: 'sale-A', dto: { ...original, motivo: 'Corregido' } }));
  let posts = 0;
  const page = makeReturns(saved, { get: async url => ({ data: url.endsWith('/request-A') ? { venta_id: 'sale-A', comando: original, estado: 'PENDIENTE' } : [] }), post: async () => { posts++; } });
  await settleReturns(page); await confirmReturn(page); page.render();
  assert.equal(posts, 0); assert.equal(saved.getItem(returnKey), null);
  assert.ok(page.find(n => n.children.some(value => typeof value === 'string' && value.includes('Tus correcciones no la modificaron'))));
});

test('importación rechaza Excel y archivos mayores de 5 MB antes de analizar datos', async () => {
  let parses=0;
  const page=harness('src/components/ImportarProductosModal.tsx','ImportarProductosModal',{
    papaparse:{parse(){parses++;}},'../utils/api':{api:{get:async()=>({data:[]})}},
  });
  page.render({isOpen:true,onClose(){}});await page.effects();page.render({isOpen:true,onClose(){}});
  for(const file of [{name:'productos.xlsx',size:100},{name:'productos.csv',size:6*1024*1024}]){
    page.find(n=>n.props.type==='file').props.onChange({target:{files:[file]}});
    page.render({isOpen:true,onClose(){}});
  }
  assert.equal(parses,0);
  assert.ok(page.find(n=>n.children.includes('Selecciona un archivo CSV de hasta 5 MB. Si usas Excel, guárdalo como CSV UTF-8.')));
});

test('importación bloquea CSV con errores de formato o más de 5000 filas',async()=>{
  let result={data:Array(5001).fill({nombre:'Producto'}),errors:[]};
  const page=harness('src/components/ImportarProductosModal.tsx','ImportarProductosModal',{
    papaparse:{parse(file,options){options.complete(result);}},'../utils/api':{api:{get:async()=>({data:[]})}},
  });
  page.render({isOpen:true,onClose(){}});await page.effects();page.render({isOpen:true,onClose(){}});
  for(const parsed of [result,{data:[{nombre:'Producto'}],errors:[{message:'Comillas inválidas'}]}]){
    result=parsed;page.find(n=>n.props.type==='file').props.onChange({target:{files:[{name:'productos.CSV',size:100}]}});
    page.render({isOpen:true,onClose(){}});
    assert.ok(page.find(n=>n.children.includes('Revisa el formato CSV y utiliza como máximo 5000 filas por archivo.')));
  }
});

test('respuesta vacía del servidor elimina apariencia antigua sin perder sucursal local', async () => {
  const saved = storage();
  saved.setItem('ferre_user', JSON.stringify({ id:'user-A', rol:'ADMIN' }));
  saved.setItem('ferre_tenant', JSON.stringify({ id:'tenant-A', templateVersion:'v2', v2Mode:'dark', fuenteTitulos:'Poppins', modoNavegacion:'TOPNAV', sucursal:'Norte', direccion:'Antigua', impuesto:{ tasa:0 } }));
  const page=harness('src/context/TenantContext.tsx','TenantProvider', { '../utils/api':{ api:{ get:async()=>({ data:{ id:'tenant-A', configuracion:{}, modulosHabilitados:[] } }) } } },saved);
  page.render(); await page.effects(); page.render();
  const tenant=page.find(node=>node.type==='ContextProvider').props.value.tenant;
  assert.equal(tenant.templateVersion,'v1'); assert.equal(tenant.v2Mode,'light');
  assert.equal(tenant.fuenteTitulos,'Archivo'); assert.equal(tenant.modoNavegacion,'SIDEBAR');
  assert.equal(tenant.impuesto.tasa,15); assert.equal(tenant.direccion,''); assert.equal(tenant.sucursal,'Norte');
});

test('lecturas fuera de orden y versiones antiguas no reemplazan el último servidor aceptado', async () => {
  const saved=storage(), pending=[];
  saved.setItem('ferre_user',JSON.stringify({ id:'user-A', rol:'ADMIN' }));
  saved.setItem('ferre_tenant',JSON.stringify({ id:'tenant-A' }));
  const page=harness('src/context/TenantContext.tsx','TenantProvider',{ '../utils/api':{ api:{ get:()=>new Promise(resolve=>pending.push(resolve)) } } },saved);
  page.render(); await page.effects(); page.fireFocus();
  pending[1]({ data:{ id:'tenant-A', nombreComercial:'Nueva', modoNavegacion:'TOPNAV', updatedAt:'2026-10-06T12:00:00Z', configuracion:{ templateVersion:'v2' } } });
  await new Promise(resolve=>setImmediate(resolve));
  pending[0]({ data:{ id:'tenant-A', nombreComercial:'Vieja', updatedAt:'2026-10-06T11:00:00Z', configuracion:{} } });
  await new Promise(resolve=>setImmediate(resolve)); page.render(); page.fireFocus();
  pending[2]({ data:{ id:'tenant-A', nombreComercial:'Replica atrasada', updatedAt:'2026-10-06T11:30:00Z', configuracion:{} } });
  await new Promise(resolve=>setImmediate(resolve)); page.render();
  const tenant=page.find(node=>node.type==='ContextProvider').props.value.tenant;
  assert.equal(tenant.nombreComercial,'Nueva'); assert.equal(tenant.templateVersion,'v2');
  assert.equal(tenant.modoNavegacion,'TOPNAV');
});

test('respuesta de la misma cuenta con otro token de sesión no se aplica', async () => {
  const saved=storage(); let finish;
  saved.setItem('ferre_user',JSON.stringify({ id:'user-A', rol:'ADMIN' }));
  saved.setItem('ferre_tenant',JSON.stringify({ id:'tenant-A', nombreComercial:'Actual' })); saved.setItem('ferre_token','login-1');
  const page=harness('src/context/TenantContext.tsx','TenantProvider',{ '../utils/api':{ api:{ get:()=>new Promise(resolve=>{finish=resolve;}) } } },saved);
  page.render(); await page.effects(); saved.setItem('ferre_token','login-2');
  finish({ data:{ id:'tenant-A', nombreComercial:'Respuesta anterior' } });
  await new Promise(resolve=>setImmediate(resolve)); page.render();
  assert.equal(page.find(node=>node.type==='ContextProvider').props.value.tenant.nombreComercial,'Actual');
});
