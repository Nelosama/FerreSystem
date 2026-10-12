import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sqlFile = readFileSync(join(backend, 'scripts/estado-base-solo-lectura.sql'), 'utf8');
const sha = (valor) => createHash('sha256').update(valor).digest('hex');
const migraciones = readdirSync(join(backend, 'prisma/migrations')).filter((n) => /^\d{14}_/.test(n)).sort();

test('estado-base-solo-lectura.sql lista exactamente las migraciones del repositorio con sus SHA-256 (no se desactualiza)', () => {
  const enSql = [...sqlFile.matchAll(/\('(\d{14}_[^']+)','([0-9a-f]{64})','([0-9a-f]{64})'\)/g)].map((m) => ({ nombre: m[1], lf: m[2], crlf: m[3] }));
  assert.deepEqual(enSql.map((m) => m.nombre), migraciones, 'la lista debe coincidir con prisma/migrations; regenere el archivo');
  for (const m of enSql) {
    const lf = readFileSync(join(backend, 'prisma/migrations', m.nombre, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(m.lf, sha(lf), `${m.nombre}: checksum LF desactualizado`);
    assert.equal(m.crlf, sha(lf.replace(/\n/g, '\r\n')), `${m.nombre}: checksum CRLF desactualizado`);
  }
});

test('estado-base-solo-lectura.sql es de solo lectura: transacción READ ONLY, termina en ROLLBACK y no contiene sentencias de escritura', () => {
  assert.match(sqlFile, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(sqlFile.trim(), /ROLLBACK;$/);
  const sinComentarios = sqlFile.split('\n').filter((l) => !l.trim().startsWith('--') && !l.trim().startsWith('\\echo')).join('\n');
  assert.doesNotMatch(sinComentarios, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i);
});
