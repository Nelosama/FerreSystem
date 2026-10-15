import { execFileSync } from 'node:child_process';
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
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';
import { Reflector } from '@nestjs/core';

// P1/P3 de la auditoría 12/10: aritmética en centavos (línea, ISV, total, cotización) y total facturado/cobrado/saldo.
// PostgreSQL temporal con todas las migraciones reales. Nunca lee DATABASE_URL.
// Los servicios y la persistencia son reales: no se usan mocks monetarios ni de PostgreSQL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

// Tarjeta y transferencia exigen autorización bancaria: cada cobro recibe una referencia única.

describe('Redondeo y cobro de ventas / HTTP y PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = "qa-local-password";
  let token: string;
  let usuarioId: string;
  let tenantId: string;
  let app: INestApplication;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-redondeo-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-redondeo-')) {
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
    await http('post', '/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 100 }).expect(201);
  });

  async function producto(codigo = 'A', precioVenta = 100, stockActual = 10) {
    const result = await http('post', '/productos', { solicitudId: randomUUID(), codigo, nombre: `QA ${codigo}`, precioCosto: 40, precioVenta, stockActual, stockMinimo: 0 }).expect(201);
    return result.body;
  }

  it('línea fraccionaria 2.5 × L.25.99: subtotal, ISV y total en centavos enteros (sin diferencia de L.0.01)', async () => {
    const p = await producto('FRAC', 25.99, 10);
    const venta = await http('post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 2.5 }] }).expect(201);
    // 2.5 × 25.99 = 64.975 → mitad hacia arriba = 64.98; ISV 15% = 9.75; total 74.73.
    expect(venta.body).toMatchObject({ subtotal: 64.98, descuento: 0, isv: 9.75, total: 74.73 });
    expect(venta.body.detalles[0]).toMatchObject({ precioUnitario: 25.99, cantidad: 2.5, subtotal: 64.98 });
    const guardada = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: venta.body.id } });
    expect(Number(guardada.subtotal)).toBe(64.98);
  });

  it('cobro al contado: total facturado y total cobrado coinciden y el saldo es cero', async () => {
    const p = await producto('CONT', 100, 10);
    const venta = await http('post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    expect(venta.body).toMatchObject({ totalFacturado: 115, totalCobrado: 115, saldoPendiente: 0 });
  });

  it('crédito: facturado, cobrado y saldo pendiente se distinguen; el abono parcial los actualiza y sin plazo no se inventa vencimiento', async () => {
    const p = await producto('CRED', 25.99, 10);
    const client = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente crédito QA', creditoHabilitado: true, limiteCredito: 500 } });
    const venta = await http('post', '/ventas', { solicitudId: randomUUID(), clienteId: client.id, metodoPago: 'CREDITO', detalles: [{ productoId: p.id, cantidad: 2.5 }] }).expect(201);
    expect(venta.body).toMatchObject({ tipoPago: 'CREDITO', total: 74.73, totalFacturado: 74.73, totalCobrado: 0, saldoPendiente: 74.73 });
    const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, documentoId: venta.body.id } });
    expect(cuenta.vencimiento).toBeNull();
    const cuentaCxc = (await http('get', '/operaciones/cuentas?tipo=CXC').expect(200)).body[0];
    await http('post', `/operaciones/cuentas/${cuentaCxc.id}/pagos`, { solicitudId: randomUUID(), monto: 30.5, metodo: 'EFECTIVO' }).expect(201);
    const leida = await http('get', `/ventas/${venta.body.id}`).expect(200);
    expect(leida.body).toMatchObject({ totalFacturado: 74.73, totalCobrado: 30.5, saldoPendiente: 44.23 });
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(44.23);
    const listado = (await http('get', '/ventas').expect(200)).body.find((v: any) => v.id === venta.body.id);
    expect(listado).toMatchObject({ totalCobrado: 30.5, saldoPendiente: 44.23 });
  });

  it('importe elevado con dos decimales: venta y abono conservan los centavos en API y PostgreSQL', async () => {
    const p = await producto('ALTO', 1234567890.12);
    const client = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente importe alto QA', creditoHabilitado: true, limiteCredito: 2000000000 } });
    const venta = await http('post', '/ventas', { solicitudId: randomUUID(), clienteId: client.id, metodoPago: 'CREDITO', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    expect(venta.body).toMatchObject({ subtotal: 1234567890.12, descuento: 0, isv: 185185183.52, total: 1419753073.64, totalCobrado: 0, saldoPendiente: 1419753073.64 });
    const guardada = await prisma.venta.findUniqueOrThrow({ where: { id: venta.body.id } });
    expect([guardada.subtotal, guardada.isv, guardada.total].map(String)).toEqual(['1234567890.12', '185185183.52', '1419753073.64']);
    const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, documentoId: venta.body.id } });
    const pago = await http('post', `/operaciones/cuentas/${cuenta.id}/pagos`, { solicitudId: randomUUID(), monto: 1234567890.12, metodo: 'EFECTIVO' }).expect(201);
    expect(Number(pago.body.monto)).toBe(1234567890.12);
    expect(String((await prisma.pagoCuenta.findUniqueOrThrow({ where: { id: pago.body.id } })).monto)).toBe('1234567890.12');
    const leida = await http('get', `/ventas/${venta.body.id}`).expect(200);
    expect(leida.body).toMatchObject({ totalFacturado: 1419753073.64, totalCobrado: 1234567890.12, saldoPendiente: 185185183.52 });
    expect(String((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe('185185183.52');
    expect(String((await prisma.cliente.findUniqueOrThrow({ where: { id: client.id } })).saldoPendiente)).toBe('185185183.52');
  });

  it('L.0.10 + L.0.20: rechaza sobrepago sin cambios y dos abonos exactos saldan L.0.35', async () => {
    const a = await producto('CENT-A', 0.1);
    const b = await producto('CENT-B', 0.2);
    const client = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente centavos QA', creditoHabilitado: true, limiteCredito: 1 } });
    const venta = await http('post', '/ventas', { solicitudId: randomUUID(), clienteId: client.id, metodoPago: 'CREDITO', detalles: [{ productoId: a.id, cantidad: 1 }, { productoId: b.id, cantidad: 1 }] }).expect(201);
    expect(venta.body).toMatchObject({ subtotal: 0.3, descuento: 0, isv: 0.05, total: 0.35, totalCobrado: 0, saldoPendiente: 0.35 });
    const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, documentoId: venta.body.id } });
    const movimientosAntes = await prisma.movimientoCaja.count({ where: { caja: { tenantId } } });
    await http('post', `/operaciones/cuentas/${cuenta.id}/pagos`, { solicitudId: randomUUID(), monto: 0.36, metodo: 'EFECTIVO' }).expect(400);
    expect(String((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe('0.35');
    expect(String((await prisma.cliente.findUniqueOrThrow({ where: { id: client.id } })).saldoPendiente)).toBe('0.35');
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(0);
    expect(await prisma.movimientoCaja.count({ where: { caja: { tenantId } } })).toBe(movimientosAntes);
    for (const monto of [0.1, 0.25]) {
      await http('post', `/operaciones/cuentas/${cuenta.id}/pagos`, { solicitudId: randomUUID(), monto, metodo: 'EFECTIVO' }).expect(201);
    }
    const leida = await http('get', `/ventas/${venta.body.id}`).expect(200);
    expect(leida.body).toMatchObject({ totalFacturado: 0.35, totalCobrado: 0.35, saldoPendiente: 0 });
    expect(String((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe('0');
    expect(String((await prisma.cliente.findUniqueOrThrow({ where: { id: client.id } })).saldoPendiente)).toBe('0');
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(2);
  });

  it('arqueo de 2000 movimientos elevados: conserva L.10 netos y cierra sin una diferencia ficticia', async () => {
    const caja = await prisma.caja.findFirstOrThrow({ where: { tenantId, usuarioId, estado: 'ABIERTA' } });
    // Cada par aporta exactamente un centavo; SQL NUMERIC conserva el importe real de cada movimiento.
    await prisma.$executeRawUnsafe(`INSERT INTO movimientos_caja (id,caja_id,usuario_id,tipo,monto,metodo,concepto)
      SELECT gen_random_uuid()::text,$1,$2,v.tipo::"TipoMovimientoCaja",v.monto,'EFECTIVO','Arqueo precisión QA'
      FROM generate_series(1,1000) AS n CROSS JOIN (VALUES ('INGRESO_MANUAL',$3::numeric),('EGRESO_MANUAL',-$4::numeric)) AS v(tipo,monto)`, caja.id, usuarioId, '1000000000.01', '1000000000');
    expect(await prisma.movimientoCaja.count({ where: { cajaId: caja.id } })).toBe(2000);
    const consultada = (await http('get', '/operaciones/caja').expect(200)).body[0];
    expect(consultada.efectivoEsperado).toBe(110);
    expect(consultada.resumen).toMatchObject({ fondoInicial: 100, efectivoEsperado: 110, totalesPorMetodo: { EFECTIVO: 10 } });
    const cerrada = await http('post', `/operaciones/caja/${caja.id}/cerrar`, { monto: 110 }).expect(201);
    expect(cerrada.body.resumen).toMatchObject({ efectivoEsperado: 110, efectivoContado: 110, diferencia: 0 });
    const guardada = await prisma.caja.findUniqueOrThrow({ where: { id: caja.id } });
    expect(guardada.estado).toBe('CERRADA');
    expect([guardada.montoEsperado, guardada.montoCierreFisico, guardada.diferencia].map(String)).toEqual(['110', '110', '0']);
    expect(guardada.notas).toBeNull();
  });

  it('cotización con descuento general prorrateado: centavos enteros, misma regla que la venta', async () => {
    const p = await producto('COT', 25.99, 10);
    const quote = await http('post', '/cotizaciones', {
      porcentajeIsv: 15, descuentoGeneral: 10, tipoDescuentoGeneral: 'MONTO',
      detalles: [{ productoId: p.id, cantidad: 2.5 }],
    }).expect(201);
    // Subtotal 64.98; descuento 10.00 → base 54.98; ISV prorrateado 9.75 × 54.98 / 64.98 = 8.25; total 63.23.
    expect(quote.body).toMatchObject({ subtotal: 64.98, descuento: 10, isv: 8.25, total: 63.23 });
  });
});
