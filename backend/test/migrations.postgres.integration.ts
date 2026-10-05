import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const bin = process.env.PG_BIN || '/usr/bin';
const executable = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
const names = readdirSync(resolve('prisma/migrations')).filter(name => /^\d{14}_/.test(name)).sort();
const initial = names[0];
const latest = names.at(-1)!;

describe('Instalación y adopción / PostgreSQL aislado', () => {
  let directory: string;
  let port: string;
  let started = false;
  const clients: PrismaClient[] = [];
  beforeAll(async () => {
    if (!existsSync(executable('initdb'))) throw new Error('Falta PostgreSQL para estas pruebas');
    directory = mkdtempSync(join(tmpdir(), 'ferre-migrations-'));
    execFileSync(executable('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8'], { timeout: 30000, stdio: 'pipe' });
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = String((server.address() as { port: number }).port);
    await new Promise<void>(resolve => server.close(() => resolve()));
    execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { timeout: 30000, stdio: 'pipe' });
    started = true;
  });
  afterAll(async () => {
    await Promise.all(clients.map(client => client.$disconnect()));
    if (started) execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 30000, stdio: 'pipe' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  const database = () => {
    const name = 'test_' + randomUUID().replaceAll('-', '');
    execFileSync(executable('createdb'), ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', name], { timeout: 30000, stdio: 'pipe' });
    const url = `postgresql://postgres@127.0.0.1:${port}/${name}`;
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    clients.push(prisma);
    return { name, url, prisma };
  };
  const cli = (url: string, command: string, args: string[] = [], extra: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, [resolve('scripts/migration-safe.mjs'), command, ...args], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, ...extra }, encoding: 'utf8', timeout: 60000,
    });
    return { status: result.status, output: result.stdout, error: result.stderr };
  };
  const apply = (name: string, through: string) => {
    for (const migration of names.slice(0, names.indexOf(through) + 1)) {
      execFileSync(executable('psql'), ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', name, '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations', migration, 'migration.sql')], { timeout: 30000, stdio: 'pipe' });
    }
  };
  const backedUp = (name: string) => {
    const folder = join(directory, 'backups_' + name);
    const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
    execFileSync(process.execPath, [resolve('scripts/backup-preflight.mjs'), folder], {
      env: { ...pgEnv, PG_BIN: bin, PGHOST: '127.0.0.1', PGPORT: port, PGUSER: 'postgres', PGDATABASE: name, PGSSLMODE: 'disable' }, timeout: 30000, stdio: 'pipe',
    });
    const saved = join(folder, readdirSync(folder)[0]);
    const restored = database();
    const manifestPath = join(saved, 'manifest.json');
    execFileSync(process.execPath, [resolve('scripts/restore-verify.mjs'), manifestPath], {
      env: { ...process.env, PG_BIN: bin, FERRE_RESTORE_DATABASE_URL: restored.url }, timeout: 30000, stdio: 'pipe',
    });
    expect(JSON.parse(readFileSync(manifestPath, 'utf8')).restoreTested).toBe(true);
    const repeated = spawnSync(process.execPath, [resolve('scripts/restore-verify.mjs'), manifestPath], {
      env: { ...process.env, PG_BIN: bin, FERRE_RESTORE_DATABASE_URL: restored.url }, timeout: 30000, encoding: 'utf8',
    });
    expect(repeated.status).toBe(1);
    return manifestPath;
  };

  it('instala desde cero con migrate deploy, crea trigger y vuelve a ejecutar sin cambios', async () => {
    const db = database();
    expect(JSON.parse(cli(db.url, 'inspect').output).state).toBe('VACIA');
    const result = cli(db.url, 'deploy');
    expect(result, result.error).toMatchObject({ status: 0 });
    expect(JSON.parse(result.output).pending).toEqual([]);
    const tenant = await db.prisma.tenant.create({ data: { nombreComercial: 'Nueva instalación' } });
    const client = await db.prisma.cliente.create({ data: { tenantId: tenant.id, nombre: 'Cliente real' } });
    expect(client.numeroCliente).toBe(1);
    expect(cli(db.url, 'deploy').status).toBe(0);
    expect(await db.prisma.cliente.count()).toBe(1);
  }, 60000);

  it('bloquea base existente sin historial; adopta solo tras comparación exacta y conserva datos al actualizar', async () => {
    const db = database();
    apply(db.name, names[1]);
    await db.prisma.$executeRawUnsafe("INSERT INTO tenants(id,nombre_comercial,updated_at) VALUES ('old-tenant','Anterior',NOW())");
    await db.prisma.$executeRawUnsafe("INSERT INTO clientes(id,tenant_id,nombre,updated_at) VALUES ('old-client','old-tenant','Ana',NOW())");
    expect(JSON.parse(cli(db.url, 'inspect').output).state).toBe('REQUIERE_BASELINE');
    expect(cli(db.url, 'deploy').status).toBe(1);
    const manifest = backedUp(db.name);
    const reference = database();
    const adoption = cli(db.url, 'adopt', ['--through', names[1], '--backup-manifest', manifest], { FERRE_REFERENCE_DATABASE_URL: reference.url });
    expect(adoption, adoption.error).toMatchObject({ status: 0 });
    expect(JSON.parse(adoption.output).applied).toEqual(names.slice(0, 2));
    expect(cli(db.url, 'deploy').status).toBe(0);
    expect(await db.prisma.cliente.findUniqueOrThrow({ where: { id: 'old-client' } })).toMatchObject({ nombre: 'Ana', tenantId: 'old-tenant', numeroCliente: 1 });
  }, 60000);

  it('adopta solo la inicial cuando el historial histórico ya existe y conserva sus checksums', async () => {
    const db = database();
    expect(cli(db.url, 'deploy').status).toBe(0);
    await db.prisma.$executeRawUnsafe('DELETE FROM public._prisma_migrations WHERE migration_name=$1', initial);
    const before = await db.prisma.$queryRawUnsafe('SELECT migration_name, checksum FROM _prisma_migrations ORDER BY migration_name');
    const manifest = backedUp(db.name);
    const reference = database();
    expect(cli(db.url, 'deploy').status).toBe(1);
    const result = cli(db.url, 'adopt', ['--through', latest, '--backup-manifest', manifest], { FERRE_REFERENCE_DATABASE_URL: reference.url });
    expect(result, result.error).toMatchObject({ status: 0 });
    expect(await db.prisma.$queryRawUnsafe('SELECT migration_name, checksum FROM _prisma_migrations WHERE migration_name <> $1 ORDER BY migration_name', initial)).toEqual(before);
    expect(cli(db.url, 'deploy').status).toBe(0);
  }, 60000);

  it('esquema diferente no se adopta ni modifica datos o historial', async () => {
    const db = database();
    apply(db.name, initial);
    await db.prisma.$executeRawUnsafe('ALTER TABLE productos ADD COLUMN campo_ajeno TEXT');
    const manifest = backedUp(db.name);
    const reference = database();
    expect(cli(db.url, 'adopt', ['--through', initial, '--backup-manifest', manifest], { FERRE_REFERENCE_DATABASE_URL: reference.url }).status).toBe(1);
    const [exists] = await db.prisma.$queryRawUnsafe<{ exists: boolean }[]>("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists");
    expect(exists.exists).toBe(false);
    expect(cli(db.url, 'deploy').status).toBe(1);
  }, 60000);

  it('rechaza numeración sin trigger aunque Prisma considere iguales las tablas', async () => {
    const db = database();
    apply(db.name, latest);
    await db.prisma.$executeRawUnsafe('DROP TRIGGER clientes_assign_number ON clientes');
    const manifest = backedUp(db.name);
    const reference = database();
    expect(cli(db.url, 'adopt', ['--through', latest, '--backup-manifest', manifest], { FERRE_REFERENCE_DATABASE_URL: reference.url }).status).toBe(1);
    const [exists] = await db.prisma.$queryRawUnsafe<{ exists: boolean }[]>("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists");
    expect(exists.exists).toBe(false);
  }, 60000);

  it('bloquea checksums cambiados, migración fallida y huecos del historial', async () => {
    const db = database();
    expect(cli(db.url, 'deploy').status).toBe(0);
    const [row] = await db.prisma.$queryRawUnsafe<{ checksum: string }[]>('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1', latest);
    await db.prisma.$executeRawUnsafe("UPDATE _prisma_migrations SET checksum='alterado' WHERE migration_name=$1", latest);
    expect(JSON.parse(cli(db.url, 'inspect').output).errors).toContain('CHECKSUM_DISTINTO');
    expect(cli(db.url, 'deploy').status).toBe(1);
    await db.prisma.$executeRawUnsafe('UPDATE _prisma_migrations SET checksum=$1, finished_at=NULL WHERE migration_name=$2', row.checksum, latest);
    expect(JSON.parse(cli(db.url, 'inspect').output).errors).toContain('MIGRACION_INCOMPLETA');
    await db.prisma.$executeRawUnsafe('UPDATE _prisma_migrations SET finished_at=NOW() WHERE migration_name=$1', latest);
    await db.prisma.$executeRawUnsafe('DELETE FROM _prisma_migrations WHERE migration_name=$1', names[1]);
    expect(JSON.parse(cli(db.url, 'inspect').output).errors).toContain('HISTORIAL_CON_HUECOS');
    expect(cli(db.url, 'deploy').status).toBe(1);
  }, 60000);

  it('historial completo no permite arrancar si falta el trigger de numeración', async () => {
    const db = database();
    expect(cli(db.url, 'deploy').status).toBe(0);
    await db.prisma.$executeRawUnsafe('DROP TRIGGER clientes_assign_number ON clientes');
    expect(JSON.parse(cli(db.url, 'inspect').output).errors).toContain('TRIGGER_CLIENTES_AUSENTE');
    expect(cli(db.url, 'deploy').status).toBe(1);
  }, 60000);

  it('rechaza adopción sin restauración probada o con referencia ocupada', async () => {
    const db = database();
    apply(db.name, initial);
    const reference = database();
    expect(cli(db.url, 'adopt', ['--through', initial], { FERRE_REFERENCE_DATABASE_URL: reference.url }).status).toBe(1);
    const manifest = backedUp(db.name);
    expect(cli(db.url, 'adopt', ['--through', initial, '--backup-manifest', manifest], { FERRE_REFERENCE_DATABASE_URL: db.url }).status).toBe(1);
    expect(JSON.parse(cli(db.url, 'inspect').output).state).toBe('REQUIERE_BASELINE');
  }, 60000);
});
