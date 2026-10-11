import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// El backend compilado no debe arrancar sin una CONTINGENCIA_CLAVE_OPERACIONES válida, y el mensaje nunca incluye valores secretos.
// Requiere `npm run build` (en CI la compilación precede a esta prueba). La validación ocurre antes de crear la aplicación: no usa base de datos.
const principal = new URL('../dist/main.js', import.meta.url).pathname;
const JWT = randomBytes(24).toString('hex');

function arrancar(extra) {
  assert.ok(existsSync(principal), 'Falta dist/main.js: ejecute `npm run build` antes de esta prueba');
  const entorno = { PATH: process.env.PATH, JWT_SECRET: JWT, DATABASE_URL: 'postgresql://invalido@127.0.0.1:1/x', PORT: '0', ...extra };
  const r = spawnSync('node', [principal], { env: entorno, encoding: 'utf8', timeout: 30000 });
  return { codigo: r.status, salida: `${r.stdout}\n${r.stderr}` };
}

test('arranque: sin clave termina con error controlado y remite a la documentación', () => {
  const r = arrancar({});
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /\[ARRANQUE\] CONTINGENCIA_CLAVE_OPERACIONES es obligatoria y debe tener al menos 32 caracteres/);
  assert.match(r.salida, /docs\/CONTINGENCIA_CLAVE_OPERACIONES\.md/);
  assert.doesNotMatch(r.salida, /at Object\.|node:internal|\.ts:\d+/, 'sin traza de pila');
});

test('arranque: una clave corta se rechaza y su valor no aparece en la salida', () => {
  const corta = 'clave-corta-secreta';
  const r = arrancar({ CONTINGENCIA_CLAVE_OPERACIONES: corta });
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /obligatoria/);
  assert.equal(r.salida.includes(corta), false);
});

test('arranque: la clave igual a JWT_SECRET se rechaza sin mostrar el valor', () => {
  const r = arrancar({ CONTINGENCIA_CLAVE_OPERACIONES: JWT.padEnd(40, 'x'), JWT_SECRET: JWT.padEnd(40, 'x') });
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /no puede ser igual a JWT_SECRET/);
  assert.equal(r.salida.includes(JWT), false);
});

test('arranque: una clave anterior inválida se rechaza sin mostrar su valor', () => {
  const anterior = 'anterior-corta-secreta';
  const r = arrancar({ CONTINGENCIA_CLAVE_OPERACIONES: randomBytes(24).toString('hex'), CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR: anterior });
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR debe tener al menos 32/);
  assert.equal(r.salida.includes(anterior), false);
});
