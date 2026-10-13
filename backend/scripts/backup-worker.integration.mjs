// Opt-in real PostgreSQL + restic test. Creates ALL data in a new temporary folder.
// Never reads .env, DATABASE_URL or a pre-existing PostgreSQL database.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { command, backupAttempt, pgBinary } from './backup-worker.mjs';
import { isolatedEnvironment } from './backup-verify-isolated.mjs';
import { snapshotDump } from './backup-consistent.mjs';

if (process.env.FS41_INTEGRATION !== '1') throw new Error('Set FS41_INTEGRATION=1 for isolated integration only.');
const root = await mkdtemp(join(tmpdir(), 'fs41-integration-'));
const source = await isolatedEnvironment(root, process.env);
const pg = name => pgBinary(name, process.env);
let started = false;
try {
  await command(pg('initdb'), ['-D', source.data, '-U', 'ferre_verify', '--pwfile', source.passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale'], { env: source.local });
  await writeFile(join(source.data, 'postgresql.auto.conf'), `listen_addresses = '127.0.0.1'\nport = ${source.port}\nunix_socket_directories = ''\n`);
  await command(pg('pg_ctl'), ['-D', source.data, '-l', join(source.cluster, 'log'), '-w', 'start'], { env: source.local }); started = true;
  const sql = `CREATE TABLE tenants(id text PRIMARY KEY); INSERT INTO tenants VALUES ('tenant-a'),('tenant-b');
    CREATE TABLE usuarios(id text PRIMARY KEY, tenant_id text REFERENCES tenants(id));
    CREATE TABLE productos(id text PRIMARY KEY, tenant_id text REFERENCES tenants(id));
    CREATE TABLE clientes(id text PRIMARY KEY, tenant_id text REFERENCES tenants(id));
    CREATE TABLE ventas(id text PRIMARY KEY, tenant_id text REFERENCES tenants(id), total numeric);
    INSERT INTO ventas VALUES ('sale-a','tenant-a',125),('sale-b','tenant-b',300);`;
  await command(pg('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: source.local });
  const passwordFile = join(root, 'restic-password');
  await writeFile(passwordFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  const restic = process.env.RESTIC_BIN || 'restic';
  // Local repository ONLY for tests; production configuration explicitly rejects it.
  const env = { ...source.local, PG_BIN: process.env.PG_BIN, RESTIC_BIN: restic, RESTIC_REPOSITORY: join(root, 'encrypted-repository'), RESTIC_PASSWORD_FILE: passwordFile, RESTIC_CACHE_DIR: join(root, 'cache') };
  await command(restic, ['init'], { env });
  const config = { temp: join(root, 'work'), instance: 'fs41-integration', keep: 2 };
  await mkdir(config.temp);
  for (let i = 0; i < 3; i++) {
    const result = await backupAttempt(config, env);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.restoreTested, true);
  }
  const snapshots = JSON.parse(await command(restic, ['snapshots', '--json'], { env }));
  assert.equal(snapshots.length, 2, 'retention keeps exactly two snapshots');
  const recoveryPoints = snapshots.map(snapshot => snapshot.id);
  // Two failed restores upload snapshots. A later success must retain another
  // verified recovery point rather than counting either failed attempt.
  for (let i = 0; i < 2; i++) {
    const failed = await backupAttempt(config, env, { verify: async () => { throw new Error('deliberate restore failure'); } });
    assert.equal(failed.errorCode, 'RESTORE');
  }
  const successful = await backupAttempt(config, env);
  assert.equal(successful.success, true);
  const afterFailures = JSON.parse(await command(restic, ['snapshots', '--json'], { env }));
  assert.equal(afterFailures.filter(snapshot => snapshot.tags.includes('fs41-verified')).length, 2);
  assert.equal(afterFailures.filter(snapshot => !snapshot.tags.includes('fs41-verified')).length, 2);
  assert.ok(afterFailures.some(snapshot => recoveryPoints.includes(snapshot.id)), 'an older verified copy survives');
  assert.ok(afterFailures.some(snapshot => snapshot.id === successful.snapshot), 'reported tagged ID exists');
  await command(restic, ['check', '--read-data'], { env });
  await assert.rejects(command(restic, ['snapshots'], { env: { ...env, RESTIC_PASSWORD_FILE: undefined, RESTIC_PASSWORD: 'wrong-key' } }));
  const rows = (await command(pg('psql'), ['-X', '-At', '-c', 'SELECT tenant_id,total FROM ventas ORDER BY tenant_id'], { env: source.local })).trim();
  assert.equal(rows.replaceAll('\r', ''), 'tenant-a|125\ntenant-b|300');
  console.log('PASS: 4 real encrypted backups/restores, 2 deliberate restore failures, retention preserves 2 verified copies and does not count failed copies; full integrity, wrong-key rejection, source rows unchanged. Local test destination only.');

  // pg_dump executes after a new sale commits; its imported snapshot must still
  // agree with the manifest captured BEFORE that sale (source remains online).
  await command(pg('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE TABLE _prisma_migrations(id text); CREATE TABLE extra(id text);'], { env: source.local });
  const consistent = join(root, 'consistent'); await mkdir(consistent);
  const manifest = await snapshotDump(consistent, env, async (name, args, options) => {
    if (name.endsWith('pg_dump')) await command(pg('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO ventas VALUES ('concurrent','tenant-a',50)"], { env: source.local });
    return command(name, args, options);
  });
  assert.equal(manifest.conteos.ventas, 2);
  const restored = await isolatedEnvironment(root, process.env);
  let restoredStarted = false;
  try {
    await command(pg('initdb'), ['-D', restored.data, '-U', 'ferre_verify', '--pwfile', restored.passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale'], { env: restored.local });
    await command(pg('pg_ctl'), ['-D', restored.data, '-l', join(restored.cluster, 'log'), '-o', `-h 127.0.0.1 -p ${restored.port} -k ${restored.cluster}`, '-w', 'start'], { env: restored.local }); restoredStarted = true;
    await command(pg('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA public CASCADE'], { env: restored.local });
    await command(pg('pg_restore'), ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', 'postgres', join(consistent, 'database.dump')], { env: restored.local });
    assert.equal((await command(pg('psql'), ['-X', '-At', '-c', 'SELECT count(*) FROM ventas'], { env: restored.local })).trim(), '2');
    assert.equal((await command(pg('psql'), ['-X', '-At', '-c', 'SELECT count(*) FROM ventas'], { env: source.local })).trim(), '3');
    console.log('PASS: consistent snapshot includes 2 original sales; concurrent sale remains in source (3) and is absent from restored dump (2), matching manifest.');
  } finally {
    if (restoredStarted) await command(pg('pg_ctl'), ['-D', restored.data, '-m', 'fast', '-w', 'stop'], { env: restored.local });
  }
} finally {
  if (started || await readFile(join(source.data, 'postmaster.pid'), 'utf8').catch(() => '')) await command(pg('pg_ctl'), ['-D', source.data, '-m', 'fast', '-w', 'stop'], { env: source.local });
  if (dirname(root) === tmpdir() && root.includes('fs41-integration-')) await rm(root, { recursive: true, force: true });
}
