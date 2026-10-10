import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

// Pruebas de CARACTERIZACIÓN del POS ante cortes de internet (docs/POS_OFFLINE_CONTINGENCIA_DISENO.md).
// Fijan el comportamiento ACTUAL sin cambiarlo. Una prueba que falle tras un PR futuro no es un error
// de la prueba: indica que ese PR cambió un comportamiento documentado y debe actualizarla a propósito.

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
};

const load = (file, globals = {}) => {
  const context = { exports: {}, console, ...globals, require: () => { throw new Error('sin dependencias'); } };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, context);
  return context.exports;
};

const UUID = '3f2b8c1e-9a4d-4e6b-8c7a-1d2e3f4a5b6c';
const line = { productoId: 'p1', codigo: 'C-1', nombre: 'Tornillo', cantidad: 2, precioUnitario: 10 };
const sale = (extra = {}) => ({
  cart: [line], clienteNombre: 'Mostrador', clienteRtn: '', metodoPago: 'EFECTIVO', descuentoPorcentaje: 0, ...extra,
});

// ───────────────────────── posRecovery (localStorage) ─────────────────────────

test('pendiente válido se recupera con su solicitudId y tiene prioridad sobre el borrador', () => {
  const localStorage = memoryStorage();
  const { readRecovery } = load('src/utils/posRecovery.ts', { localStorage });
  localStorage.setItem('pend', JSON.stringify({ ...sale(), solicitudId: UUID }));
  localStorage.setItem('draft', JSON.stringify({ version: 1, sale: sale({ clienteNombre: 'Otro' }) }));
  const result = readRecovery('pend', 'draft');
  assert.equal(result.error, null);
  assert.equal(result.pending.solicitudId, UUID);
  assert.equal(result.draft, null, 'con pendiente no se ofrece el borrador');
});

test('pendiente corrupto o sin UUID v4-formato válido NO se descarta ni se reemplaza: bloquea el cobro', () => {
  for (const raw of ['{no json', JSON.stringify({ ...sale(), solicitudId: 'abc' }), JSON.stringify({ ...sale(), cart: [], solicitudId: UUID })]) {
    const localStorage = memoryStorage();
    const { readRecovery } = load('src/utils/posRecovery.ts', { localStorage });
    localStorage.setItem('pend', raw);
    const result = readRecovery('pend', 'draft');
    assert.equal(result.pending, null);
    assert.match(result.error, /administrador/);
    assert.equal(localStorage.getItem('pend'), raw, 'el dato original sigue intacto');
  }
});

test('borrador: versión desconocida o inválido produce error; vacío elimina la clave; inválido no se guarda', () => {
  const localStorage = memoryStorage();
  const { readRecovery, saveDraft } = load('src/utils/posRecovery.ts', { localStorage });
  localStorage.setItem('draft', JSON.stringify({ version: 2, sale: sale() }));
  assert.match(readRecovery('pend', 'draft').error, /borrador/);

  saveDraft('d2', sale());
  assert.equal(JSON.parse(localStorage.getItem('d2')).version, 1);
  assert.ok(JSON.parse(localStorage.getItem('d2')).savedAt);
  saveDraft('d2', sale({ cart: [] }));
  assert.equal(localStorage.getItem('d2'), null);
  assert.throws(() => saveDraft('d3', sale({ descuentoPorcentaje: 101 })), /inválidos/);
  assert.equal(localStorage.getItem('d3'), null);
});

test('el borrador NO guarda catálogo ni libro de ventas: solo líneas, cliente, método y descuento', () => {
  const localStorage = memoryStorage();
  const { saveDraft } = load('src/utils/posRecovery.ts', { localStorage });
  saveDraft('d', sale());
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('d')).sale).sort(),
    ['cart', 'clienteNombre', 'clienteRtn', 'descuentoPorcentaje', 'metodoPago']);
});

test('cuota/almacenamiento lleno: saveDraft propaga el error (el POS bloquea el cobro) y readRecovery lo reporta', () => {
  const full = { ...memoryStorage(), setItem() { throw new DOMException('quota', 'QuotaExceededError'); } };
  const mod = load('src/utils/posRecovery.ts', { localStorage: full, DOMException });
  assert.throws(() => mod.saveDraft('d', sale()), /quota/);
  const broken = { getItem() { throw new Error('denegado'); } };
  const result = load('src/utils/posRecovery.ts', { localStorage: broken }).readRecovery('p', 'd');
  assert.match(result.error, /No se pudo acceder/);
});

test('un solo hueco de recuperación por usuario/empresa: las claves incluyen tenant y usuario', () => {
  const source = fs.readFileSync('src/pages/POSPage.tsx', 'utf8');
  assert.match(source, /`ferre_pending_sale:\$\{tenant\.id\}:\$\{user\?\.id \|\| ''\}`/);
  assert.match(source, /`ferre_sale_draft:\$\{tenant\.id\}:\$\{user\?\.id \|\| ''\}`/);
});

// ───────────────────────── identidad de solicitud ─────────────────────────

test('newRequestId genera UUID v4 con y sin crypto.randomUUID (LAN sin HTTPS)', () => {
  const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const withNative = load('src/utils/requestId.ts', { crypto: webcrypto });
  assert.match(withNative.newRequestId(), v4);
  const fallback = load('src/utils/requestId.ts', { crypto: { getRandomValues: (a) => webcrypto.getRandomValues(a) } });
  const ids = new Set(Array.from({ length: 200 }, () => fallback.newRequestId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, v4);
});

test('el POS genera la identidad de la venta con crypto.randomUUID directo (sin el fallback de requestId)', () => {
  // Hallazgo documentado: en HTTP de LAN (contexto no seguro) esta llamada no existe y el cobro falla antes de enviar.
  const source = fs.readFileSync('src/pages/POSPage.tsx', 'utf8');
  assert.match(source, /solicitudId: pendingIdentity \|\| crypto\.randomUUID\(\)/);
  assert.doesNotMatch(source, /newRequestId/);
});

// ───────────────────────── ausencia de capacidades offline ─────────────────────────

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

test('el service worker existe, no cachea la API y el POS base sigue sin persistir catálogo (el de contingencia es otra página)', () => {
  // Actualizado por el PR de contingencia: el shell se cachea; la API nunca. POSPage.tsx no cambió.
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  assert.match(sw, /url\.pathname\.startsWith\('\/api'\)\) return;/);
  assert.doesNotMatch(sw.replace(/\/\/.*$/gm, ''), /skipWaiting\(/);
  const hits = [];
  for (const file of [...walk('src'), 'index.html', 'vite.config.ts']) {
    if (!/\.(tsx?|html)$/.test(file)) continue;
    if (/offline|PosContingencia|ContingenciaAdmin/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/serviceWorker|indexedDB|workbox|caches\.open/.test(text)) hits.push(file);
  }
  assert.deepEqual(hits, ['src/main.tsx']);
  assert.ok(fs.existsSync('public/manifest.webmanifest'));
});

test('el catálogo del POS vive solo en estado React: no se persiste', () => {
  const source = fs.readFileSync('src/pages/POSPage.tsx', 'utf8');
  assert.match(source, /api\.get\('\/productos\/comercial'\)/);
  const writes = [...source.matchAll(/localStorage\.setItem\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(writes.sort(), ['pendingKey', 'pendingKey'].sort());
});

test('el cliente HTTP no define timeout: una red caída puede dejar la petición colgada', () => {
  const source = fs.readFileSync('src/utils/api.ts', 'utf8');
  assert.doesNotMatch(source, /timeout/);
});

test('la actualización de precios del carrito es un botón manual que reemplaza precios sin desglose', () => {
  const source = fs.readFileSync('src/pages/POSPage.tsx', 'utf8');
  assert.match(source, /Actualizar catálogo y precios del carrito/);
  assert.match(source, /\{\.\.\.i,precioUnitario:p\.precioVenta\}/);
});

// ───────────────────────── sesión y renovación (authInterceptors) ─────────────────────────

const interceptors = (localStorage, postImpl) => {
  let onRejected;
  const api = Object.assign(async (req) => ({ data: 'reintento', req }), {
    interceptors: { request: { use() {} }, response: { use: (_ok, bad) => { onRejected = bad; } } },
    post: postImpl,
  });
  const window = { location: { pathname: '/pos', href: '' } };
  const mod = load('src/utils/authInterceptors.ts', { localStorage, window });
  mod.installAuthInterceptors(api);
  return { fail: onRejected, window };
};

test('sin conexión (error sin respuesta) el interceptor NO toca la sesión ni redirige', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('ferre_token', 'T1');
  const { fail, window } = interceptors(localStorage, async () => { throw new Error('no debe llamarse'); });
  await assert.rejects(fail({ config: { url: '/ventas', headers: { Authorization: 'Bearer T1' } }, message: 'Network Error' }));
  assert.equal(localStorage.getItem('ferre_token'), 'T1');
  assert.equal(window.location.href, '');
});

test('401 con refresh que falla por red: conserva la sesión para reintentar al volver la conexión', async () => {
  // Cambio de comportamiento (PR de contingencia): sin respuesta de la API no se sabe si la sesión venció;
  // borrar el token en ese caso dejaba operaciones pendientes sin forma de enviarlas.
  const localStorage = memoryStorage();
  localStorage.setItem('ferre_token', 'T1');
  const { fail, window } = interceptors(localStorage, async () => { throw new Error('Network Error'); });
  await assert.rejects(fail({
    response: { status: 401 }, config: { url: '/ventas', headers: { Authorization: 'Bearer T1' } },
  }));
  assert.equal(localStorage.getItem('ferre_token'), 'T1');
  assert.equal(window.location.href, '');
});

test('401 con refresh rechazado por la API (sesión vencida de verdad): elimina el token y redirige', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('ferre_token', 'T1');
  const rechazo = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
  const { fail, window } = interceptors(localStorage, async () => { throw rechazo; });
  await assert.rejects(fail({
    response: { status: 401 }, config: { url: '/ventas', headers: { Authorization: 'Bearer T1' } },
  }));
  assert.equal(localStorage.getItem('ferre_token'), null);
  assert.equal(window.location.href, '/login');
});

test('401 con refresh correcto guarda el token nuevo y reintenta una sola vez', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('ferre_token', 'T1');
  const { fail } = interceptors(localStorage, async () => ({ data: { accessToken: 'T2' } }));
  const config = { url: '/ventas', headers: { Authorization: 'Bearer T1' } };
  const result = await fail({ response: { status: 401 }, config });
  assert.equal(localStorage.getItem('ferre_token'), 'T2');
  assert.equal(result.req._retry, true);
  assert.equal(result.req.headers.Authorization, 'Bearer T2');
});

test('la sesión vive en localStorage (token de acceso) y el refresh es cookie HttpOnly: no hay sesión offline', () => {
  const source = fs.readFileSync('src/utils/authInterceptors.ts', 'utf8');
  assert.match(source, /localStorage\.getItem\('ferre_token'\)/);
  assert.match(source, /api\.post\(admin \? '\/admin\/auth\/refresh' : '\/auth\/refresh'\)/);
});
