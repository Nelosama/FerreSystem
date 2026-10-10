import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarMigracion, buscarComandosProhibidos, comprobarInmutables } from './verificar-migraciones.mjs';

test('detecta comandos destructivos de Prisma en archivos ejecutables', () => {
  const hallazgos = buscarComandosProhibidos([
    { ruta: 'package.json', contenido: '"x": "prisma db push --accept-data-loss"' },
    { ruta: '.github/workflows/d.yml', contenido: 'run: npx prisma migrate dev --name x' },
    { ruta: 'deploy/a.sh', contenido: 'npx prisma migrate reset --force' },
    { ruta: 'backend/scripts/s.mjs', contenido: "spawnSync(p, ['db', 'seed'])" },
  ]);
  assert.equal(hallazgos.length, 4);
});

test('no bloquea los comandos legítimos de migración y generación', () => {
  const hallazgos = buscarComandosProhibidos([
    { ruta: 'backend/scripts/migration-safe.mjs', contenido: "prismaCommand(['migrate', 'deploy'], url);\nconsole.error('No use reset ni db push.');" },
    { ruta: 'backend/package.json', contenido: '"start:prod": "node scripts/migration-safe.mjs deploy && node dist/main"' },
  ]);
  assert.equal(hallazgos.length, 0);
});

test('una migración aditiva pasa sin marca', () => {
  const a = analizarMigracion('m/migration.sql', 'CREATE TABLE "x" ("id" TEXT NOT NULL);\nCREATE INDEX "x_i" ON "x"("id");');
  assert.deepEqual(a.operaciones, []);
  assert.equal(a.bloqueada, false);
});

test('el SQL destructivo sin marca de aprobación se bloquea', () => {
  const a = analizarMigracion('m/migration.sql', 'DROP TABLE "apartados";\nDELETE FROM "clientes";');
  assert.deepEqual(a.operaciones.sort(), ['DELETE', 'DROP']);
  assert.equal(a.bloqueada, true);
});

test('con marca de aprobación explícita, el SQL destructivo se permite y queda registrado', () => {
  const a = analizarMigracion('m/migration.sql', '-- APROBACION-DESTRUCTIVA: CHG-42 @Nelosama\nDROP TABLE "apartados";');
  assert.equal(a.aprobada, true);
  assert.equal(a.bloqueada, false);
});

test('los DROP dentro de comentarios no cuentan', () => {
  const a = analizarMigracion('m/migration.sql', '-- Reversión manual: DROP TABLE sesiones_auth;\nCREATE TABLE "y" ("id" TEXT);');
  assert.deepEqual(a.operaciones, []);
});

test('un cambio de tipo o un RENAME exigen aprobación', () => {
  assert.equal(analizarMigracion('m', 'ALTER TABLE "p" ALTER COLUMN "s" SET DATA TYPE DECIMAL(12,2);').bloqueada, true);
  assert.equal(analizarMigracion('m', 'ALTER TABLE "p" RENAME COLUMN "a" TO "b";').bloqueada, true);
});

test('las migraciones publicadas son inmutables: solo se permiten archivos nuevos', () => {
  const bloqueados = comprobarInmutables([
    { estado: 'A', ruta: 'backend/prisma/migrations/2026/migration.sql' },
    { estado: 'M', ruta: 'backend/prisma/migrations/20260930/migration.sql' },
    { estado: 'D', ruta: 'backend/prisma/migrations/20260925/migration.sql' },
    { estado: 'R100', ruta: 'backend/prisma/migrations/20261011/migration.sql' },
  ]);
  assert.deepEqual(bloqueados.map((b) => b.estado), ['M', 'D', 'R100']);
});

test('la marca de aprobación exige ticket y responsable con handle', () => {
  assert.equal(analizarMigracion('m', '-- APROBACION-DESTRUCTIVA: CHG-42 dueño-db\nDROP TABLE "x";').aprobada, false);
  assert.equal(analizarMigracion('m', '-- APROBACION-DESTRUCTIVA: CHG-42 @Nelosama\nDROP TABLE "x";').aprobada, true);
  assert.equal(analizarMigracion('m', '-- APROBACION-DESTRUCTIVA: sin-ticket @Nelosama\nDROP TABLE "x";').aprobada, false);
});

test('una migración no puede crear la tabla de marca de entorno', () => {
  const a = analizarMigracion('m', 'CREATE TABLE "entorno_ferresystem" ("id" INTEGER);');
  assert.equal(a.bloqueada, true);
  assert.ok(a.operaciones.includes('tabla de marca de entorno'));
});
