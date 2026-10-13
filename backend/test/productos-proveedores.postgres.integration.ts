import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CashierResponseInterceptor } from '../src/common/interceptors/cashier-response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';

// Relación producto–proveedor contra PostgreSQL real (cadena completa de migraciones, clúster temporal).
// Cubre: asociación automática al recibir, último costo que sube y baja, un solo preferido, permisos por rol,
// aislamiento entre empresas, idempotencia del alta, auditoría y atomicidad si falla la auditoría de recepción.
describe('Productos y proveedores / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let ops: OperacionesService;
  let tenantId: string;
  let otherTenantId: string;
  let productoId: string;
  let proveedorA: string;
  let proveedorB: string;
  const users: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const vinculos = (producto = productoId) => sql(
    'SELECT proveedor_id, codigo_proveedor, es_preferido, ultimo_costo::float AS ultimo_costo, ultima_compra_at FROM productos_proveedores WHERE tenant_id=$1 AND producto_id=$2 ORDER BY proveedor_id', tenantId, producto);
  const http = (method: 'get' | 'put' | 'delete', path: string, rol: string, body?: any) => {
    const req = request(app.getHttpServer())[method](`/api/operaciones${path}`).auth(users[rol], { type: 'bearer' });
    return body === undefined ? req : req.send(body);
  };
  const comprar = async (proveedorId: string, costo: number, cantidad = 10, numeroFactura = `FAC-${randomUUID().slice(0, 8)}`) => {
    const orden = await ops.compra(tenantId, userIds.ADMIN, {
      solicitudId: randomUUID(), proveedorId, numeroFactura, isv: 0, items: [{ productoId, cantidad, costo }],
    } as any);
    return orden;
  };
  const recibir = async (ordenId: string, cantidad = 10) => {
    const detalle = (await sql('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', ordenId))[0];
    return ops.recibir(tenantId, userIds.BODEGUERO, ordenId, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad }] } as any);
  };

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-prodprov-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    ops = new OperacionesService(prisma);

    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Proveedores', estado: 'ACTIVO' } });
    for (const [clave, tenant, rol, permisos] of [
      ['ADMIN', tenantId, 'ADMIN', []],
      ['BODEGUERO', tenantId, 'BODEGUERO', ['inventario.editar', 'inventario.ver']],
      ['CAJERO', tenantId, 'CAJERO', []],
      ['VENDEDOR', tenantId, 'VENDEDOR', []],
      ['OTRO_ADMIN', otherTenantId, 'ADMIN', []],
    ] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId: tenant, nombre: clave, email: `${id}@test.invalid`, passwordHash: 'x', rol: rol as any, permisosConfigurados: rol === 'BODEGUERO', permisos: [...permisos] } as any });
      userIds[clave] = id;
      users[clave] = jwt.sign({ sub: id, tenantId: tenant, type: 'tenant' });
    }

    const producto = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'PRV-001', nombre: 'Tornillo 2 pulgadas', precioCosto: 10, precioVenta: 15, stockActual: 0 } as any });
    productoId = producto.id;
    proveedorA = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Distribuidora Norte' } })).id;
    proveedorB = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Ferretera Sur' } })).id;

    const module = await Test.createTestingModule({
      controllers: [OperacionesController],
      providers: [OperacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 180000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-prodprov-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  it('recibir mercancía asocia el proveedor real y guarda su último costo, aunque baje', async () => {
    const orden1 = await comprar(proveedorA, 50);
    await recibir(orden1.id);
    let filas = await vinculos();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ proveedor_id: proveedorA, es_preferido: false, ultimo_costo: 50 });
    expect(filas[0].ultima_compra_at).toBeTruthy();

    const orden2 = await comprar(proveedorA, 40);
    await recibir(orden2.id);
    filas = await vinculos();
    expect(filas).toHaveLength(1);
    expect(filas[0].ultimo_costo).toBe(40);
  });

  it('el costo de referencia por proveedor no cambia el costo vigente del producto ni el historial', async () => {
    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    const costos = await prisma.costoCompra.count({ where: { productoId, proveedorId: proveedorA } });
    expect(Number(producto.costoVigente)).toBe(40);
    expect(costos).toBe(2);
  });

  it('ADMIN ve la relación con costo y código; BODEGUERO la gestiona; CAJERO no accede (403)', async () => {
    const lista = await http('get', `/productos/${productoId}/proveedores`, 'ADMIN').expect(200);
    expect(lista.body[0]).toMatchObject({ proveedor_nombre: 'Distribuidora Norte', ultimo_costo: 40 });
    await http('get', `/productos/${productoId}/proveedores`, 'CAJERO').expect(403);
    await http('put', `/productos/${productoId}/proveedores/${proveedorB}`, 'CAJERO', { esPreferido: false }).expect(403);
    await http('get', `/productos/${productoId}/proveedores`, 'VENDEDOR').expect(403);
    await http('delete', `/productos/${productoId}/proveedores/${proveedorB}`, 'VENDEDOR').expect(403);
  });

  it('un solo proveedor preferido por producto; el cambio queda auditado con valor anterior', async () => {
    await http('put', `/productos/${productoId}/proveedores/${proveedorA}`, 'BODEGUERO', { esPreferido: true, codigoProveedor: 'DN-778' }).expect(200);
    const res = await http('put', `/productos/${productoId}/proveedores/${proveedorB}`, 'BODEGUERO', { esPreferido: true, codigoProveedor: ' FS-22 ' }).expect(200);
    const preferidos = res.body.filter((fila: any) => fila.es_preferido);
    expect(preferidos.map((fila: any) => fila.proveedor_nombre)).toEqual(['Ferretera Sur']);
    const codigoB = res.body.find((fila: any) => fila.proveedor_id === proveedorB);
    expect(codigoB.codigo_proveedor).toBe('FS-22');

    const auditoria = await prisma.auditoriaOperacion.findMany({ where: { tenantId, operacion: 'PRODUCTO_PROVEEDOR_GUARDAR' }, orderBy: { createdAt: 'asc' } });
    expect(auditoria.length).toBeGreaterThanOrEqual(2);
    expect(auditoria.at(-1)!.datos).toMatchObject({ proveedorId: proveedorB, esPreferido: true, codigoProveedor: 'FS-22', anterior: null });
  });

  it('repetir el mismo alta no duplica la relación ni cambia el resultado (idempotente)', async () => {
    const body = { esPreferido: true, codigoProveedor: 'FS-22' };
    const primera = await http('put', `/productos/${productoId}/proveedores/${proveedorB}`, 'BODEGUERO', body).expect(200);
    const segunda = await http('put', `/productos/${productoId}/proveedores/${proveedorB}`, 'BODEGUERO', body).expect(200);
    // updated_at cambia en cada escritura; lo demás debe ser idéntico.
    const sinFecha = ({ updated_at, ...resto }: any) => resto;
    expect(segunda.body.map(sinFecha)).toEqual(primera.body.map(sinFecha));
    expect((await vinculos()).filter(f => f.proveedor_id === proveedorB)).toHaveLength(1);
  });

  it('rechaza proveedor inactivo, proveedor o producto de otra empresa, y código demasiado largo', async () => {
    const inactivo = await prisma.proveedor.create({ data: { tenantId, nombre: 'Inactivo', activo: false } });
    await http('put', `/productos/${productoId}/proveedores/${inactivo.id}`, 'BODEGUERO', { esPreferido: false }).expect(400);
    const ajeno = await prisma.proveedor.create({ data: { tenantId: otherTenantId, nombre: 'Ajeno' } });
    await http('put', `/productos/${productoId}/proveedores/${ajeno.id}`, 'BODEGUERO', { esPreferido: false }).expect(404);
    const productoAjeno = await prisma.producto.create({ data: {precioAprobado:true, tenantId: otherTenantId, codigo: 'AJ-1', nombre: 'Ajeno', precioCosto: 1, precioVenta: 2, stockActual: 0 } as any });
    await http('put', `/productos/${productoAjeno.id}/proveedores/${proveedorA}`, 'BODEGUERO', { esPreferido: false }).expect(404);
    await http('get', `/productos/${productoAjeno.id}/proveedores`, 'ADMIN').expect(404);
    await http('put', `/productos/${productoId}/proveedores/${proveedorA}`, 'BODEGUERO', { esPreferido: false, codigoProveedor: 'X'.repeat(101) }).expect(400);
    expect(await sql('SELECT 1 FROM productos_proveedores WHERE tenant_id=$1 AND proveedor_id=$2', otherTenantId, ajeno.id)).toHaveLength(0);
  });

  it('otra empresa no ve ni cambia la relación de este producto', async () => {
    await http('get', `/productos/${productoId}/proveedores`, 'OTRO_ADMIN').expect(404);
    await http('delete', `/productos/${productoId}/proveedores/${proveedorA}`, 'OTRO_ADMIN').expect(404);
    expect(await vinculos()).toHaveLength(2);
  });

  it('eliminar la asociación la quita y deja auditoría; una segunda baja responde 404', async () => {
    await http('delete', `/productos/${productoId}/proveedores/${proveedorA}`, 'BODEGUERO').expect(200);
    expect((await vinculos()).map(f => f.proveedor_id)).toEqual([proveedorB]);
    await http('delete', `/productos/${productoId}/proveedores/${proveedorA}`, 'BODEGUERO').expect(404);
    const auditoria = await prisma.auditoriaOperacion.findMany({ where: { tenantId, operacion: 'PRODUCTO_PROVEEDOR_ELIMINAR' } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].datos).toMatchObject({ proveedorId: proveedorA, ultimoCosto: 40 });
  });

  it('si falla la auditoría de la recepción, no queda relación ni existencias ni costos (atomicidad)', async () => {
    const antes = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    const orden = await comprar(proveedorA, 77, 5);
    await sql(`CREATE OR REPLACE FUNCTION fallo_auditoria_recepcion() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'auditoria no disponible'; END; $$ LANGUAGE plpgsql;`);
    await sql(`CREATE TRIGGER fallo_auditoria_recepcion BEFORE INSERT ON auditoria_operaciones FOR EACH ROW WHEN (NEW.operacion = 'COMPRA_RECIBIR') EXECUTE FUNCTION fallo_auditoria_recepcion();`);
    try {
      await expect(recibir(orden.id, 5)).rejects.toThrow('no disponible');
    } finally {
      await sql('DROP TRIGGER IF EXISTS fallo_auditoria_recepcion ON auditoria_operaciones');
      await sql('DROP FUNCTION IF EXISTS fallo_auditoria_recepcion()');
    }
    const despues = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect(despues.stockActual).toEqual(antes.stockActual);
    expect(Number(despues.costoVigente)).toBe(Number(antes.costoVigente));
    expect((await vinculos()).find(f => f.ultimo_costo === 77)).toBeUndefined();
  });
});
