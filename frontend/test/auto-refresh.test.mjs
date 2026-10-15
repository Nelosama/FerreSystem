/**
 * auto-refresh.test.mjs
 *
 * Motor de sincronización automática (src/utils/autoRefresh.ts): carga inicial, refresco periódico,
 * al volver a la pestaña y a la red, sin duplicados, descarte de respuestas obsoletas y limpieza al
 * detener. Usa un entorno falso (temporizadores, red y visibilidad controlados); no usa navegador.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, deps = {}) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const require = (spec) => { if (!(spec in deps)) throw new Error(`dependencia no esperada: ${spec}`); return deps[spec]; };
  vm.runInNewContext(out, { module, exports: module.exports, require, Intl, Date, AbortController });
  return module.exports;
}

const format = load('src/utils/format.ts');
const m = load('src/utils/autoRefresh.ts', { './format': format });

function fakeEnv() {
  const state = { online: true, visible: true, timers: new Map(), next: 1, listeners: { online: new Set(), offline: new Set(), visible: new Set() } };
  const env = {
    online: () => state.online,
    visible: () => state.visible,
    setTimer(cb) { const id = state.next++; state.timers.set(id, cb); return id; },
    clearTimer(id) { state.timers.delete(id); },
    listen(event, cb) { state.listeners[event].add(cb); return () => state.listeners[event].delete(cb); },
  };
  const emit = (event) => [...state.listeners[event]].forEach(cb => cb());
  const tick = () => [...state.timers.values()].forEach(cb => cb());
  return { env, state, emit, tick };
}

// Carga controlada: cada llamada queda pendiente hasta que el test la resuelve o la rechaza.
function controlledLoad() {
  const calls = [];
  const load = (signal) => new Promise((resolve, reject) => {
    calls.push({ signal, resolve, reject });
  });
  return { load, calls };
}

const flush = () => new Promise(r => setImmediate(r));

test('carga al iniciar, aplica el valor y registra la última sincronización', async () => {
  const { env } = fakeEnv();
  const { load, calls } = controlledLoad();
  const applied = [];
  const snapshots = [];
  const h = m.startAutoRefresh({ load, apply: v => applied.push(v), intervalMs: 30000, env, onSnapshot: s => snapshots.push(s), now: () => new Date('2026-10-13T15:30:00Z') });
  assert.equal(calls.length, 1);
  assert.equal(snapshots.at(-1).phase, 'loading');
  calls[0].resolve({ total: 10 });
  await flush();
  assert.deepEqual(applied, [{ total: 10 }]);
  assert.equal(snapshots.at(-1).phase, 'ok');
  assert.equal(snapshots.at(-1).lastSync.toISOString(), '2026-10-13T15:30:00.000Z');
  h.stop();
});

test('no duplica peticiones: un refresco manual mientras hay una en vuelo reutiliza la misma', async () => {
  const { env, tick } = fakeEnv();
  const { load, calls } = controlledLoad();
  const h = m.startAutoRefresh({ load, apply: () => {}, intervalMs: 30000, env });
  void h.refresh();
  tick();
  assert.equal(calls.length, 1);
  calls[0].resolve(1);
  await flush();
  void h.refresh();
  assert.equal(calls.length, 2);
  h.stop();
});

test('el temporizador y el regreso a la pestaña disparan lecturas; en segundo plano no consulta', async () => {
  const { env, state, emit, tick } = fakeEnv();
  const { load, calls } = controlledLoad();
  const h = m.startAutoRefresh({ load, apply: () => {}, intervalMs: 60000, env });
  calls[0].resolve(0); await flush();
  state.visible = false;
  tick();
  assert.equal(calls.length, 1, 'no debe consultar en segundo plano');
  state.visible = true;
  emit('visible');
  assert.equal(calls.length, 2);
  calls[1].resolve(0); await flush();
  tick();
  assert.equal(calls.length, 3);
  calls[2].resolve(0); await flush();
  h.stop();
});

test('sin red no consulta, informa «offline» y al recuperarla refresca', async () => {
  const { env, state, emit } = fakeEnv();
  const { load, calls } = controlledLoad();
  const snapshots = [];
  const h = m.startAutoRefresh({ load, apply: () => {}, intervalMs: 30000, env, onSnapshot: s => snapshots.push(s) });
  calls[0].reject(new Error('red')); await flush();
  assert.equal(snapshots.at(-1).phase, 'error');
  state.online = false;
  emit('offline');
  assert.equal(snapshots.at(-1).phase, 'offline');
  h.refresh();
  assert.equal(calls.length, 1, 'sin red no debe haber petición');
  state.online = true;
  emit('online');
  assert.equal(calls.length, 2);
  calls[1].resolve(5); await flush();
  assert.equal(snapshots.at(-1).phase, 'ok');
  h.stop();
});

test('al perder la red se descarta la respuesta en vuelo, que ya no es fiable', async () => {
  const { env, state, emit } = fakeEnv();
  const { load, calls } = controlledLoad();
  const applied = [];
  const h = m.startAutoRefresh({ load, apply: v => applied.push(v), intervalMs: 30000, env });
  state.online = false;
  emit('offline');
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve('tarde'); await flush();
  assert.deepEqual(applied, []);
  h.stop();
});

test('detener cancela la petición, limpia el temporizador y los escuchadores, y no aplica respuestas tardías', async () => {
  const { env, state } = fakeEnv();
  const { load, calls } = controlledLoad();
  const applied = [];
  const h = m.startAutoRefresh({ load, apply: v => applied.push(v), intervalMs: 30000, env });
  h.stop();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(state.timers.size, 0);
  assert.equal(state.listeners.visible.size + state.listeners.online.size + state.listeners.offline.size, 0);
  calls[0].resolve('tarde'); await flush();
  assert.deepEqual(applied, []);
  void h.refresh();
  assert.equal(calls.length, 1, 'tras detener no hay nuevas lecturas');
});

test('un error no detiene el sondeo: la siguiente vuelta recupera el estado', async () => {
  const { env, tick } = fakeEnv();
  const { load, calls } = controlledLoad();
  const snapshots = [];
  const h = m.startAutoRefresh({ load, apply: () => {}, intervalMs: 30000, env, onSnapshot: s => snapshots.push(s) });
  calls[0].reject(new Error('500')); await flush();
  assert.equal(snapshots.at(-1).phase, 'error');
  tick();
  calls[1].resolve(1); await flush();
  assert.equal(snapshots.at(-1).phase, 'ok');
  h.stop();
});

test('la hora de sincronización usa la zona de negocio', () => {
  const texto = m.formatHoraSincronizacion(new Date('2026-10-13T15:05:00Z'));
  assert.equal(texto, '09:05');
});
