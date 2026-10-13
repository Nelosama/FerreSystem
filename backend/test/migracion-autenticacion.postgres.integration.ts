import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';

// Migración 20261012000000_autenticacion_sesiones_intentos sobre una base con datos reales de otra fase:
// debe crear las tablas nuevas sin tocar filas existentes, y las restricciones deben cumplirse.
describe('Migración de autenticación / PostgreSQL con datos previos', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const NUEVA = '20261012000000_autenticacion_sesiones_intentos';
  let directory: string;
  let started = false;
  let prisma: PrismaService;
  let url: string;
  let port: number;
  const psql = (sql: string) => execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { timeout: 60000, stdio: 'pipe' }).toString();

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-migracion-auth-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const options = { windowsHide: true, timeout: 30000, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))) }, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // Estado previo: todas las migraciones anteriores a la nueva, en orden.
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      if (migracion === NUEVA || !existsSync(resolve('prisma/migrations', migracion, 'migration.sql'))) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations', migracion, 'migration.sql')], { ...options, timeout: 120000 });
    }
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-migracion-auth-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  it('con datos previos, la migración crea las tablas y no altera ninguna fila existente', async () => {
    const tenant = randomUUID();
    psql(`INSERT INTO tenants (id, nombre_comercial, updated_at, configuracion) VALUES ('${tenant}', 'Previa', now(), '{}')`);
    psql(`INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, activo, updated_at) VALUES ('${randomUUID()}', '${tenant}', 'Admin previo', 'previo@test.invalid', 'x', 'ADMIN', true, now())`);
    const antes = psql(`SELECT md5((SELECT string_agg(u::text, '|' ORDER BY u::text) FROM usuarios u) || (SELECT string_agg(t::text, '|' ORDER BY t::text) FROM tenants t))`);

    execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations', NUEVA, 'migration.sql')], { windowsHide: true, timeout: 60000, stdio: 'pipe' });

    const despues = psql(`SELECT md5((SELECT string_agg(u::text, '|' ORDER BY u::text) FROM usuarios u) || (SELECT string_agg(t::text, '|' ORDER BY t::text) FROM tenants t))`);
    expect(despues).toBe(antes);
    expect(psql(`SELECT to_regclass('public.sesiones_auth') IS NOT NULL AND to_regclass('public.intentos_login') IS NOT NULL`)).toMatch(/\bt\b/);
  });

  it('las restricciones de la migración se cumplen y el cliente de Prisma conecta', async () => {
    expect(() => psql(`INSERT INTO sesiones_auth (id, tipo, sujeto_id, expires_at) VALUES ('s-mal', 'OTRO', 'u', now() + interval '1 day')`)).toThrow();
    psql(`INSERT INTO sesiones_auth (id, tipo, sujeto_id, expires_at) VALUES ('s-bien', 'TENANT', 'u', now() + interval '1 day')`);
    psql(`INSERT INTO intentos_login (clave, fallos) VALUES ('cuenta:x', 1)`);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    expect(await prisma.sesionAuth.findUnique({ where: { id: 's-bien' } })).toMatchObject({ tipo: 'TENANT', sujetoId: 'u', revokedAt: null });
    expect(await prisma.intentoLogin.findUnique({ where: { clave: 'cuenta:x' } })).toMatchObject({ fallos: 1 });
  });
});
