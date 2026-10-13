import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceEnvironment } from './backup-consistent.mjs';

test('explicit source replaces inherited services, options and passwords without shell evaluation', () => {
  const env = sourceEnvironment('postgresql://reader:p%27%24%28literal%29@source.invalid/catalog%20one?sslmode=verify-full', {
    PATH: process.env.PATH, PGSERVICE: 'other-source', PGOPTIONS: '-c search_path=wrong', PGSSLMODE: 'disable',
    PGPASSWORD: 'old', PGPASSFILE: '/other', FERRE_ORIGEN_URL: 'secret', PG_BIN: '/tools',
  });
  assert.equal(env.PGHOST, 'source.invalid');
  assert.equal(env.PGDATABASE, 'catalog one');
  assert.equal(env.PGPASSWORD, "p'$(literal)");
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.PGPASSFILE, undefined);
  assert.equal(env.FERRE_ORIGEN_URL, undefined);
  assert.equal(env.PGOPTIONS, '-c default_transaction_read_only=on');
  for (const url of ['https://source.invalid/db', 'postgresql://source.invalid/db', 'postgresql://u@source.invalid/', 'postgresql://u@source.invalid/db?host=other', 'postgresql://u@source.invalid/db?schema=other']) {
    assert.throws(() => sourceEnvironment(url, {}));
  }
});

test('manual backup preserves inherited TLS verification and CA; URL overrides remain explicit', () => {
  const policy = { PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/private/source-ca.pem', PGCHANNELBINDING: 'require' };
  const env = sourceEnvironment('postgresql://reader@source.invalid/catalog', policy);
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGSSLROOTCERT, '/private/source-ca.pem');
  assert.equal(env.PGCHANNELBINDING, 'require');
  assert.equal(sourceEnvironment('postgresql://reader@[::1]/catalog', {}).PGHOST, '::1');
  assert.equal(sourceEnvironment('postgresql://reader@source.invalid/catalog?sslmode=require', policy).PGSSLMODE, 'require');
});

test('checksum mismatch stops before invoking any PostgreSQL tool or issuing a verified manifest', { skip: process.platform === 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'pilot-corrupt-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin'), marker = join(root, 'postgres-invoked');
  await mkdir(bin);
  for (const tool of ['pg_restore', 'pg_ctl', 'initdb', 'psql']) {
    await writeFile(join(bin, tool), `#!/bin/sh\ntouch '${marker}'\nexit 0\n`, { mode: 0o700 });
  }
  await writeFile(join(root, 'database.dump'), 'corrupted archive');
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ sha256: 'a'.repeat(64), conteos: {} }));
  const script = join(dirname(fileURLToPath(import.meta.url)), 'verificar-respaldo.sh');
  const result = spawnSync('bash', [script, root], { env: { PATH: process.env.PATH, PG_BIN: bin }, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /no se restaura/);
  await assert.rejects(access(marker));
  await assert.rejects(access(join(root, 'manifest.json.verificado')));
  assert.equal(await readFile(join(root, 'database.dump'), 'utf8'), 'corrupted archive');
});
