import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// A-02: la pantalla conserva la clave de un alta durante los reintentos y genera otra al empezar una operación nueva.
const almacen = new Map();
let almacenRoto = false;
globalThis.localStorage = {
  getItem: (k) => { if (almacenRoto) throw new Error('bloqueado'); return almacen.has(k) ? almacen.get(k) : null; },
  setItem: (k, v) => { if (almacenRoto) throw new Error('bloqueado'); almacen.set(k, String(v)); },
  removeItem: (k) => { if (almacenRoto) throw new Error('bloqueado'); almacen.delete(k); },
};
const cargar = (file) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, () => { throw new Error('sin dependencias'); });
  return exports;
};
const m = cargar('src/utils/solicitudAlta.ts');
let n = 0;
const nueva = () => `clave-${++n}`;

test('separa la clave por operación, empresa, usuario y documento de origen', () => {
  const claves = new Set([
    m.claveAlmacenAlta('CLIENTE_CREAR', 't1', 'u1'),
    m.claveAlmacenAlta('COTIZACION_CREAR', 't1', 'u1'),
    m.claveAlmacenAlta('COTIZACION_DUPLICAR', 't1', 'u1', 'cot-1'),
    m.claveAlmacenAlta('COTIZACION_DUPLICAR', 't1', 'u1', 'cot-2'),
    m.claveAlmacenAlta('CLIENTE_CREAR', 't2', 'u1'),
    m.claveAlmacenAlta('CLIENTE_CREAR', 't1', 'u2'),
  ]);
  assert.equal(claves.size, 6);
});

test('mismo contenido reutiliza la clave (reintento); otro contenido o un alta cerrada generan otra', () => {
  const k = m.claveAlmacenAlta('CLIENTE_CREAR', 't1', 'u1');
  const a = m.solicitudParaAlta(k, { nombre: 'Delta', rtn: null }, nueva);
  assert.equal(m.solicitudParaAlta(k, { rtn: null, nombre: 'Delta' }, nueva), a, 'el orden de las claves no importa');
  assert.ok(almacen.has(k), 'se guarda antes de enviar para sobrevivir a una recarga');
  const b = m.solicitudParaAlta(k, { nombre: 'Delta Sur', rtn: null }, nueva);
  assert.notEqual(b, a);
  m.cerrarSolicitudAlta(k);
  assert.equal(almacen.has(k), false);
  assert.notEqual(m.solicitudParaAlta(k, { nombre: 'Delta Sur', rtn: null }, nueva), b, 'tras terminar, la misma alta es una operación nueva');
});

test('una clave de más de 24 horas no se reutiliza', () => {
  const k = m.claveAlmacenAlta('COTIZACION_CREAR', 't1', 'u1');
  const t0 = Date.UTC(2026, 10, 18, 12);
  const a = m.solicitudParaAlta(k, { detalles: [1] }, nueva, t0);
  assert.equal(m.solicitudParaAlta(k, { detalles: [1] }, nueva, t0 + 23 * 3600e3), a);
  assert.notEqual(m.solicitudParaAlta(k, { detalles: [1] }, nueva, t0 + 25 * 3600e3), a);
});

test('sin almacenamiento disponible la clave se conserva en memoria', () => {
  almacenRoto = true;
  try {
    const k = m.claveAlmacenAlta('COTIZACION_DUPLICAR', 't1', 'u1', 'cot-9');
    const a = m.solicitudParaAlta(k, { origenId: 'cot-9' }, nueva);
    assert.equal(m.solicitudParaAlta(k, { origenId: 'cot-9' }, nueva), a);
    m.cerrarSolicitudAlta(k);
    assert.notEqual(m.solicitudParaAlta(k, { origenId: 'cot-9' }, nueva), a);
  } finally { almacenRoto = false; }
});

test('solo un rechazo del servidor descarta la clave; red, 408, 429 y 5xx la conservan', () => {
  assert.equal(m.conservarSolicitudTrasError(new Error('Network Error')), true);
  assert.equal(m.conservarSolicitudTrasError({ response: { status: 0 } }), true);
  for (const status of [408, 429, 500, 502, 503]) assert.equal(m.conservarSolicitudTrasError({ response: { status } }), true, String(status));
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(m.conservarSolicitudTrasError({ response: { status } }), false, String(status));
});
