import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';

function modulos(externos = {}) {
  const cache = new Map();
  function cargar(archivo) {
    const ruta = path.resolve(archivo);
    if (cache.has(ruta)) return cache.get(ruta);
    const m = { exports: {} }; cache.set(ruta, m.exports);
    const codigo = ts.transpileModule(fs.readFileSync(ruta, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('exports', 'require', 'module', codigo)(m.exports, n => {
      if (n in externos) return externos[n];
      if (!n.startsWith('.')) throw new Error(n);
      return cargar(path.join(path.dirname(ruta), `${n}.ts`));
    }, m);
    return m.exports;
  }
  return cargar;
}
const usuario = (id, tenantId, rol = 'CAJERO') => ({ id, tenantId, rol });
const sesion = u => ({ usuarioId: u.id, tenantId: u.tenantId, rol: u.rol });
const A1 = usuario('a1', 'A'), A2 = usuario('a2', 'A'), AA = usuario('admin-a', 'A', 'ADMIN');
const B1 = usuario('b1', 'B'), BA = usuario('admin-b', 'B', 'ADMIN');
const op = (id, cajeroId, tenantId, extra = {}) => ({
  operacionId: id, ...(tenantId ? { tenantId } : {}), cajeroId, cajeroNombre: cajeroId,
  dispositivoId: 'd', cajaId: 'c', ventanaId: 'v-vieja', secuenciaLocal: Number(id.replace(/\D/g, '')) || 1,
  correlativoLocal: `CT-01-${id}`, creadaAt: '2026-11-03T18:00:00Z', ocurridoAtLocal: '2026-11-03T18:00:00Z',
  lineas: [{ productoId: 'p', codigo: 'P', nombre: 'Producto', precioCentavos: 1000, cantidadCentesimas: 100 }],
  subtotalCentavos: 1000, isvCentavos: 150, totalCentavos: 1150, efectivoRecibidoCentavos: 1200, cambioCentavos: 50,
  clienteNombre: id, clienteRtn: '', esquemaVersion: 1, intentos: 0, estado: 'PENDIENTE', conflictos: [], ...extra,
});
async function escenario(ops) {
  globalThis.indexedDB = new IDBFactory();
  const cargar = modulos(), db = cargar('src/offline/db.ts');
  await db.transaccion(['operaciones'], 'readwrite', tx => { for (const o of ops) tx.objectStore('operaciones').add(o); });
  return { cargar, db, journal: cargar('src/offline/journal.ts'), sync: cargar('src/offline/sync.ts') };
}
const mezcladas = () => [op('a-1', 'a1', 'A'), op('a-2', 'a2', 'A'), op('b-3', 'b1', 'B'), op('vieja-4', 'a1'), op('desconocida-5', 'otro')];

for (const [u, ids] of [[A1, ['a-1', 'vieja-4']], [A2, ['a-2']], [AA, ['a-1', 'a-2']], [B1, ['b-3']], [BA, ['b-3']], [usuario('a1','B'), []], [usuario('a1','A','VENDEDOR'), []]]) {
  test(`envío y conteo de ${u.id}/${u.tenantId}/${u.rol}`, async () => {
    const e = await escenario(mezcladas());
    // Un histórico del mismo usuario solo es atribuible cuando no declara empresa contradictoria.
    const esperados = u.id === 'a1' && u.tenantId === 'B' ? ['vieja-4'] : ids;
    assert.deepEqual(mezcladas().filter(o => e.sync.puedeEnviar(o, u)).map(o => o.operacionId), esperados);
    assert.equal(await e.journal.contarVentasPorEnviar(sesion(u)), esperados.length);
    assert.equal(await e.journal.contarVentasPorEnviar(null), 0);
  });
}

test('históricos: evidencia de ventana, sin atribución ni reescritura por la sesión actual', async () => {
  const e = await escenario([op('vieja-1','a1'), op('ajena-2','b1','B')]);
  const inicial = await e.journal.listarOperaciones();
  assert.equal(await e.journal.contarVentasPorEnviar(sesion(AA)), 0);
  await e.db.escribirClave('ventana', 'activa', { ventanaId: 'v-vieja', tenantId: 'A' });
  assert.equal(await e.journal.contarVentasPorEnviar(sesion(AA)), 1);
  assert.equal(await e.journal.contarVentasPorEnviar(sesion(BA)), 1);
  assert.deepEqual(await e.journal.listarOperaciones(), inicial);
});

test('recuperación y revisión solo modifican operaciones accesibles de la empresa', async () => {
  const ops = [op('a-1','a1','A',{ estado:'ENVIANDO' }), op('b-2','b1','B',{ estado:'ENVIANDO' }), op('b-3','b1','B',{ estado:'REVISION' }), op('a-4','a2','A',{ estado:'REVISION' })];
  const e = await escenario(ops);
  await e.journal.recuperarEnvios(sesion(AA));
  const consultas = [];
  await e.sync.refrescarRevisiones({ get: async (_url, c) => { consultas.push(c.params.ids); return { data: [{ operacionId:'a-4', estado:'APLICADA' }, { operacionId:'b-3', estado:'APLICADA' }] }; } }, AA);
  assert.deepEqual(consultas, ['a-4']);
  const final = await e.journal.listarOperaciones();
  for (const o of ops.filter(o => o.tenantId === 'B')) assert.deepEqual(final.find(x=>x.operacionId===o.operacionId), o);
  assert.equal(final.find(o=>o.operacionId==='a-1').estado, 'PENDIENTE');
});

test('dos empresas, varios cajeros, reinicio y reintentos: sin UUID nuevos ni cambios de carga/secuencia', async () => {
  const inicial = mezcladas(), e = await escenario(inicial), recibidas = new Map();
  const apiPara = u => ({ post: async (_url, dto) => {
    assert.equal(dto.pendientesRestantes, 0);
    return { data: { resultados: dto.operaciones.map(o => {
      assert.ok(e.sync.puedeEnviar(inicial.find(x=>x.operacionId===o.operacionId),u));
      assert.ok(!('tenantId' in o));
      recibidas.set(o.operacionId, (recibidas.get(o.operacionId)||0)+1);
      return { operacionId:o.operacionId, estado:'APLICADA', ventaId:o.operacionId };
    }) } };
  } });
  assert.equal((await e.sync.sincronizarPendientes(apiPara(A1),'d',A1)).pendientes, 0);
  let reinicio = modulos()('src/offline/sync.ts');
  assert.equal((await reinicio.sincronizarPendientes(apiPara(BA),'d',BA)).aplicadas, 1);
  assert.equal((await reinicio.sincronizarPendientes(apiPara(AA),'d',AA)).aplicadas, 1);
  assert.equal((await reinicio.sincronizarPendientes(apiPara(AA),'d',AA)).aplicadas, 0);
  const final = await e.journal.listarOperaciones();
  for (const o of inicial) {
    const despues = final.find(x=>x.operacionId===o.operacionId);
    for (const campo of Object.keys(o).filter(k=>!['estado','conflictos'].includes(k))) assert.deepEqual(despues[campo],o[campo],campo);
  }
  assert.deepEqual(final.find(o=>o.operacionId==='desconocida-5'), inicial[4]);
  assert.equal([...recibidas.values()].every(n=>n===1),true);
});

test('rechazo de lote y envío individual no incluyen ventas de otra empresa ni de otro cajero', async () => {
  const e = await escenario(mezcladas()), enviados = [];
  const r = await e.sync.sincronizarPendientes({ post: async (_url,dto) => {
    enviados.push(dto.operaciones.map(o=>o.operacionId));
    if(dto.operaciones.length>1) throw { response:{ status:413 } };
    return { data:{ resultados:dto.operaciones.map(o=>({ operacionId:o.operacionId, estado:'APLICADA' })) } };
  } },'d',A1);
  assert.equal(r.aplicadas,2);
  assert.deepEqual(enviados,[['a-1','vieja-4'],['a-1'],['vieja-4']]);
});

test('sesión cambia entre lotes: el token de B nunca envía la cola de A', async () => {
  const inicial = Array.from({length:21},(_,i)=>op(`a-${i+1}`,'a1','A')).concat([op('b-50','b1','B')]);
  const e = await escenario(inicial), anteriorWindow = globalThis.window, anteriorStorage = globalThis.localStorage;
  const datos = new Map();
  const entrar = u => { datos.set('ferre_user',JSON.stringify({id:u.id})); datos.set('ferre_tenant',JSON.stringify({id:u.tenantId})); datos.set('ferre_token',`token-${u.tenantId}`); };
  globalThis.window = {};
  globalThis.localStorage = { getItem: k=>datos.get(k)||null };
  const envios = [];
  try {
    entrar(AA);
    const api = { post: async (_url,dto,config) => {
      envios.push({ids:dto.operaciones.map(o=>o.operacionId), auth:config.headers.Authorization});
      entrar(BA);
      return {data:{resultados:dto.operaciones.map(o=>({operacionId:o.operacionId,estado:'APLICADA'}))}};
    } };
    await assert.rejects(e.sync.sincronizarPendientes(api,'d',AA),/sesión cambió/);
    assert.equal(envios.length,1);
    assert.equal(envios[0].auth,'Bearer token-A');
    assert.ok(envios[0].ids.every(id=>id.startsWith('a-')));
    assert.deepEqual((await e.journal.listarOperaciones()).find(o=>o.tenantId==='B'),inicial.at(-1));
    await assert.rejects(e.sync.sincronizarPendientes(api,'d',AA),/sesión cambió/);
  } finally { globalThis.window=anteriorWindow; if(anteriorStorage===undefined) delete globalThis.localStorage; else globalThis.localStorage=anteriorStorage; }
});

test('nuevas operaciones requieren tenantId; no cambia el contador/secuencia al rechazar', async () => {
  const e = await escenario([]), nueva = op('nueva-1','a1',undefined);
  await assert.rejects(e.journal.registrarOperacion(nueva,'01',['uuid-1']),/empresa identificada/);
  assert.deepEqual(await e.journal.listarOperaciones(),[]);
  assert.equal(await e.db.leerClave('meta','secuencia'),undefined);
  const guardada = await e.journal.registrarOperacion({...nueva,tenantId:'A'},'01',['uuid-1']);
  assert.equal(guardada.operacionId,'uuid-1'); assert.equal(guardada.secuenciaLocal,1); assert.equal(guardada.tenantId,'A');
});

test('useConexion invalida el conteo en el primer render al cambiar empresa/usuario/rol y descarta lecturas tardías', async () => {
  const estados = [], pendientes = [];
  let indice = 0, efecto, intervalo, actual = A1, limpiar;
  const cargar = modulos({
    react: { useState: inicial => {
      const i = indice++;
      if (!(i in estados)) estados[i] = typeof inicial === 'function' ? inicial() : inicial;
      return [estados[i], valor => { estados[i] = typeof valor === 'function' ? valor(estados[i]) : valor; }];
    }, useEffect: fn => { efecto = fn; } },
    '../context/TenantContext': { useTenant: () => ({ user: actual, tenant:{ id:actual?.tenantId }, authStatus:'ready' }) },
    '../offline/journal': { contarVentasPorEnviar: sesion => new Promise((resolve,reject)=>pendientes.push({sesion,resolve,reject})) },
  });
  const hook = cargar('src/hooks/useConexion.ts').useConexion;
  const render = () => { indice=0; return hook(); };
  const commit = () => { limpiar?.(); limpiar=efecto(); };
  const anterior = globalThis.window;
  globalThis.window = {setInterval: fn=>{ intervalo=fn;return 1; },clearInterval(){},addEventListener(){},removeEventListener(){}};
  try {
    render(); commit();
    assert.deepEqual(pendientes[0].sesion,sesion(A1));
    pendientes.shift().resolve(7); await Promise.resolve();
    assert.equal(render().ventasPorEnviar,7);
    intervalo(); const tardia=pendientes.shift();
    actual=B1;
    assert.equal(render().ventasPorEnviar,0);
    assert.equal(render().estadoLectura,'cargando');
    commit(); pendientes.shift().resolve(2); await Promise.resolve();
    tardia.resolve(99); await Promise.resolve();
    assert.equal(render().ventasPorEnviar,2);
    actual=usuario('b1','B','ADMIN');
    assert.equal(render().ventasPorEnviar,0); commit();
    pendientes.shift().reject(new Error('lectura B')); await Promise.resolve();
    assert.equal(render().ventasPorEnviar,0);
    assert.equal(render().estadoLectura,'error');
    actual=null; assert.equal(render().ventasPorEnviar,0); commit();
    assert.equal(pendientes.length,0);
  } finally { limpiar?.(); globalThis.window=anterior; }
});

for (const accion of ['ventana', 'dispositivo']) test(`${accion}: una respuesta de la sesión anterior no reemplaza metadatos de otra empresa`, async () => {
  const e=await escenario([]), anteriorWindow=globalThis.window, anteriorStorage=globalThis.localStorage;
  const datos=new Map(), entrar=u=>{
    datos.set('ferre_user',JSON.stringify({id:u.id})); datos.set('ferre_tenant',JSON.stringify({id:u.tenantId})); datos.set('ferre_token',`token-${u.tenantId}`);
  };
  const dispositivo={id:'d',codigo:'01',nombre:'Equipo',registrado:true};
  const ventana={ventanaId:'v-A',tenantId:'A',productos:[{id:'producto-A'}],catalogoHash:'hash-A'};
  await e.db.escribirClave('ventana','activa',ventana);
  await e.db.escribirClave('meta','dispositivo',dispositivo);
  globalThis.window={}; globalThis.localStorage={getItem:k=>datos.get(k)||null};
  try {
    entrar(B1);
    const api={post:async (_url, cuerpo, config)=>{
      assert.equal(config.headers.Authorization,'Bearer token-B');
      if(accion==='ventana') assert.equal(cuerpo.catalogoHashActual,undefined,'no debe anunciar el catálogo de A en B');
      entrar(A1);
      return {data:accion==='ventana'?{ventana:{id:'v-B',usuarioId:'b1',cajaId:'c-B',catalogoHash:'hash-B'},catalogo:{productos:[]}}:{codigo:'02',nombre:'Equipo B'}};
    }};
    await assert.rejects(accion==='ventana'
      ?e.sync.renovarVentana(api,dispositivo,B1)
      :e.sync.registrarDispositivoEnServidor(api,dispositivo,B1),/sesión cambió/);
    assert.deepEqual(await e.db.leerClave('ventana','activa'),ventana);
    assert.deepEqual(await e.db.leerClave('meta','dispositivo'),dispositivo);
  } finally {globalThis.window=anteriorWindow;if(anteriorStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=anteriorStorage;}
});
