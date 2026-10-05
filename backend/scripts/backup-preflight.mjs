import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync, chmodSync, createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePrivateDirectory } from './private-directory.mjs';

// Usa PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSFILE o PGSERVICE.
// No lee .env, no imprime conexión/credenciales y no modifica la base de origen.
if (!process.env.PGDATABASE && !process.env.PGSERVICE) {
  throw new Error('Configure PGDATABASE o PGSERVICE para la base que quiere respaldar. No se usa DATABASE_URL automáticamente.');
}
if (process.argv.length !== 3) throw new Error('Uso: node scripts/backup-preflight.mjs DIRECTORIO_DE_RESPALDOS');
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolvePrivateDirectory(process.argv[2], project);
mkdirSync(root, { recursive: true, mode: 0o700 });
const directory = join(root, `ferresystem-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
mkdirSync(directory, { mode: 0o700 });

function run(name, args, input) {
  const command = process.env.PG_BIN ? join(process.env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name;
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    // No propagar stderr: puede contener información de conexión o datos privados.
    throw new Error(`${name} no terminó correctamente. Revise conectividad, permisos y versión con el administrador. El respaldo incompleto no es válido.`);
  }
  return result.stdout;
}

const report = run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', '-'], readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'preflight.sql'), 'utf8'));
writeFileSync(join(directory, 'preflight.txt'), report, { mode: 0o600 });
const backup = join(directory, 'database.dump');
run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', backup]);
if (!statSync(backup).size) throw new Error('El archivo de respaldo está vacío.');
run('pg_restore', ['--list', backup]);
chmodSync(backup, 0o600);
const hash = createHash('sha256');
for await (const chunk of createReadStream(backup)) hash.update(chunk);
const digest = hash.digest('hex');
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
  createdAt: new Date().toISOString(), bytes: statSync(backup).size, sha256: digest,
  dumpVersion: run('pg_dump', ['--version']).trim(),
  archiveReadable: true, restoreTested: false,
  note: 'Archivo legible no equivale a restauración probada. preflight y dump son snapshots distintos si hay operaciones en curso.',
}, null, 2), { mode: 0o600 });
process.send?.({ type: 'backup-completed', backupDirectory: basename(directory), sha256: digest });
console.log(`Respaldo y diagnóstico guardados en ${directory}. Falta probar restauración en una base aislada.`);
