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
import { ClientesController } from '../src/clientes/clientes.controller';
import { ClientesService } from '../src/clientes/clientes.service';

// Estado de cuenta de cliente contra PostgreSQL real (HTTP con JWT): cuentas CXC, abonos, vencimiento por día
// de negocio, conciliación con el saldo del cliente, permiso solo ADMIN y aislamiento entre empresas.
describe('Estado de cuenta de cliente / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-estado-cuenta-'));
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
      controllers: [OperacionesController, ClientesController],
      providers: [OperacionesService, ClientesService, JwtStrategy,
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-estado-cuenta-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  it('ADMIN ve cuentas, abonos, vencimientos y si el saldo concilia con las cuentas', async () => {
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente Estado', creditoHabilitado: true, limiteCredito: 1000, saldoPendiente: 300 } as any });
    const vencida = await prisma.cuentaOperativa.create({ data: { tenantId, tipo: 'CXC', clienteId: cliente.id, documentoId: randomUUID(), monto: 500, saldo: 200, vencimiento: new Date('2026-01-01T00:00:00Z'), usuarioId: userIds.ADMIN } as any });
    await prisma.cuentaOperativa.create({ data: { tenantId, tipo: 'CXC', clienteId: cliente.id, documentoId: randomUUID(), monto: 100, saldo: 100, vencimiento: new Date('2099-01-01T00:00:00Z'), usuarioId: userIds.ADMIN } as any });
    await prisma.pagoCuenta.create({ data: { tenantId, cuentaId: vencida.id, solicitudId: randomUUID(), solicitudHash: 'h', monto: 300, metodo: 'EFECTIVO', usuarioId: userIds.ADMIN } as any });

    const res = await http('get', `/clientes/${cliente.id}/estado-cuenta`, 'ADMIN').expect(200);
    expect(res.body.cliente).toMatchObject({ nombre: 'Cliente Estado', limiteCredito: 1000, saldoPendiente: 300 });
    expect(res.body.saldoCuentas).toBe(300);
    expect(res.body.conciliado).toBe(true);
    expect(res.body.cuentas).toHaveLength(2);
    const detalle = res.body.cuentas.find((c: any) => c.id === vencida.id);
    expect(detalle).toMatchObject({ monto: 500, saldo: 200, vencida: true });
    expect(detalle.abonos).toEqual([expect.objectContaining({ monto: 300, metodo: 'EFECTIVO' })]);
  });

  it('si el saldo del cliente no coincide con sus cuentas, el estado lo marca como no conciliado', async () => {
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente Desfasado', creditoHabilitado: true, saldoPendiente: 250 } as any });
    await prisma.cuentaOperativa.create({ data: { tenantId, tipo: 'CXC', clienteId: cliente.id, documentoId: randomUUID(), monto: 300, saldo: 300, vencimiento: new Date('2099-01-01T00:00:00Z'), usuarioId: userIds.ADMIN } as any });
    const res = await http('get', `/clientes/${cliente.id}/estado-cuenta`, 'ADMIN').expect(200);
    expect(res.body.conciliado).toBe(false);
    expect(res.body.saldoCuentas).toBe(300);
    expect(res.body.cliente.saldoPendiente).toBe(250);
  });

  it('ADMIN y CAJERO consultan el estado de cuenta; el cajero no ve el límite de crédito; otra empresa recibe 404', async () => {
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente Restringido', creditoHabilitado: true, limiteCredito: 900, saldoPendiente: 0 } as any });
    const admin = await http('get', `/clientes/${cliente.id}/estado-cuenta`, 'ADMIN').expect(200);
    expect(admin.body.cliente.limiteCredito).toBe(900);
    const cajero = await http('get', `/clientes/${cliente.id}/estado-cuenta`, 'CAJERO').expect(200);
    expect(cajero.body.cliente.limiteCredito).toBeNull();
    await http('get', `/clientes/${cliente.id}/estado-cuenta`, 'BODEGUERO').expect(403);
    await http('get', `/clientes/${cliente.id}/estado-cuenta`, 'OTRO_ADMIN').expect(404);
    await http('get', `/clientes/${randomUUID()}/estado-cuenta`, 'ADMIN').expect(404);
  });

  it('VENDEDOR no ve estado de cuenta y el buscador le devuelve solo datos comerciales (sin saldo, límite ni datos privados)', async () => {
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente Comercial Seguro', email: 'privado@test.invalid', direccion: 'Dir privada', rtn: '08019999000001', creditoHabilitado: true, limiteCredito: 5000, saldoPendiente: 1234 } as any });
    await http('get', `/clientes/${cliente.id}/estado-cuenta`, 'VENDEDOR').expect(403);
    const res = await request(app.getHttpServer()).get('/api/clientes/buscar?q=Comercial%20Seguro').auth(users.VENDEDOR, { type: 'bearer' }).expect(200);
    expect(res.body).toHaveLength(1);
    expect(Object.keys(res.body[0]).sort()).toEqual(['codigo', 'creditoHabilitado', 'id', 'nombre', 'numeroCliente', 'rtn', 'telefono']);
    expect(JSON.stringify(res.body)).not.toMatch(/1234|5000|privado@|Dir privada/);
  });
});
