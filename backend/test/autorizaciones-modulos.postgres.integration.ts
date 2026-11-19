import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { AutorizacionesController } from '../src/autorizaciones/autorizaciones.controller';
import { AutorizacionesService } from '../src/autorizaciones/autorizaciones.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';

// Auditoría de #248: /autorizaciones admite cualquiera de los dos módulos (cotizaciones o arqueo_caja), pero una solicitud de un
// módulo desactivado no se consulta, lista, decide ni cancela a través del otro. HTTP real con el guard de módulos global (como
// en app.module.ts), JWT real y PostgreSQL temporal con la cadena completa de migraciones. Cada caso comprueba que nada cambió.
describe('Autorizaciones por módulo (cotizaciones / arqueo_caja) / HTTP y PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let ops: OperacionesService;
  let tenantId: string, admin: string, cajero: string, productoId: string;

  const como = (sub: string) => {
    const t = jwt.sign({ sub, tenantId, type: 'tenant' });
    const http = () => request(app.getHttpServer());
    return {
      get: (url: string) => http().get(`/api${url}`).auth(t, { type: 'bearer' }),
      post: (url: string, body: object = {}) => http().post(`/api${url}`).auth(t, { type: 'bearer' }).send(body),
    };
  };
  const modulo = (moduleKey: string, enabled: boolean) => prisma.tenantModule.upsert({
    where: { tenantId_moduleKey: { tenantId, moduleKey } }, update: { enabled }, create: { tenantId, moduleKey, enabled },
  });
  const auditorias = () => prisma.auditoriaOperacion.count({ where: { tenantId } });
  /** Cotización del cajero con descuento: nace una solicitud DESCUENTO_COTIZACION pendiente. */
  const solicitudDescuento = async () => {
    const cot = (await como(cajero).post('/cotizaciones', { clienteNombre: 'Obra', detalles: [{ productoId, cantidad: 2, descuento: 10, tipoDescuento: 'PORCENTAJE' }] }).expect(201)).body;
    const s = await prisma.solicitudAutorizacion.findFirstOrThrow({ where: { tenantId, entidadId: cot.id, estado: 'PENDIENTE' } });
    return { cotizacionId: cot.id as string, solicitudId: s.id };
  };
  /** Apertura de caja del cajero en una tienda que exige autorización: nace una solicitud APERTURA_CAJA pendiente. */
  const solicitudApertura = async () => {
    await ops.guardarConfiguracionCaja(tenantId, admin, { aperturaAutonoma: false, cierreAutonomo: true, umbralAvisoDiferencia: 0 });
    const r = await ops.abrir(tenantId, cajero, { solicitudId: randomUUID(), monto: 80 } as any) as any;
    expect(r.estado).toBe('PENDIENTE_AUTORIZACION');
    return r.solicitudAutorizacionId as string;
  };
  const estado = async (id: string) => (await prisma.solicitudAutorizacion.findUniqueOrThrow({ where: { id } })).estado;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-aut-modulos-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url };
    const options = { timeout: 60000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
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
    const module = await Test.createTestingModule({
      controllers: [CotizacionesController, AutorizacionesController],
      providers: [CotizacionesService, AutorizacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalGuards(new TenantModuleGuard(module.get(Reflector), prisma));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 240000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-aut-modulos-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería sintética', estado: 'ACTIVO' } as any });
    const usuario = async (rol: 'ADMIN' | 'CAJERO') => (await prisma.usuario.create({
      data: { tenantId, nombre: `${rol}-${randomUUID().slice(0, 4)}`, email: `${randomUUID()}@test.invalid`, passwordHash: 'not-a-password', rol } as any,
    })).id;
    admin = await usuario('ADMIN'); cajero = await usuario('CAJERO');
    productoId = (await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'A', nombre: 'Martillo', precioVenta: 100, precioCosto: 40, stockActual: 50 } as any })).id;
  });

  it('cotizaciones desactivado y caja activa: la solicitud de descuento no se cancela, decide ni consulta por /autorizaciones, y la cotización no cambia', async () => {
    const { cotizacionId, solicitudId } = await solicitudDescuento();
    const antes = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId }, include: { detalles: true } });
    expect(Number(antes.descuento)).toBe(20);
    await modulo('cotizaciones', false);
    const nAuditoria = await auditorias();

    for (const quien of [admin, cajero]) await como(quien).post(`/autorizaciones/${solicitudId}/cancelar`).expect(403);
    await como(admin).post(`/autorizaciones/${solicitudId}/aprobar`).expect(403);
    await como(admin).post(`/autorizaciones/${solicitudId}/rechazar`, { motivo: 'no' }).expect(403);
    await como(admin).get(`/autorizaciones/${solicitudId}`).expect(403);
    // El listado y su contador no muestran tipos de un módulo desactivado, aunque el cliente los pida.
    for (const url of ['/autorizaciones?estado=PENDIENTE', '/autorizaciones?estado=PENDIENTE&tipo=DESCUENTO_COTIZACION']) {
      const lista = (await como(admin).get(url).expect(200)).body;
      expect(lista).toMatchObject({ solicitudes: [], pendientes: 0 });
    }

    // Nada cambió: ni la solicitud, ni la cotización (descuentos y totales), ni la auditoría.
    expect(await estado(solicitudId)).toBe('PENDIENTE');
    const despues = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId }, include: { detalles: true } });
    expect({ descuento: Number(despues.descuento), total: Number(despues.total), lineas: despues.detalles.map((d) => Number(d.descuento)) })
      .toEqual({ descuento: Number(antes.descuento), total: Number(antes.total), lineas: antes.detalles.map((d) => Number(d.descuento)) });
    expect(await auditorias()).toBe(nAuditoria);

    // Control: con el módulo otra vez activo, la misma cancelación funciona.
    await modulo('cotizaciones', true);
    await como(cajero).post(`/autorizaciones/${solicitudId}/cancelar`).expect(201);
    expect(await estado(solicitudId)).toBe('CANCELADA');
  });

  it('caja desactivada y cotizaciones activo: la solicitud de apertura no se decide, cancela ni consulta, y no cambia', async () => {
    const solicitudId = await solicitudApertura();
    await modulo('arqueo_caja', false);
    const nAuditoria = await auditorias();

    await como(admin).post(`/autorizaciones/${solicitudId}/aprobar`).expect(403);
    await como(admin).post(`/autorizaciones/${solicitudId}/rechazar`).expect(403);
    for (const quien of [admin, cajero]) await como(quien).post(`/autorizaciones/${solicitudId}/cancelar`).expect(403);
    await como(admin).get(`/autorizaciones/${solicitudId}`).expect(403);
    for (const url of ['/autorizaciones?estado=PENDIENTE', '/autorizaciones?estado=PENDIENTE&tipo=APERTURA_CAJA,CIERRE_CAJA']) {
      expect((await como(admin).get(url).expect(200)).body).toMatchObject({ solicitudes: [], pendientes: 0 });
    }
    expect(await estado(solicitudId)).toBe('PENDIENTE');
    expect(await auditorias()).toBe(nAuditoria);

    await modulo('arqueo_caja', true);
    await como(admin).post(`/autorizaciones/${solicitudId}/aprobar`).expect(201);
    expect(await estado(solicitudId)).toBe('APROBADA');
  });

  it('con un solo módulo activo, el listado muestra solo sus solicitudes; con los dos, ambas; sin ninguno, el guard responde 403', async () => {
    const descuento = await solicitudDescuento();
    const apertura = await solicitudApertura();
    const tipos = async (url = '/autorizaciones?estado=PENDIENTE') => {
      const body = (await como(admin).get(url).expect(200)).body;
      return { tipos: body.solicitudes.map((s: any) => s.tipo).sort(), pendientes: body.pendientes };
    };
    expect(await tipos()).toEqual({ tipos: ['APERTURA_CAJA', 'DESCUENTO_COTIZACION'], pendientes: 2 });
    // El cajero ve las suyas con la misma regla.
    expect((await como(cajero).get('/autorizaciones?estado=PENDIENTE').expect(200)).body.pendientes).toBe(2);

    await modulo('cotizaciones', false);
    expect(await tipos()).toEqual({ tipos: ['APERTURA_CAJA'], pendientes: 1 });
    expect(await tipos('/autorizaciones?estado=PENDIENTE&tipo=DESCUENTO_COTIZACION,APERTURA_CAJA')).toEqual({ tipos: ['APERTURA_CAJA'], pendientes: 1 });
    expect((await como(admin).get(`/autorizaciones/${apertura}`).expect(200)).body.tipo).toBe('APERTURA_CAJA');

    await modulo('cotizaciones', true); await modulo('arqueo_caja', false);
    expect(await tipos()).toEqual({ tipos: ['DESCUENTO_COTIZACION'], pendientes: 1 });
    expect((await como(admin).get(`/autorizaciones/${descuento.solicitudId}`).expect(200)).body.tipo).toBe('DESCUENTO_COTIZACION');

    await modulo('cotizaciones', false);
    await como(admin).get('/autorizaciones?estado=PENDIENTE').expect(403);
  });
});
