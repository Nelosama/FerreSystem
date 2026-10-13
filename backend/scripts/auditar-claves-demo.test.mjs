import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarClavesDemo, CLAVES_DEMO } from './auditar-claves-demo.mjs';

const comparar = async (clave, hash) => hash === `hash:${clave}`;

test('detecta cuentas con clave demo y omite las demás', async () => {
  const cuentas = [
    { tipo: 'SUPER_ADMIN', id: '1', email: 'a@x.test', passwordHash: 'hash:SuperAdmin2026!' },
    { tipo: 'USUARIO', id: '2', email: 'b@x.test', passwordHash: 'hash:Ferre2026!' },
    { tipo: 'USUARIO', id: '3', email: 'c@x.test', passwordHash: 'hash:OtraClaveReal-9' },
    { tipo: 'USUARIO', id: '4', email: 'd@x.test', passwordHash: null },
  ];
  const r = await detectarClavesDemo(cuentas, CLAVES_DEMO, comparar);
  assert.deepEqual(r.map((c) => c.id), ['1', '2']);
});

test('sin cuentas con clave demo no hay coincidencias', async () => {
  assert.deepEqual(await detectarClavesDemo([{ tipo: 'USUARIO', id: '9', email: 'z@x.test', passwordHash: 'hash:nada' }], CLAVES_DEMO, comparar), []);
});
