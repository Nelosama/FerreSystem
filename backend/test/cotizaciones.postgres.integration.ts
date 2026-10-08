import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';

// Dedicated disposable cluster. Never use an external DATABASE_URL or apply migrations.
describe('FUNC-001 / HTTP and isolated PostgreSQL', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;
  let tenantId: string, usuarioId: string, token: string, cotizacionId: string;
  const post = (id = cotizacionId, body = {}) => request(app.getHttpServer())
    .post(`/api/cotizaciones/${id}/convertir`).auth(token, { type: 'bearer' }).send(body);
  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-func001-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    // Override all connection variables for child processes as well as Prisma.
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    // Disposable fixture: no crash-durability assertion, so skip initial fsync.
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // Offline DDL generation from the current model, not the migration history.
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [CotizacionesController],
      providers: [CotizacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 120000);
  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-func001-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); usuarioId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'FUNC-001 synthetic' } });
    await prisma.usuario.create({ data: { id: usuarioId, tenantId, nombre: 'ADMIN', email: `${usuarioId}@test.invalid`, passwordHash: 'not-a-password', rol: 'ADMIN' } });
    token = jwt.sign({ sub: usuarioId, tenantId, type: 'tenant' });
    await prisma.caja.create({ data: { tenantId, usuarioId, codigo: 'CAJA-TEST', montoApertura: 100 } });
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente sintético', rtn: '08019999999999' } });
    const details = [];
    for (const [codigo, cantidad, medida, precioUnitario] of [['A', 2, 3, 10.25], ['B', 1.5, 1, 7.5]] as const) {
      const product = await prisma.producto.create({ data: { tenantId, codigo, nombre: codigo, precioVenta: precioUnitario, precioCosto: 2, stockActual: 100, usaMedida: codigo === 'A' } });
      details.push({ productoId: product.id, cantidad, medida, precioUnitario });
    }
    cotizacionId = (await new CotizacionesService(prisma).create(tenantId, usuarioId, { clienteId: cliente.id, detalles: details })).id;
  });

  it('HTTP canónico conserva cliente, productos, medida, precios, ISV y total; rechaza ruta antigua', async () => {
    await request(app.getHttpServer()).post(`/api/cotizaciones/${cotizacionId}/convertir-venta`).auth(token, { type: 'bearer' }).expect(404);
    const cot = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId }, include: { detalles: true } });
    const response = await post().expect(201);
    const sale = await prisma.venta.findUniqueOrThrow({ where: { id: response.body.ventaId }, include: { detalles: true } });
    expect(sale).toMatchObject({ tenantId, usuarioId, clienteId: cot.clienteId, clienteNombre: cot.clienteNombre, clienteRtn: cot.clienteRtn, metodoPago: 'EFECTIVO' });
    expect(Number(sale.total)).toBe(Number(cot.total));
    expect(response.body.total).toBe(Number(cot.total));
    expect(Number(sale.isv)).toBe(Number(cot.isv));
    expect(Number(sale.subtotal)).toBe(72.75);
    expect(sale.detalles).toHaveLength(2);
    for (const line of cot.detalles) {
      const actual = sale.detalles.find(d => d.productoId === line.productoId)!;
      expect(Number(actual.cantidad)).toBe(Number(line.totalMedida));
      expect(Number(actual.precioUnitario)).toBe(Number(line.precioUnitario));
      expect(Number(actual.subtotal)).toBe(Number(line.totalMedida) * Number(line.precioUnitario));
    }
    expect(await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } })).toMatchObject({ estado: 'CONVERTIDA', ventaId: sale.id });
  });

  it('dos POST concurrentes y un reintento tras respuesta perdida generan solo una venta/cobro', async () => {
    const responses = await Promise.all([post(), post()]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 400]);
    await post().expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    const movements = await prisma.$queryRawUnsafe<any[]>('SELECT m.id FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1', tenantId);
    expect(movements).toHaveLength(1);
  });

  it('fallo al actualizar cotización revierte venta y reservas; reintento crea una sola venta', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_conversion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo sintético antes de commit'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_conversion BEFORE UPDATE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION fail_conversion()');
    try { await post().expect(500); } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_conversion ON cotizaciones');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_conversion()');
    }
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } })).estado).toBe('BORRADOR');
    for (const p of await prisma.producto.findMany({ where: { tenantId } })) expect(Number(p.stockReservado)).toBe(0);
    await post().expect(201);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
  });

  it('ID inexistente o de otro tenant y método inválido no crean ventas', async () => {
    await post(randomUUID()).expect(404);
    const otherTenantId = randomUUID();
    await prisma.tenant.create({ data: { id: otherTenantId, nombreComercial: 'Otro tenant sintético' } });
    await prisma.cotizacion.update({ where: { id: cotizacionId }, data: { tenantId: otherTenantId } });
    await post().expect(404);
    await post(cotizacionId, { metodoPago: 'INVALIDO' }).expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });
});
