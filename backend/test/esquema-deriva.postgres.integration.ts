import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';

// Deriva de esquema: una base creada solo con migraciones versionadas debe describir
// exactamente el mismo esquema que prisma/schema.prisma. Si no coincide, `prisma migrate dev`
// propondría eliminar tablas con datos (garantias, apartados, transferencias…).
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL de producción.
describe('Deriva de esquema Prisma / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const backend = resolve(__dirname, '..');
  const schema = join(backend, 'prisma', 'schema.prisma');
  let directory = '';
  let started = false;
  let url = '';
  let env: NodeJS.ProcessEnv;

  // Tablas con datos operativos que no deben desaparecer del modelo ni de la base.
  const tablasHistoricas = [
    'abonos_apartado',
    'apartados',
    'auditoria_soporte',
    'cierres_comisiones',
    'detalles_transferencia',
    'garantias',
    'historial_garantias',
    'listas_precio',
    'pedidos_especiales',
    'transferencias',
  ];

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-deriva-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));

    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8'], { timeout: 60000, stdio: 'pipe' });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-o', `-p ${port} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', join(directory, 'server.log'), '-w', 'start'], { timeout: 60000, stdio: 'pipe' });
    started = true;
    url = `postgresql://postgres@127.0.0.1:${port}/esquema`;
    execFileSync(exe('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'esquema'], { timeout: 30000, stdio: 'pipe' });
    env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
    // Ruta de despliegue real: solo migraciones versionadas sobre base vacía.
    execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], { cwd: backend, env, timeout: 180000, stdio: 'pipe' });
  }, 240000);

  afterAll(() => {
    if (started) {
      try { execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 60000, stdio: 'pipe' }); } catch { /* el clúster ya no existe */ }
    }
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('prisma migrate diff no encuentra diferencias entre migraciones y schema.prisma', () => {
    // --exit-code devuelve 2 si existe cualquier diferencia (incluido DROP TABLE).
    let salida = '';
    let codigo = 0;
    try {
      salida = execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', schema, '--script', '--exit-code'], { cwd: backend, env, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    } catch (error: any) {
      codigo = error.status ?? 1;
      salida = String(error.stdout ?? '');
    }
    expect(codigo, `Deriva detectada:\n${salida.slice(0, 2000)}`).toBe(0);
  }, 180000);

  it('las tablas operativas históricas existen en la base reconstruida', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      const rows = await prisma.$queryRawUnsafe<{ name: string | null }[]>(
        `SELECT t.name FROM unnest($1::text[]) AS t(name) WHERE to_regclass('public.' || t.name) IS NULL`,
        tablasHistoricas,
      );
      expect(rows.map(r => r.name)).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('el modelo Prisma expone las tablas históricas (no se proponen DROP TABLE)', () => {
    const modelos = ['Apartado', 'AbonoApartado', 'Garantia', 'HistorialGarantia', 'ListaPrecio', 'PedidoEspecial', 'Transferencia', 'DetalleTransferencia', 'AuditoriaSoporte', 'CierreComision'];
    const texto = readFileSync(schema, 'utf8');
    for (const modelo of modelos) expect(texto).toMatch(new RegExp(`^model ${modelo} \\{`, 'm'));
  });
});
