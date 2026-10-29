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

// Política provisional T6 (docs/AUDITORIA_EXENCIONES_T6.md): ninguna exención se concede, ni a VENDEDOR, CAJERO o ADMIN.
// Las ventas gravadas no cambian. Cada intento bloqueado queda en auditoría con usuario, empresa, documento y producto.
describe('T6 política provisional de exenciones / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-t6pol-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-t6pol-')) {
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
      const product = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo, nombre: codigo, precioVenta: precioUnitario, precioCosto: 2, stockActual: 100, usaMedida: codigo === 'A' } });
      details.push({ productoId: product.id, cantidad, medida, precioUnitario });
    }
    cotizacionId = (await new CotizacionesService(prisma).create(tenantId, usuarioId, { clienteId: cliente.id, detalles: details })).id;
  });

  const usuarioCon = async (rol: string, tenant = tenantId) => {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: tenant, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol: rol as any, permisosConfigurados: false, permisos: [] } });
    await prisma.caja.create({ data: { tenantId: tenant, usuarioId: id, codigo: `T6P-${id.slice(0, 8)}`, montoApertura: 0 } as any });
    return { id, token: jwt.sign({ sub: id, tenantId: tenant, type: 'tenant' }) };
  };
  const producto = () => prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: `T6P-${randomUUID().slice(0, 6)}`, nombre: 'Producto T6', precioVenta: 50, precioCosto: 20, stockActual: 100 } as any });
  const conExencion = (tk: string, productoId: string) => request(app.getHttpServer())
    .post('/api/cotizaciones').auth(tk, { type: 'bearer' }).send({ detalles: [{ productoId, cantidad: 1, exento: true }] });
  const intentos = (tenant = tenantId) => prisma.auditoriaOperacion.findMany({ where: { tenantId: tenant, operacion: 'EXENCION_BLOQUEADA' } });

  it.each(['VENDEDOR', 'CAJERO', 'ADMIN'])('%s no puede crear una cotización con línea exenta: 403, sin cotización y con intento auditado', async (rol) => {
    const u = await usuarioCon(rol);
    const p = await producto();
    const antes = await prisma.cotizacion.count({ where: { tenantId } });
    const r = await conExencion(u.token, p.id).expect(403);
    expect(r.body.message).toMatch(/bloqueadas hasta la decisión fiscal/);
    expect(await prisma.cotizacion.count({ where: { tenantId } })).toBe(antes);
    const [intento] = await intentos();
    expect(intento).toMatchObject({ usuarioId: u.id, entidadId: 'NUEVA_COTIZACION' });
    expect(intento.datos).toMatchObject({ intento: 'CREAR', motivo: 'DECISION_FISCAL_PENDIENTE', lineas: 1, productoIds: [p.id] });
  });

  it('una cotización gravada se crea normalmente, sin intentos auditados', async () => {
    const vendedor = await usuarioCon('VENDEDOR');
    const p = await producto();
    const r = await request(app.getHttpServer()).post('/api/cotizaciones').auth(vendedor.token, { type: 'bearer' })
      .send({ detalles: [{ productoId: p.id, cantidad: 1, exento: false }] }).expect(201);
    expect(r.body.isv).toBeGreaterThan(0);
    expect(await intentos()).toEqual([]);
  });

  it('editar una cotización para marcar una línea exenta: 403; la cotización original no cambia y el intento queda auditado', async () => {
    const vendedor = await usuarioCon('VENDEDOR');
    const p = await producto();
    const cot = await request(app.getHttpServer()).post('/api/cotizaciones').auth(vendedor.token, { type: 'bearer' })
      .send({ detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    const antes = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.body.id }, include: { detalles: true } });
    await request(app.getHttpServer()).put(`/api/cotizaciones/${cot.body.id}`).auth(vendedor.token, { type: 'bearer' })
      .send({ detalles: [{ productoId: p.id, cantidad: 1, exento: true }] }).expect(403);
    const despues = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.body.id }, include: { detalles: true } });
    expect([despues.isv, despues.total, despues.detalles.map(d => d.exento)]).toEqual([antes.isv, antes.total, [false]]);
    const [intento] = await intentos();
    expect(intento).toMatchObject({ usuarioId: vendedor.id, entidadId: cot.body.id });
    expect(intento.datos).toMatchObject({ intento: 'EDITAR' });
  });

  it('convertir una cotización histórica con exenta: 403 también para ADMIN; sin venta, con intento auditado', async () => {
    const admin = await usuarioCon('ADMIN');
    const p = await producto();
    const ventasAntes = await prisma.venta.count({ where: { tenantId } });
    const cot = await prisma.cotizacion.create({ data: { tenantId, numeroCotizacion: 900, usuarioId: admin.id, subtotal: 50, isv: 0, total: 50, estado: 'APROBADA', fechaValidez: new Date('2099-12-31T00:00:00.000Z'), porcentajeIsv: 15 } as any });
    await prisma.detalleCotizacion.create({ data: { cotizacionId: cot.id, productoId: p.id, cantidad: 1, totalMedida: 1, precioUnitario: 50, precioLista: 50, subtotal: 50, isv: 0, totalLinea: 50, exento: true, codigoProducto: 'T6P', descripcionProducto: 'Producto T6', unidadMedida: 'UND' } as any });
    const r = await request(app.getHttpServer()).post(`/api/cotizaciones/${cot.id}/convertir`).auth(admin.token, { type: 'bearer' }).send({ metodoPago: 'EFECTIVO' }).expect(403);
    expect(r.body.message).toMatch(/bloqueadas/);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(ventasAntes);
    expect(await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).toMatchObject({ estado: 'APROBADA', ventaId: null });
    const [intento] = await intentos();
    expect(intento.datos).toMatchObject({ intento: 'CONVERTIR', productoIds: [p.id] });
  });

  it('aislamiento: los intentos de una empresa no aparecen en otra y la otra no puede convertir ni ver su cotización', async () => {
    const vendedor = await usuarioCon('VENDEDOR');
    const p = await producto();
    await conExencion(vendedor.token, p.id).expect(403);
    const otra = randomUUID();
    await prisma.tenant.create({ data: { id: otra, nombreComercial: 'Otra empresa T6' } as any });
    expect(await intentos(otra)).toEqual([]);
    const ajeno = await usuarioCon('ADMIN', otra);
    const cot = await request(app.getHttpServer()).post('/api/cotizaciones').auth(vendedor.token, { type: 'bearer' })
      .send({ detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
    await request(app.getHttpServer()).get(`/api/cotizaciones/${cot.body.id}`).auth(ajeno.token, { type: 'bearer' }).expect(404);
    await request(app.getHttpServer()).post(`/api/cotizaciones/${cot.body.id}/convertir`).auth(ajeno.token, { type: 'bearer' }).send({ metodoPago: 'EFECTIVO' }).expect(404);
  });
});
