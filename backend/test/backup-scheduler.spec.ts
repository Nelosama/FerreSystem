import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

describe.skipIf(process.platform === 'win32')('Programador de respaldos con clientes PostgreSQL sintéticos', () => {
  let fixture: string;
  let directory: string;
  let bin: string;
  let child: ChildProcess | undefined;

  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'ferre-backup-scheduler-'));
    directory = join(fixture, 'backups');
    bin = join(fixture, 'bin');
    mkdirSync(directory, { mode: 0o700 });
    mkdirSync(bin, { mode: 0o700 });
    const script = `#!${process.execPath}
import { basename } from 'node:path';
import { writeFileSync } from 'node:fs';
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
if (command === 'pg_dump' && args.includes('--version')) process.stdout.write('pg_dump synthetic 17\\n');
else if (command === 'pg_dump') {
  if (process.env.FERRE_FIXTURE_FAIL_DUMP === '1') process.exit(1);
  writeFileSync(args[args.indexOf('--file') + 1], 'synthetic archive fixture\\n');
} else process.stdout.write('synthetic diagnostic fixture\\n');
`;
    for (const command of ['psql', 'pg_dump', 'pg_restore']) writeFileSync(join(bin, command), script, { mode: 0o700 });
  });

  afterEach(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(done => {
        child!.once('close', () => done());
        child!.kill('SIGTERM');
      });
    }
    child = undefined;
    rmSync(fixture, { recursive: true, force: true });
  });

  const start = (fail = false) => {
    child = spawn(process.execPath, [resolve('scripts/backup-scheduler.mjs'), directory], {
      stdio: 'ignore', env: {
        PATH: process.env.PATH,
        PG_BIN: bin,
        PGDATABASE: 'synthetic_fixture',
        BACKUP_INTERVAL_SECONDS: '60',
        FERRE_FIXTURE_FAIL_DUMP: fail ? '1' : '0',
      },
    });
  };
  const latest = async () => {
    const timeout = Date.now() + 5000;
    while (Date.now() < timeout) {
      try { return JSON.parse(readFileSync(join(directory, 'latest-status.json'), 'utf8')); }
      catch { /* Esperar únicamente el fixture, sin conexiones PostgreSQL reales. */ }
      if (child?.exitCode !== null || child?.signalCode !== null) throw new Error('El programador sintético terminó antes de publicar estado');
      await new Promise(done => setTimeout(done, 20));
    }
    throw new Error('El programador sintético no publicó estado');
  };

  it('vincula su copia exacta por IPC, aunque exista un manifiesto ajeno más reciente', async () => {
    const unrelated = join(directory, 'ferresystem-z-fixture');
    mkdirSync(unrelated);
    writeFileSync(join(unrelated, 'manifest.json'), JSON.stringify({ createdAt: '9999-01-01T00:00:00Z', sha256: 'b'.repeat(64), restoreTested: true }));
    start();
    const status = await latest();
    expect(status.success).toBe(true);
    expect(status.backupDirectory).not.toBe('ferresystem-z-fixture');
    const manifest = JSON.parse(readFileSync(join(directory, status.backupDirectory, 'manifest.json'), 'utf8'));
    expect(status.sha256).toBe(manifest.sha256);
    expect(status).not.toHaveProperty('restoreTested');
    expect(manifest.archiveReadable).toBe(true);
    expect(manifest.restoreTested).toBe(false);
    expect(readdirSync(directory).filter(name => name.endsWith('.tmp'))).toEqual([]);
  }, 10000);

  it('publica un fallo sin enlazar una carpeta parcial como respaldo válido', async () => {
    start(true);
    const status = await latest();
    expect(status.success).toBe(false);
    expect(status).not.toHaveProperty('backupDirectory');
    expect(status).not.toHaveProperty('sha256');
    expect(readdirSync(directory).filter(name => name.startsWith('ferresystem-'))).toHaveLength(1);
  }, 10000);
});
