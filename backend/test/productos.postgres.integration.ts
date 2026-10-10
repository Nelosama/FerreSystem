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
import { ProductosController } from '../src/productos/productos.controller';
import { ProductosService } from '../src/productos/productos.service';

// Dedicated disposable cluster. Never use an external DATABASE_URL or apply migrations.
describe('SEC-005 / HTTP and isolated PostgreSQL', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;
  let tenantId: string, otherTenantId: string, productId: string, foreignId: string;
  const users: Record<string, { id: string; token: string }> = {};
  const get = (path: string, role: string) => request(app.getHttpServer()).get(path).auth(users[role].token, { type: 'bearer' });
  const financialKeys = ['precioCosto', 'costoVigente', 'margen', 'ultimaCompraAt'];
  const publicResponse = (p: any) => {
    for (const key of financialKeys) expect(p).not.toHaveProperty(key);
    expect(p.precioVenta).toBe(10);
  };

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-sec005-'));
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
      controllers: [ProductosController],
      providers: [ProductosService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 120000);
  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-sec005-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });
  beforeEach(async () => {
    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'SEC-005 synthetic' } });
    for (const rol of ['ADMIN', 'BODEGUERO', 'CAJERO', 'VENDEDOR'] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'not-a-login-password', rol, permisosConfigurados: true, permisos: ['inventario.ver', 'inventario.editar', 'pos.vender'] } });
      users[rol] = { id, token: jwt.sign({ sub: id, tenantId, type: 'tenant' }) };
    }
    const data = { codigo: 'SEC005', nombre: 'Cable SEC005', precioVenta: 10, precioCosto: 4, costoVigente: 5, margen: 60, ultimaCompraAt: new Date(), stockActual: 8, stockReservado: 2, stockMinimo: 7 };
    productId = (await prisma.producto.create({ data: { ...data, tenantId } })).id;
    foreignId = (await prisma.producto.create({ data: { ...data, tenantId: otherTenantId } })).id;
  });

  it.each(['ADMIN', 'BODEGUERO'])('%s can create, read and adjust inventory with financial data and audit', async role => {
    // Decisión 3: solo ADMIN define precios al dar de alta; BODEGUERO registra pendiente de configuración.
    const esAdmin = role === 'ADMIN';
    const precioAlta = esAdmin ? { precioCosto: 4, precioVenta: 10, margen: 60 } : { precioCosto: 0, precioVenta: 0 };
    const created = await request(app.getHttpServer()).post('/productos').auth(users[role].token, { type: 'bearer' })
      .send({ codigo: `NEW-${role}`, nombre: 'Producto nuevo', categoria: 'Herramientas', ...precioAlta, stockActual: 8, stockMinimo: 7 }).expect(201);
    expect(created.body).toMatchObject(esAdmin
      ? { precioCosto: 4, precioVenta: 10, margen: '60', stockActual: 8, activo: true, pendienteConfiguracion: false }
      : { precioCosto: 0, precioVenta: 0, stockActual: 8, activo: false, pendienteConfiguracion: true });
    // Regla de precios: solo ADMIN cambia costo, precio o margen; BODEGUERO conserva existencias.
    if (role === 'BODEGUERO') {
      await request(app.getHttpServer()).put(`/productos/${created.body.id}`).auth(users[role].token, { type: 'bearer' })
        .send({ version: created.body.version, precioVenta: 12 }).expect(403);
    }
    const cambioPrecio = role === 'ADMIN' ? { precioCosto: 6, precioVenta: 12, margen: 50 } : {};
    const precioEsperado = role === 'ADMIN' ? { precioCosto: 6, precioVenta: 12, margen: '50' } : { precioCosto: 0, precioVenta: 0, margen: null };
    const edited = await request(app.getHttpServer()).put(`/productos/${created.body.id}`).auth(users[role].token, { type: 'bearer' })
      .send({ version: created.body.version, ...cambioPrecio, stockAnterior: 8, stockActual: 6, motivo: 'Conteo sintético SEC-005' }).expect(200);
    expect(edited.body).toMatchObject({ ...precioEsperado, stockActual: 6, stockBajo: true });
    const stored = await prisma.producto.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(Number(stored.precioCosto)).toBe(precioEsperado.precioCosto);
    expect(Number(stored.precioVenta)).toBe(precioEsperado.precioVenta);
    expect(Number(stored.stockActual)).toBe(6);
    expect(await prisma.movimientoInventario.count({ where: { tenantId, productoId: stored.id } })).toBe(2);
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId, entidadId: stored.id, usuarioId: users[role].id } })).toBe(2);
    for (const path of ['/productos', '/productos?search=SEC005', `/productos/${productId}`, '/productos/alertas/stock-bajo']) {
      const response = await get(path, role).expect(200);
      const p = Array.isArray(response.body) ? response.body.find((p: any) => p.id === productId) : response.body;
      expect(p).toMatchObject({ precioCosto: 4, costoVigente: '5', margen: '60', stockDisponible: 6 });
    }
  });
  it.each(['CAJERO', 'VENDEDOR'])('%s sees operational data and cannot cross tenants', async role => {
    for (const path of ['/productos?tenantId=' + otherTenantId + '&includeCosts=true', '/productos?search=SEC005', `/productos/${productId}`, '/productos/alertas/stock-bajo', '/productos/comercial']) {
      const response = await get(path, role).expect(200);
      if (Array.isArray(response.body)) expect(response.body.map((p: any) => p.id)).toEqual([productId]);
      const p = Array.isArray(response.body) ? response.body[0] : response.body;
      publicResponse(p);
      expect(p.stockDisponible).toBe(6);
      expect(p.stockActual).toBe(path === '/productos/comercial' ? 6 : 8);
    }
    await get(`/productos/${foreignId}`, role).expect(404);
  });
  it('revokes BODEGUERO financial access in persistence without changing its JWT or inventory values', async () => {
    await prisma.usuario.update({ where: { id: users.BODEGUERO.id }, data: { permisos: ['inventario.editar'] } });
    publicResponse((await get(`/productos/${productId}`, 'BODEGUERO').expect(200)).body);
    const edited = await request(app.getHttpServer()).put(`/productos/${productId}`).auth(users.BODEGUERO.token, { type: 'bearer' }).send({ version: 1, nombre: 'Renombrado' }).expect(200);
    publicResponse(edited.body);
    const stored = await prisma.producto.findUniqueOrThrow({ where: { id: productId } });
    expect([Number(stored.precioCosto), Number(stored.costoVigente), Number(stored.margen), Number(stored.precioVenta)]).toEqual([4, 5, 60, 10]);
    await prisma.usuario.update({ where: { id: users.BODEGUERO.id }, data: { permisos: [] } });
    await request(app.getHttpServer()).put(`/productos/${productId}`).auth(users.BODEGUERO.token, { type: 'bearer' }).send({ nombre: 'Denied' }).expect(403);
  });
});
