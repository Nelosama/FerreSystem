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
import { GarantiasController } from '../src/garantias/garantias.controller';
import { GarantiasService } from '../src/garantias/garantias.service';

// Garantías por línea de factura contra PostgreSQL real: cadena completa de migraciones,
// HTTP con JWT, permisos por rol, aislamiento de tenants, concurrencia e integridad del trigger.
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL.
describe('Garantías / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let tenantA: string;
  let tenantB: string;
  const users: Record<string, { id: string; token: string; tenantId: string }> = {};
  let productoA: string;
  let productoB: string;
  let numeroA = 0;

  const call = (method: 'get' | 'post' | 'patch', path: string, role: string, body: any = {}) =>
    request(app.getHttpServer())[method](`/api${path}`).auth(users[role].token, { type: 'bearer' }).send(body);

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);

  /** Crea una factura completada con las líneas indicadas en el instante dado. */
  const venta = async (tenantId: string, usuarioId: string, createdAt: string, lineas: { productoId: string; cantidad?: number }[]) => {
    const numero = tenantId === tenantA ? ++numeroA : 1;
    const v = await prisma.venta.create({
      data: {
        tenantId,
        numeroVenta: numero,
        usuarioId,
        subtotal: 100,
        isv: 15,
        total: 115,
        createdAt: new Date(createdAt),
        detalles: {
          create: lineas.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad ?? 1,
            precioUnitario: 100,
            subtotal: 100,
          })),
        },
      },
      include: { detalles: true },
    });
    return v;
  };

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-garantias-'));
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
    // Cadena real de migraciones, en orden, sobre base vacía (no el DDL generado desde el esquema).
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();

    // Histórico: un reclamo existente en la tabla `garantias` que no debe cambiar.
    await prisma.$executeRawUnsafe(`INSERT INTO tenants (id, nombre_comercial, estado, updated_at) VALUES ('tenant-hist', 'Histórico', 'ACTIVO', NOW())`);
    await prisma.$executeRawUnsafe(`INSERT INTO productos (id, tenant_id, codigo, nombre, precio_venta, precio_costo, precio_aprobado, updated_at) VALUES ('prod-hist', 'tenant-hist', 'H-1', 'Histórico', 1, 1, true, NOW())`);
    await prisma.$executeRawUnsafe(`INSERT INTO garantias (id, tenant_id, codigo, cliente_nombre, producto_id, motivo_falla, estado, updated_at) VALUES ('rec-hist', 'tenant-hist', 'REC-1', 'Cliente histórico', 'prod-hist', 'Falla previa', 'RECIBIDO', NOW())`);

    tenantA = randomUUID();
    tenantB = randomUUID();
    for (const id of [tenantA, tenantB]) {
      await prisma.tenant.create({ data: { id, nombreComercial: `Ferretería ${id.slice(0, 4)}`, estado: 'ACTIVO' } });
    }
    const crear = async (tenantId: string, rol: string) => {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: `${rol} ${tenantId.slice(0, 4)}`, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: true, permisos: [] } as any });
      users[`${rol}-${tenantId === tenantA ? 'A' : 'B'}`] = { id, token: jwt.sign({ sub: id, tenantId, type: 'tenant' }), tenantId };
    };
    for (const rol of ['ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR']) await crear(tenantA, rol);
    await crear(tenantB, 'ADMIN');
    productoA = (await prisma.producto.create({ data: {precioAprobado:true, tenantId: tenantA, codigo: 'TAL-1', nombre: 'Taladro', precioVenta: 100, precioCosto: 60 } as any })).id;
    productoB = (await prisma.producto.create({ data: {precioAprobado:true, tenantId: tenantB, codigo: 'TAL-1', nombre: 'Taladro B', precioVenta: 100, precioCosto: 60 } as any })).id;

    const module = await Test.createTestingModule({
      controllers: [GarantiasController],
      providers: [GarantiasService, JwtStrategy,
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-garantias-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  describe('cálculo de vencimiento desde la fecha de la factura (día de negocio)', () => {
    it.each([
      [30, '2026-10-10T18:00:00.000Z', '2026-10-10', '2026-11-09'],
      [90, '2026-10-10T18:00:00.000Z', '2026-10-10', '2027-01-08'],
      [180, '2026-10-10T18:00:00.000Z', '2026-10-10', '2027-04-08'],
      [365, '2026-10-10T18:00:00.000Z', '2026-10-10', '2027-10-10'],
    ])('garantía de %i días desde la factura del %s', async (dias, fecha, inicio, vence) => {
      const v = await venta(tenantA, users['ADMIN-A'].id, fecha, [{ productoId: productoA }]);
      const res = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: dias, solicitudId: randomUUID() }).expect(201);
      expect(res.body.fechaInicio).toBe(inicio);
      expect(res.body.fechaVencimiento).toBe(vence);
      expect(res.body.diasGarantia).toBe(dias);
    });

    it('cambio de mes: 31 ene + 30 días = 2 mar', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-01-31T18:00:00.000Z', [{ productoId: productoA }]);
      const res = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      expect(res.body.fechaVencimiento).toBe('2026-03-02');
    });

    it('cambio de año: 31 dic + 1 día = 1 ene', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-12-31T18:00:00.000Z', [{ productoId: productoA }]);
      const res = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 1, solicitudId: randomUUID() }).expect(201);
      expect(res.body.fechaVencimiento).toBe('2027-01-01');
    });

    it('año bisiesto: 28 feb 2028 + 1 = 29 feb; + 2 = 1 mar; 28 feb 2027 + 1 = 1 mar', async () => {
      const b = await venta(tenantA, users['ADMIN-A'].id, '2028-02-28T18:00:00.000Z', [{ productoId: productoA }, { productoId: productoA }]);
      const r1 = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: b.id, detalleVentaId: b.detalles[0].id, diasGarantia: 1, solicitudId: randomUUID() }).expect(201);
      const r2 = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: b.id, detalleVentaId: b.detalles[1].id, diasGarantia: 2, solicitudId: randomUUID() }).expect(201);
      expect(r1.body.fechaVencimiento).toBe('2028-02-29');
      expect(r2.body.fechaVencimiento).toBe('2028-03-01');
      const n = await venta(tenantA, users['ADMIN-A'].id, '2027-02-28T18:00:00.000Z', [{ productoId: productoA }]);
      const r3 = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: n.id, detalleVentaId: n.detalles[0].id, diasGarantia: 1, solicitudId: randomUUID() }).expect(201);
      expect(r3.body.fechaVencimiento).toBe('2027-03-01');
    });

    it('factura de las 23:30 de Tegucigalpa (05:30 UTC del día siguiente) mantiene el día de negocio', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T05:30:00.000Z', [{ productoId: productoA }]);
      const res = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      expect(res.body.fechaInicio).toBe('2026-10-09');
      expect(res.body.fechaVencimiento).toBe('2026-11-08');
    });

    it('persiste las fechas como DATE y la restricción vencimiento = venta + días se cumple en PostgreSQL', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const res = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 90, solicitudId: randomUUID() }).expect(201);
      const [fila] = await sql(`SELECT fecha_venta::text AS fv, fecha_vencimiento::text AS fz, dias_garantia FROM coberturas_garantia WHERE id = $1`, res.body.id);
      expect(fila).toEqual({ fv: '2026-10-10', fz: '2027-01-08', dias_garantia: 90 });
    });
  });

  describe('validaciones de entrada', () => {
    it.each([0, -1, 3651, 30.5, '30'])('rechaza diasGarantia = %p', async (dias) => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: dias, solicitudId: randomUUID() }).expect(400);
    });

    it('acepta exactamente 1 y 3650 días', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }, { productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 1, solicitudId: randomUUID() }).expect(201);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[1].id, diasGarantia: 3650, solicitudId: randomUUID() }).expect(201);
    });

    it('rechaza una solicitud que no es UUID v4', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: 'no-uuid' }).expect(400);
    });
  });

  describe('facturas inexistentes y productos de otra factura', () => {
    it('no permite garantizar una factura inexistente', async () => {
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: randomUUID(), detalleVentaId: randomUUID(), diasGarantia: 30, solicitudId: randomUUID() }).expect(404);
    });

    it('la búsqueda de una factura inexistente responde 404', async () => {
      await call('get', '/garantias/facturas/999999', 'ADMIN-A').expect(404);
      await call('get', '/garantias/facturas/abc', 'ADMIN-A').expect(400);
    });

    it('no permite una línea que no pertenece a la factura indicada', async () => {
      const v1 = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const v2 = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v1.id, detalleVentaId: v2.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(400);
    });

    it('la base rechaza una cobertura cuyo producto no es el de la línea (escritura directa)', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO coberturas_garantia (id, tenant_id, venta_id, detalle_venta_id, producto_id, fecha_venta, dias_garantia, fecha_vencimiento, solicitud_id, creado_por, updated_at)
           VALUES ($1, $2, $3, $4, $5, '2026-10-10', 30, '2026-11-09', $6, $7, NOW())`,
          randomUUID(), tenantA, v.id, v.detalles[0].id, productoB, randomUUID(), users['ADMIN-A'].id,
        ),
      ).rejects.toThrow(/no corresponde a la línea/);
    });

    it('la base rechaza una fecha de vencimiento que no es fecha de venta + días', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO coberturas_garantia (id, tenant_id, venta_id, detalle_venta_id, producto_id, fecha_venta, dias_garantia, fecha_vencimiento, solicitud_id, creado_por, updated_at)
           VALUES ($1, $2, $3, $4, $5, '2026-10-10', 30, '2027-01-01', $6, $7, NOW())`,
          randomUUID(), tenantA, v.id, v.detalles[0].id, productoA, randomUUID(), users['ADMIN-A'].id,
        ),
      ).rejects.toThrow(/coberturas_garantia_vencimiento_check/);
    });
  });

  describe('duplicados y solicitudes concurrentes', () => {
    it('una segunda garantía sobre la misma línea responde 409, aunque cambie la solicitud', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      const dup = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 90, solicitudId: randomUUID() }).expect(409);
      expect(dup.body.code).toBe('GARANTIA_DUPLICADA');
    });

    it('reintento con la misma solicitud devuelve el registro original sin duplicar', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const solicitud = randomUUID();
      const body = { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 180, solicitudId: solicitud };
      const primera = await call('post', '/garantias/coberturas', 'ADMIN-A', body).expect(201);
      const reintento = await call('post', '/garantias/coberturas', 'ADMIN-A', body).expect(201);
      expect(reintento.body.id).toBe(primera.body.id);
      const filas = await sql(`SELECT count(*)::int AS n FROM coberturas_garantia WHERE detalle_venta_id = $1`, v.detalles[0].id);
      expect(filas[0].n).toBe(1);
    });

    it('misma solicitud con otros datos responde 409 y no cambia el registro', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const solicitud = randomUUID();
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: solicitud }).expect(201);
      const otra = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 365, solicitudId: solicitud }).expect(409);
      expect(otra.body.code).toBe('SOLICITUD_REUTILIZADA');
      const [fila] = await sql(`SELECT dias_garantia FROM coberturas_garantia WHERE detalle_venta_id = $1`, v.detalles[0].id);
      expect(fila.dias_garantia).toBe(30);
    });

    it('cinco solicitudes simultáneas sobre la misma línea: exactamente una crea la garantía', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () =>
          call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }),
        ),
      );
      const creadas = respuestas.filter((r) => r.status === 201);
      const rechazadas = respuestas.filter((r) => r.status === 409);
      expect(creadas).toHaveLength(1);
      expect(rechazadas).toHaveLength(4);
      const filas = await sql(`SELECT count(*)::int AS n FROM coberturas_garantia WHERE detalle_venta_id = $1`, v.detalles[0].id);
      expect(filas[0].n).toBe(1);
    });

    it('cinco reintentos simultáneos con la misma solicitud devuelven la misma garantía', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const solicitud = randomUUID();
      const body = { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 90, solicitudId: solicitud };
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => call('post', '/garantias/coberturas', 'ADMIN-A', body)));
      const ids = new Set(respuestas.filter((r) => r.status === 201).map((r) => r.body.id));
      expect(ids.size).toBe(1);
      expect(respuestas.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    });
  });

  describe('permisos por rol (verificados en backend)', () => {
    it('el administrador crea y edita; el cajero consulta y no crea ni edita', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'CAJERO-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(403);
      const creada = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      await call('patch', `/garantias/coberturas/${creada.body.id}`, 'CAJERO-A', { diasGarantia: 60 }).expect(403);
      await call('patch', `/garantias/coberturas/${creada.body.id}`, 'ADMIN-A', { diasGarantia: 60 }).expect(200);
      await call('get', `/garantias/facturas/${v.numeroVenta}`, 'CAJERO-A').expect(200);
      await call('get', '/garantias/coberturas', 'CAJERO-A').expect(200);
    });

    it('el vendedor no consulta ni cambia coberturas (403), igual que la ruta del frontend', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await call('get', '/garantias/coberturas', 'VENDEDOR-A').expect(403);
      await call('get', `/garantias/facturas/${v.numeroVenta}`, 'VENDEDOR-A').expect(403);
      await call('post', '/garantias/coberturas', 'VENDEDOR-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(403);
    });

    it('el listado muestra quién creó y quién actualizó cada cobertura, por nombre', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const creada = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      await call('patch', `/garantias/coberturas/${creada.body.id}`, 'ADMIN-A', { diasGarantia: 45 }).expect(200);
      const nombreAdmin = (await prisma.usuario.findUniqueOrThrow({ where: { id: users['ADMIN-A'].id } })).nombre;
      const lista = await call('get', '/garantias/coberturas', 'CAJERO-A').expect(200);
      const fila = lista.body.find((f: any) => f.id === creada.body.id);
      expect(fila).toMatchObject({ creadoPorNombre: nombreAdmin, actualizadoPorNombre: nombreAdmin });
    });

    it('el bodeguero no accede a garantías', async () => {
      await call('get', '/garantias/coberturas', 'BODEGUERO-A').expect(403);
      await call('get', '/garantias/facturas/1', 'BODEGUERO-A').expect(403);
    });

    it('sin sesión no hay acceso', async () => {
      await request(app.getHttpServer()).get('/api/garantias/coberturas').expect(401);
    });
  });

  describe('aislamiento entre tenants', () => {
    it('una factura de otra empresa no se encuentra ni se garantiza', async () => {
      const vA = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const vB = await venta(tenantB, users['ADMIN-B'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoB }]);
      // La factura 1 existe en ambas empresas: cada una ve solo la suya.
      const porB = await call('get', '/garantias/facturas/1', 'ADMIN-B').expect(200);
      expect(porB.body.id).toBe(vB.id);
      expect(porB.body.id).not.toBe(vA.id);
      // Garantizar una factura ajena es 404, aunque se conozca su identificador.
      await call('post', '/garantias/coberturas', 'ADMIN-B', { ventaId: vA.id, detalleVentaId: vA.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(404);
    });

    it('el listado y la edición no exponen garantías de otra empresa', async () => {
      const vA = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const creada = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: vA.id, detalleVentaId: vA.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      const listaB = await call('get', '/garantias/coberturas', 'ADMIN-B').expect(200);
      expect(listaB.body.some((g: any) => g.id === creada.body.id)).toBe(false);
      await call('patch', `/garantias/coberturas/${creada.body.id}`, 'ADMIN-B', { diasGarantia: 365 }).expect(404);
      const listaA = await call('get', '/garantias/coberturas', 'ADMIN-A').expect(200);
      expect(listaA.body.find((g: any) => g.id === creada.body.id).diasGarantia).toBe(30);
    });
  });

  describe('edición, auditoría y estado', () => {
    it('cambiar los días recalcula el vencimiento desde la fecha de venta y queda auditado', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      const creada = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      const editada = await call('patch', `/garantias/coberturas/${creada.body.id}`, 'ADMIN-A', { diasGarantia: 365 }).expect(200);
      expect(editada.body.fechaInicio).toBe('2026-10-10');
      expect(editada.body.fechaVencimiento).toBe('2027-10-10');
      const aud = await sql(`SELECT operacion, usuario_id, datos FROM auditoria_operaciones WHERE tenant_id = $1 AND entidad_id = $2 ORDER BY created_at`, tenantA, creada.body.id);
      expect(aud.map((a) => a.operacion)).toEqual(['GARANTIA_CREAR', 'GARANTIA_EDITAR']);
      expect(aud[0].usuario_id).toBe(users['ADMIN-A'].id);
      expect(aud[1].datos.anterior.diasGarantia).toBe(30);
      expect(aud[1].datos.nuevo.diasGarantia).toBe(365);
      const [fila] = await sql(`SELECT creado_por, actualizado_por FROM coberturas_garantia WHERE id = $1`, creada.body.id);
      expect(fila).toEqual({ creado_por: users['ADMIN-A'].id, actualizado_por: users['ADMIN-A'].id });
    });

    it('el estado es VIGENTE hasta el vencimiento y VENCIDA después, con el día de negocio', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2025-01-01T18:00:00.000Z', [{ productoId: productoA }]);
      const vencida = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      expect(vencida.body.estado).toBe('VENCIDA');
      const w = await venta(tenantA, users['ADMIN-A'].id, new Date().toISOString(), [{ productoId: productoA }]);
      const vigente = await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: w.id, detalleVentaId: w.detalles[0].id, diasGarantia: 3650, solicitudId: randomUUID() }).expect(201);
      expect(vigente.body.estado).toBe('VIGENTE');
    });

    it('la búsqueda de factura muestra la cobertura de cada línea', async () => {
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }, { productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 90, solicitudId: randomUUID() }).expect(201);
      const factura = await call('get', `/garantias/facturas/${v.numeroVenta}`, 'CAJERO-A').expect(200);
      expect(factura.body.items).toHaveLength(2);
      // El orden de las líneas no es de negocio: cada línea se localiza por su identificador.
      const cubierta = factura.body.items.find((i: any) => i.detalleVentaId === v.detalles[0].id);
      const sinCubrir = factura.body.items.find((i: any) => i.detalleVentaId === v.detalles[1].id);
      expect(cubierta.cobertura.diasGarantia).toBe(90);
      expect(sinCubrir.cobertura).toBeNull();
      expect(factura.body.fechaVenta).toBe('2026-10-10');
    });
  });

  describe('compatibilidad con datos históricos', () => {
    it('el reclamo existente en `garantias` no cambia al usar el módulo', async () => {
      const antes = await sql(`SELECT codigo, cliente_nombre, motivo_falla, estado::text AS estado FROM garantias WHERE id = 'rec-hist'`);
      const v = await venta(tenantA, users['ADMIN-A'].id, '2026-10-10T18:00:00.000Z', [{ productoId: productoA }]);
      await call('post', '/garantias/coberturas', 'ADMIN-A', { ventaId: v.id, detalleVentaId: v.detalles[0].id, diasGarantia: 30, solicitudId: randomUUID() }).expect(201);
      const despues = await sql(`SELECT codigo, cliente_nombre, motivo_falla, estado::text AS estado FROM garantias WHERE id = 'rec-hist'`);
      expect(despues).toEqual(antes);
      expect(antes).toHaveLength(1);
    });
  });
});
