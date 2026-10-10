import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductosService } from '../src/productos/productos.service';
import { ProductosController } from '../src/productos/productos.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { VentasService } from '../src/ventas/ventas.service';
import { VentasController } from '../src/ventas/ventas.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ClientesService } from '../src/clientes/clientes.service';
import { ClientesController } from '../src/clientes/clientes.controller';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { diaCalendario } from '../src/common/zona-horaria';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';
import { Reflector } from '@nestjs/core';

// Ciclo operativo HTTP con PostgreSQL temporal y todas las migraciones reales.
// Nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Ciclo de ventas / HTTP y PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = "qa-local-password";
  let token: string;
  let usuarioId: string;
  let cajaId: string;
  let tenantId: string;
  let app: INestApplication;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-ciclo-'));
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
    const module = await Test.createTestingModule({
      controllers: [ProductosController, CotizacionesController, VentasController, OperacionesController, AuthController, ClientesController, DashboardController],
      providers: [ProductosService, CotizacionesService, VentasService, OperacionesService, JwtStrategy, AuthService, ClientesService, DashboardService,
        { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => key === 'JWT_SECRET' ? jwtSecret : fallback } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalGuards(new TenantModuleGuard(module.get(Reflector), prisma));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
  }, 120000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-ciclo-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const http = (method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, auth = token) =>
    request(app.getHttpServer())[method](`/api${path}`).auth(auth, { type: 'bearer' }).send(body);

  beforeEach(async () => {
    tenantId = randomUUID(); usuarioId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'QA ciclo' } });
    await prisma.usuario.create({ data: { id: usuarioId, tenantId, rol: 'ADMIN', nombre: 'QA', email: `${usuarioId}@example.test`, passwordHash: await bcrypt.hash(password, 4) } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: `${usuarioId}@example.test`, password, tenantId }).expect(200);
    token = login.body.accessToken;
    const opened = await http('post', '/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 100 }).expect(201);
    cajaId = opened.body.id;
  });

  async function producto(codigo = 'A', precioVenta = 100, stockActual = 10) {
    const result = await http('post', '/productos', { solicitudId: randomUUID(), codigo, nombre: `QA ${codigo}`, precioCosto: 40, precioVenta, stockActual, stockMinimo: 0 }).expect(201);
    return result.body;
  }

  it('jornada completa: compra, recepción, cotización, tres medios, crédito, abono y arqueo concilian en PostgreSQL', async () => {
    const p = await producto('JORNADA', 100, 2);
    const supplier = await http('post', '/operaciones/proveedores', { solicitudId: randomUUID(), nombre: 'Distribuidora jornada QA' }).expect(201);
    const purchaseBody = { solicitudId: randomUUID(), proveedorId: supplier.body.id, numeroFactura: 'QA-JORNADA', isv: 0, items: [{ productoId: p.id, cantidad: 10, costo: 60 }] };
    const purchase = await http('post', '/operaciones/compras', purchaseBody).expect(201);
    await http('post', '/operaciones/compras', purchaseBody).expect(201);
    const lines = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', purchase.body.id);
    const reception = { solicitudId: randomUUID(), items: [{ detalleId: lines[0].id, cantidad: 10 }] };
    await Promise.all([http('post', `/operaciones/compras/${purchase.body.id}/recepciones`, reception).expect(201), http('post', `/operaciones/compras/${purchase.body.id}/recepciones`, reception).expect(201)]);
    const received = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect([Number(received.stockActual), Number(received.costoVigente), Number(received.precioVenta)]).toEqual([12, 60, 100]);
    const catalog = await http('get', '/productos/comercial').expect(200);
    expect(catalog.body.some((x: any) => x.id === p.id)).toBe(true);
    const sales: string[] = [];
    const quote = await http('post', '/cotizaciones', { detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    const converted = await http('post', `/cotizaciones/${quote.body.id}/convertir`, { metodoPago: 'EFECTIVO' }).expect(201);
    sales.push(converted.body.ventaId);
    for (const metodoPago of ['TRANSFERENCIA', 'TARJETA']) {
      const body = { solicitudId: randomUUID(), metodoPago, detalles: [{ productoId: p.id, cantidad: 1 }] };
      const sale = await http('post', '/ventas', body).expect(201);
      await http('post', '/ventas', body).expect(201);
      sales.push(sale.body.id);
    }
    const client = await http('post', '/clientes', { nombre: 'Cliente jornada QA' }).expect(201);
    await http('patch', `/clientes/${client.body.id}/credito`, { creditoHabilitado: true, limiteCredito: 500 }).expect(200);
    const credit = await http('post', '/ventas', { solicitudId: randomUUID(), clienteId: client.body.id, metodoPago: 'CREDITO', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    sales.push(credit.body.id);
    const account = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXC', documentoId: credit.body.id } });
    const payment = { solicitudId: randomUUID(), monto: 30, metodo: 'EFECTIVO' };
    await Promise.all([http('post', `/operaciones/cuentas/${account.id}/pagos`, payment).expect(201), http('post', `/operaciones/cuentas/${account.id}/pagos`, payment).expect(201)]);
    for (const id of sales) {
      const entrega = { solicitudId: randomUUID(), receptorNombre: 'Cliente QA' };
      await http('post', `/operaciones/ventas/${id}/entregar`, entrega).expect(201);
      await http('post', `/operaciones/ventas/${id}/entregar`, entrega).expect(201);
    }
    const ingreso = { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 20, concepto: 'Fondo adicional QA' };
    await http('post', `/operaciones/caja/${cajaId}/movimientos`, ingreso).expect(201);
    await http('post', `/operaciones/caja/${cajaId}/movimientos`, ingreso).expect(201);
    await http('post', `/operaciones/caja/${cajaId}/movimientos`, { solicitudId: randomUUID(), tipo: 'EGRESO_MANUAL', monto: 10, concepto: 'Retiro QA' }).expect(201);
    const cash = (await http('get', '/operaciones/caja').expect(200)).body[0];
    expect(cash.efectivoEsperado).toBe(255); // 100 + 115 + 30 + 20 - 10.
    expect(cash.totales.TRANSFERENCIA).toBe(115); expect(cash.totales.TARJETA).toBe(115);
    const close = await http('post', `/operaciones/caja/${cajaId}/cerrar`, { monto: 255 }).expect(201);
    expect(Number(close.body.diferencia)).toBe(0);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(4);
    expect(Number((await prisma.venta.aggregate({ where: { tenantId }, _sum: { total: true } }))._sum.total)).toBe(460);
    const stock = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect([Number(stock.stockActual), Number(stock.stockReservado)]).toEqual([8, 0]);
    expect(await prisma.movimientoInventario.count({ where: { tenantId, tipo: 'ENTREGA' } })).toBe(4);
    expect(await prisma.movimientoInventario.count({ where: { tenantId, tipo: 'COMPRA' } })).toBe(1);
    expect(await prisma.costoCompra.count({ where: { tenantId, productoId: p.id } })).toBe(1);
    const physicalLedger = await prisma.$queryRawUnsafe<any[]>('SELECT COALESCE(SUM(cantidad),0) AS cantidad FROM movimientos_inventario WHERE tenant_id=$1 AND producto_id=$2', tenantId, p.id);
    expect(Number(physicalLedger[0].cantidad)).toBe(8);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: account.id } })).saldo)).toBe(85);
    expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: client.body.id } })).saldoPendiente)).toBe(85);
    expect(Number((await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP' } })).saldo)).toBe(600);
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId, operacion: 'CAJA_CERRAR' } })).toBe(1);
  });

  it.each(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'])('producto → cotización → %s → entrega → cierre, sin duplicaciones', async metodoPago => {
    const a = await producto(); const b = await producto('B', 50);
    const catalogo = await http('get', '/productos/comercial').expect(200);
    expect(catalogo.body.find((p: any) => p.id === a.id)).toMatchObject({ precioVenta: 100, stockActual: 10 });
    const quote = await http('post', '/cotizaciones', {
      porcentajeIsv: 15, descuentoGeneral: 10, tipoDescuentoGeneral: 'MONTO',
      detalles: [{ productoId: a.id, cantidad: 2, descuento: 10, tipoDescuento: 'PORCENTAJE' }, { productoId: b.id, cantidad: 1 }],
    }).expect(201);
    // Bruto 250, descuentos 20 + 10, base 220, ISV 33, total 253.
    expect(quote.body).toMatchObject({ subtotal: 230, descuento: 30, isv: 33, total: 253 });
    const path = `/cotizaciones/${quote.body.id}/convertir`;
    const converted = await Promise.all([http('post', path, { metodoPago }), http('post', path, { metodoPago })]);
    expect(converted.map(r => r.status).sort((a, b) => a - b)).toEqual([201, 400]);
    const ventaId = converted.find(r => r.status === 201)!.body.ventaId;
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: a.id } })).stockActual)).toBe(10);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: a.id } })).stockReservado)).toBe(2);
    const entregaDoble = { solicitudId: randomUUID(), receptorNombre: 'Cliente QA' };
    await Promise.all([http('post', `/operaciones/ventas/${ventaId}/entregar`, entregaDoble).expect(201), http('post', `/operaciones/ventas/${ventaId}/entregar`, entregaDoble).expect(201)]);
    const stock = await prisma.producto.findUniqueOrThrow({ where: { id: a.id } });
    expect(Number(stock.stockActual)).toBe(8); expect(Number(stock.stockReservado)).toBe(0);
    expect(await prisma.movimientoInventario.count({ where: { tenantId, tipo: 'ENTREGA' } })).toBe(2);
    const caja = (await http('get', '/operaciones/caja').expect(200)).body[0];
    const esperado = metodoPago === 'EFECTIVO' ? 353 : 100;
    expect(caja.efectivoEsperado).toBe(esperado); expect(caja.totales[metodoPago]).toBe(253);
    await http('post', `/operaciones/caja/${cajaId}/cerrar`, { monto: esperado - 1 }).expect(400);
    const cierre = await http('post', `/operaciones/caja/${cajaId}/cerrar`, { monto: esperado - 1, notas: 'Diferencia QA de un lempira' }).expect(201);
    expect(Number(cierre.body.diferencia)).toBe(-1);
    await http('post', `/operaciones/caja/${cajaId}/cerrar`, { monto: esperado - 1, notas: 'Diferencia QA de un lempira' }).expect(201);
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId, operacion: 'CAJA_CERRAR' } })).toBe(1);
  });

  it('venta a crédito y abono parcial concurrente/repetido conservan un solo pago y saldo', async () => {
    const p = await producto();
    const client = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente registrado QA', creditoHabilitado: true, limiteCredito: 500 } });
    const saleRequest = { solicitudId: randomUUID(), clienteId: client.id, metodoPago: 'CREDITO', detalles: [{ productoId: p.id, cantidad: 2 }] };
    const sales = await Promise.all([http('post', '/ventas', saleRequest).expect(201), http('post', '/ventas', saleRequest).expect(201)]);
    expect(sales[0].body.id).toBe(sales[1].body.id);
    const cuenta = (await http('get', '/operaciones/cuentas?tipo=CXC').expect(200)).body[0];
    expect(Number(cuenta.saldo)).toBe(230);
    const payment = { solicitudId: randomUUID(), monto: 30, metodo: 'EFECTIVO' };
    const pagos = await Promise.all([http('post', `/operaciones/cuentas/${cuenta.id}/pagos`, payment).expect(201), http('post', `/operaciones/cuentas/${cuenta.id}/pagos`, payment).expect(201)]);
    expect(pagos[0].body.id).toBe(pagos[1].body.id);
    await http('post', `/operaciones/cuentas/${cuenta.id}/pagos`, payment).expect(201);
    await http('post', `/operaciones/cuentas/${cuenta.id}/pagos`, { ...payment, monto: 40 }).expect(409);
    expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: client.id } })).saldoPendiente)).toBe(200);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: sales[0].body.id } })).saldoCredito)).toBe(200);
    expect((await http('get', '/operaciones/caja').expect(200)).body[0].efectivoEsperado).toBe(130);
    expect((await http('get', '/operaciones/cuentas?tipo=CXC').expect(200)).body[0].pagos).toHaveLength(1);
  });

  it('producto inactivo, ajeno o cantidad insuficiente rechazan ventas sin reservas ni cobros', async () => {
    const p = await producto();
    await http('put', `/productos/${p.id}`, { version: p.version, activo: false }).expect(200);
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(404);
    const otro = await prisma.tenant.create({ data: { nombreComercial: 'Otro tenant QA' } });
    const ajeno = await prisma.producto.create({ data: { tenantId: otro.id, codigo: 'AJENO', nombre: 'Ajeno', precioVenta: 100, precioCosto: 40, stockActual: 10 } });
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: ajeno.id, cantidad: 1 }] }).expect(404);
    const activo = await producto('ACTIVO', 100, 1);
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: activo.id, cantidad: 2 }] }).expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect((await prisma.producto.findMany({ where: { tenantId } })).every(p => Number(p.stockReservado) === 0)).toBe(true);
    expect((await http('get', '/productos/comercial').expect(200)).body.map((p: any) => p.id)).toEqual([activo.id]);
  });

  it('cotización mixta gravada/exenta conserva descuentos, ISV y total al convertir', async () => {
    const a = await producto(); const b = await producto('EXENTO', 50);
    const quote = await http('post', '/cotizaciones', {
      porcentajeIsv: 15, descuentoGeneral: 10,
      detalles: [{ productoId: a.id, cantidad: 2, descuento: 10, tipoDescuento: 'PORCENTAJE' }, { productoId: b.id, cantidad: 1, exento: true }],
    }).expect(201);
    expect(quote.body).toMatchObject({ descuento: 30, isv: 25.83, total: 245.83 });
    const result = await http('post', `/cotizaciones/${quote.body.id}/convertir`, { metodoPago: 'TRANSFERENCIA' }).expect(201);
    const sale = await prisma.venta.findUniqueOrThrow({ where: { id: result.body.ventaId } });
    expect(Number(sale.subtotal)).toBe(250); expect(Number(sale.descuento)).toBe(30);
    expect(Number(sale.isv)).toBe(25.83); expect(Number(sale.total)).toBe(245.83);
  });

  it('venta sin inventario exige proveedor y no altera stock ni crea una entrega física', async () => {
    const p = await producto('PEDIDO', 100, 0);
    const sale = { solicitudId: randomUUID(), metodoPago: 'TRANSFERENCIA', detalles: [{ productoId: p.id, cantidad: 2, sinInventario: true }] };
    await http('post', '/ventas', sale).expect(400);
    const provider = await http('post', '/operaciones/proveedores', { solicitudId: randomUUID(), nombre: 'Proveedor QA' }).expect(201);
    const valid = { ...sale, detalles: [{ ...sale.detalles[0], proveedorId: provider.body.id }] };
    const results = await Promise.all([http('post', '/ventas', valid).expect(201), http('post', '/ventas', valid).expect(201)]);
    expect(results[0].body.id).toBe(results[1].body.id);
    await http('post', `/operaciones/ventas/${results[0].body.id}/entregar`, { solicitudId: randomUUID(), receptorNombre: 'Cliente QA' }).expect(409);
    const stock = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(stock.stockActual)).toBe(0); expect(Number(stock.stockReservado)).toBe(0);
    expect(await prisma.movimientoInventario.count({ where: { tenantId, tipo: 'ENTREGA' } })).toBe(0);
  });

  it('fallo después de reservar revierte venta, inventario y caja; el reintento crea solo una venta', async () => {
    const p = await producto();
    const sale = { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 2 }] };
    await prisma.$executeRawUnsafe("CREATE FUNCTION qa_fallo_cobro() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo QA de cobro'; END $$");
    await prisma.$executeRawUnsafe('CREATE TRIGGER qa_fallo_cobro BEFORE INSERT ON movimientos_caja FOR EACH ROW EXECUTE FUNCTION qa_fallo_cobro()');
    try { await http('post', '/ventas', sale).expect(500); }
    finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER qa_fallo_cobro ON movimientos_caja');
      await prisma.$executeRawUnsafe('DROP FUNCTION qa_fallo_cobro()');
    }
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    const stock = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(stock.stockActual)).toBe(10); expect(Number(stock.stockReservado)).toBe(0);
    expect((await http('get', '/operaciones/caja').expect(200)).body[0].efectivoEsperado).toBe(100);
    await http('post', '/ventas', sale).expect(201);
    await http('post', '/ventas', sale).expect(201);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
  });

  it('ventas por dos cajeros se asignan a su propia caja y respetan acceso al arqueo ajeno', async () => {
    const p = await producto();
    const cajero = await prisma.usuario.create({ data: { tenantId, rol: 'CAJERO', nombre: 'Cajero QA', email: `${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 4) } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: cajero.email, password, tenantId }).expect(200);
    const segundoToken = login.body.accessToken;
    const caja = await http('post', '/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 50 }, segundoToken).expect(201);
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 1 }] }, segundoToken).expect(201);
    expect((await http('get', '/operaciones/caja').expect(200)).body[0].efectivoEsperado).toBe(215);
    expect((await http('get', '/operaciones/caja', undefined, segundoToken).expect(200)).body[0].efectivoEsperado).toBe(165);
    await http('get', `/operaciones/caja/${cajaId}`, undefined, segundoToken).expect(404);
    expect(await prisma.venta.count({ where: { tenantId, cajaId: caja.body.id, usuarioId: cajero.id } })).toBe(1);
  });

  it('dos ventas HTTP simultáneas compiten por la última unidad sin sobreventa', async () => {
    const p = await producto('ULTIMO', 100, 1);
    const responses = await Promise.all([1, 2].map(() => http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 1 }] })));
    expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([201, 400]);
    const stock = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(stock.stockActual)).toBe(1); expect(Number(stock.stockReservado)).toBe(1);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect((await http('get', '/operaciones/caja').expect(200)).body[0].efectivoEsperado).toBe(215);
  });

  it('seguridad HTTP: CAJERO, datos inválidos, tenant ajeno y módulo deshabilitado no escriben', async () => {
    const p = await producto('SEGURIDAD');
    const cashier = await prisma.usuario.create({ data: { tenantId, rol: 'CAJERO', nombre: 'QA permisos', email: `${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 4) } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ tenantId, email: cashier.email, password }).expect(200);
    const cashierToken = login.body.accessToken;
    await http('post', '/operaciones/proveedores', { solicitudId: randomUUID(), nombre: 'No autorizado' }, cashierToken).expect(403);
    await http('post', '/productos', { solicitudId: randomUUID(), nombre: 'No autorizado', precioCosto: 1, precioVenta: 2, stockActual: 1 }, cashierToken).expect(403);
    await http('get', '/operaciones/auditoria', undefined, cashierToken).expect(403);
    await http('post', `/operaciones/caja/${cajaId}/movimientos`, { solicitudId: randomUUID(), tipo: 'EGRESO_MANUAL', monto: 10, concepto: 'Sin permiso' }, cashierToken).expect(403);
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: -1 }] }).expect(400);
    await request(app.getHttpServer()).post('/api/ventas').send({ solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(401);
    const other = await prisma.tenant.create({ data: { nombreComercial: 'Otro negocio QA' } });
    const otherUser = await prisma.usuario.create({ data: { tenantId: other.id, rol: 'ADMIN', nombre: 'Ajeno QA', email: `${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 4) } });
    const otherLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ tenantId: other.id, email: otherUser.email, password }).expect(200);
    await http('post', '/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 0 }, otherLogin.body.accessToken).expect(201);
    await http('get', `/operaciones/caja/${cajaId}`, undefined, otherLogin.body.accessToken).expect(404);
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 1 }] }, otherLogin.body.accessToken).expect(404);
    await prisma.tenantModule.create({ data: { tenantId, moduleKey: 'pos', enabled: false } });
    await http('post', '/ventas', { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(403);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.proveedor.count({ where: { tenantId } })).toBe(0);
    const stock = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect([Number(stock.stockActual), Number(stock.stockReservado)]).toEqual([10, 0]);
    expect((await http('get', '/operaciones/caja').expect(200)).body[0].efectivoEsperado).toBe(100);
  });

  // QA-CLI-001 (corregido): nombre null o en blanco en edición responde 400 y no escribe.
  it('QA-CLI-001: editar nombre de cliente con null o en blanco responde 400 sin modificar el cliente', async () => {
    const client = await http('post', '/clientes', { nombre: 'Cliente nulidad QA' }).expect(201);
    await http('put', `/clientes/${client.body.id}`, { nombre: null }).expect(400);
    await http('put', `/clientes/${client.body.id}`, { nombre: '   ' }).expect(400);
    const despues = await http('get', `/clientes/${client.body.id}`).expect(200);
    expect(despues.body.nombre).toBe('Cliente nulidad QA');
  });

  it('cotización vencida exige renovar vigencia antes de convertir, sin cobros ni reservas por rechazo', async () => {
    const p = await producto();
    const quote = await http('post', '/cotizaciones', { fechaValidez: '2000-01-01', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    const found = await http('get', `/cotizaciones/${quote.body.id}`).expect(200);
    expect(found.body.vencida).toBe(true);
    await http('post', `/cotizaciones/${quote.body.id}/convertir`, { metodoPago: 'EFECTIVO' }).expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).stockReservado)).toBe(0);
    expect((await http('get', '/operaciones/caja').expect(200)).body[0].efectivoEsperado).toBe(100);
    await http('put', `/cotizaciones/${quote.body.id}`, { fechaValidez: '2099-12-31', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(200);
    await http('post', `/cotizaciones/${quote.body.id}/convertir`, { metodoPago: 'EFECTIVO' }).expect(201);
  });

  it('una cotización con DATE válido hasta hoy no vence un día antes y aún se convierte', async () => {
    const p = await producto();
    const hoy = diaCalendario(new Date());
    const quote = await http('post', '/cotizaciones', { fechaValidez: hoy, detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    const stored = await prisma.cotizacion.findUniqueOrThrow({ where: { id: quote.body.id } });
    expect(stored.fechaValidez.toISOString()).toBe(`${hoy}T00:00:00.000Z`);
    const found = await http('get', `/cotizaciones/${quote.body.id}`).expect(200);
    expect(found.body).toMatchObject({ vencida: false, porVencerHoy: true });
    await http('post', `/cotizaciones/${quote.body.id}/convertir`, { metodoPago: 'TRANSFERENCIA' }).expect(201);
  });

  it.runIf(process.env.REAL_SETTINGS_BROWSER === '1')('Chromium real: conversión por transferencia y POS con tarjeta usan el método elegido', async () => {
    const p = await producto('NAVEGADOR');
    const quote = await http('post', '/cotizaciones', { detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    await http('patch', `/cotizaciones/${quote.body.id}/estado`, { estado: 'ENVIADA' }).expect(200);
    await promisify(execFile)(process.execPath, [resolve('test/real-ciclo-ventas-browser.mjs')], {
      timeout: 60000, encoding: 'utf8',
      env: { ...process.env, VITE_API_URL: '/api', CYCLE_API: `${await app.getUrl()}/api`, CYCLE_EMAIL: `${usuarioId}@example.test`, CYCLE_PASSWORD: password, CYCLE_VALIDITY: quote.body.fechaValidez },
    });
    const sales = await prisma.venta.findMany({ where: { tenantId }, orderBy: { numeroVenta: 'asc' } });
    expect(sales.map(v => v.metodoPago)).toEqual(['TRANSFERENCIA', 'TARJETA', 'EFECTIVO']);
    expect(sales.map(v => Number(v.total))).toEqual([115, 115, 115]);
    expect((await http('get', '/operaciones/caja').expect(200)).body[0].efectivoEsperado).toBe(215);
    // La conversión de cotización deja la mercadería en bodega (reserva); las dos ventas del POS se cobran y entregan en mostrador.
    const stock = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(stock.stockReservado)).toBe(1);
    expect(Number(stock.stockActual)).toBe(8);
  }, 70000);
});

