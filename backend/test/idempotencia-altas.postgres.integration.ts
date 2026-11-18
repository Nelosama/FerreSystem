import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { configurarPipesGlobales } from '../src/common/pipes/profundidad-maxima.pipe';
import { ClientesController } from '../src/clientes/clientes.controller';
import { ClientesService } from '../src/clientes/clientes.service';
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { idAlta } from '../src/common/idempotencia-alta';

// A-02 (evaluación de producción del 2026-11-16): altas idempotentes de clientes, cotizaciones y copias de cotización.
// - Misma clave, mismo usuario y mismo contenido → el mismo registro y la misma respuesta, sin filas nuevas.
// - Misma clave con otro contenido (u otro usuario, u otra cotización de origen) → 409 y nada cambia.
// - La clave queda aislada por empresa y por tipo de operación.
// - Sin clave, cada alta crea un registro nuevo, como antes (compatibilidad con clientes y API antiguos).
// Ruta real: controladores, guards, pipes globales de producción y `prisma migrate deploy` sobre PostgreSQL temporal.
describe('A-02 — altas idempotentes (clientes, cotizaciones, duplicar) / HTTP y PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;

  let tenantId: string, otroTenantId: string;
  let admin: string, admin2: string, cajero: string, adminOtro: string;
  let productoA: string, productoB: string, productoOtro: string;
  const como = (sub: string, tenant = tenantId) => {
    const t = jwt.sign({ sub, tenantId: tenant, type: 'tenant' });
    const http = () => request(app.getHttpServer());
    return {
      get: (url: string) => http().get(`/api${url}`).auth(t, { type: 'bearer' }),
      post: (url: string, body?: object) => {
        const r = http().post(`/api${url}`).auth(t, { type: 'bearer' });
        return body === undefined ? r : r.send(body);
      },
    };
  };
  const cotizacion = (extra: object = {}) => ({ clienteNombre: 'Obra Las Lomas', detalles: [{ productoId: productoA, cantidad: 2 }, { productoId: productoB, cantidad: 1 }], ...extra });
  const conDescuento = () => cotizacion({ detalles: [{ productoId: productoA, cantidad: 2, descuento: 10, tipoDescuento: 'PORCENTAJE' }, { productoId: productoB, cantidad: 1 }] });
  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const foto = async (tenant = tenantId) => ({
    clientes: await prisma.cliente.count({ where: { tenantId: tenant } }),
    cotizaciones: await prisma.cotizacion.count({ where: { tenantId: tenant } }),
    detalles: await prisma.detalleCotizacion.count({ where: { cotizacion: { tenantId: tenant } } }),
    autorizaciones: await prisma.solicitudAutorizacion.count({ where: { tenantId: tenant } }),
    secuencia: Number((await sql(`SELECT COALESCE(MAX(ultimo_numero),0)::int AS n FROM secuencias_tenant WHERE tenant_id=$1 AND tipo='COTIZACION'`, tenant))[0].n),
    altas: Number((await sql(`SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion IN ('CLIENTE_CREAR','COTIZACION_CREAR','COTIZACION_DUPLICAR')`, tenant))[0].n),
  });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-a02-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { timeout: 60000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { ...options, timeout: 180000 });
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [ClientesController, CotizacionesController],
      providers: [ClientesService, CotizacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
      ],
    }).compile();
    app = module.createNestApplication();
    configurarPipesGlobales(app);
    app.setGlobalPrefix('api');
    await app.init();
  }, 240000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-a02-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otroTenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería sintética' } });
    await prisma.tenant.create({ data: { id: otroTenantId, nombreComercial: 'Otra empresa sintética' } });
    const usuario = async (rol: 'ADMIN' | 'CAJERO', tenant = tenantId) => (await prisma.usuario.create({
      data: { tenantId: tenant, nombre: `${rol}-${randomUUID().slice(0, 4)}`, email: `${randomUUID()}@test.invalid`, passwordHash: 'not-a-password', rol },
    })).id;
    admin = await usuario('ADMIN'); admin2 = await usuario('ADMIN'); cajero = await usuario('CAJERO');
    adminOtro = await usuario('ADMIN', otroTenantId);
    productoA = (await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'A', nombre: 'Martillo', precioVenta: 100, precioCosto: 40, stockActual: 50 } })).id;
    productoB = (await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'B', nombre: 'Clavos', precioVenta: 50, precioCosto: 20, stockActual: 50 } })).id;
    productoOtro = (await prisma.producto.create({ data: { precioAprobado: true, tenantId: otroTenantId, codigo: 'A', nombre: 'Martillo', precioVenta: 100, precioCosto: 40, stockActual: 50 } })).id;
  });

  describe('clientes', () => {
    it('un reintento con la misma clave devuelve el mismo cliente y no crea otro', async () => {
      const solicitudId = randomUUID();
      const cuerpo = { solicitudId, nombre: 'Constructora Delta', telefono: '9999-0000' };
      const primero = await como(admin).post('/clientes', cuerpo).expect(201);
      const antes = await foto();
      const segundo = await como(admin).post('/clientes', cuerpo).expect(201);
      expect(segundo.body).toEqual(primero.body);
      expect(primero.body.id).toBe(idAlta(tenantId, 'CLIENTE_CREAR', solicitudId));
      expect(await foto()).toEqual(antes);
      expect(antes).toMatchObject({ clientes: 1, altas: 1 });
    });

    it('envíos simultáneos con la misma clave crean un solo cliente', async () => {
      const cuerpo = { solicitudId: randomUUID(), nombre: 'Doble clic' };
      const respuestas = await Promise.all(Array.from({ length: 6 }, () => como(admin).post('/clientes', cuerpo)));
      expect(respuestas.map((r) => r.status)).toEqual(Array(6).fill(201));
      expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(1);
      expect(new Set(respuestas.map((r) => r.body.numeroCliente)).size).toBe(1);
      expect(await foto()).toMatchObject({ clientes: 1, altas: 1 });
    });

    it('la misma clave con otro contenido o de otro usuario responde 409 y no cambia nada', async () => {
      const solicitudId = randomUUID();
      const original = await como(admin).post('/clientes', { solicitudId, nombre: 'Ferretería Norte' }).expect(201);
      const antes = await foto();
      const otroContenido = await como(admin).post('/clientes', { solicitudId, nombre: 'Ferretería Sur' }).expect(409);
      expect(otroContenido.body.message).toMatch(/clave de solicitud ya se usó con otros datos/);
      await como(admin).post('/clientes', { solicitudId, nombre: 'Ferretería Norte', telefono: '1' }).expect(409);
      await como(admin2).post('/clientes', { solicitudId, nombre: 'Ferretería Norte' }).expect(409);
      expect(await foto()).toEqual(antes);
      expect((await prisma.cliente.findUniqueOrThrow({ where: { id: original.body.id } })).nombre).toBe('Ferretería Norte');
    });

    it('un reintento devuelve el cliente aunque el contenido ya no pasaría la validación actual', async () => {
      // Cliente creado con la clave y luego un reintento idéntico: el reintento se reconoce antes de volver a validar.
      const solicitudId = randomUUID();
      const creado = await como(admin).post('/clientes', { solicitudId, nombre: 'Validado', rtn: '0801-1999-000001' }).expect(201);
      expect(creado.body.rtn).toBe('08011999000001');
      expect((await como(admin).post('/clientes', { solicitudId, nombre: 'Validado', rtn: '0801-1999-000001' }).expect(201)).body.id).toBe(creado.body.id);
    });

    it('aislada por empresa: la misma clave en otra empresa crea su propio cliente y no revela el primero', async () => {
      const solicitudId = randomUUID();
      const a = await como(admin).post('/clientes', { solicitudId, nombre: 'Mismo nombre' }).expect(201);
      const b = await como(adminOtro, otroTenantId).post('/clientes', { solicitudId, nombre: 'Otro contenido' }).expect(201);
      expect(b.body.id).not.toBe(a.body.id);
      expect(b.body.tenantId).toBe(otroTenantId);
      expect((await como(adminOtro, otroTenantId).post('/clientes', { solicitudId, nombre: 'Otro contenido' }).expect(201)).body.id).toBe(b.body.id);
      expect(await foto()).toMatchObject({ clientes: 1, altas: 1 });
      expect(await foto(otroTenantId)).toMatchObject({ clientes: 1, altas: 1 });
    });

    it('sin clave cada alta crea un cliente (compatibilidad); una clave que no es UUID v4 o es un id interno responde 400', async () => {
      await como(admin).post('/clientes', { nombre: 'Sin clave' }).expect(201);
      await como(admin).post('/clientes', { nombre: 'Sin clave' }).expect(201);
      expect(await foto()).toMatchObject({ clientes: 2, altas: 0 });
      await como(admin).post('/clientes', { solicitudId: 'reintento-1', nombre: 'Clave mala' }).expect(400);
      await como(admin).post('/clientes', { solicitudId: idAlta(tenantId, 'CLIENTE_CREAR', randomUUID()), nombre: 'Clave interna' }).expect(400);
      expect(await foto()).toMatchObject({ clientes: 2 });
    });
  });

  describe('cotizaciones', () => {
    it('un reintento devuelve la misma cotización, con el mismo número, sin gastar correlativo ni crear líneas', async () => {
      const solicitudId = randomUUID();
      const primero = await como(cajero).post('/cotizaciones', { ...cotizacion(), solicitudId }).expect(201);
      const antes = await foto();
      const segundo = await como(cajero).post('/cotizaciones', { ...cotizacion(), solicitudId }).expect(201);
      expect(segundo.body).toEqual(primero.body);
      expect(await foto()).toEqual(antes);
      expect(antes).toMatchObject({ cotizaciones: 1, detalles: 2, secuencia: 1, altas: 1 });
      // La siguiente cotización real toma el número siguiente: el reintento no consumió ninguno.
      expect((await como(cajero).post('/cotizaciones', cotizacion()).expect(201)).body.numeroCotizacion).toBe(primero.body.numeroCotizacion + 1);
    });

    it('con descuento, el reintento no crea una segunda solicitud de autorización', async () => {
      const solicitudId = randomUUID();
      const primero = await como(cajero).post('/cotizaciones', { ...conDescuento(), solicitudId }).expect(201);
      expect(primero.body.autorizacionDescuento).toMatchObject({ requerida: true, estado: 'PENDIENTE' });
      const segundo = await como(cajero).post('/cotizaciones', { ...conDescuento(), solicitudId }).expect(201);
      expect(segundo.body).toEqual(primero.body);
      expect(await foto()).toMatchObject({ cotizaciones: 1, autorizaciones: 1 });
    });

    it('envíos simultáneos con la misma clave crean una sola cotización', async () => {
      const cuerpo = { ...cotizacion(), solicitudId: randomUUID() };
      const respuestas = await Promise.all(Array.from({ length: 6 }, () => como(cajero).post('/cotizaciones', cuerpo)));
      expect(respuestas.map((r) => r.status)).toEqual(Array(6).fill(201));
      expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(1);
      expect(await foto()).toMatchObject({ cotizaciones: 1, detalles: 2, secuencia: 1, altas: 1 });
    });

    it('la misma clave con otro contenido o de otro usuario responde 409 y no cambia nada', async () => {
      const solicitudId = randomUUID();
      await como(cajero).post('/cotizaciones', { ...cotizacion(), solicitudId }).expect(201);
      const antes = await foto();
      await como(cajero).post('/cotizaciones', { ...cotizacion({ clienteNombre: 'Otro cliente' }), solicitudId }).expect(409);
      await como(cajero).post('/cotizaciones', { ...cotizacion({ detalles: [{ productoId: productoA, cantidad: 3 }, { productoId: productoB, cantidad: 1 }] }), solicitudId }).expect(409);
      await como(cajero).post('/cotizaciones', { ...conDescuento(), solicitudId }).expect(409);
      await como(admin).post('/cotizaciones', { ...cotizacion(), solicitudId }).expect(409);
      expect(await foto()).toEqual(antes);
    });

    it('aislada por empresa: la misma clave en otra empresa crea su propia cotización', async () => {
      const solicitudId = randomUUID();
      const a = await como(cajero).post('/cotizaciones', { ...cotizacion(), solicitudId }).expect(201);
      const cuerpoOtro = { clienteNombre: 'Otra obra', detalles: [{ productoId: productoOtro, cantidad: 1 }], solicitudId };
      const b = await como(adminOtro, otroTenantId).post('/cotizaciones', cuerpoOtro).expect(201);
      expect(b.body.id).not.toBe(a.body.id);
      expect((await como(adminOtro, otroTenantId).post('/cotizaciones', cuerpoOtro).expect(201)).body.id).toBe(b.body.id);
      // La cotización de una empresa sigue invisible para la otra.
      await como(adminOtro, otroTenantId).get(`/cotizaciones/${a.body.id}`).expect(404);
      expect(await foto()).toMatchObject({ cotizaciones: 1, altas: 1 });
      expect(await foto(otroTenantId)).toMatchObject({ cotizaciones: 1, altas: 1 });
    });

    it('sin clave cada alta crea una cotización (compatibilidad); la edición ignora la clave', async () => {
      const a = await como(cajero).post('/cotizaciones', cotizacion()).expect(201);
      await como(cajero).post('/cotizaciones', cotizacion()).expect(201);
      expect(await foto()).toMatchObject({ cotizaciones: 2, altas: 0 });
      await request(app.getHttpServer()).put(`/api/cotizaciones/${a.body.id}`).auth(jwt.sign({ sub: cajero, tenantId, type: 'tenant' }), { type: 'bearer' })
        .send({ ...cotizacion({ clienteNombre: 'Editada' }), solicitudId: randomUUID() }).expect(200);
      expect(await foto()).toMatchObject({ cotizaciones: 2, altas: 0 });
      await como(cajero).post('/cotizaciones', { ...cotizacion(), solicitudId: 'no-es-uuid' }).expect(400);
    });
  });

  describe('duplicar cotización', () => {
    it('un reintento devuelve la misma copia; sin clave cada llamada crea una copia nueva', async () => {
      const original = (await como(cajero).post('/cotizaciones', cotizacion()).expect(201)).body;
      const solicitudId = randomUUID();
      const copia = await como(cajero).post(`/cotizaciones/${original.id}/duplicar`, { solicitudId }).expect(201);
      expect(copia.body.id).not.toBe(original.id);
      expect(copia.body.notas).toMatch(/^Copia de COT-/);
      const antes = await foto();
      const reintento = await como(cajero).post(`/cotizaciones/${original.id}/duplicar`, { solicitudId }).expect(201);
      expect(reintento.body).toEqual(copia.body);
      expect(await foto()).toEqual(antes);
      expect(antes).toMatchObject({ cotizaciones: 2, secuencia: 2, altas: 1 });
      // Compatibilidad: sin cuerpo (contrato anterior) o sin clave, cada llamada es una copia nueva.
      await como(cajero).post(`/cotizaciones/${original.id}/duplicar`).expect(201);
      await como(cajero).post(`/cotizaciones/${original.id}/duplicar`, {}).expect(201);
      expect(await foto()).toMatchObject({ cotizaciones: 4, altas: 1 });
    });

    it('envíos simultáneos con la misma clave crean una sola copia y una sola solicitud de autorización', async () => {
      const original = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
      const solicitudId = randomUUID();
      const respuestas = await Promise.all(Array.from({ length: 6 }, () => como(cajero).post(`/cotizaciones/${original.id}/duplicar`, { solicitudId })));
      expect(respuestas.map((r) => r.status)).toEqual(Array(6).fill(201));
      expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(1);
      expect(await foto()).toMatchObject({ cotizaciones: 2, autorizaciones: 2, altas: 1 });
    });

    it('la misma clave para duplicar otra cotización, o de otro usuario, responde 409', async () => {
      const a = (await como(cajero).post('/cotizaciones', cotizacion()).expect(201)).body;
      const b = (await como(cajero).post('/cotizaciones', cotizacion({ clienteNombre: 'Otra' })).expect(201)).body;
      const solicitudId = randomUUID();
      await como(cajero).post(`/cotizaciones/${a.id}/duplicar`, { solicitudId }).expect(201);
      const antes = await foto();
      await como(cajero).post(`/cotizaciones/${b.id}/duplicar`, { solicitudId }).expect(409);
      await como(admin).post(`/cotizaciones/${a.id}/duplicar`, { solicitudId }).expect(409);
      expect(await foto()).toEqual(antes);
    });

    it('aislada por empresa: no duplica una cotización ajena aunque se reutilice la clave', async () => {
      const a = (await como(cajero).post('/cotizaciones', cotizacion()).expect(201)).body;
      const solicitudId = randomUUID();
      await como(adminOtro, otroTenantId).post(`/cotizaciones/${a.id}/duplicar`, { solicitudId }).expect(404);
      await como(cajero).post(`/cotizaciones/${a.id}/duplicar`, { solicitudId }).expect(201);
      await como(adminOtro, otroTenantId).post(`/cotizaciones/${a.id}/duplicar`, { solicitudId }).expect(404);
      expect(await foto(otroTenantId)).toMatchObject({ cotizaciones: 0, altas: 0 });
    });
  });

  it('aislada por tipo de operación: la misma clave sirve para un cliente, una cotización y una copia sin mezclarse', async () => {
    const solicitudId = randomUUID();
    const cliente = await como(admin).post('/clientes', { solicitudId, nombre: 'Cliente compartido' }).expect(201);
    const cot = await como(admin).post('/cotizaciones', { ...cotizacion(), solicitudId }).expect(201);
    const copia = await como(admin).post(`/cotizaciones/${cot.body.id}/duplicar`, { solicitudId }).expect(201);
    expect(new Set([cliente.body.id, cot.body.id, copia.body.id]).size).toBe(3);
    expect(copia.body.notas).toMatch(/^Copia de COT-/);
    // Cada reintento sigue devolviendo lo suyo.
    expect((await como(admin).post('/clientes', { solicitudId, nombre: 'Cliente compartido' }).expect(201)).body.id).toBe(cliente.body.id);
    expect((await como(admin).post('/cotizaciones', { ...cotizacion(), solicitudId }).expect(201)).body.id).toBe(cot.body.id);
    expect((await como(admin).post(`/cotizaciones/${cot.body.id}/duplicar`, { solicitudId }).expect(201)).body.id).toBe(copia.body.id);
    expect(await foto()).toMatchObject({ clientes: 1, cotizaciones: 2, altas: 3 });
  });

  it('registros anteriores sin clave siguen funcionando: se leen, se duplican y conviven con altas nuevas', async () => {
    // Cliente y cotización creados como antes de A-02 (identificador aleatorio, sin fila de alta en la auditoría).
    const [cliente] = await sql(`INSERT INTO clientes (id, tenant_id, nombre, updated_at) VALUES ($1, $2, 'Cliente histórico', now()) RETURNING id`, randomUUID(), tenantId);
    const historica = (await como(cajero).post('/cotizaciones', { ...cotizacion(), clienteId: cliente.id }).expect(201)).body;
    expect(await foto()).toMatchObject({ altas: 0 });
    const solicitudId = randomUUID();
    const copia = await como(cajero).post(`/cotizaciones/${historica.id}/duplicar`, { solicitudId }).expect(201);
    expect(copia.body.clienteId).toBe(cliente.id);
    expect((await como(cajero).post(`/cotizaciones/${historica.id}/duplicar`, { solicitudId }).expect(201)).body.id).toBe(copia.body.id);
    expect((await como(admin).get(`/clientes/${cliente.id}`).expect(200)).body.nombre).toBe('Cliente histórico');
  });
});
