import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { diaCalendario } from '../src/common/zona-horaria';

// Corrección del ISV de compras (docs/AUDITORIA_COMPRAS_ISV.md, C-01 y C-03). Validación aritmética: ISV ≤ subtotal y costo > 0.
// No fija tasas: 0 % y 15 % se aceptan porque la tasa aplicable es una decisión pendiente del contador. Datos sintéticos.
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL. Llama al servicio real (sin mocks).
describe('Compras: validación aritmética del ISV (corrección) / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  let directory: string, prisma: PrismaService, ops: OperacionesService;
  let started = false;
  let tenantId: string, otherTenantId: string, proveedorId: string, productoId: string;
  const users: Record<string, string> = {};

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const producto = () => prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
  const compraDe = (numeroFactura: string, costo: number, cantidad: number, extra: any = {}) => ({
    solicitudId: randomUUID(), proveedorId, numeroFactura, isv: 0,
    items: [{ productoId, cantidad, costo }], ...extra,
  });
  const detalleDe = async (orderId: string) => (await sql('SELECT id, cantidad, cantidad_recibida FROM detalles_orden_compra WHERE orden_id=$1', orderId))[0];
  const cuentaDe = (orderId: string) => prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP', documentoId: orderId } });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-compras-fix-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    ops = new OperacionesService(prisma);
  }, 120000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-compras-fix-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Compras de prueba' } });
    const roles: [string, string, string[], boolean][] = [['ADMIN', 'ADMIN', [], false], ['BODEGUERO', 'BODEGUERO', ['inventario.editar', 'inventario.ver'], true], ['CAJERO', 'CAJERO', [], false]];
    for (const [clave, rol, permisos, configurados] of roles) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: clave, email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol: rol as any, permisosConfigurados: configurados, permisos } });
      users[clave] = id;
    }
    const otro = randomUUID();
    await prisma.usuario.create({ data: { id: otro, tenantId: otherTenantId, nombre: 'Ajeno', email: `${otro}@test.invalid`, passwordHash: 'not-a-password', rol: 'ADMIN' } });
    users.OTHER = otro;
    proveedorId = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Distribuidora Central' } })).id;
    productoId = (await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioCosto: 50, precioVenta: 70, stockActual: 100, stockMinimo: 0, unidadMedida: 'UNIDAD' } })).id;
  });

  const ordenes = (tenant: string) => sql('SELECT subtotal::float AS subtotal, isv::float AS isv, total::float AS total FROM ordenes_compra WHERE tenant_id=$1', tenant);

  it('ISV negativo se rechaza y no crea orden ni CxP', async () => {
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-N1', 45, 10, { isv: -1 }))).rejects.toThrow();
    expect(await ordenes(tenantId)).toEqual([]);
  });

  it('ISV con más de dos decimales o fuera de rango se rechaza', async () => {
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-N2', 45, 10, { isv: 1.234 }))).rejects.toThrow(/dos decimales/);
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-N3', 45, 10, { isv: 99999999999 }))).rejects.toThrow(/no negativo|dos decimales/);
    expect(await ordenes(tenantId)).toEqual([]);
  });

  it('el total y el subtotal enviados por el cliente se ignoran: el servidor calcula de las líneas', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, { ...compraDe('FAC-M1', 45, 10, { isv: 0 }), total: 1, subtotal: 1 } as any);
    expect([Number(orden.subtotal), Number(orden.total)]).toEqual([450, 450]);
  });

  it('rechaza un ISV mayor que el subtotal y no crea orden ni CxP', async () => {
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-ISV1', 45, 10, { isv: 4500 }))).rejects.toThrow('El ISV no puede superar el subtotal');
    expect(await ordenes(tenantId)).toEqual([]);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP' } })).toBe(0);
  });

  it('rechaza un costo de cero: una línea sin costo no entra en el costo promedio', async () => {
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-C0', 0, 10, { isv: 0 }))).rejects.toThrow(/mayor a cero/);
    expect(await ordenes(tenantId)).toEqual([]);
  });

  it('un costo negativo se rechaza en el servicio (la validación HTTP lo rechaza antes)', async () => {
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-NEG', -5, 10, { isv: 0 }))).rejects.toThrow();
    expect(await ordenes(tenantId)).toEqual([]);
  });

  it('CARACTERIZACIÓN (pendiente de decisión D3): el ISV del encabezado no tiene desglose por línea', async () => {
    const columnas = (await sql("SELECT column_name FROM information_schema.columns WHERE table_name='detalles_orden_compra'")).map(c => c.column_name);
    expect(columnas).not.toContain('isv');
    expect(columnas).not.toContain('exento');
  });

  it('acepta 0 % y 15 % (tasa pendiente de decisión del contador) y rechaza 500 % por aritmética', async () => {
    for (const [numero, isv] of [['FAC-T0', 0], ['FAC-T15', 67.5]] as const) {
      await expect(ops.compra(tenantId, users.ADMIN, compraDe(numero, 45, 10, { isv }))).resolves.toBeDefined();
    }
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-T500', 45, 10, { isv: 2250 }))).rejects.toThrow('El ISV no puede superar el subtotal');
  });

  it('aislamiento: un ADMIN de otra empresa no puede registrar compras con el proveedor de esta', async () => {
    await expect(ops.compra(otherTenantId, users.OTHER, compraDe('FAC-AJ', 45, 10))).rejects.toThrow();
    expect(await ordenes(otherTenantId)).toEqual([]);
  });
});
