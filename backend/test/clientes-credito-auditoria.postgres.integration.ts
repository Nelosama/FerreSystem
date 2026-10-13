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
import { ClientesController } from '../src/clientes/clientes.controller';
import { ClientesService } from '../src/clientes/clientes.service';

// FS-14 y FS-18 contra PostgreSQL real: auditoría de cambios de crédito (antes/después, misma transacción),
// atomicidad si la auditoría falla, permisos por rol y acceso del vendedor al buscador comercial. Clúster temporal.
describe('Clientes / crédito auditado y permisos con PostgreSQL aislado', () => {
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
  const users: Record<string, string> = {};

  const call = (method: 'get' | 'post' | 'put', path: string, rol: string, body: any = {}) =>
    request(app.getHttpServer())[method](`/api${path}`).auth(users[rol], { type: 'bearer' }).send(body);

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-credito-'));
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

    tenantA = randomUUID();
    tenantB = randomUUID();
    for (const id of [tenantA, tenantB]) await prisma.tenant.create({ data: { id, nombreComercial: 'Clientes', estado: 'ACTIVO' } });
    for (const [tenantId, rol] of [[tenantA, 'ADMIN'], [tenantA, 'CAJERO'], [tenantA, 'BODEGUERO'], [tenantA, 'VENDEDOR'], [tenantB, 'CAJERO']] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: `${rol} ${tenantId.slice(0, 4)}`, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: true, permisos: [] } as any });
      users[tenantId === tenantA ? `${rol}-A` : `${rol}-B`] = jwt.sign({ sub: id, tenantId, type: 'tenant' });
    }
    users.ADMIN = users['ADMIN-A']; users.CAJERO = users['CAJERO-A']; users.BODEGUERO = users['BODEGUERO-A']; users.VENDEDOR = users['VENDEDOR-A'];

    await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Constructora del Norte', rtn: '08019999123456', telefono: '9876-5432', creditoHabilitado: true, limiteCredito: 5000, saldoPendiente: 1234.5, email: 'compras@norte.invalid', direccion: 'Col. Centro' } as any });
    await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Taller San José', telefono: '3311-2244', creditoHabilitado: false, saldoPendiente: 0 } as any });
    await prisma.cliente.create({ data: { tenantId: tenantB, nombre: 'Constructora Ajena', telefono: '9999-0000', creditoHabilitado: true, saldoPendiente: 0 } as any });

    const module = await Test.createTestingModule({
      controllers: [ClientesController],
      providers: [ClientesService, JwtStrategy,
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-credito-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const patchCredito = (id: string, rol: string, body: any) =>
    request(app.getHttpServer()).patch(`/api/clientes/${id}/credito`).auth(users[rol], { type: 'bearer' }).send(body);

  it('ADMIN cambia crédito y queda auditado con valor anterior y nuevo', async () => {
    const cliente = await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Ferretería Auditada', telefono: '2200-1100', creditoHabilitado: false, saldoPendiente: 0 } as any });
    const res = await patchCredito(cliente.id, 'ADMIN', { creditoHabilitado: true, limiteCredito: 2500 }).expect(200);
    expect(res.body.creditoHabilitado).toBe(true);

    const auditoria = await prisma.auditoriaOperacion.findMany({ where: { tenantId: tenantA, operacion: 'CLIENTE_CREDITO_EDITAR', entidadId: cliente.id } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].usuarioId).toBeTruthy();
    expect(auditoria[0].datos).toMatchObject({
      cliente: 'Ferretería Auditada',
      anterior: { creditoHabilitado: false, limiteCredito: null },
      nuevo: { creditoHabilitado: true, limiteCredito: 2500 },
    });
  });

  it('si la auditoría falla, el cambio de crédito no se aplica', async () => {
    const cliente = await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Cliente Atomico', telefono: '2200-2200', creditoHabilitado: false, saldoPendiente: 0 } as any });
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fallo_auditoria_credito() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'auditoria no disponible'; END; $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fallo_auditoria_credito BEFORE INSERT ON auditoria_operaciones FOR EACH ROW WHEN (NEW.operacion = 'CLIENTE_CREDITO_EDITAR') EXECUTE FUNCTION fallo_auditoria_credito();`);
    try {
      const res = await patchCredito(cliente.id, 'ADMIN', { creditoHabilitado: true, limiteCredito: 900 });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fallo_auditoria_credito ON auditoria_operaciones;`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fallo_auditoria_credito();`);
    }
    const tras = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } });
    expect(tras.creditoHabilitado).toBe(false);
    expect(tras.limiteCredito).toBeNull();
  });

  it('CAJERO y VENDEDOR no cambian crédito ni listan clientes con saldos; VENDEDOR sí busca comercialmente', async () => {
    const cliente = await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Cliente Restringido', telefono: '2200-3300', creditoHabilitado: false, saldoPendiente: 0 } as any });
    await patchCredito(cliente.id, 'CAJERO', { creditoHabilitado: true }).expect(403);
    await patchCredito(cliente.id, 'VENDEDOR', { creditoHabilitado: true }).expect(403);
    await request(app.getHttpServer()).get('/api/clientes').auth(users.VENDEDOR, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get('/api/clientes').auth(users.CAJERO, { type: 'bearer' }).expect(403);
    const busqueda = await request(app.getHttpServer()).get('/api/clientes/buscar?q=Restringido').auth(users.VENDEDOR, { type: 'bearer' }).expect(200);
    expect(busqueda.body[0]).not.toHaveProperty('saldoPendiente');
    expect(busqueda.body[0]).not.toHaveProperty('limiteCredito');
    const sinCambios = await prisma.auditoriaOperacion.count({ where: { tenantId: tenantA, operacion: 'CLIENTE_CREDITO_EDITAR', entidadId: cliente.id } });
    expect(sinCambios).toBe(0);
  });

  it('otra empresa no puede cambiar crédito de un cliente ajeno', async () => {
    const ajeno = await prisma.cliente.findFirstOrThrow({ where: { tenantId: tenantB } });
    const res = await patchCredito(ajeno.id, 'ADMIN', { creditoHabilitado: true });
    expect(res.status).toBe(404);
  });
});
