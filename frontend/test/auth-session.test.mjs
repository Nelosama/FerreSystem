import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import axios from 'axios';

function setup(adapter) {
  const values = new Map([['ferre_token', 'old-token']]);
  const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const window = { location: { pathname: '/', href: '/' }, dispatchEvent() {} };
  const context = { exports: {}, localStorage, sessionStorage: { setItem() {}, removeItem() {} }, window, Event, atob };
  const code = ts.transpileModule(fs.readFileSync('src/utils/authInterceptors.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, context);
  const api = axios.create({ adapter });
  context.exports.installAuthInterceptors(api);
  return { api, localStorage, window, notices: context.exports };
}
const ok = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const unauthorized = (config) => { throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, { status: 401, config, data: {}, headers: {} }); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('un rechazo de credenciales en seguridad no renueva sesión ni repite un cambio sensible', async () => {
  const calls = [];
  const { api } = setup(async config => { calls.push(config.url); unauthorized(config); });
  await assert.rejects(api.post('/auth/security/change-password', { currentPassword: 'wrong', password: 'Synthetic-New-123' }));
  assert.deepEqual(calls, ['/auth/security/change-password']);
});

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

for (const status of [403, 502, 503, 504]) {
  test(`renovación HTTP ${status} conserva una sesión potencialmente válida`, async () => {
    const { api, localStorage, window } = setup(async config => {
      if (config.url === '/auth/refresh') throw new axios.AxiosError('Temporal', 'ERR_BAD_RESPONSE', config, {}, { status, config, data: {}, headers: {} });
      unauthorized(config);
    });
    await assert.rejects(api.get('/productos'), error => error.response?.status === status);
    assert.equal(localStorage.getItem('ferre_token'), 'old-token');
    assert.equal(window.location.href, '/');
  });
}

test('401 tardío reutiliza la renovación terminada sin abrir otra ni fallar la consulta', async () => {
  const gate = deferred(); let refreshes = 0;
  const { api } = setup(async config => {
    if (config.url === '/auth/refresh') { refreshes++; return ok(config, { accessToken: 'new-token' }); }
    if (config.headers.Authorization === 'Bearer old-token') {
      if (config.url === '/lenta') await gate.promise;
      unauthorized(config);
    }
    return ok(config, []);
  });
  const slow = api.get('/lenta');
  await api.get('/productos'); gate.resolve();
  await slow;
  assert.equal(refreshes, 1);
});

test('401 terminal simultáneo limpia una sola sesión y nunca confirma operaciones rechazadas', async () => {
  const gate = deferred(); let refreshes = 0;
  const { api, localStorage } = setup(async config => {
    if (config.url === '/auth/refresh') { refreshes++; await gate.promise; }
    unauthorized(config);
  });
  localStorage.setItem('ferre_user', JSON.stringify({ id: 'u' }));
  localStorage.setItem('ferre_tenant', JSON.stringify({ id: 't' }));
  const requests = Promise.allSettled([api.post('/levantamientos/l/items', { solicitudId: 'same' }), api.get('/productos'), api.get('/clientes')]);
  await tick(); gate.resolve();
  assert.ok((await requests).every(result => result.status === 'rejected'));
  assert.equal(refreshes, 1);
  for (const key of ['ferre_token', 'ferre_user', 'ferre_tenant']) assert.equal(localStorage.getItem(key), null);
});

test('403 de un módulo nunca renueva ni cierra una sesión válida', async () => {
  let calls = 0;
  const { api, localStorage } = setup(async config => { calls++; throw new axios.AxiosError('Prohibido', 'ERR_BAD_REQUEST', config, {}, { status: 403, config, data: {}, headers: {} }); });
  await assert.rejects(api.get('/admin/tenants'), error => error.response?.status === 403);
  assert.equal(calls, 1); assert.equal(localStorage.getItem('ferre_token'), 'old-token');
});

test('un segundo 401 tras renovar invalida sin bucles ni otra renovación', async () => {
  let refreshes = 0;
  const { api, localStorage } = setup(async config => {
    if (config.url === '/auth/refresh') { refreshes++; return ok(config, { accessToken: 'new-token' }); }
    unauthorized(config);
  });
  await assert.rejects(api.get('/productos'));
  assert.equal(refreshes, 1); assert.equal(localStorage.getItem('ferre_token'), null);
});

test('una respuesta vieja de productos no llega al estado del usuario nuevo', async () => {
  const gate = deferred();
  const { api, localStorage } = setup(async config => { await gate.promise; return ok(config, [{ nombre: 'Privado anterior' }]); });
  localStorage.setItem('ferre_user', JSON.stringify({ id: 'u1' }));
  localStorage.setItem('ferre_tenant', JSON.stringify({ id: 't1' }));
  const rejected = assert.rejects(api.get('/productos'), /sesión cambió/);
  await tick(); localStorage.setItem('ferre_user', JSON.stringify({ id: 'u2' })); localStorage.setItem('ferre_tenant', JSON.stringify({ id: 't2' })); gate.resolve(); await rejected;
});

for (const code of ['ERR_NETWORK', 'ECONNABORTED']) {
  test(`renovación ${code} propaga error recuperable y conserva credenciales`, async () => {
    const { api, localStorage } = setup(async config => {
      if (config.url === '/auth/refresh') throw new axios.AxiosError('Error de red', code, config);
      unauthorized(config);
    });
    await assert.rejects(api.get('/productos'), error => error.code === code);
    assert.equal(localStorage.getItem('ferre_token'), 'old-token');
  });
}

const jwtToken = claims => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`;
test('expiración conocida renueva antes de enviar la consulta de inventario', async () => {
  const calls=[];const base={sub:'u',tenantId:'t',type:'tenant',sid:'s'};
  const {api,localStorage}=setup(async config=>{calls.push(config.url);return ok(config,config.url==='/auth/refresh'?{accessToken:jwtToken({...base,iat:Date.now()/1000,exp:Date.now()/1000+900})}:[]);});
  localStorage.setItem('ferre_token',jwtToken({...base,exp:Date.now()/1000-86400}));
  await api.get('/levantamientos');assert.deepEqual(calls,['/auth/refresh','/levantamientos']);
});
test('reloj adelantado no genera un bucle con el JWT recién emitido', async()=>{
  const calls=[];const base={sub:'u',tenantId:'t',type:'tenant',sid:'s'};
  const {api,localStorage}=setup(async config=>{calls.push(config.url);return ok(config,config.url==='/auth/refresh'?{accessToken:jwtToken({...base,iat:Date.now()/1000-4500,exp:Date.now()/1000-3600})}:[]);});
  localStorage.setItem('ferre_token',jwtToken({...base,exp:Date.now()/1000-86400}));
  await api.get('/auth/me');await api.get('/levantamientos');assert.equal(calls.filter(x=>x==='/auth/refresh').length,1);
});
test('refresh de otro usuario/tenant nunca reemplaza la identidad anterior',async()=>{
  const base={sub:'u',tenantId:'t',type:'tenant',sid:'s',exp:Date.now()/1000+900};
  const {api,localStorage}=setup(async config=>{if(config.url==='/auth/refresh')return ok(config,{accessToken:jwtToken({...base,sub:'otro',tenantId:'ajeno'})});unauthorized(config);});
  localStorage.setItem('ferre_token',jwtToken(base));await assert.rejects(api.get('/productos'),/otra identidad/);assert.equal(localStorage.getItem('ferre_token'),null);
});
test('una renovación de la misma sesión en otra pestaña recupera un 401 tardío',async()=>{
  const gate=deferred(),base={sub:'u',tenantId:'t',type:'tenant',sid:'s',exp:Date.now()/1000+900};let calls=0;
  const {api,localStorage}=setup(async config=>{calls++;if(calls===1){await gate.promise;unauthorized(config);}return ok(config,[]);});
  localStorage.setItem('ferre_token',jwtToken(base));const request=api.get('/productos');await tick();localStorage.setItem('ferre_token',jwtToken({...base,exp:base.exp+900}));gate.resolve();await request;assert.equal(calls,2);
});

test('Super Admin usa su cookie de renovación también al validar /auth/me',async()=>{
  const calls=[],base={sub:'sa',type:'super_admin',rol:'SUPER_ADMIN',sid:'sa-session'};
  const {api,localStorage}=setup(async config=>{calls.push(config.url);return ok(config,config.url==='/admin/auth/refresh'?{accessToken:jwtToken({...base,exp:Date.now()/1000+900})}:{user:{...base}});});
  localStorage.setItem('ferre_token',jwtToken({...base,exp:Date.now()/1000-86400}));
  localStorage.setItem('ferre_user',JSON.stringify({id:'sa',rol:'SUPERADMIN'}));
  await api.get('/auth/me');assert.deepEqual(calls,['/admin/auth/refresh','/auth/me']);
});


test('el aviso de vencimiento pertenece a la sesión actual y no a una visita inicial', async () => {
  const { api, localStorage, notices } = setup(unauthorized);
  assert.equal(notices.hasSessionExpiredNotice(), false);
  await assert.rejects(api.get('/productos'));
  assert.equal(notices.hasSessionExpiredNotice(), true);
  assert.equal(localStorage.getItem('ferre_token'), null);
  notices.clearSessionExpiredNotice();
  assert.equal(notices.hasSessionExpiredNotice(), false);
  const fresh = setup(unauthorized);
  fresh.localStorage.removeItem('ferre_token');
  await assert.rejects(fresh.api.get('/productos'));
  assert.equal(fresh.notices.hasSessionExpiredNotice(), false);
});
