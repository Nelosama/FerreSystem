import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/barcodeScanner.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function env(t, { camera, play, decoder } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = { exports: {}, setTimeout, clearTimeout, window: {}, navigator: {} };
  vm.runInNewContext(compiled, context);
  const track = new EventTarget();
  let stops = 0, requests = 0;
  track.stop = () => { stops++; };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = Object.assign(new EventTarget(), {
    srcObject: null, readyState: 4, currentTime: 0, videoWidth: 1280, videoHeight: 720,
    play: play || (() => Promise.resolve()), pause() {},
  });
  const events = { codes: [], errors: [], ready: 0 };
  const deps = {
    secure: true,
    mediaDevices: { getUserMedia: () => { requests++; return camera ? camera.promise : Promise.resolve(stream); } },
    createDecoder: () => Promise.resolve(decoder || (() => Promise.resolve(null))),
  };
  const start = (options = {}) => context.exports.startBarcodeCamera(video, {
    onReady: () => { events.ready++; }, onCode: code => events.codes.push(code), onError: message => events.errors.push(message), ...options,
  }, deps);
  return { start, video, track, stream, deps, events, get stops() { return stops; }, get requests() { return requests; } };
}

test('stop es idempotente: libera una vez y desconecta el vídeo', async t => {
  const e = env(t); const stop = e.start(); await flush(); stop(); stop();
  assert.equal(e.stops, 1); assert.equal(e.video.srcObject, null);
});
test('cerrar y reabrir con permiso pendiente comparte petición y entrega solo al último consumidor', async t => {
  const camera = deferred(); const e = env(t, { camera });
  const stop1 = e.start(); stop1(); const stop2 = e.start();
  assert.equal(e.requests, 1);
  camera.resolve(e.stream); await flush();
  assert.equal(e.events.ready, 1); assert.equal(e.stops, 0); assert.equal(e.video.srcObject, e.stream);
  stop2(); assert.equal(e.stops, 1);
});
test('permiso pendiente agota espera; un stream tardío se detiene sin callbacks', async t => {
  const camera = deferred(); const e = env(t, { camera }); e.start();
  t.mock.timers.tick(30001); await flush();
  assert.match(e.events.errors[0] || '', /tiempo|tard|respond/i);
  camera.resolve(e.stream); await flush(); assert.equal(e.stops, 1); assert.equal(e.events.ready, 0);
});
test('play pendiente agota espera y libera cámara', async t => {
  const e = env(t, { play: () => new Promise(() => {}) }); e.start(); await flush();
  t.mock.timers.tick(15001); await flush(); assert.equal(e.events.errors.length, 1); assert.equal(e.stops, 1);
});
test('pista terminada por el sistema informa interrupción y permite otra activación', async t => {
  const e = env(t); e.start(); await flush(); e.track.dispatchEvent(new Event('ended'));
  assert.equal(e.events.errors.length, 1); assert.equal(e.stops, 1);
  const stop = e.start(); await flush(); assert.equal(e.events.ready, 2); stop();
});
test('lector pendiente agota espera y libera cámara', async t => {
  const e = env(t, { decoder: () => new Promise(() => {}) }); e.start(); await flush();
  t.mock.timers.tick(5001); await flush(); assert.equal(e.events.errors.length, 1); assert.equal(e.stops, 1);
});
test('sin fotogramas no queda escaneando indefinidamente', async t => {
  const e = env(t); e.video.readyState = 0; e.start(); await flush();
  for (let i = 0; i < 65; i++) { t.mock.timers.tick(250); await flush(); }
  assert.equal(e.events.errors.length, 1); assert.equal(e.stops, 1);
});
test('una lectura detiene antes de notificar; sin duplicados ni callbacks tardíos', async t => {
  const result = deferred(); const e = env(t, { decoder: () => result.promise }); const stop = e.start(); await flush();
  stop(); result.resolve('5901234123457'); await flush(); t.mock.timers.tick(10000); await flush();
  assert.deepEqual(e.events.codes, []); assert.deepEqual(e.events.errors, []); assert.equal(e.stops, 1);
});
test('activaciones consecutivas aceptan diferentes productos una vez cada una', async t => {
  const values = ['5901234123457', '96385074'];
  const e = env(t, { decoder: () => Promise.resolve(values.shift()) });
  e.start(); await flush(); e.start(); await flush(); t.mock.timers.tick(10000); await flush();
  assert.deepEqual(e.events.codes, ['5901234123457', '96385074']); assert.equal(e.stops, 2);
});

test('cancelar durante carga del lector libera pista y descarta carga tardía', async t => {
  const module = deferred(); const e = env(t); e.deps.createDecoder = () => module.promise;
  const stop = e.start(); await flush(); stop(); module.resolve(() => Promise.resolve('late')); await flush();
  assert.equal(e.stops, 1); assert.equal(e.events.ready, 0); assert.deepEqual(e.events.codes, []);
});
test('carga del lector sin resolver muestra error y libera pista', async t => {
  const e = env(t); e.deps.createDecoder = () => new Promise(() => {}); e.start(); await flush();
  t.mock.timers.tick(15001); await flush(); assert.equal(e.events.errors.length, 1); assert.equal(e.stops, 1);
});
test('enfoque continuo opcional no bloquea si el dispositivo lo rechaza', async t => {
  const e = env(t); let applied;
  e.track.getCapabilities = () => ({ focusMode: ['continuous'] });
  e.track.applyConstraints = value => { applied = value; return Promise.reject(new Error('unsupported')); };
  const stop = e.start(); await flush();
  assert.equal(applied.advanced[0].focusMode, 'continuous'); assert.equal(e.events.ready, 1); assert.equal(e.events.errors.length, 0); stop();
});
test('una respuesta tardía a permiso después del cierre no conserva cámara', async t => {
  const camera = deferred(); const e = env(t, { camera }); const stop = e.start(); stop(); camera.resolve(e.stream); await flush();
  assert.equal(e.stops, 1); assert.equal(e.video.srcObject, null); assert.equal(e.events.ready, 0);
});

for (const nativeCase of ['absent', 'partial', 'throws', 'native', 'runtime-failure']) {
  test(`selección de lector ${nativeCase}: fallback local sin user-agent`, async () => {
    let imports = 0;
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    const window = {};
    if (nativeCase !== 'absent') window.BarcodeDetector = class {
      static getSupportedFormats() {
        if (nativeCase === 'throws') throw new Error('not available');
        return Promise.resolve(nativeCase === 'partial' ? formats.slice(0, 3) : formats);
      }
      async detect() { if (nativeCase === 'runtime-failure') throw new Error('unsupported'); return [{ rawValue: 'NATIVE-128' }]; }
    };
    const context = { exports: {}, window, require: name => {
      assert.equal(name, './zxingDecoder'); imports++;
      return { createZxingDecoder: () => async () => 'SOFTWARE-128' };
    } };
    vm.runInNewContext(compiled, context);
    const decode = await context.exports.createBarcodeDecoder();
    const expected = nativeCase === 'native' ? 'NATIVE-128' : 'SOFTWARE-128';
    assert.equal(await decode({}), expected); assert.equal(await decode({}), expected);
    assert.equal(imports, nativeCase === 'native' ? 0 : 1);
  });
}

test('cerrar entre resolver getUserMedia y adjuntar el stream tampoco deja pistas vivas', async t => {
  const camera = deferred(); const e = env(t, { camera }); const stop = e.start();
  camera.resolve(e.stream); queueMicrotask(stop); await flush();
  assert.equal(e.stops, 1); assert.equal(e.video.srcObject, null); assert.equal(e.events.ready, 0);
});

test('tras agotar permiso se puede reintentar con otra petición; la anterior tardía se limpia', async t => {
  const first = deferred(), second = deferred(); let requests = 0;
  const e = env(t); e.deps.mediaDevices.getUserMedia = () => (++requests === 1 ? first.promise : second.promise);
  e.start(); t.mock.timers.tick(30001); await flush(); assert.equal(e.events.errors.length, 1);
  const stop = e.start(); assert.equal(requests, 2);
  first.resolve(e.stream); await flush(); assert.equal(e.stops, 1); assert.equal(e.events.ready, 0);
  let secondStops = 0;
  const newTrack = Object.assign(new EventTarget(), { stop() { secondStops++; } });
  second.resolve({ getTracks: () => [newTrack], getVideoTracks: () => [newTrack] }); await flush();
  assert.equal(e.events.ready, 1); assert.equal(secondStops, 0); stop(); assert.equal(secondStops, 1);
});


test('cámara elegida usa deviceId exacto sin facingMode y libera la anterior', async t => {
  const e = env(t); const constraints = [];
  e.deps.mediaDevices.getUserMedia = value => { constraints.push(value); return Promise.resolve(e.stream); };
  const first = e.start(); await flush(); first();
  e.deps.mediaDevices.getUserMedia = value => {
    assert.equal(e.stops, 1); constraints.push(value); return Promise.resolve(e.stream);
  };
  const stop = e.start({ deviceId: 'front' }); await flush();
  assert.equal(constraints[0].video.facingMode.ideal, 'environment');
  assert.equal(constraints[1].video.deviceId.exact, 'front');
  assert.equal(constraints[1].video.facingMode, undefined); stop();
});

test('enumeración posterior al permiso no publica resultados tras cerrar', async t => {
  const e = env(t); const devices = deferred(); const reports = [];
  e.deps.mediaDevices.enumerateDevices = () => {
    assert.equal(e.events.ready, 1); return devices.promise;
  };
  const stop = e.start({ onCameras: (...args) => reports.push(args) }); await flush(); stop();
  devices.resolve([{ kind: 'videoinput', deviceId: 'front' }]); await flush();
  assert.equal(reports.length, 0);
});

test('rechazo de enumerateDevices conserva cámara y lector operativos', async t => {
  const e = env(t);
  e.deps.mediaDevices.enumerateDevices = () => Promise.reject(new Error('not supported'));
  const stop = e.start({ onCameras: () => assert.fail('sin dispositivos') }); await flush();
  assert.equal(e.events.ready, 1); assert.equal(e.events.errors.length, 0); assert.equal(e.stops, 0); stop();
});

test('cambio rápido con permiso pendiente no reutiliza la cámara de otro dispositivo', async t => {
  const e = env(t); const front = deferred(), back = deferred(); const requests = [];
  let oldStops = 0;
  const oldStream = { getTracks: () => [{ stop: () => oldStops++ }] };
  e.deps.mediaDevices.getUserMedia = constraints => {
    requests.push(constraints.video.deviceId.exact);
    return constraints.video.deviceId.exact === 'front' ? front.promise : back.promise;
  };
  const stopFront = e.start({ deviceId: 'front' }); stopFront();
  const stopBack = e.start({ deviceId: 'back' });
  assert.deepEqual(requests, ['front', 'back']);
  back.resolve(e.stream); await flush();
  front.resolve(oldStream); await flush();
  assert.equal(e.video.srcObject, e.stream); assert.equal(oldStops, 1);
  assert.equal(e.events.ready, 1); stopBack();
});

test('enumerateDevices que lanza sincrónicamente tampoco detiene el lector', async t => {
  const e = env(t);
  e.deps.mediaDevices.enumerateDevices = () => { throw new Error('unsupported'); };
  const stop = e.start({ onCameras: () => assert.fail('sin dispositivos') }); await flush();
  assert.equal(e.events.ready, 1); assert.equal(e.events.errors.length, 0); assert.equal(e.stops, 0); stop();
});
