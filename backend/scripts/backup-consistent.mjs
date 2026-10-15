import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chmod, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, digest, pgBinary } from './backup-worker.mjs';
import { resolvePrivateDirectory } from './private-directory.mjs';

export function sourceEnvironment(url, inherited) {
  const source = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(source.protocol) || !source.hostname || !source.username || source.pathname.length < 2) throw new Error('SOURCE_CONFIGURATION');
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith('PG') && key !== 'FERRE_ORIGEN_URL'));
  // Preserve an operator's stricter TLS policy/CA. Removing PG service and
  // credentials must not silently turn verify-full into libpq's prefer default.
  for (const key of ['PGSSLMODE', 'PGSSLROOTCERT', 'PGSSLCRL', 'PGSSLCRLDIR', 'PGSSLMINPROTOCOLVERSION', 'PGSSLMAXPROTOCOLVERSION', 'PGCHANNELBINDING']) {
    if (inherited[key]) env[key] = inherited[key];
  }
  const options = { sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', connect_timeout: 'PGCONNECT_TIMEOUT' };
  for (const [key, value] of source.searchParams) {
    if (key === 'schema' && value === 'public') continue;
    if (!options[key]) throw new Error('SOURCE_CONFIGURATION');
    env[options[key]] = value;
  }
  Object.assign(env, { PG_BIN: inherited.PG_BIN, PGHOST: source.hostname.replace(/^\[|\]$/g, ''), PGPORT: source.port || '5432',
    PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password),
    PGDATABASE: decodeURIComponent(source.pathname.slice(1)), PGCONNECT_TIMEOUT: env.PGCONNECT_TIMEOUT || '15',
    PGOPTIONS: '-c default_transaction_read_only=on' });
  return env;
}

// Both the manifest and pg_dump read the SAME exported, read-only transaction.
// Keeping psql's stdin open keeps that snapshot alive until the dump finishes.
export async function snapshotDump(directory, env, run = command) {
  const exporter = spawn(pgBinary('psql', env), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: exporter.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  let failed = false;
  const closed = new Promise(done => {
    exporter.once('error', () => { failed = true; done(); });
    exporter.once('close', code => { failed ||= code !== 0; done(); });
  });
  exporter.stdin.on('error', () => { failed = true; });
  const timer = setTimeout(() => { failed = true; exporter.kill('SIGKILL'); }, 1800000);
  const read = async () => {
    const row = await iterator.next();
    if (row.done || failed) throw new Error('SNAPSHOT_FAILED');
    return row.value;
  };
  try {
    exporter.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n');
    const snapshot = await read();
    if (!/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/i.test(snapshot)) throw new Error('SNAPSHOT_FAILED');
    exporter.stdin.write(`SELECT COALESCE(json_object_agg(table_name, n), '{}'::json) FROM (
      SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint AS n
      FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') counts;\n`);
    const counts = JSON.parse(await read());
    if (!Object.hasOwn(counts, '_prisma_migrations') || Object.keys(counts).length <= 5) throw new Error('SOURCE_TABLES');
    const dump = join(directory, 'database.dump');
    await run(pgBinary('pg_dump', env), ['--format=custom', '--schema=public', '--no-owner', '--no-privileges', '--lock-wait-timeout=5000', '--snapshot', snapshot, '--file', dump], { env });
    exporter.stdin.end('ROLLBACK;\n');
    await closed;
    if (failed || !(await stat(dump)).size) throw new Error('DUMP_FAILED');
    await chmod(dump, 0o600);
    const contents = await run(pgBinary('pg_restore', env), ['--list', dump], { env });
    if (!contents.includes('TABLE DATA public _prisma_migrations')) throw new Error('MIGRATION_HISTORY');
    await writeFile(join(directory, 'contenido.txt'), contents, { mode: 0o600 });
    await writeFile(join(directory, 'conteos.txt'), Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `${name}=${count}`).join('\n') + '\n', { mode: 0o600 });
    const manifest = { archiveReadable: true, restoreTested: false, sha256: await digest(dump), bytes: (await stat(dump)).size,
      creado: new Date().toISOString(), esquema: 'public', conteos: counts, consistentSnapshot: true };
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
    return manifest;
  } finally {
    clearTimeout(timer);
    if (exporter.exitCode === null && exporter.signalCode === null) exporter.kill('SIGKILL');
    await closed;
    lines.close();
  }
}

export async function main(args = process.argv.slice(2), inherited = process.env) {
  if (args.length !== 1 || !inherited.FERRE_ORIGEN_URL) throw new Error('SOURCE_CONFIGURATION');
  const env = sourceEnvironment(inherited.FERRE_ORIGEN_URL, inherited);
  const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const directory = resolvePrivateDirectory(args[0], project);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await readdir(directory)).length) throw new Error('DESTINATION_NOT_EMPTY');
  await chmod(directory, 0o700);
  const manifest = await snapshotDump(directory, env);
  console.log(`Respaldo consistente creado (${manifest.bytes} bytes). Falta verificar su restauración en una base aislada.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().catch(() => { console.error('BACKUP_NOT_VERIFIED: revise origen, destino privado vacío y herramientas PostgreSQL. No utilice archivos incompletos.'); process.exitCode = 1; });
}
