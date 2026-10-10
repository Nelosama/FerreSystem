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
describe('BALANCE: cuentas por cobrar y por pagar / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let databaseUrl = '';
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-balance-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    databaseUrl = url;
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

    const producto = await prisma.producto.create({ data: { tenantId, codigo: 'PRV-001', nombre: 'Tornillo 2 pulgadas', precioCosto: 10, precioVenta: 15, stockActual: 0 } as any });
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-balance-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const post = (ruta: string, rol: string, body: any) => request(app.getHttpServer()).post(`/api/operaciones${ruta}`).auth(users[rol], { type: 'bearer' }).send(body);
  const cliente = async (nombre: string) => prisma.cliente.create({ data: { tenantId, nombre, creditoHabilitado: true, limiteCredito: 10000, saldoPendiente: 0 } as any });
  const cuentaCxc = async (clienteId: string, monto: number, vencimiento = new Date('2099-01-01T00:00:00Z')) => {
    const c = await prisma.cuentaOperativa.create({ data: { tenantId, tipo: 'CXC', clienteId, documentoId: randomUUID(), monto, saldo: monto, vencimiento, usuarioId: userIds.ADMIN } as any });
    await prisma.cliente.update({ where: { id: clienteId }, data: { saldoPendiente: { increment: monto } } });
    return c;
  };
  const abonar = (cuentaId: string, rol: string, monto: number, extra: any = {}, solicitudId = randomUUID()) =>
    post(`/cuentas/${cuentaId}/pagos`, rol, { solicitudId, monto, metodo: 'EFECTIVO', ...extra });
  const saldoDe = async (id: string) => Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id } })).saldo);
  const listar = (rol: string, query: string) => request(app.getHttpServer()).get(`/api/operaciones/cuentas?${query}`).auth(users[rol], { type: 'bearer' });

  // Cobros y pagos requieren caja abierta del usuario que los registra (igual que el resto de operaciones).
  beforeEach(async () => {
    for (const clave of ['ADMIN', 'CAJERO']) {
      const abierta = await prisma.caja.findFirst({ where: { tenantId, usuarioId: userIds[clave], estado: 'ABIERTA' } });
      if (!abierta) await ops.abrir(tenantId, userIds[clave], { solicitudId: randomUUID(), monto: 100 } as any);
    }
  });

  it('crédito con varios abonos: saldo correcto, estado parcial, historial con responsable y referencia', async () => {
    const c = await cliente('Cliente Abonos');
    const cuenta = await cuentaCxc(c.id, 500);
    await abonar(cuenta.id, 'ADMIN', 100).expect(201);
    await abonar(cuenta.id, 'CAJERO', 150, { metodo: 'TRANSFERENCIA', pagoElectronico: { referencia: 'TRF-BAL-150' } }).expect(201);
    expect(await saldoDe(cuenta.id)).toBe(250);
    const lista = await listar('ADMIN', `tipo=CXC&clienteId=${c.id}`).expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject({ estado: 'PARCIAL', vencida: false });
    expect(lista.body[0].pagos).toHaveLength(2);
    const trf = lista.body[0].pagos.find((x: any) => x.metodo === 'TRANSFERENCIA');
    expect(trf).toMatchObject({ referencia: 'TRF-BAL-150', usuario_nombre: expect.any(String) });
    const estado = await http('get', `/clientes/${c.id}/estado-cuenta`, 'ADMIN').expect(200);
    expect(estado.body.movimientos.map((m: any) => [m.tipo, m.monto, m.saldoAcumulado])).toEqual([['CARGO', 500, 500], ['ABONO', -100, 400], ['ABONO', -150, 250]]);
    expect(estado.body.movimientos.at(-1).saldoAcumulado).toBe(estado.body.saldoCuentas);
  });

  it('pago total deja la factura en PAGADA: sale de la deuda pendiente y no admite otro pago', async () => {
    const c = await cliente('Cliente Saldado');
    const cuenta = await cuentaCxc(c.id, 200);
    await abonar(cuenta.id, 'ADMIN', 200).expect(201);
    expect(await saldoDe(cuenta.id)).toBe(0);
    const pagadas = await listar('ADMIN', `tipo=CXC&clienteId=${c.id}&estado=PAGADA`).expect(200);
    expect(pagadas.body.map((x: any) => x.id)).toEqual([cuenta.id]);
    const pendientes = await listar('ADMIN', `tipo=CXC&clienteId=${c.id}&estado=PENDIENTE`).expect(200);
    expect(pendientes.body).toEqual([]);
    await abonar(cuenta.id, 'ADMIN', 1).expect(400);
  });

  it('sobrepago se rechaza sin cambiar el saldo', async () => {
    const c = await cliente('Cliente Sobrepago');
    const cuenta = await cuentaCxc(c.id, 100);
    const res = await abonar(cuenta.id, 'ADMIN', 100.01);
    expect(res.status).toBe(400);
    expect(await saldoDe(cuenta.id)).toBe(100);
  });

  it('reintentar el mismo abono (misma solicitud) no duplica el pago ni el saldo', async () => {
    const c = await cliente('Cliente Reintento');
    const cuenta = await cuentaCxc(c.id, 300);
    const solicitudId = randomUUID();
    await abonar(cuenta.id, 'ADMIN', 50, {}, solicitudId).expect(201);
    await abonar(cuenta.id, 'ADMIN', 50, {}, solicitudId).expect(201);
    expect(await saldoDe(cuenta.id)).toBe(250);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(1);
  });

  it('dos pagos concurrentes que juntos superan el saldo: solo uno se aplica y el saldo nunca es negativo', async () => {
    const c = await cliente('Cliente Concurrente');
    const cuenta = await cuentaCxc(c.id, 100);
    const [a, b] = await Promise.all([abonar(cuenta.id, 'ADMIN', 80), abonar(cuenta.id, 'CAJERO', 80)]);
    expect([a.status, b.status].filter(x => x === 201)).toHaveLength(1);
    expect([a.status, b.status].filter(x => x >= 400)).toHaveLength(1);
    expect(await saldoDe(cuenta.id)).toBe(20);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(1);
  });

  it('CxP: factura duplicada del mismo proveedor se rechaza; vencida, parcial, pagada y por vencer se distinguen', async () => {
    const proveedor = await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor Balance' } });
    const compra = (numero: string, cantidad: number, costo: number, vencimiento?: string) => post('/compras', 'ADMIN', {
      solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: numero, isv: 0, vencimiento, items: [{ productoId, cantidad, costo }],
    });
    const vencida = await compra('FAC-VENC-1', 2, 150, '2026-01-01');
    expect(vencida.status).toBe(201);
    expect((await compra(' fac-venc-1 ', 1, 10)).status).toBe(409);
    const porVencer = await compra('FAC-POR-1', 1, 100, new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
    expect(porVencer.status).toBe(201);
    const cuentaVencida = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP', documentoId: vencida.body.id } });
    await post(`/cuentas/${cuentaVencida.id}/pagos`, 'ADMIN', { solicitudId: randomUUID(), monto: 100, metodo: 'TRANSFERENCIA', pagoElectronico: { referencia: 'PAG-PROV-1' } }).expect(201);
    const lista = await listar('ADMIN', 'tipo=CXP').expect(200);
    const fila = lista.body.find((x: any) => x.id === cuentaVencida.id);
    expect(fila).toMatchObject({ estado: 'VENCIDA', vencida: true });
    expect(Number(fila.saldo)).toBe(200);
    expect(fila.pagos[0]).toMatchObject({ referencia: 'PAG-PROV-1', usuario_nombre: expect.any(String) });
    const porVencerLista = await listar('ADMIN', 'tipo=CXP&estado=POR_VENCER').expect(200);
    expect(porVencerLista.body.map((x: any) => x.documento)).toEqual(['FAC-POR-1']);
    await post(`/cuentas/${cuentaVencida.id}/pagos`, 'ADMIN', { solicitudId: randomUUID(), monto: 200, metodo: 'EFECTIVO' }).expect(201);
    const pagada = (await listar('ADMIN', `tipo=CXP&estado=PAGADA`).expect(200)).body;
    expect(pagada.map((x: any) => x.id)).toContain(cuentaVencida.id);
  });

  it('una referencia de pago a proveedor no se repite en la misma factura (evita pagos duplicados); sí puede usarse en otra', async () => {
    const proveedor = await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor Referencias' } });
    const compra = (numero: string) => post('/compras', 'ADMIN', { solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: numero, isv: 0, items: [{ productoId, cantidad: 1, costo: 50 }] }).expect(201);
    const f1 = await compra('FAC-REF-1');
    const f2 = await compra('FAC-REF-2');
    const c1 = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP', documentoId: f1.body.id } });
    const c2 = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP', documentoId: f2.body.id } });
    await post(`/cuentas/${c1.id}/pagos`, 'ADMIN', { solicitudId: randomUUID(), monto: 20, metodo: 'TRANSFERENCIA', referencia: 'cheque-778' }).expect(201);
    const repetido = await post(`/cuentas/${c1.id}/pagos`, 'ADMIN', { solicitudId: randomUUID(), monto: 20, metodo: 'TRANSFERENCIA', referencia: 'CHEQUE-778' });
    expect(repetido.status).toBe(409);
    expect(await saldoDe(c1.id)).toBe(30);
    await post(`/cuentas/${c2.id}/pagos`, 'ADMIN', { solicitudId: randomUUID(), monto: 20, metodo: 'TRANSFERENCIA', referencia: 'CHEQUE-778' }).expect(201);
    expect(await saldoDe(c2.id)).toBe(30);
  });

  it('permisos: CAJERO ve cuentas por cobrar pero no por pagar ni paga proveedores; BODEGUERO no ve cuentas', async () => {
    await listar('CAJERO', 'tipo=CXC').expect(200);
    await listar('CAJERO', 'tipo=CXP').expect(403);
    await listar('BODEGUERO', 'tipo=CXC').expect(403);
    const proveedor = await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor Permisos' } });
    const orden = await post('/compras', 'ADMIN', { solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: 'FAC-PERM-1', isv: 0, items: [{ productoId, cantidad: 1, costo: 20 }] }).expect(201);
    const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP', documentoId: orden.body.id } });
    await post(`/cuentas/${cuenta.id}/pagos`, 'CAJERO', { solicitudId: randomUUID(), monto: 5, metodo: 'EFECTIVO' }).expect(403);
    expect(await saldoDe(cuenta.id)).toBe(20);
  });

  it('separación entre empresas: otra empresa no ve ni paga las cuentas de esta', async () => {
    const c = await cliente('Cliente Aislado');
    const cuenta = await cuentaCxc(c.id, 90);
    const otra = await listar('OTRO_ADMIN', `tipo=CXC&clienteId=${c.id}`).expect(200);
    expect(otra.body).toEqual([]);
    await abonar(cuenta.id, 'OTRO_ADMIN', 10).expect(404);
    expect(await saldoDe(cuenta.id)).toBe(90);
  });

  it('persistencia: después de cerrar la conexión, una nueva lectura muestra el mismo saldo y el mismo historial', async () => {
    const c = await cliente('Cliente Persistente');
    const cuenta = await cuentaCxc(c.id, 400);
    await abonar(cuenta.id, 'ADMIN', 150).expect(201);
    await prisma.$disconnect();
    prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    expect(await saldoDe(cuenta.id)).toBe(250);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(1);
  });
});
