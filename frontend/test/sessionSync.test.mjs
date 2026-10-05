import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(get) {
  const values=new Map([['ferre_user',JSON.stringify({id:'user-A',rol:'ADMIN',nombre:'Usuario'})],['ferre_tenant',JSON.stringify({id:'tenant-A'})],['ferre_token','token-A']]);
  const listeners=new Map(); let timer;
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const events={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  const document={...events,visibilityState:'visible'};
  const context={exports:{},localStorage,document,window:events,setInterval:fn=>{timer=fn;return 1;},clearInterval:()=>{timer=null;}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/sessionSync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  const users=[]; const stop=context.exports.startSessionSync(get,user=>users.push(user));
  return {users,localStorage,stop,document,fire:key=>listeners.get(key)?.(),poll:()=>timer?.()};
}
const profile={sub:'user-A',tenantId:'tenant-A',rol:'CAJERO',permisos:['pos.vender'],permisosConfigurados:true,descuentoMaximo:3};
test('sesión abierta actualiza rol, permisos y descuento sin cambiar identidad',async()=>{
  const h=setup(async()=>({data:{user:profile}}));await tick();
  assert.equal(h.users[0].rol,'CAJERO');assert.equal(h.users[0].nombre,'Usuario');
  assert.equal(JSON.parse(h.localStorage.getItem('ferre_user')).descuentoMaximo,3);
  h.stop();
});
test('respuesta antigua no modifica un login o empresa nuevos',async()=>{
  let resolve;const h=setup(()=>new Promise(done=>resolve=done));
  h.localStorage.setItem('ferre_user',JSON.stringify({id:'user-B',rol:'ADMIN'}));
  resolve({data:{user:profile}});await tick();assert.equal(h.users.length,0);
  assert.equal(JSON.parse(h.localStorage.getItem('ferre_user')).id,'user-B');h.stop();
});
test('focus y sondeo no duplican consultas; fallo de red conserva sesión y permite reintentar',async()=>{
  let calls=0,resolve;
  const h=setup(()=>{calls++;return calls===1?Promise.reject(Error('offline')):new Promise(done=>resolve=done);});
  await tick();assert.equal(h.users.length,0);h.fire('focus');h.poll();assert.equal(calls,2);
  resolve({data:{user:profile}});await tick();assert.equal(h.users.length,1);h.stop();
});
test('una sincronización detenida o una identidad ajena no actualizan permisos',async()=>{
  let resolve;const h=setup(()=>new Promise(done=>resolve=done));h.stop();resolve({data:{user:profile}});await tick();assert.equal(h.users.length,0);
  const other=setup(async()=>({data:{user:{...profile,tenantId:'tenant-B'}}}));await tick();assert.equal(other.users.length,0);other.stop();
});
