// Opt-in real PostgreSQL + restic test. Creates ALL data in a new temporary folder.
// Never reads .env, DATABASE_URL or a pre-existing PostgreSQL database.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { command, backupAttempt, pgBinary } from './backup-worker.mjs';
import { isolatedEnvironment } from './backup-verify-isolated.mjs';

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
  await command(restic, ['check', '--read-data'], { env });
  await assert.rejects(command(restic, ['snapshots'], { env: { ...env, RESTIC_PASSWORD_FILE: undefined, RESTIC_PASSWORD: 'wrong-key' } }));
  const rows = (await command(pg('psql'), ['-X', '-At', '-c', 'SELECT tenant_id,total FROM ventas ORDER BY tenant_id'], { env: source.local })).trim();
  assert.equal(rows.replaceAll('\r', ''), 'tenant-a|125\ntenant-b|300');
  console.log('PASS: 3 real encrypted backups, readback checksum, 3 isolated PostgreSQL restores, retention 2, full restic integrity, wrong-key rejection, source tenant rows unchanged. Local test destination only.');
} finally {
  if (started || await readFile(join(source.data, 'postmaster.pid'), 'utf8').catch(() => '')) await command(pg('pg_ctl'), ['-D', source.data, '-m', 'fast', '-w', 'stop'], { env: source.local });
  if (dirname(root) === tmpdir() && root.includes('fs41-integration-')) await rm(root, { recursive: true, force: true });
}
