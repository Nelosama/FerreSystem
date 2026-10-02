import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import axios from 'axios';

function setup(adapter) {
  const values = new Map([['ferre_token', 'old-token']]);
  const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const window = { location: { pathname: '/', href: '/' } };
  const context = { exports: {}, localStorage, window };
  const code = ts.transpileModule(fs.readFileSync('src/utils/authInterceptors.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, context);
  const api = axios.create({ adapter });
  context.exports.installAuthInterceptors(api);
  return { api, localStorage, window };
}
const ok = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const unauthorized = (config) => { throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, { status: 401, config, data: {}, headers: {} }); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('renovaciones simultáneas comparten una petición y reintentan con el token nuevo', async () => {
  const gate = deferred(); let refreshes = 0;
  const { api, localStorage } = setup(async (config) => {
    if (config.url === '/auth/refresh') { refreshes++; await gate.promise; return ok(config, { accessToken: 'new-token' }); }
    if (config.headers.Authorization === 'Bearer old-token') unauthorized(config);
    return ok(config, { success: true });
  });
  const requests = Promise.all([api.get('/productos'), api.get('/clientes'), api.get('/usuarios')]);
  await tick(); assert.equal(refreshes, 1); gate.resolve();
  assert.equal((await requests).length, 3);
  assert.equal(localStorage.getItem('ferre_token'), 'new-token');
});

test('una renovación antigua no reemplaza un login reciente ni lo cierra', async () => {
  const gate = deferred();
  const { api, localStorage, window } = setup(async (config) => {
    if (config.url === '/auth/refresh') { await gate.promise; return ok(config, { accessToken: 'stale-token' }); }
    unauthorized(config);
  });
  const request = api.get('/productos');
  const rejected = assert.rejects(request);
  await tick(); localStorage.setItem('ferre_token', 'new-login'); gate.resolve(); await rejected;
  assert.equal(localStorage.getItem('ferre_token'), 'new-login');
  assert.equal(window.location.href, '/');
});

test('soporte renueva con el superadmin guardado y conserva ambas identidades', async () => {
  const calls = [];
  const { api, localStorage } = setup(async (config) => {
    calls.push([config.url, config.headers.Authorization]);
    if (config.url === '/admin/auth/refresh') return ok(config, { accessToken: 'admin-new' });
    if (config.url === '/admin/support/token') {
      if (config.headers.Authorization === 'Bearer admin-old') unauthorized(config);
      return ok(config, { accessToken: 'support-new' });
    }
    if (config.headers.Authorization === 'Bearer old-token') unauthorized(config);
    return ok(config, []);
  });
  localStorage.setItem('ferre_original_superadmin_token', 'admin-old');
  localStorage.setItem('ferre_support_target', JSON.stringify({ tenantId: 't1', usuarioId: 'u1', readOnly: true }));
  await api.get('/productos');
  assert.equal(localStorage.getItem('ferre_token'), 'support-new');
  assert.equal(localStorage.getItem('ferre_original_superadmin_token'), 'admin-new');
  assert.ok(calls.some(([url, header]) => url === '/admin/support/token' && header === 'Bearer admin-new'));
  assert.ok(!calls.some(([url]) => url === '/auth/refresh'));
});

test('no intenta renovar errores de login ni errores sin configuración', async () => {
  let calls = 0;
  const { api } = setup(async (config) => { calls++; unauthorized(config); });
  await assert.rejects(api.post('/admin/auth/login', {}));
  assert.equal(calls, 1);
});
