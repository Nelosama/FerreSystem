import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarMarcador, verificarEntornoSeed } from './guard-seed.mjs';

const ID = '11111111-2222-4333-8444-555555555555';
const marca = (tipo = 'STAGING', identificador = ID) => [{ tipo, identificador }];

test('acepta una marca de staging registrada y con confirmación exacta', () => {
  assert.deepEqual(validarMarcador(marca(), [ID], ID), { tipo: 'STAGING', identificador: ID });
});

test('rechaza PRODUCCION aunque el identificador esté en la lista', () => {
  assert.throws(() => validarMarcador(marca('PRODUCCION'), [ID], ID), /PRODUCCION/);
});

test('rechaza una base sin marca o con más de una', () => {
  assert.throws(() => validarMarcador([], [ID], ID), /exactamente una marca/);
  assert.throws(() => validarMarcador([...marca(), ...marca()], [ID], ID), /exactamente una marca/);
});

test('rechaza un identificador que no está en la lista aprobada', () => {
  assert.throws(() => validarMarcador(marca('DESARROLLO', 'x'), [ID], 'x'), /no está en prisma\/entornos-seed.json/);
});

test('exige confirmar el identificador exacto, no el host', () => {
  assert.throws(() => validarMarcador(marca(), [ID], 'localhost'), /SEED_CONFIRMAR_IDENTIFICADOR/);
  assert.throws(() => validarMarcador(marca(), [ID], undefined), /SEED_CONFIRMAR_IDENTIFICADOR/);
});

test('NODE_ENV=production se rechaza antes de consultar la base', async () => {
  let consultada = false;
  const prisma = { $queryRawUnsafe: async () => { consultada = true; return marca(); } };
  await assert.rejects(verificarEntornoSeed({ prisma, env: { NODE_ENV: 'production', DATABASE_URL: 'x' }, identificadoresPermitidos: [ID] }), /production/);
  assert.equal(consultada, false);
});

test('base inaccesible o sin tabla de marca: se rechaza', async () => {
  const prisma = { $queryRawUnsafe: async () => { throw new Error('relation does not exist'); } };
  await assert.rejects(verificarEntornoSeed({ prisma, env: { DATABASE_URL: 'x', SEED_CONFIRMAR_IDENTIFICADOR: ID }, identificadoresPermitidos: [ID] }), /No se pudo leer la marca/);
});

test('camino completo con marca válida', async () => {
  const prisma = { $queryRawUnsafe: async () => marca() };
  const r = await verificarEntornoSeed({ prisma, env: { DATABASE_URL: 'x', SEED_CONFIRMAR_IDENTIFICADOR: ID }, identificadoresPermitidos: [ID] });
  assert.equal(r.tipo, 'STAGING');
});
