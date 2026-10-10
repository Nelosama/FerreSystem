import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParserImport from 'cookie-parser';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CashierResponseInterceptor } from '../src/common/interceptors/cashier-response.interceptor';
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasController } from '../src/ventas/ventas.controller';
import { VentasService } from '../src/ventas/ventas.service';

// Auditoría de seguridad fase 2: negativas entre empresas, matriz de roles, costos y tokens.
// Clúster PostgreSQL temporal y dedicado; nunca usa DATABASE_URL externa. Ejecutar sin root (initdb lo exige).
describe('Seguridad fase 2 / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  const password = 'Clave-Segura-2026!';
  let directory: string;
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let ventas: VentasService;
  let operaciones: OperacionesService;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const users: Record<string, { id: string; tenantId: string; rol: string; permisos?: string[]; permisosConfigurados?: boolean }> = {
    adminA: { id: randomUUID(), tenantId: tenantA, rol: 'ADMIN' },
    cajeroA: { id: randomUUID(), tenantId: tenantA, rol: 'CAJERO' },
    vendedorA: { id: randomUUID(), tenantId: tenantA, rol: 'VENDEDOR' },
    bodegueroSinPermiso: { id: randomUUID(), tenantId: tenantA, rol: 'BODEGUERO', permisos: [], permisosConfigurados: true },
    bodegueroConPermiso: { id: randomUUID(), tenantId: tenantA, rol: 'BODEGUERO', permisos: ['inventario.ver'], permisosConfigurados: true },
    vendedorB: { id: randomUUID(), tenantId: tenantB, rol: 'VENDEDOR' },
    adminB: { id: randomUUID(), tenantId: tenantB, rol: 'ADMIN' },
  };
  const tokens: Record<string, string> = {};
  const superAdminId = randomUUID();
  let productoId: string;
  let venta: { id: string; numeroVenta: number };

  const cookieParser = (cookieParserImport as any).default || cookieParserImport;
  const get = (path: string, token: string) => request(app.getHttpServer()).get(`/api${path}`).auth(token, { type: 'bearer' });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-seguridad-'));
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
    ventas = new VentasService(prisma);
    operaciones = new OperacionesService(prisma);

    const config = { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? secret : fallback) } as unknown as ConfigService;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, VentasController, CotizacionesController, OperacionesController],
      providers: [
        AuthService, JwtStrategy, VentasService, CotizacionesService, OperacionesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();

    await prisma.tenant.create({ data: { id: tenantA, nombreComercial: 'Ferretería A' } });
    await prisma.tenant.create({ data: { id: tenantB, nombreComercial: 'Ferretería B' } });
    const passwordHash = await bcrypt.hash(password, 4);
    for (const [key, user] of Object.entries(users)) {
      await prisma.usuario.create({ data: {
        id: user.id, tenantId: user.tenantId, nombre: key, email: `${key.toLowerCase()}@test.invalid`, passwordHash,
        rol: user.rol as any, permisos: user.permisos ?? [], permisosConfigurados: user.permisosConfigurados ?? false,
      } });
      tokens[key] = jwt.sign({ sub: user.id, tenantId: user.tenantId, type: 'tenant', rol: user.rol });
    }
    await prisma.superAdmin.create({ data: { id: superAdminId, nombre: 'Plataforma', email: 'plataforma@test.invalid', passwordHash } });

    productoId = (await prisma.producto.create({ data: { tenantId: tenantA, codigo: 'SEG-1', nombre: 'Cable', precioVenta: 100, precioCosto: 50, stockActual: 1000, stockMinimo: 0 } })).id;
    await operaciones.abrir(tenantA, users.cajeroA.id, { solicitudId: randomUUID(), monto: 500 } as any);
    const registrada = await ventas.create(tenantA, users.cajeroA.id, {
      solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId, cantidad: 1, precioUnitario: 100 }],
    } as any);
    venta = { id: registrada.id, numeroVenta: registrada.numeroVenta };
  }, 120000);

  afterAll(async () => {
    try {
      await app?.close();
      await prisma?.$disconnect();
    } finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-seguridad-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  describe('costos por línea de venta', () => {
    it('ADMIN conserva el costo de la línea en la búsqueda por número', async () => {
      const response = await get(`/operaciones/ventas/buscar?numero=${venta.numeroVenta}`, tokens.adminA).expect(200);
      expect(Number(response.body.items[0].costo_unitario)).toBe(50);
    });

    it('CAJERO no recibe el costo de la línea en la búsqueda por número', async () => {
      const response = await get(`/operaciones/ventas/buscar?numero=${venta.numeroVenta}`, tokens.cajeroA).expect(200);
      expect(response.body.items[0]).not.toHaveProperty('costo_unitario');
    });

    it('VENDEDOR no recibe el costo de la línea en la búsqueda por número', async () => {
      const response = await get(`/operaciones/ventas/buscar?numero=${venta.numeroVenta}`, tokens.vendedorA).expect(200);
      expect(response.body.items[0]).not.toHaveProperty('costo_unitario');
    });

    it('BODEGUERO sin inventario.ver no recibe el costo de la línea en entregas', async () => {
      const response = await get('/operaciones/entregas', tokens.bodegueroSinPermiso).expect(200);
      const entrega = response.body.find((v: any) => v.id === venta.id);
      expect(entrega).toBeDefined();
      expect(entrega.items[0]).not.toHaveProperty('costo_unitario');
    });

    it('BODEGUERO con inventario.ver conserva el costo, según la política de productos', async () => {
      const response = await get('/operaciones/entregas', tokens.bodegueroConPermiso).expect(200);
      const entrega = response.body.find((v: any) => v.id === venta.id);
      expect(Number(entrega.items[0].costo_unitario)).toBe(50);
    });
  });

  describe('matriz de roles en lecturas comerciales', () => {
    it('BODEGUERO no lee el historial de ventas ni el detalle de una venta', async () => {
      await get('/ventas', tokens.bodegueroSinPermiso).expect(403);
      await get(`/ventas/${venta.id}`, tokens.bodegueroSinPermiso).expect(403);
    });

    it('BODEGUERO no lee cotizaciones (datos de contacto y RTN de clientes)', async () => {
      await get('/cotizaciones', tokens.bodegueroSinPermiso).expect(403);
    });

    it.each(['adminA', 'cajeroA', 'vendedorA'])('%s conserva lectura de ventas y cotizaciones', async key => {
      await get('/ventas', tokens[key]).expect(200);
      await get('/cotizaciones', tokens[key]).expect(200);
    });
  });

  describe('aislamiento entre empresas', () => {
    it('una venta de otra empresa no se lee por id ni por número', async () => {
      await get(`/ventas/${venta.id}`, tokens.vendedorB).expect(404);
      await get(`/operaciones/ventas/buscar?numero=${venta.numeroVenta}`, tokens.vendedorB).expect(404);
    });

    it('el historial de otra empresa no incluye ventas ajenas', async () => {
      const response = await get('/ventas', tokens.adminB).expect(200);
      expect(response.body.map((v: any) => v.id)).not.toContain(venta.id);
    });

    it('el token de una empresa no sirve para escribir en otra', async () => {
      const intento = await request(app.getHttpServer())
        .post(`/api/operaciones/productos/${productoId}/ajuste`)
        .auth(tokens.adminB, { type: 'bearer' })
        .send({ solicitudId: randomUUID(), cantidad: 1, motivo: 'intento' });
      expect(intento.status).toBeGreaterThanOrEqual(400);
      const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
      expect(Number(producto.stockActual)).toBe(1000);
    });
  });

  describe('tokens de sesión', () => {
    const login = () => request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'adminA@test.invalid', password, tenantId: tenantA })
      .expect(200);

    it('el refresh token no se acepta como token de acceso', async () => {
      const response = await login();
      const cookie = (response.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('refreshToken='))!;
      const refreshToken = cookie.split(';')[0].slice('refreshToken='.length);
      await request(app.getHttpServer()).get('/api/auth/me').auth(refreshToken, { type: 'bearer' }).expect(401);
    });

    it('el refresh token sigue renovando la sesión', async () => {
      const response = await login();
      const cookie = (response.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('refreshToken='))!;
      await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]).expect(200);
    });

    it('un Super Admin desactivado pierde acceso antes de que expire su token', async () => {
      const token = jwt.sign({ sub: superAdminId, email: 'plataforma@test.invalid', rol: 'SUPER_ADMIN', type: 'super_admin' });
      await get('/auth/me', token).expect(200);
      await prisma.superAdmin.update({ where: { id: superAdminId }, data: { activo: false } });
      try {
        await get('/auth/me', token).expect(401);
      } finally {
        await prisma.superAdmin.update({ where: { id: superAdminId }, data: { activo: true } });
      }
    });
  });
});
