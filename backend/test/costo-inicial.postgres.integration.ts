import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';

import { PrismaService } from '../src/prisma/prisma.service';
import { CostoInicialController } from '../src/productos/costo-inicial.controller';
import { CostoInicialService } from '../src/productos/costo-inicial.service';

import { OperacionesService } from '../src/operaciones/operaciones.service';

// Inicialización por HTTP y JWT real, cadena completa de migraciones y clúster local exclusivo.
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL.
describe('Costo inicial / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;
  let tenantId: string, otherTenantId: string;
  const users: Record<string, { id: string; token: string }> = {};
  const call = (method: 'get' | 'post' | 'put' | 'delete', path: string, body = {}, role = 'ADMIN') =>
    request(app.getHttpServer())[method](`/api${path}`).auth(users[role].token, { type: 'bearer' }).send(body);
  let costos: CostoInicialService;
  const fila = (id: string) => prisma.producto.findUniqueOrThrow({ where: { id } });
  const producto = (data: any = {}) => prisma.producto.create({ data: {
    tenantId, codigo: randomUUID(), nombre: 'Inventario inicial', precioCosto: 8,
    precioVenta: 12, stockActual: 40, stockReservado: 2, stockMinimo: 5,
    unidadMedida: 'METRO', ...data,
  } });
  const body = (extra: any = {}) => ({ solicitudId: randomUUID(), version: 1, costo: 8, motivo: 'Conteo y costo de referencia revisados por ADMIN', ...extra });
  const inicializar = (id: string, dto = body(), role = 'ADMIN') => call('post', `/productos/${id}/costo-inicial`, dto, role);
  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const auditoria = (id: string) => sql("SELECT usuario_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='COSTO_INICIALIZAR' AND entidad_id=$2", tenantId, id);
  const conteos = async () => {
    const result: Record<string, number> = {};
    for (const table of ['movimientos_inventario', 'cuentas_operativas', 'ordenes_compra', 'recepciones_compra', 'costos_compra', 'movimientos_caja', 'ventas']) {
      result[table] = Number((await sql(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
    }
    return result;
  };

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-costo-inicial-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // URL generada localmente. No ejecutar wrappers de migración contra un entorno externo.
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { ...options, timeout: 60000 });
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [CostoInicialController],
      providers: [CostoInicialService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
      ],
    }).compile();
    costos = module.get(CostoInicialService);
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 120000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-costo-inicial-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Edición de productos' } });
    for (const rol of ['ADMIN', 'BODEGUERO', 'CAJERO', 'VENDEDOR'] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol, permisosConfigurados: true, permisos: ['inventario.editar', 'inventario.ver'] } });
      users[rol] = { id, token: jwt.sign({ sub: id, tenantId, type: 'tenant' }) };
    }
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: otherTenantId, nombre: 'Ajeno', email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol: 'ADMIN' } });
    users.OTHER = { id, token: jwt.sign({ sub: id, tenantId: otherTenantId, type: 'tenant' }) };
  });

  it.each([null, 0])('inicializa costo %s sin movimientos, CxP ni cambios de stock/precio/fecha', async costoVigente => {
    const p = await producto({ costoVigente });
    const antes = await conteos();
    const dto = body({ costo: 9.25 });
    const response = await inicializar(p.id, dto).expect(201);
    expect(response.body).toMatchObject({ id: p.id, costoVigente: 9.25, precioCosto: 9.25, version: 2 });
    const despues = await fila(p.id);
    expect(Number(despues.costoVigente)).toBe(9.25);
    expect(Number(despues.precioCosto)).toBe(9.25);
    for (const field of ['stockActual', 'stockReservado', 'stockMinimo', 'precioVenta', 'unidadMedida', 'ultimaCompraAt', 'activo'] as const) {
      expect(despues[field]).toEqual(p[field]);
    }
    // Campos del candidato: la inicialización no cambia ni concede aprobación de precios.
    for (const field of ['precioAprobado', 'precioAprobadoPor', 'precioAprobadoAt']) {
      expect((despues as any)[field]).toEqual((p as any)[field]);
    }
    expect(await conteos()).toEqual(antes);
    const [a] = await auditoria(p.id);
    expect(a.usuario_id).toBe(users.ADMIN.id);
    expect(a.datos).toMatchObject({ solicitudId: dto.solicitudId, motivo: dto.motivo,
      anterior: { costoVigente, precioCosto: 8, version: 1 }, resultado: response.body });
  });

  it.each(['BODEGUERO', 'CAJERO', 'VENDEDOR'])('deniega %s aun con permisos de inventario, por HTTP y servicio', async role => {
    const p = await producto();
    await inicializar(p.id, body(), role).expect(403);
    await expect(costos.inicializar(tenantId, p.id, body(), users[role].id)).rejects.toThrow('rol');
    expect((await fila(p.id)).costoVigente).toBeNull();
    expect(await auditoria(p.id)).toHaveLength(0);
  });

  it('aísla empresas y rechaza usuario revocado usando el mismo JWT', async () => {
    const p = await producto();
    await inicializar(p.id, body(), 'OTHER').expect(404);
    await expect(costos.inicializar(tenantId, p.id, body(), users.OTHER.id)).rejects.toThrow('Usuario');
    await prisma.usuario.update({ where: { id: users.ADMIN.id }, data: { rol: 'BODEGUERO' } });
    await inicializar(p.id).expect(403);
    expect((await fila(p.id)).costoVigente).toBeNull();
  });

  it.each([{ costo: 0 }, { costo: -1 }, { costo: 1.001 }, { costo: '8' }, { costo: null }, { costo: 10000000000 },
    { version: 0 }, { version: null }, { solicitudId: 'x' }, { motivo: '   ' }, { motivo: 'x'.repeat(501) }])('rechaza entrada inválida %j', async extra => {
    const p = await producto();
    await inicializar(p.id, body(extra)).expect(400);
    expect((await fila(p.id)).costoVigente).toBeNull();
    expect(await auditoria(p.id)).toHaveLength(0);
  });

  it('rechaza versión antigua, producto inactivo y costo positivo existente', async () => {
    for (const data of [{ version: 2 }, { activo: false }, { costoVigente: 8 }]) {
      const p = await producto(data);
      await inicializar(p.id).expect(409);
      expect(await fila(p.id)).toEqual(p);
      expect(await auditoria(p.id)).toHaveLength(0);
    }
  });

  it('reintentos y concurrencia con la misma solicitud dejan una sola auditoría', async () => {
    const p = await producto(); const dto = body();
    const responses = await Promise.all(Array.from({ length: 5 }, () => inicializar(p.id, dto)));
    expect(responses.map(r => r.status)).toEqual([201, 201, 201, 201, 201]);
    for (const r of responses) expect(r.body).toEqual(responses[0].body);
    expect((await fila(p.id)).version).toBe(2);
    expect(await auditoria(p.id)).toHaveLength(1);
    await inicializar(p.id, { ...dto, costo: 10 }).expect(409);
    const otro = await producto();
    await inicializar(otro.id, dto).expect(409);
  });

  it('dos solicitudes distintas concurrentes no sobrescriben el costo inicial', async () => {
    const p = await producto();
    const responses = await Promise.all([inicializar(p.id, body({ costo: 8 })), inicializar(p.id, body({ costo: 9 }))]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await auditoria(p.id)).toHaveLength(1);
  });

  it('la primera compra real posterior fija el costo y el reintento no lo revierte', async () => {
    const p = await producto(); const dto = body();
    const original = (await inicializar(p.id, dto).expect(201)).body;
    const ops = new OperacionesService(prisma);
    const proveedor = await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor de prueba' } });
    const orden = await ops.compra(tenantId, users.ADMIN.id, { solicitudId: randomUUID(), proveedorId: proveedor.id,
      numeroFactura: 'PRUEBA-COMPRA', isv: 0, items: [{ productoId: p.id, cantidad: 3, costo: 6 }] });
    const [linea] = await sql('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', orden.id);
    await ops.recibir(tenantId, users.ADMIN.id, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 3 }] });
    const recibido = await fila(p.id);
    expect(Number(recibido.costoVigente)).toBe(6);
    expect(Number(recibido.precioCosto)).toBe(6);
    expect(Number(recibido.stockActual)).toBe(43);
    expect(recibido.ultimaCompraAt).not.toBeNull();
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP' } })).toBe(1);
    expect((await inicializar(p.id, dto).expect(201)).body).toEqual(original);
    expect(await fila(p.id)).toEqual(recibido);
    await inicializar(p.id, body({ version: recibido.version })).expect(409);
    // Incluso si una inconsistencia antigua dejó fecha nula y costo cero, el historial de compra lo impide.
    await prisma.producto.update({ where: { id: p.id }, data: { ultimaCompraAt: null, costoVigente: 0 } });
    await inicializar(p.id, body({ version: recibido.version })).expect(409);
  });

  it('una recepción concurrente no permite que la inicialización borre su costo', async () => {
    const p = await producto(); const ops = new OperacionesService(prisma);
    const proveedor = await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor concurrente' } });
    const orden = await ops.compra(tenantId, users.ADMIN.id, { solicitudId: randomUUID(), proveedorId: proveedor.id,
      numeroFactura: 'CONCURRENTE', isv: 0, items: [{ productoId: p.id, cantidad: 1, costo: 6 }] });
    const [linea] = await sql('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', orden.id);
    const [inicio] = await Promise.all([inicializar(p.id), ops.recibir(tenantId, users.ADMIN.id, orden.id,
      { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 1 }] })]);
    expect([201, 409]).toContain(inicio.status);
    expect(Number((await fila(p.id)).costoVigente)).toBe(6);
    expect(Number((await fila(p.id)).stockActual)).toBe(41);
  });

  it('un fallo de auditoría revierte costo y versión en la misma transacción', async () => {
    const p = await producto();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION rechazar_costo_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operacion='COSTO_INICIALIZAR' THEN RAISE EXCEPTION 'audit failure test'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fallo_costo BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION rechazar_costo_audit()');
    try {
      await expect(costos.inicializar(tenantId, p.id, body(), users.ADMIN.id)).rejects.toThrow();
      expect(await fila(p.id)).toEqual(p);
      expect(await auditoria(p.id)).toHaveLength(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fallo_costo ON auditoria_operaciones');
      await prisma.$executeRawUnsafe('DROP FUNCTION rechazar_costo_audit()');
    }
  });
});
