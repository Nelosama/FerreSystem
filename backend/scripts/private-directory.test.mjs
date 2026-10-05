import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolvePrivateDirectory } from './private-directory.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const prepare = join(project, 'deploy/local/prepare.mjs');
const preflight = join(project, 'backend/scripts/backup-preflight.mjs');
const posixOnly = { skip: process.platform === 'win32' };

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ferre-private-directory-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('rechaza destinos nuevos dentro del proyecto mediante un enlace externo', posixOnly, t => {
  const directory = fixture(t);
  const projectDirectory = join(directory, 'project');
  const alias = join(directory, 'alias');
  mkdirSync(projectDirectory);
  symlinkSync(projectDirectory, alias, 'dir');
  assert.throws(() => resolvePrivateDirectory(join(alias, 'new', 'private'), projectDirectory), /fuera del repositorio/);
  assert.throws(() => resolvePrivateDirectory(projectDirectory, alias), /fuera del repositorio/);
});

test('canonicaliza destinos externos y distingue el proyecto de un directorio hermano', posixOnly, t => {
  const directory = fixture(t);
  const projectDirectory = join(directory, 'project');
  const outside = join(directory, 'project-other');
  const alias = join(directory, 'outside-alias');
  mkdirSync(projectDirectory);
  mkdirSync(outside);
  symlinkSync(outside, alias, 'dir');
  const name = String.raw`private\$FERRE_FIXTURE_INTERPOLATION`;
  assert.ok(resolvePrivateDirectory(join(alias, name), projectDirectory) === join(outside, name));
});

test('no trata un enlace roto como un ancestro pendiente de crear', posixOnly, t => {
  const directory = fixture(t);
  const projectDirectory = join(directory, 'project');
  const alias = join(directory, 'dangling');
  mkdirSync(projectDirectory);
  symlinkSync(join(projectDirectory, 'missing'), alias, 'dir');
  assert.throws(() => resolvePrivateDirectory(join(alias, 'private'), projectDirectory));
});

test('prepare y preflight rechazan enlaces al repositorio antes de crear archivos', posixOnly, t => {
  const directory = fixture(t);
  const alias = join(directory, 'project-alias');
  const name = `.fixture-private-${randomUUID()}`;
  symlinkSync(project, alias, 'dir');
  const target = join(alias, name);
  const childEnv = { PATH: process.env.PATH, PGDATABASE: 'fixture-only' };
  const prepared = spawnSync(process.execPath, [prepare, target, 'fixture.lan', 'fixture@example.test', 'Fixture'], { env: childEnv, encoding: 'utf8' });
  assert.ok(prepared.status !== 0 && prepared.stderr.includes('fuera del repositorio'));
  const backedUp = spawnSync(process.execPath, [preflight, target], { env: childEnv, encoding: 'utf8' });
  assert.ok(backedUp.status !== 0 && backedUp.stderr.includes('fuera del repositorio'));
  assert.ok(!existsSync(join(project, name)));
});

test('prepare conserva barras POSIX y dólares literales en la configuración Compose', posixOnly, t => {
  const directory = fixture(t);
  const target = join(directory, String.raw`private\$FERRE_FIXTURE_INTERPOLATION`);
  const name = String.raw`Ferretería\'Norte ` + '${FERRE_FIXTURE_INTERPOLATION} $$';
  const childEnv = { PATH: process.env.PATH, DOCKER_CONFIG: directory, FERRE_FIXTURE_INTERPOLATION: 'must-not-expand' };
  const prepared = spawnSync(process.execPath, [prepare, target, 'fixture.lan', 'fixture@example.test', name], { env: childEnv, encoding: 'utf8' });
  assert.ok(prepared.status === 0, 'prepare debe aceptar los valores ficticios');
  for (const path of [target, join(target, 'secrets'), join(target, 'backups')]) {
    assert.ok((statSync(path).mode & 0o777) === 0o700, 'Los directorios nuevos deben ser privados');
  }
  const envFile = join(target, 'local.env');
  assert.ok((statSync(envFile).mode & 0o777) === 0o600);
  const generated = readFileSync(envFile, 'utf8');
  assert.ok(generated.includes('$$FERRE_FIXTURE_INTERPOLATION'), 'dotenv debe escapar dólares literales');
  const version = spawnSync('docker', ['compose', 'version'], { env: childEnv, encoding: 'utf8' });
  if (version.status !== 0) {
    t.skip('Compose no está instalado; se verificaron generación y permisos.');
    return;
  }
  const configured = spawnSync('docker', ['compose', '--env-file', envFile, '-f', join(project, 'deploy/local/compose.yaml'), 'config', '--format', 'json'], { cwd: directory, env: childEnv, encoding: 'utf8' });
  assert.ok(configured.status === 0, 'Compose debe aceptar únicamente los fixtures temporales');
  const model = JSON.parse(configured.stdout);
  // config escapa los dólares al serializar un modelo reutilizable.
  const literal = value => value.replaceAll('$$', '$');
  assert.ok(literal(model.services.backend.environment.INITIAL_TENANT_NAME) === name);
  assert.ok(literal(model.secrets.database_password.file) === join(target, 'secrets/database_password'));
  assert.ok(literal(model.services.backups.volumes[0].source) === join(target, 'backups'));
});

function fakePostgres(directory) {
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  const writeTool = (name, source) => writeFileSync(join(bin, name), `#!${process.execPath}\n${source}\n`, { mode: 0o700 });
  writeTool('psql', "console.log('Fixture report');");
  writeTool('pg_dump', "const fs = require('node:fs'); const crypto = require('node:crypto'); if (process.argv.includes('--version')) console.log('pg_dump fixture'); else fs.writeFileSync(process.argv[process.argv.indexOf('--file') + 1], crypto.randomBytes(64));");
  writeTool('pg_restore', "if (process.env.FERRE_FIXTURE_FAIL_RESTORE === '1') process.exit(1); console.log('Fixture archive');");
  return bin;
}

async function runPreflight(root, bin, failRestore = false) {
  const messages = [];
  const child = fork(preflight, [root], {
    env: { PATH: process.env.PATH, PGDATABASE: 'fixture-only', PG_BIN: bin, FERRE_FIXTURE_FAIL_RESTORE: failRestore ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout.resume();
  child.stderr.resume();
  child.on('message', message => messages.push(message));
  const status = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  return { status, messages };
}

test('preflight informa por IPC el respaldo verificado después de escribir su manifiesto', posixOnly, async t => {
  const directory = fixture(t);
  const root = join(directory, 'backups');
  const result = await runPreflight(root, fakePostgres(directory));
  assert.ok(result.status === 0 && result.messages.length === 1);
  const message = result.messages[0];
  assert.ok(message.type === 'backup-completed');
  assert.ok(/^ferresystem-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]{36}$/.test(message.backupDirectory));
  const manifest = JSON.parse(readFileSync(join(root, message.backupDirectory, 'manifest.json'), 'utf8'));
  assert.ok(message.sha256 === manifest.sha256 && /^[a-f0-9]{64}$/.test(message.sha256));
});

test('preflight no anuncia un respaldo cuya validación de archivo falla', posixOnly, async t => {
  const directory = fixture(t);
  const result = await runPreflight(join(directory, 'backups'), fakePostgres(directory), true);
  assert.ok(result.status !== 0 && result.messages.length === 0);
});
