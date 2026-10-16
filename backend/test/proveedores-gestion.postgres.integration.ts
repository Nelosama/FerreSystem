import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProveedoresController } from '../src/proveedores/proveedores.controller';
import { ProveedoresService } from '../src/proveedores/proveedores.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

// JW-08: edición, RTN, desactivación y reactivación de proveedores contra PostgreSQL real (clúster temporal y
// cadena completa de migraciones). HTTP con los guards reales de empresa y rol; solo se sustituye la firma del JWT.
// Nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Proveedores: edición y desactivación / HTTP y PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let tenantId: string;
  let usuarioId: string;
  let rolPrueba = 'ADMIN';

  const http = (method: 'get' | 'patch' | 'delete', path: string, body?: unknown) =>
    request(app.getHttpServer())[method](path).send(body as object);
  const auditorias = (entidadId: string) => prisma.auditoriaOperacion.findMany({ where: { tenantId, entidadId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-proveedores-'));
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
    const module = await Test.createTestingModule({
      controllers: [ProveedoresController],
      providers: [ProveedoresService, { provide: PrismaService, useValue: prisma }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: any) {
        context.switchToHttp().getRequest().user = { sub: usuarioId, tenantId, type: 'tenant', rol: rolPrueba };
        return true;
      },
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 120000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-proveedores-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    rolPrueba = 'ADMIN';
    tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Proveedores de prueba' } });
    usuarioId = (await prisma.usuario.create({ data: { tenantId, nombre: 'Admin', email: `${randomUUID()}@example.test`, passwordHash: 'x', rol: 'ADMIN' } })).id;
  });

  const proveedor = () => prisma.proveedor.create({ data: { tenantId, nombre: 'Distribuidora Norte', telefono: '9999-0000' } });

  it('ADMIN edita nombre, RTN, teléfono y dirección; queda auditado con valores anterior y nuevo', async () => {
    const p = await proveedor();
    const r = await http('patch', `/proveedores/${p.id}`, { nombre: '  Distribuidora del Norte  ', rtn: ' 0801-1999-000123 ', direccion: 'Barrio El Centro' }).expect(200);
    expect(r.body).toMatchObject({ nombre: 'Distribuidora del Norte', rtn: '0801-1999-000123', direccion: 'Barrio El Centro', telefono: '9999-0000', activo: true });
    expect(await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ nombre: 'Distribuidora del Norte', rtn: '0801-1999-000123' });
    const [a] = await auditorias(p.id);
    expect(a).toMatchObject({ operacion: 'PROVEEDOR_EDITAR', usuarioId });
    expect(a.datos).toMatchObject({ anterior: { nombre: 'Distribuidora Norte', rtn: null }, nuevo: { nombre: 'Distribuidora del Norte', rtn: '0801-1999-000123' } });
  });

  it('una cadena vacía borra un dato opcional; un nombre vacío, un correo inválido o activo=false se rechazan sin cambios', async () => {
    const p = await proveedor();
    await http('patch', `/proveedores/${p.id}`, { telefono: '' }).expect(200);
    expect((await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).telefono).toBeNull();
    await http('patch', `/proveedores/${p.id}`, { nombre: '   ' }).expect(400);
    await http('patch', `/proveedores/${p.id}`, { email: 'no-es-correo' }).expect(400);
    await http('patch', `/proveedores/${p.id}`, { activo: false }).expect(400);
    expect(await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ nombre: 'Distribuidora Norte', activo: true });
  });

  it('desactivar es idempotente y se audita una vez; el proveedor desactivado se lista a pedido y se reactiva', async () => {
    const p = await proveedor();
    await http('delete', `/proveedores/${p.id}`).expect(200);
    await http('delete', `/proveedores/${p.id}`).expect(200);
    expect((await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).activo).toBe(false);
    expect((await http('get', '/proveedores').expect(200)).body.map((x: any) => x.id)).not.toContain(p.id);
    expect((await http('get', '/proveedores?incluirInactivos=true').expect(200)).body.map((x: any) => x.id)).toContain(p.id);
    // Antes respondía 404: un proveedor desactivado no se podía corregir ni reactivar.
    await http('patch', `/proveedores/${p.id}`, { activo: true, rtn: '08011999000123' }).expect(200);
    expect(await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ activo: true, rtn: '08011999000123' });
    expect((await auditorias(p.id)).map((a) => a.operacion)).toEqual(['PROVEEDOR_DESACTIVAR', 'PROVEEDOR_REACTIVAR']);
  });

  it('CAJERO, BODEGUERO y VENDEDOR no editan ni desactivan proveedores', async () => {
    const p = await proveedor();
    for (const rol of ['CAJERO', 'BODEGUERO', 'VENDEDOR']) {
      rolPrueba = rol;
      await http('patch', `/proveedores/${p.id}`, { nombre: 'Cambio indebido' }).expect(403);
      await http('delete', `/proveedores/${p.id}`).expect(403);
    }
    expect(await prisma.proveedor.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ nombre: 'Distribuidora Norte', activo: true });
    expect(await auditorias(p.id)).toHaveLength(0);
  });

  it('el proveedor de otra empresa no se lee, edita ni desactiva (404) y no cambia', async () => {
    const otraEmpresa = await prisma.tenant.create({ data: { nombreComercial: 'Otra empresa' } });
    const ajeno = await prisma.proveedor.create({ data: { tenantId: otraEmpresa.id, nombre: 'Proveedor ajeno' } });
    await http('get', `/proveedores/${ajeno.id}`).expect(404);
    await http('patch', `/proveedores/${ajeno.id}`, { nombre: 'Intrusión' }).expect(404);
    await http('delete', `/proveedores/${ajeno.id}`).expect(404);
    expect(await prisma.proveedor.findUniqueOrThrow({ where: { id: ajeno.id } })).toMatchObject({ nombre: 'Proveedor ajeno', activo: true });
  });
});
