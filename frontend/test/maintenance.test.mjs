import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(done => setImmediate(done));
function setup(get) {
  const listeners = new Map(), received = [], errors = [];
  let timer;
  const events = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const context = { exports: {}, AbortController, navigator: { onLine: true }, document: { ...events, visibilityState: 'visible' }, window: { ...events, setInterval: fn => { timer = fn; return 1; }, clearInterval: () => { timer = null; } } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/maintenancePolling.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const stop = context.exports.startMaintenancePolling(get, value => received.push(value), () => errors.push(true));
  return { context, received, errors, stop, fire: key => listeners.get(key)?.(), poll: () => timer?.(), listeners };
}
test('technical controls absent from dashboard and role gated in maintenance', () => {
  const dashboard = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');
  assert.ok(!dashboard.includes('BackupStatus'));
  const component = fs.readFileSync('src/components/BackupStatus.tsx', 'utf8');
  assert.match(component, /user\?\.rol !== 'SUPERADMIN'/);
  assert.ok(!component.includes('<button'));
  assert.match(component, /\/admin\/maintenance\/backup/);
});
test('automatic polling retries failed GET, skips hidden/offline and does not overlap', async () => {
  let calls = 0, resolve;
  const h = setup(() => { calls++; return calls === 1 ? Promise.reject(Error('offline')) : new Promise(done => { resolve = done; }); });
  await tick(); assert.equal(h.errors.length, 1);
  h.context.navigator.onLine = false; h.poll(); assert.equal(calls, 1);
  h.context.navigator.onLine = true; h.fire('online'); h.poll(); assert.equal(calls, 2);
  resolve({ success: true }); await tick(); assert.equal(h.received.length, 1);
  h.context.document.visibilityState = 'hidden'; h.poll(); assert.equal(calls, 2);
  h.stop(); assert.equal(h.listeners.size, 0);
});
test('unmount or role change cancels request and discards late technical state', async () => {
  let resolve, signal;
  const h = setup(s => { signal = s; return new Promise(done => { resolve = done; }); });
  h.stop(); assert.ok(signal.aborted); resolve({ private: true }); await tick();
  assert.equal(h.received.length, 0); assert.equal(h.errors.length, 0);
});
test('connection loss invalidates stale success until a fresh response', async () => {
  const h = setup(async () => ({ success: true })); await tick();
  h.context.navigator.onLine = false; h.fire('offline'); assert.equal(h.errors.length, 1);
  h.context.navigator.onLine = true; h.fire('online'); await tick(); assert.equal(h.received.length, 2); h.stop();
});
