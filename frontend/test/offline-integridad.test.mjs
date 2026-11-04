import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

// Base sintética por escenario, con journal y transacciones reales (complete/abort).
function modulos(externos = {}) {
  const cache = new Map();
  function cargar(archivo) {
    const ruta = path.resolve(archivo);
    if (cache.has(ruta)) return cache.get(ruta);
    const modulo = { exports: {} };
    cache.set(ruta, modulo.exports);
    const codigo = ts.transpileModule(fs.readFileSync(ruta, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('exports', 'require', 'module', codigo)(modulo.exports, nombre => {
      if (nombre in externos) return externos[nombre];
      if (!nombre.startsWith('.')) throw new Error(nombre);
      return cargar(path.join(path.dirname(ruta), `${nombre}.ts`));
    }, modulo);
    return modulo.exports;
  }
  return cargar;
}
const usuario = { id: 'u', rol: 'CAJERO', tenantId: 'A' };
const sesion = { usuarioId: 'u', rol: 'CAJERO', tenantId: 'A' };
async function escenario(cantidad = 2) {
  globalThis.indexedDB = new IDBFactory();
  const cargar = modulos();
  const journal = cargar('src/offline/journal.ts'), sync = cargar('src/offline/sync.ts'), db = cargar('src/offline/db.ts');
  const ops = [], ids = Array.from({ length: cantidad }, (_, i) => `uuid-${i}`);
  for (let i = 0; i < cantidad; i++) ops.push(await journal.registrarOperacion({
    tenantId: 'A', dispositivoId: 'd', ventanaId: 'v', cajeroId: 'u', cajeroNombre: 'Ana', cajaId: 'c',
    ocurridoAtLocal: '2026-11-03T18:00:00Z', lineas: [{ productoId: 'p', codigo: 'P', nombre: 'Producto', cantidadCentesimas: 100, precioCentavos: 1000 }],
    subtotalCentavos: 1000, isvCentavos: 150, totalCentavos: 1150, efectivoRecibidoCentavos: 1200, cambioCentavos: 50,
    clienteNombre: '', clienteRtn: '', esquemaVersion: 1,
  }, '01', ids));
  const servidor = new Map(), envios = [];
  const api = { post: async (_url, dto) => {
    envios.push(structuredClone(dto.operaciones));
    return { data: { resultados: dto.operaciones.map(op => {
      if (servidor.has(op.operacionId)) assert.deepEqual(op, servidor.get(op.operacionId));
      else servidor.set(op.operacionId, structuredClone(op));
      return { operacionId: op.operacionId, estado: 'APLICADA', numeroVenta: 1, ventaId: op.operacionId };
    }) } };
  } };
  return { journal, sync, db, ops, api, servidor, envios };
}
function abortarConfirmacion(id) {
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (valor, ...args) {
    const peticion = original.call(this, valor, ...args);
    if (this.name === 'operaciones' && valor.operacionId === id && valor.estado === 'SINCRONIZADA') this.transaction.abort();
    return peticion;
  };
  return () => { IDBObjectStore.prototype.put = original; };
}
for (const aislada of [false, true]) test(`H-F1: abort después de respuesta y recuperación idempotente (aislada=${aislada})`, async () => {
  const e = await escenario();
  if (aislada) {
    const post = e.api.post;
    e.api.post = async (url, dto) => {
      if (dto.operaciones.length > 1) throw { response: { status: 413 } };
      return post(url, dto);
    };
  }
  const restaurar = abortarConfirmacion('uuid-1');
  try { await assert.rejects(e.sync.sincronizarPendientes(e.api, 'd', usuario)); }
  finally { restaurar(); }
  const despues = await e.journal.listarOperaciones();
  assert.deepEqual(despues.map(o => o.estado), ['SINCRONIZADA', 'ENVIANDO']);
  assert.equal(despues[1].sincronizadaAt, undefined);
  assert.equal(e.servidor.size, 2);
  // Reinicio de módulos: no se depende de confirmaciones en memoria.
  const sync = modulos()('src/offline/sync.ts');
  const resultado = await sync.sincronizarPendientes(e.api, 'd', usuario);
  assert.equal(resultado.aplicadas, 1);
  assert.equal(resultado.pendientes, 0);
  assert.equal(e.servidor.size, 2);
  assert.deepEqual(e.envios.at(-1), [e.sync.aOperacionDto(e.ops[1])]);
  const finales = await e.journal.listarOperaciones();
  for (let i = 0; i < finales.length; i++) {
    assert.deepEqual(e.sync.aOperacionDto(finales[i]), e.sync.aOperacionDto(e.ops[i]));
    assert.equal(finales[i].estado, 'SINCRONIZADA');
  }
});
test('interrupción sin confirmación: reenvía ENVIANDO con carga original', async () => {
  const e = await escenario(1);
  await e.journal.actualizarSincronizacion('uuid-0', { estado: 'ENVIANDO' });
  assert.equal((await modulos()('src/offline/sync.ts').sincronizarPendientes(e.api, 'd', usuario)).aplicadas, 1);
  assert.deepEqual(e.envios[0], [e.sync.aOperacionDto(e.ops[0])]);
});
for (const status of [401, 403, 408, 409, 429, 500, undefined]) test(`regresión HTTP ${status}: conserva carga y recuperación`, async () => {
  const e = await escenario(1);
  e.api.post = async () => { throw { response: status ? { status } : undefined, message: 'fallo HTTP' }; };
  assert.equal((await e.sync.sincronizarPendientes(e.api, 'd', usuario)).pendientes, 1);
  const [op] = await e.journal.listarOperaciones();
  assert.equal(op.estado, 'PENDIENTE');
  assert.deepEqual(e.sync.aOperacionDto(op), e.sync.aOperacionDto(e.ops[0]));
});
test('lectura: cero real/base ausente difieren de fallos de enumeración/transacción', async () => {
  const e = await escenario(0);
  assert.equal(await e.journal.contarVentasPorEnviar(sesion), 0);
  const base = await e.db.abrirBase();
  assert.equal(await e.journal.contarVentasPorEnviar(sesion), 0);
  const transaction = base.transaction;
  base.transaction = () => { throw new Error('lectura rota'); };
  await assert.rejects(e.journal.contarVentasPorEnviar(sesion), /consultar las ventas/);
  base.transaction = transaction;
  indexedDB.databases = async () => { throw new Error('enumeración rota'); };
  await assert.rejects(e.journal.contarVentasPorEnviar(sesion), /consultar las ventas/);
  globalThis.indexedDB = undefined;
  await assert.rejects(e.journal.contarVentasPorEnviar(sesion), /consultar las ventas/);
});
test('useConexion: carga, error con último conteo, recuperación a cero y desmontaje', async () => {
  const estados = [], pendientes = [];
  let indice = 0, efecto, intervalo;
  const cargar = modulos({
    '../context/TenantContext': { useTenant: () => ({ user: usuario, tenant: { id: 'A' }, authStatus: 'ready' }) },
    react: { useState: inicial => {
      const i = indice++;
      if (!(i in estados)) estados[i] = typeof inicial === 'function' ? inicial() : inicial;
      return [estados[i], valor => { estados[i] = typeof valor === 'function' ? valor(estados[i]) : valor; }];
    }, useEffect: fn => { efecto = fn; } },
    '../offline/journal': { contarVentasPorEnviar: () => new Promise((resolve, reject) => pendientes.push({ resolve, reject })) },
  });
  const hook = cargar('src/hooks/useConexion.ts').useConexion;
  const render = () => { indice = 0; return hook(); };
  const previo = globalThis.window;
  globalThis.window = { setInterval: fn => { intervalo = fn; return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} };
  try {
    assert.equal(render().estadoLectura, 'cargando');
    const limpiar = efecto();
    pendientes.shift().resolve(3); await Promise.resolve();
    assert.equal(render().ventasPorEnviar, 3);
    intervalo(); pendientes.shift().reject(new Error('IndexedDB')); await Promise.resolve();
    assert.equal(render().estadoLectura, 'error');
    assert.equal(render().ventasPorEnviar, 3);
    intervalo(); pendientes.shift().resolve(0); await Promise.resolve();
    assert.equal(render().estadoLectura, 'disponible');
    assert.equal(render().ventasPorEnviar, 0);
    intervalo(); intervalo();
    pendientes.pop().resolve(2); await Promise.resolve();
    pendientes.shift().reject(new Error('respuesta anterior')); await Promise.resolve();
    assert.equal(render().estadoLectura, 'disponible');
    assert.equal(render().ventasPorEnviar, 2);
    intervalo(); limpiar(); pendientes.shift().reject(new Error('desmontado')); await Promise.resolve();
    assert.equal(render().estadoLectura, 'disponible');
  } finally { globalThis.window = previo; }
});

test('respuesta perdida después de aplicar: reintento con el mismo UUID no duplica', async () => {
  const e = await escenario(1), post = e.api.post;
  e.api.post = async (...args) => { await post(...args); throw new Error('respuesta perdida'); };
  assert.equal((await e.sync.sincronizarPendientes(e.api, 'd', usuario)).aplicadas, 0);
  assert.equal(e.servidor.size, 1);
  const [op] = await e.journal.listarOperaciones();
  assert.equal(op.estado, 'PENDIENTE');
  assert.equal(op.sincronizadaAt, undefined);
  await e.journal.actualizarSincronizacion(op.operacionId, { proximoIntentoAt: undefined });
  e.api.post = post;
  assert.equal((await e.sync.sincronizarPendientes(e.api, 'd', usuario)).aplicadas, 1);
  assert.equal(e.servidor.size, 1);
  assert.deepEqual(e.envios[0], e.envios[1]);
});

test('fallo al persistir ENVIANDO: no contacta al servidor ni altera carga', async () => {
  const e = await escenario(1);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (valor, ...args) {
    const peticion = put.call(this, valor, ...args);
    if (this.name === 'operaciones' && valor.estado === 'ENVIANDO') this.transaction.abort();
    return peticion;
  };
  try { await assert.rejects(e.sync.sincronizarPendientes(e.api, 'd', usuario)); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.equal(e.envios.length, 0);
  assert.deepEqual(await e.journal.listarOperaciones(), e.ops);
});

for (const estado of ['REVISION', 'RECHAZADA_TECNICA', 'RESUELTA_MANUAL', 'ERROR_TEMPORAL', 'SIN_RESPUESTA']) test(`regresión respuesta ${estado}`, async () => {
  const e = await escenario(1);
  e.api.post = async () => ({ data: { resultados: estado === 'SIN_RESPUESTA' ? [] : [{ operacionId: 'uuid-0', estado }] } });
  e.api.get = async () => ({ data: [] });
  await e.sync.sincronizarPendientes(e.api, 'd', usuario);
  const [op] = await e.journal.listarOperaciones();
  const esperado = { REVISION: 'REVISION', RECHAZADA_TECNICA: 'REVISION', RESUELTA_MANUAL: 'SINCRONIZADA', ERROR_TEMPORAL: 'PENDIENTE', SIN_RESPUESTA: 'PENDIENTE' };
  assert.equal(op.estado, esperado[estado]);
  assert.deepEqual(e.sync.aOperacionDto(op), e.sync.aOperacionDto(e.ops[0]));
});

for (const status of [400, 413]) test(`rechazo ${status} aislado: revisión sin perder venta`, async () => {
  const e = await escenario(1);
  e.api.post = async () => { throw { response: { status, data: { message: 'rechazo' } } }; };
  e.api.get = async () => ({ data: [] });
  assert.equal((await e.sync.sincronizarPendientes(e.api, 'd', usuario)).enRevision, 1);
  const [op] = await e.journal.listarOperaciones();
  assert.equal(op.estado, 'REVISION');
  assert.deepEqual(e.sync.aOperacionDto(op), e.sync.aOperacionDto(e.ops[0]));
});

test('conteo positivo sin soporte de databases(): consulta el diario', async () => {
  const e = await escenario();
  indexedDB.databases = undefined;
  assert.equal(await e.journal.contarVentasPorEnviar(sesion), 2);
});

for (const estadoLectura of ['cargando', 'error', 'disponible']) test(`indicador visible: ${estadoLectura} no confunde el último conteo con una lectura válida`, () => {
  const cargar = modulos({
    react: React, 'react/jsx-runtime': jsxRuntime, 'lucide-react': { WifiOff: () => null },
    '../hooks/useConexion': { useConexion: () => ({ enLinea: true, ventasPorEnviar: 3, estadoLectura }) },
    '../context/I18nContext': { useI18n: () => ({ t: clave => clave }) },
  });
  const Indicador = cargar('src/components/IndicadorConexion.tsx').IndicadorConexion;
  const html = renderToStaticMarkup(React.createElement(Indicador));
  const clave = { cargando: 'pending_sales_loading', error: 'pending_sales_error', disponible: 'pending_sales' }[estadoLectura];
  assert.ok(html.includes(`navigation.${clave}`));
  if (estadoLectura !== 'disponible') assert.ok(!html.includes('navigation.pending_sales<'));
});
