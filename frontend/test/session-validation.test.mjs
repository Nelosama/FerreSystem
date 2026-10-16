import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(read, superAdmin = false, offline = {}) {
  let now = Date.parse('2026-10-16T08:00:00Z');
  const values = new Map([['ferre_token','token'],['ferre_user',JSON.stringify({id:'u'})],['ferre_tenant',JSON.stringify({id:'t'})]]);
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,val) => values.set(key,val), removeItem: key => values.delete(key) };
  const window = new EventTarget(); window.location = { pathname: offline.path || '/levantamiento' };
  const document = new EventTarget(); document.visibilityState = 'visible'; document.documentElement = { dataset: {} };
  const timers = new Map(); let id=0, deadline;
  const auth = { SESSION_TIMEOUT_MS:10000, tokenExpiresAt: () => deadline };
  const context = { exports:{}, require: name => name.includes('offline/ventana') ? { leerVentana: async()=>offline.window, ventanaVigente: value=>value?.vigenteHasta > now } : auth, window, document, navigator:{onLine:offline.online ?? true}, localStorage,
    Date: { now: () => now }, setTimeout: (fn,ms) => {const key=++id;timers.set(key,{fn,at:now+ms});return key;}, clearTimeout:key=>timers.delete(key), setInterval:()=>++id, clearInterval(){} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/sessionValidation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  const statuses=[], profiles=[], changes=[];
  const stop = context.exports.startSessionValidation({ profile:read, userId:'u', tenantId:'t', superAdmin, onStatus:x=>statuses.push(x),onProfile:x=>profiles.push(x),onChanged:()=>changes.push(true) });
  return { statuses,profiles,changes,localStorage,stop,window,document,
    deadline: value=>deadline=value,
    advance: async ms=>{now+=ms; for(const [key,t] of timers) if(t.at<=now){timers.delete(key);t.fn();} await tick();},
    fire: name=>window.dispatchEvent(new Event(name)), now:()=>now };
}
const valid = {data:{user:{sub:'u',tenantId:'t',type:'tenant',rol:'ADMIN'}}};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('el perfil guardado no habilita módulos hasta recibir confirmación del servidor', async()=>{
  const gate=deferred(); const h=setup(()=>gate.promise);
  assert.deepEqual(h.statuses,['checking']); gate.resolve(valid); await tick();
  assert.equal(h.statuses.at(-1),'ready');h.stop();
});
test('restauración por pageshow, foco y visibilidad comparte una consulta y bloquea interacción',async()=>{
  let calls=0; const gate=deferred();const h=setup(()=>{calls++;return calls===1?Promise.resolve(valid):gate.promise;});await tick();
  h.fire('pageshow');h.fire('focus');h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls,2);assert.equal(h.statuses.at(-1),'checking');gate.resolve(valid);await tick();assert.equal(h.statuses.at(-1),'ready');h.stop();
});
test('reloj simulado renueva exactamente al vencimiento emitido sin esperar horas',async()=>{
  const gate=deferred();let calls=0;const h=setup(()=>{calls++;return gate.promise;});h.deadline(h.now()+900_000);gate.resolve(valid);await tick();
  await h.advance(899_999);assert.equal(calls,1);h.deadline(h.now()+900_000);await h.advance(1);assert.equal(calls,2);h.stop();
});
for (const failure of [{response:{status:403}}, {response:{status:502}}, {response:{status:503}}, {response:{status:504}}, {code:'ECONNABORTED'}, new Error('Network Error')]) {
  test(`perfil recuperable ${failure.response?.status || failure.code || 'red'} no borra sesión y reintenta manualmente`,async()=>{
    let calls=0;const h=setup(()=>++calls===1?Promise.reject(failure):Promise.resolve(valid));await tick();
    assert.equal(h.statuses.at(-1),failure.response?.status===403?'denied':'error');assert.equal(h.localStorage.getItem('ferre_token'),'token');
    h.fire('ferre:session-retry');await tick();assert.equal(h.statuses.at(-1),'ready');h.stop();
  });
}
test('cambiar de cuenta con lectura pendiente descarta la respuesta y conserva el nuevo login',async()=>{
  const gate=deferred();const h=setup(()=>gate.promise);h.localStorage.setItem('ferre_user',JSON.stringify({id:'otra'}));h.localStorage.setItem('ferre_token','nuevo');
  gate.resolve(valid);await tick();assert.equal(h.profiles.length,0);assert.equal(h.changes.length,1);assert.equal(h.localStorage.getItem('ferre_token'),'nuevo');h.stop();
});
test('perfil de otra empresa no autoriza ni contamina los datos',async()=>{
  const h=setup(async()=>({data:{user:{sub:'u',tenantId:'otra',type:'tenant'}}}));await tick();assert.equal(h.profiles.length,0);assert.equal(h.changes.length,1);h.stop();
});
test('Super Admin también exige validar su identidad en backend',async()=>{
  const h=setup(async()=>({data:{user:{sub:'u',type:'super_admin',rol:'SUPER_ADMIN'}}}),true);await tick();assert.equal(h.statuses.at(-1),'ready');h.stop();
});
test('ocultar pestaña retira datos y al volver valida antes de mostrarlos',async()=>{
  const h=setup(async()=>valid);await tick();h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.statuses.at(-1),'checking');assert.equal(h.document.documentElement.dataset.sessionPending,'true');
  h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(h.statuses.at(-1),'ready');h.stop();
});

test('desmontar durante una consulta no cambia el estado al terminar',async()=>{
  const gate=deferred();const h=setup(()=>gate.promise);h.stop();gate.resolve(valid);await tick();assert.equal(h.profiles.length,0);assert.deepEqual(h.statuses,['checking']);
});

test('storage invalida una pestaña oculta sin borrar la nueva cuenta',async()=>{
  const h=setup(async()=>valid);await tick();h.document.visibilityState='hidden';h.localStorage.setItem('ferre_user',JSON.stringify({id:'nuevo'}));h.localStorage.setItem('ferre_token','nuevo-token');
  const event=new Event('storage');event.key='ferre_user';h.window.dispatchEvent(event);await tick();assert.equal(h.changes.length,1);assert.equal(h.localStorage.getItem('ferre_token'),'nuevo-token');h.stop();
});

test('renovar token de la misma identidad no invalida el usuario',async()=>{
  let calls=0;const h=setup(async()=>{calls++;return valid;});await tick();h.localStorage.setItem('ferre_token','renovado');const event=new Event('storage');event.key='ferre_token';h.window.dispatchEvent(event);await tick();assert.equal(calls,2);assert.equal(h.changes.length,0);h.stop();
});

test('contingencia autorizada permite restauración offline exclusivamente al cajero y tenant de la ventana',async()=>{
  const h=setup(()=>{throw new Error('no debe consultar red');},false,{path:'/pos-contingencia',online:false,window:{tenantId:'t',cajeroId:'u',vigenteHasta:Date.parse('2026-10-16T10:00:00Z')}});await tick();assert.equal(h.statuses.at(-1),'offline');h.stop();
});
for (const failure of [new Error('Network Error'),{code:'ECONNABORTED'}]) {
  test(`red conectada sin salida (${failure.code || 'red'}) conserva la ventana ya autorizada`,async()=>{
    const h=setup(async()=>{throw failure;},false,{path:'/pos-contingencia',window:{tenantId:'t',cajeroId:'u',vigenteHasta:Date.parse('2026-10-16T10:00:00Z')}});await tick();assert.equal(h.statuses.at(-1),'offline');h.stop();
  });
}
for (const window of [{tenantId:'ajeno',cajeroId:'u',vigenteHasta:Infinity},{tenantId:'t',cajeroId:'ajeno',vigenteHasta:Infinity},{tenantId:'t',cajeroId:'u',vigenteHasta:0}]) {
  test(`ventana ajena o vencida no habilita el POS de contingencia: ${JSON.stringify(window)}`,async()=>{
    const h=setup(async()=>{throw new Error('offline');},false,{path:'/pos-contingencia',online:false,window});await tick();assert.equal(h.statuses.at(-1),'error');h.stop();
  });
}
test('un 403 explícito no puede evadirse usando la ventana local',async()=>{
  const h=setup(async()=>{throw {response:{status:403}};},false,{path:'/pos-contingencia',window:{tenantId:'t',cajeroId:'u',vigenteHasta:Infinity}});await tick();assert.equal(h.statuses.at(-1),'denied');h.stop();
});
