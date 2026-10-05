import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(get, role='ADMIN') {
  const values=new Map([['ferre_user',JSON.stringify({id:'user-A',rol:role,nombre:'Usuario'})],['ferre_tenant',JSON.stringify({id:'tenant-A'})],['ferre_token','token-A']]);
  const listeners=new Map(); let timer;
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const events={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  const document={...events,visibilityState:'visible'};
  const context={exports:{},localStorage,document,window:events,setInterval:fn=>{timer=fn;return 1;},clearInterval:()=>{timer=null;}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/sessionSync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  const users=[],changes=[]; const stop=context.exports.startSessionSync(get,user=>users.push(user),{userId:'user-A',tenantId:'tenant-A',onChanged:()=>changes.push(true)});
  return {users,changes,localStorage,stop,document,fire:(key,event)=>listeners.get(key)?.(event),poll:()=>timer?.()};
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

test('otro login antes del siguiente refresh invalida solo la pantalla local y conserva sus credenciales',async()=>{
  let calls=0;
  const h=setup(async()=>{calls++;return {data:{user:{...profile,rol:'ADMIN'}}};});await tick();
  h.localStorage.setItem('ferre_user',JSON.stringify({id:'user-B',rol:'ADMIN'}));
  h.localStorage.setItem('ferre_tenant',JSON.stringify({id:'tenant-B'}));
  h.localStorage.setItem('ferre_token','token-B');
  h.fire('focus');h.poll();await tick();
  assert.equal(calls,1);assert.equal(h.changes.length,1);
  assert.ok(h.users.every(user=>user.id==='user-A'));
  assert.equal(JSON.parse(h.localStorage.getItem('ferre_user')).id,'user-B');
  assert.equal(JSON.parse(h.localStorage.getItem('ferre_tenant')).id,'tenant-B');
  assert.equal(h.localStorage.getItem('ferre_token'),'token-B');h.stop();
});

test('cambio de sesión por storage se detecta oculta y descarta una consulta en vuelo',async()=>{
  let finish;const h=setup(()=>new Promise(resolve=>finish=resolve));
  h.document.visibilityState='hidden';
  h.localStorage.setItem('ferre_user',JSON.stringify({id:'user-B',rol:'ADMIN'}));
  h.localStorage.setItem('ferre_tenant',JSON.stringify({id:'tenant-B'}));
  h.localStorage.setItem('ferre_token','token-B');
  h.fire('storage',{key:'ferre_user'});
  finish({data:{user:profile}});await tick();
  assert.equal(h.changes.length,1);assert.equal(h.users.length,0);h.stop();
});

test('cerrar sesión en otra pestaña invalida localmente; renovar el token de la misma cuenta mantiene contexto',async()=>{
  let calls=0;const h=setup(async()=>{calls++;return {data:{user:profile}};});await tick();
  h.localStorage.setItem('ferre_token','renewed-token');h.fire('storage',{key:'ferre_token'});await tick();
  assert.equal(calls,2);assert.equal(h.changes.length,0);
  h.localStorage.removeItem('ferre_token');h.fire('storage',{key:'ferre_token'});await tick();
  assert.equal(h.changes.length,1);assert.equal(h.users.at(-1).id,'user-A');h.stop();
});

test('Superadmin conserva su flujo separado pero también invalida la pantalla ante otra identidad',async()=>{
  let calls=0;const h=setup(async()=>{calls++;return {data:{user:profile}};},'SUPERADMIN');await tick();
  h.fire('focus');await tick();assert.equal(calls,0);
  h.localStorage.setItem('ferre_user',JSON.stringify({id:'user-B',rol:'ADMIN'}));
  h.fire('storage',{key:'ferre_user'});await tick();
  assert.equal(h.changes.length,1);assert.equal(h.users.length,0);h.stop();
});
