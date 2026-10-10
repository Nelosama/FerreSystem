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

// Clientes para CAJERO contra PostgreSQL real: búsqueda comercial por HTTP con JWT, proyección sin datos
// administrativos, permisos por rol y aislamiento entre empresas. Clúster temporal; nunca lee DATABASE_URL.
describe('Clientes / búsqueda de cajero con PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-clientes-'));
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
    for (const [tenantId, rol] of [[tenantA, 'ADMIN'], [tenantA, 'CAJERO'], [tenantA, 'BODEGUERO'], [tenantB, 'CAJERO']] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: `${rol} ${tenantId.slice(0, 4)}`, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: true, permisos: [] } as any });
      users[tenantId === tenantA ? `${rol}-A` : `${rol}-B`] = jwt.sign({ sub: id, tenantId, type: 'tenant' });
    }
    users.ADMIN = users['ADMIN-A']; users.CAJERO = users['CAJERO-A']; users.BODEGUERO = users['BODEGUERO-A'];

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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-clientes-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  it('el cajero encuentra clientes por nombre, RTN, teléfono y número de cliente', async () => {
    const porNombre = await call('get', '/clientes/buscar?q=constructora', 'CAJERO').expect(200);
    expect(porNombre.body.map((c: any) => c.nombre)).toEqual(['Constructora del Norte']);
    const porRtn = await call('get', '/clientes/buscar?q=08019999123456', 'CAJERO').expect(200);
    expect(porRtn.body).toHaveLength(1);
    const porTelefono = await call('get', '/clientes/buscar?q=3311-2244', 'CAJERO').expect(200);
    expect(porTelefono.body.map((c: any) => c.nombre)).toEqual(['Taller San José']);
    const numero = (await call('get', '/clientes/buscar?q=constructora', 'CAJERO').expect(200)).body[0].numeroCliente;
    const porNumero = await call('get', `/clientes/buscar?q=CLI-${String(numero).padStart(6, '0')}`, 'CAJERO').expect(200);
    expect(porNumero.body.map((c: any) => c.nombre)).toEqual(['Constructora del Norte']);
  });

  it('búsqueda vacía devuelve clientes activos para elegir sin escribir', async () => {
    const res = await call('get', '/clientes/buscar', 'CAJERO').expect(200);
    expect(res.body.map((c: any) => c.nombre).sort()).toEqual(['Constructora del Norte', 'Taller San José']);
  });

  it('el cajero recibe solo datos comerciales, sin saldo, límite, correo ni dirección', async () => {
    const res = await call('get', '/clientes/buscar?q=constructora', 'CAJERO').expect(200);
    const cliente = res.body[0];
    expect(Object.keys(cliente).sort()).toEqual(['codigo', 'creditoHabilitado', 'id', 'nombre', 'numeroCliente', 'rtn', 'telefono'].sort());
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('1234.5');
    expect(texto).not.toContain('compras@norte.invalid');
    expect(texto).not.toContain('Col. Centro');
    expect(texto).not.toContain('limiteCredito');
  });

  it('la lista administrativa y el detalle no están disponibles para el cajero', async () => {
    await call('get', '/clientes', 'CAJERO').expect(403);
    const admin = await call('get', '/clientes?limit=5', 'ADMIN').expect(200);
    const id = admin.body[0].id;
    await call('get', `/clientes/${id}`, 'CAJERO').expect(403);
    await call('post', '/clientes', 'CAJERO', { nombre: 'Nuevo' }).expect(403);
    await call('put', `/clientes/${id}`, 'CAJERO', { telefono: '1' }).expect(403);
  });

  it('el bodeguero no busca clientes', async () => {
    await call('get', '/clientes/buscar?q=constructora', 'BODEGUERO').expect(403);
  });

  it('aislamiento: el cajero de otra empresa no encuentra clientes ajenos', async () => {
    const res = await call('get', '/clientes/buscar?q=constructora', 'CAJERO').expect(200);
    expect(res.body.every((c: any) => c.nombre !== 'Constructora Ajena')).toBe(true);
    const otro = await request(app.getHttpServer()).get('/api/clientes/buscar?q=Ajena').auth(users['CAJERO-B'], { type: 'bearer' }).expect(200);
    expect(otro.body.map((c: any) => c.nombre)).toEqual(['Constructora Ajena']);
    const ajeno = await call('get', '/clientes/buscar?q=Ajena', 'CAJERO').expect(200);
    expect(ajeno.body).toEqual([]);
  });

  it('QA-CLI-001 para el administrador: nombre null en edición responde 400', async () => {
    const admin = await call('get', '/clientes?limit=1', 'ADMIN').expect(200);
    await call('put', `/clientes/${admin.body[0].id}`, 'ADMIN', { nombre: null }).expect(400);
    await call('put', `/clientes/${admin.body[0].id}`, 'ADMIN', { nombre: '  ' }).expect(400);
  });
});
