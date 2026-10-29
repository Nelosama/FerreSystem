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

// T6 (docs/AUDITORIA_EXENCIONES_T6.md): autorización y aislamiento de la marca exenta en cotizaciones.
// Caracterización: CAJERO y VENDEDOR marcan exentas sin autorización ni auditoría; los casos DEFECTO CONOCIDO deben cambiar
// cuando se implemente el registro de exenciones. Clúster temporal, datos sintéticos.
describe('T6 exenciones: autorización y aislamiento / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-t6-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-t6-')) {
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
    // Caja propia: convertir abre caja antes de buscar la cotización, así que sin caja la respuesta sería 409, no 404.
    await prisma.caja.create({ data: { tenantId: tenant, usuarioId: id, codigo: `T6-${id.slice(0, 8)}`, montoApertura: 0 } as any });
    return { id, token: jwt.sign({ sub: id, tenantId: tenant, type: 'tenant' }) };
  };
  const producto = () => prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: `T6-${randomUUID().slice(0, 6)}`, nombre: 'Producto T6', precioVenta: 50, precioCosto: 20, stockActual: 100 } as any });
  const crearConExencion = (tk: string, productoId: string) => request(app.getHttpServer())
    .post('/api/cotizaciones').auth(tk, { type: 'bearer' }).send({ detalles: [{ productoId, cantidad: 1, exento: true }] });
  const auditoriaDe = (entidadId: string) => prisma.auditoriaOperacion.findMany({ where: { tenantId, entidadId } });

  it('DEFECTO CONOCIDO: un VENDEDOR puede crear una cotización con línea exenta, sin autorización de administrador', async () => {
    const vendedor = await usuarioCon('VENDEDOR');
    const p = await producto();
    const r = await crearConExencion(vendedor.token, p.id).expect(201);
    expect(r.body.detalles[0]).toMatchObject({ exento: true, isv: 0 });
  });

  it('DEFECTO CONOCIDO: un CAJERO puede crear una cotización con línea exenta', async () => {
    const cajero = await usuarioCon('CAJERO');
    const p = await producto();
    await crearConExencion(cajero.token, p.id).expect(201);
  });

  it('DEFECTO CONOCIDO: crear una línea exenta no deja ninguna fila de auditoría de la exención', async () => {
    const vendedor = await usuarioCon('VENDEDOR');
    const p = await producto();
    const r = await crearConExencion(vendedor.token, p.id).expect(201);
    expect(await auditoriaDe(r.body.id)).toEqual([]);
  });

  it('la exención no se trata como autorizada cuando la convierte un CAJERO: 400 y sin venta', async () => {
    const vendedor = await usuarioCon('VENDEDOR');
    const cajero = await usuarioCon('CAJERO');
    const p = await producto();
    const cot = await crearConExencion(vendedor.token, p.id).expect(201);
    const r = await request(app.getHttpServer()).post(`/api/cotizaciones/${cot.body.id}/convertir`).auth(cajero.token, { type: 'bearer' }).send({ metodoPago: 'EFECTIVO' }).expect(400);
    expect(r.body.message).toMatch(/administrador/);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });

  it('aislamiento: un usuario de otra empresa no ve ni convierte una cotización con exención de esta', async () => {
    const vendedor = await usuarioCon('VENDEDOR');
    const p = await producto();
    const cot = await crearConExencion(vendedor.token, p.id).expect(201);
    const otra = randomUUID();
    await prisma.tenant.create({ data: { id: otra, nombreComercial: 'Otra empresa T6' } as any });
    const ajeno = await usuarioCon('ADMIN', otra);
    await request(app.getHttpServer()).get(`/api/cotizaciones/${cot.body.id}`).auth(ajeno.token, { type: 'bearer' }).expect(404);
    await request(app.getHttpServer()).post(`/api/cotizaciones/${cot.body.id}/convertir`).auth(ajeno.token, { type: 'bearer' }).send({ metodoPago: 'EFECTIVO' }).expect(404);
    expect(await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.body.id } })).toMatchObject({ estado: 'BORRADOR' });
  });
});
