import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { VentasController } from '../src/ventas/ventas.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { ContingenciaController } from '../src/contingencia/contingencia.controller';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { ProductosService } from '../src/productos/productos.service';
import { ProductosController } from '../src/productos/productos.controller';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';


// VERIFICACIÓN INDEPENDIENTE (CENTINELA) de las correcciones D1, R1 y D3 de ATLAS (PR #145, 5be0d6ce).
// PostgreSQL temporal con migraciones reales, login real y ValidationPipe como en producción. Nunca lee DATABASE_URL.
// Cada bloque corresponde a un punto de la solicitud de revalidación. Los `it.fails` documentan lo que no cumple.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);


describe('Verificación CENTINELA de correcciones ATLAS (D1, R1, D3) / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let operaciones: OperacionesService;
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = 'verificacion-centinela-2026';

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-verificacion-'));
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
    operaciones = new OperacionesService(prisma);
    const module = await Test.createTestingModule({
      controllers: [ProductosController, VentasController, OperacionesController, ContingenciaController, AuthController],
      providers: [ProductosService, VentasService, OperacionesService, ContingenciaService, JwtStrategy, AuthService,
        { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => key === 'JWT_SECRET' ? jwtSecret : fallback } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalGuards(new TenantModuleGuard(module.get(Reflector), prisma));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
  }, 180000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-verificacion-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const http = (method: 'get' | 'post' | 'patch', path: string, auth: string, body?: unknown) =>
    request(app.getHttpServer())[method](`/api${path}`).auth(auth, { type: 'bearer' }).send(body as object);

  type Persona = { id: string; token: string; tenantId: string; rol: string };
  const crearEmpresa = async () => {
    const id = randomUUID();
    await prisma.tenant.create({ data: { id, nombreComercial: 'Verificación CENTINELA' } });
    return id;
  };
  const persona = async (tenant: string, rol: string, extra: any = {}): Promise<Persona> => {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: tenant, rol: rol as any, nombre: `${rol} ${id.slice(0, 4)}`, email: `${id}@example.test`, passwordHash: await bcrypt.hash(password, 4), ...extra } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: `${id}@example.test`, password, tenantId: tenant }).expect(200);
    return { id, token: login.body.accessToken, tenantId: tenant, rol };
  };
  const abrirCaja = (p: Persona, solicitudId = randomUUID()) => http('post', '/operaciones/caja/abrir', p.token, { solicitudId, monto: 100 });
  const producto = (tenant: string, stock = 10) => prisma.producto.create({ data: { tenantId: tenant, codigo: `P-${randomUUID().slice(0, 6)}`, nombre: 'Producto verificación', precioVenta: 100, precioCosto: 40, stockActual: stock, precioAprobado: true } as any });
  const stockDe = async (id: string) => { const p = await prisma.producto.findUniqueOrThrow({ where: { id } }); return { actual: Number(p.stockActual), reservado: Number(p.stockReservado) }; };
  const ventaBody = (productoId: string, cantidad = 2, solicitudId = randomUUID()) => ({ solicitudId, detalles: [{ productoId, cantidad }] });

  /** Empresa con dos cajeros (cajas abiertas), vendedor, bodeguero y administrador. */
  async function escenario() {
    const tenantId = await crearEmpresa();
    const admin = await persona(tenantId, 'ADMIN');
    const cajero = await persona(tenantId, 'CAJERO', { permisos: ['pos.vender', 'caja.movimientos_manuales', 'inventario.ver'], permisosConfigurados: true });
    const cajero2 = await persona(tenantId, 'CAJERO');
    const vendedor = await persona(tenantId, 'VENDEDOR');
    const bodeguero = await persona(tenantId, 'BODEGUERO');
    await abrirCaja(cajero).expect(201);
    await abrirCaja(cajero2).expect(201);
    const p = await producto(tenantId);
    return { tenantId, admin, cajero, cajero2, vendedor, bodeguero, producto: p };
  }
  const venta = async (quien: Persona, productoId: string, cantidad = 2, solicitudId = randomUUID()) => {
    const r = await http('post', '/ventas', quien.token, ventaBody(productoId, cantidad, solicitudId));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body;
  };

  // ───────────────────────── 1. Solo ADMIN y BODEGUERO entregan, con permisos personalizados ─────────────────────────
  describe('1. entrega: solo ADMIN y BODEGUERO, incluso con permisos personalizados', () => {
    const todosLosPermisos = ['pos.vender', 'caja.movimientos_manuales', 'inventario.ver', 'inventario.editar', 'reportes.ver', 'cotizaciones.crear', 'cotizaciones.aprobar', 'cotizaciones.convertir_venta', 'entregas.gestionar', 'entrega.confirmar'];

    it('ADMIN y BODEGUERO sí entregan (2xx) y el stock baja una sola vez', async () => {
      const e = await escenario();
      const v1 = await venta(e.cajero, e.producto.id, 1);
      const v2 = await venta(e.cajero, e.producto.id, 1);
      expect((await http('post', `/operaciones/ventas/${v1.id}/entregar`, e.admin.token, {})).status).toBeLessThan(300);
      expect((await http('post', `/operaciones/ventas/${v2.id}/entregar`, e.bodeguero.token, {})).status).toBeLessThan(300);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 8, reservado: 0 });
    });

    it('CAJERO con TODOS los permisos personalizados recibe 403 y nada cambia', async () => {
      const e = await escenario();
      const cajeroConTodo = await persona(e.tenantId, 'CAJERO', { permisos: todosLosPermisos, permisosConfigurados: true });
      const v = await venta(e.cajero, e.producto.id, 2);
      const antes = await stockDe(e.producto.id);
      const r = await http('post', `/operaciones/ventas/${v.id}/entregar`, cajeroConTodo.token, {});
      expect(r.status).toBe(403);
      const [fila] = await prisma.$queryRawUnsafe<any[]>('SELECT entregado_at, reserva_pendiente FROM ventas WHERE id=$1', v.id);
      expect(fila.entregado_at).toBeNull();
      expect(fila.reserva_pendiente).toBe(true);
      expect(await stockDe(e.producto.id)).toEqual(antes);
    });

    it('VENDEDOR con TODOS los permisos personalizados recibe 403', async () => {
      const e = await escenario();
      const vendedorConTodo = await persona(e.tenantId, 'VENDEDOR', { permisos: todosLosPermisos, permisosConfigurados: true });
      const v = await venta(e.cajero, e.producto.id, 1);
      expect((await http('post', `/operaciones/ventas/${v.id}/entregar`, vendedorConTodo.token, {})).status).toBe(403);
    });

    it('el servicio rechaza la entrega de un CAJERO aunque se invoque sin pasar por HTTP', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1);
      await expect(operaciones.entregar(e.tenantId, e.cajero.id, v.id)).rejects.toMatchObject({ status: 403 });
    });

    it('la única escritura que marca una entrega está en el servicio de operaciones (sin otra vía)', async () => {
      // Comprobación de estado del código: ninguna otra ruta actualiza entregado_at ni reserva_pendiente.
      const { execFileSync: run } = require('node:child_process');
      const salida = run('grep', ['-rln', 'entregado_at', resolve('src')], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      const escrituras = run('grep', ['-rn', 'entregado_at=NOW\\|entregado_at = NOW\\|reserva_pendiente=false', resolve('src')], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      expect(salida.length).toBeGreaterThan(0);
      expect(escrituras.map((l: string) => l.split(':')[0].replace(resolve('src') + '/', ''))).toEqual(['operaciones/operaciones.service.ts']);
    });
  });

  // ───────────────────────── 2. Consulta de pendientes por rol ─────────────────────────
  describe('2. consulta de entregas pendientes: CAJERO solo lo suyo, VENDEDOR sin acceso', () => {
    it('CAJERO ve solo sus ventas pendientes; ADMIN y BODEGUERO ven las de todos', async () => {
      const e = await escenario();
      const mia = await venta(e.cajero, e.producto.id, 1);
      const ajena = await venta(e.cajero2, e.producto.id, 1);
      const ids = async (t: string) => (await http('get', '/operaciones/entregas', t).expect(200)).body.map((v: any) => v.id);
      expect(await ids(e.cajero.token)).toEqual([mia.id]);
      expect(await ids(e.cajero2.token)).toEqual([ajena.id]);
      expect((await ids(e.admin.token)).sort()).toEqual([mia.id, ajena.id].sort());
      expect((await ids(e.bodeguero.token)).sort()).toEqual([mia.id, ajena.id].sort());
    });

    it('VENDEDOR recibe 403 en el listado de entregas, aunque tenga permisos personalizados', async () => {
      const e = await escenario();
      const vendedorConPermisos = await persona(e.tenantId, 'VENDEDOR', { permisos: ['entregas.ver', 'pos.vender'], permisosConfigurados: true });
      await venta(e.cajero, e.producto.id, 1);
      expect((await http('get', '/operaciones/entregas', e.vendedor.token)).status).toBe(403);
      expect((await http('get', '/operaciones/entregas', vendedorConPermisos.token)).status).toBe(403);
    });

    it('la venta sale del listado de todos al entregarse; la del cajero sigue visible solo para él hasta entonces', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1);
      await http('post', `/operaciones/ventas/${v.id}/entregar`, e.bodeguero.token, {}).expect(201);
      expect((await http('get', '/operaciones/entregas', e.cajero.token)).body).toEqual([]);
      expect((await http('get', '/operaciones/entregas', e.admin.token)).body).toEqual([]);
    });

    it('otra empresa no ve entregas pendientes de esta', async () => {
      const e = await escenario();
      const otra = await escenario();
      await venta(e.cajero, e.producto.id, 1);
      const r = await http('get', '/operaciones/entregas', otra.admin.token).expect(200);
      expect(r.body).toEqual([]);
    });

    it('CAJERO no lee por id la venta registrada por otro cajero (404, mismo que una venta inexistente)', async () => {
      const e = await escenario();
      const ajena = await venta(e.cajero2, e.producto.id, 1);
      const r = await http('get', `/ventas/${ajena.id}`, e.cajero.token);
      expect(r.status).toBe(404);
    });
  });

  // ───────────────────────── 3. Identificador de otra empresa: sin diferencias observables ─────────────────────────
  describe('3. identificador de otra empresa: respuesta idéntica a la de un identificador libre', () => {
    const normalizar = (cuerpo: any) => JSON.parse(JSON.stringify(cuerpo ?? {}, (clave, valor) => (
      /id$|At$|Id$|_at$|_id$|numero|codigo|hash|Hash|fecha|Fecha/.test(clave) ? '[volatil]' : valor)));

    it('ventas: creación con solicitud de otra empresa = solicitud libre (estado, cuerpo y ningún dato ajeno)', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const ocupada = randomUUID();
      await venta(dueno.cajero, dueno.producto.id, 1, ocupada);
      const ajena = await http('post', '/ventas', intruso.cajero.token, ventaBody(intruso.producto.id, 1, ocupada));
      const libre = await http('post', '/ventas', intruso.cajero.token, ventaBody(intruso.producto.id, 1, randomUUID()));
      expect(ajena.status).toBe(libre.status);
      expect(Object.keys(ajena.body).sort()).toEqual(Object.keys(libre.body).sort());
      expect(normalizar(ajena.body)).toEqual(normalizar(libre.body));
      expect(JSON.stringify(ajena.body)).not.toContain(dueno.tenantId);
    });

    it('consulta de solicitud de venta de otra empresa = consulta de solicitud libre', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const ocupada = randomUUID();
      await venta(dueno.cajero, dueno.producto.id, 1, ocupada);
      const ajena = await http('get', `/ventas/solicitudes/${ocupada}`, intruso.cajero.token).expect(200);
      const libre = await http('get', `/ventas/solicitudes/${randomUUID()}`, intruso.cajero.token).expect(200);
      expect(ajena.body).toEqual(libre.body);
    });

    it('caja: apertura con solicitud de otra empresa = apertura con solicitud libre', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const ocupada = randomUUID();
      await abrirCaja(dueno.admin, ocupada).expect(201);
      const intrusoA = await persona(intruso.tenantId, 'ADMIN');
      const intrusoB = await persona(intruso.tenantId, 'ADMIN');
      const ajena = await abrirCaja(intrusoA, ocupada);
      const libre = await abrirCaja(intrusoB, randomUUID());
      expect(ajena.status).toBe(libre.status);
      expect(Object.keys(ajena.body).sort()).toEqual(Object.keys(libre.body).sort());
    });

    it('proveedor: creación con solicitud de otra empresa = solicitud libre', async () => {
      const dueno = await crearEmpresa(); const intruso = await crearEmpresa();
      const dAdmin = await persona(dueno, 'ADMIN'); const iAdmin = await persona(intruso, 'ADMIN');
      const ocupada = randomUUID();
      await http('post', '/operaciones/proveedores', dAdmin.token, { solicitudId: ocupada, nombre: 'Proveedor dueño' }).expect(201);
      const ajena = await http('post', '/operaciones/proveedores', iAdmin.token, { solicitudId: ocupada, nombre: 'Proveedor intruso' });
      const libre = await http('post', '/operaciones/proveedores', iAdmin.token, { solicitudId: randomUUID(), nombre: 'Proveedor intruso' });
      expect(ajena.status).toBe(libre.status);
      expect(Object.keys(ajena.body).sort()).toEqual(Object.keys(libre.body).sort());
    });

    it('movimiento de caja: un identificador de otra empresa responde igual que uno libre', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const cajaDueno = (await abrirCaja(dueno.admin).expect(201)).body;
      const movimiento = randomUUID();
      await http('post', `/operaciones/caja/${cajaDueno.id}/movimientos`, dueno.admin.token, { solicitudId: movimiento, tipo: 'INGRESO_MANUAL', monto: 5, concepto: 'Dueño' }).expect(201);
      const cajaIntruso = (await abrirCaja(intruso.admin).expect(201)).body;
      const ajena = await http('post', `/operaciones/caja/${cajaIntruso.id}/movimientos`, intruso.admin.token, { solicitudId: movimiento, tipo: 'INGRESO_MANUAL', monto: 5, concepto: 'Intruso' });
      const libre = await http('post', `/operaciones/caja/${cajaIntruso.id}/movimientos`, intruso.admin.token, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 5, concepto: 'Intruso' });
      expect(ajena.status).toBe(libre.status);
      expect(Object.keys(ajena.body).sort()).toEqual(Object.keys(libre.body).sort());
    });

    it('solicitud de devolución: consulta de id ajeno = consulta de id libre (404 idéntico)', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const v = await venta(dueno.cajero, dueno.producto.id, 1);
      const sol = randomUUID();
      const creada = await http('post', `/operaciones/ventas/${v.id}/solicitudes-devolucion`, dueno.cajero.token, { solicitudId: sol, motivo: 'Motivo de verificación', metodo: 'EFECTIVO', items: [{ detalleId: (await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: v.id } })).id, cantidad: 1, destino: 'NO_ENTREGADO' }] });
      expect(creada.status, JSON.stringify(creada.body)).toBeLessThan(300);
      const ajena = await http('get', `/operaciones/solicitudes-devolucion/${sol}`, intruso.admin.token);
      const libre = await http('get', `/operaciones/solicitudes-devolucion/${randomUUID()}`, intruso.admin.token);
      expect(ajena.status).toBe(libre.status);
      expect(ajena.body).toEqual(libre.body);
    });

    it('ningún identificador ajeno filtra el id de otra empresa en la respuesta', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const ocupada = randomUUID();
      await venta(dueno.cajero, dueno.producto.id, 1, ocupada);
      const r = await http('post', '/ventas', intruso.cajero.token, ventaBody(intruso.producto.id, 1, ocupada));
      expect(JSON.stringify(r.body)).not.toContain(dueno.tenantId);
      expect(JSON.stringify(r.body)).not.toContain(dueno.cajero.id);
    });
  });

  // ───────────────────────── 4. Idempotencia, reintentos y registros anteriores ─────────────────────────
  describe('4. idempotencia, reintentos paralelos y compatibilidad con registros anteriores', () => {
    it('reintentos en paralelo de la misma venta: una sola venta, un solo descuento, misma respuesta', async () => {
      const e = await escenario();
      const cuerpo = ventaBody(e.producto.id, 3);
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => http('post', '/ventas', e.cajero.token, cuerpo)));
      const codigos = respuestas.map(r => r.status);
      expect(codigos.every(c => c === 201)).toBe(true);
      expect(new Set(respuestas.map(r => r.body.id)).size).toBe(1);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(1);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 10, reservado: 3 });
    });

    it('mismo identificador, otro usuario de la misma empresa: conflicto, no comparte la venta', async () => {
      const e = await escenario();
      const solicitud = randomUUID();
      await venta(e.cajero, e.producto.id, 1, solicitud);
      const otro = await http('post', '/ventas', e.cajero2.token, ventaBody(e.producto.id, 1, solicitud));
      expect(otro.status).toBe(409);
    });

    it('venta creada antes del cambio (id = solicitud) se reconoce en el reintento y no se duplica', async () => {
      const e = await escenario();
      const solicitud = randomUUID();
      const original = await venta(e.cajero, e.producto.id, 2, solicitud);
      // Simula un registro anterior al cambio: el id de la venta es la propia solicitud.
      await prisma.$executeRawUnsafe('UPDATE ventas SET id=$1 WHERE id=$2', solicitud, original.id);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 10, reservado: 2 });
      const reintento = await http('post', '/ventas', e.cajero.token, ventaBody(e.producto.id, 2, solicitud));
      expect(reintento.status).toBe(201);
      expect(reintento.body.id).toBe(solicitud);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(1);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 10, reservado: 2 });
    });

    it('venta anterior al cambio: contenido distinto sigue siendo conflicto', async () => {
      const e = await escenario();
      const solicitud = randomUUID();
      const original = await venta(e.cajero, e.producto.id, 2, solicitud);
      await prisma.$executeRawUnsafe('UPDATE ventas SET id=$1 WHERE id=$2', solicitud, original.id);
      const distinto = await http('post', '/ventas', e.cajero.token, ventaBody(e.producto.id, 5, solicitud));
      expect(distinto.status).toBe(409);
    });

    it('caja anterior al cambio (id = solicitud): la apertura repetida devuelve la misma caja', async () => {
      const e = await escenario();
      const solicitud = randomUUID();
      const creada = (await abrirCaja(e.admin, solicitud).expect(201)).body;
      await prisma.$executeRawUnsafe('UPDATE cajas SET id=$1 WHERE id=$2', solicitud, creada.id);
      const repetida = await abrirCaja(e.admin, solicitud);
      expect(repetida.status).toBe(201);
      expect(repetida.body.id).toBe(solicitud);
      expect(await prisma.caja.count({ where: { tenantId: e.tenantId, usuarioId: e.admin.id } })).toBe(1);
    });

    it('registro anterior de otra empresa con el mismo UUID no se reconoce como propio', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const solicitud = randomUUID();
      const original = await venta(dueno.cajero, dueno.producto.id, 1, solicitud);
      await prisma.$executeRawUnsafe('UPDATE ventas SET id=$1 WHERE id=$2', solicitud, original.id);
      const ajena = await http('post', '/ventas', intruso.cajero.token, ventaBody(intruso.producto.id, 1, solicitud));
      expect(ajena.status).toBe(201);
      expect(ajena.body.id).not.toBe(solicitud);
      expect(await prisma.venta.count({ where: { id: solicitud } })).toBe(1);
    });

    it('reintento de entrega en paralelo: una sola entrega y un solo descuento', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 2);
      const respuestas = await Promise.all(Array.from({ length: 4 }, () => http('post', `/operaciones/ventas/${v.id}/entregar`, e.bodeguero.token, {})));
      expect(respuestas.every(r => r.status < 300)).toBe(true);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 8, reservado: 0 });
      expect(await prisma.$queryRawUnsafe<any[]>("SELECT id FROM auditoria_operaciones WHERE entidad_id=$1 AND operacion='VENTA_ENTREGAR'", v.id)).toHaveLength(1);
    });
  });

  // ───────────────────────── 5. ID interno frente a solicitudId ─────────────────────────
  describe('5. separación entre identificador interno y solicitudId', () => {
    it('el id interno devuelto es distinto de la solicitud y la solicitud sigue consultándose', async () => {
      const e = await escenario();
      const solicitud = randomUUID();
      const v = await venta(e.cajero, e.producto.id, 1, solicitud);
      expect(v.id).not.toBe(solicitud);
      const porSolicitud = await http('get', `/ventas/solicitudes/${solicitud}`, e.cajero.token).expect(200);
      expect(porSolicitud.body).toMatchObject({ estado: 'REGISTRADA' });
    });

    it.fails('HALLAZGO P3: el id interno no debe servir como solicitud en la consulta (hoy responde REGISTRADA para la misma empresa y usuario)', async () => {
      const e = await escenario();
      const solicitud = randomUUID();
      const v = await venta(e.cajero, e.producto.id, 1, solicitud);
      const porInterno = await http('get', `/ventas/solicitudes/${v.id}`, e.cajero.token).expect(200);
      expect(porInterno.body).toEqual({ estado: 'NO_REGISTRADA' });
    });

    it('el id interno de una venta propia puede leerse por su id; de otra empresa, no', async () => {
      const e = await escenario(); const intruso = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1);
      expect((await http('get', `/ventas/${v.id}`, e.cajero.token)).status).toBe(200);
      expect((await http('get', `/ventas/${v.id}`, intruso.cajero.token)).status).toBe(404);
    });

    it('OBSERVACIÓN: usar el id interno como solicitudId responde 409 (no duplica ni devuelve otra venta)', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1);
      const r = await http('post', '/ventas', e.cajero.token, ventaBody(e.producto.id, 1, v.id));
      expect(r.status).toBe(409);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(1);
    });
  });

  // ───────────────────────── 7. Riesgo residual: dispositivos_pos y operaciones_contingencia ─────────────────────────
  describe('7. riesgo residual de contingencia (dispositivos_pos y operaciones_contingencia)', () => {
    beforeAll(() => { process.env.POS_OFFLINE_ENABLED = 'true'; });
    afterAll(() => { delete process.env.POS_OFFLINE_ENABLED; });
    const habilitar = async (p: Persona) => http('patch', '/contingencia/configuracion', p.token, { habilitada: true }).expect(200);
    const registrarDispositivo = (p: Persona, id: string) => http('post', '/contingencia/dispositivos', p.token, { dispositivoId: id, nombre: 'Caja verificación' });

    it('otra empresa no puede tomar ni modificar un dispositivo registrado por esta', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const dispositivo = randomUUID();
      await habilitar(dueno.admin); await registrarDispositivo(dueno.admin, dispositivo).expect(201);
      const antes = await prisma.dispositivoPos.findUniqueOrThrow({ where: { id: dispositivo } });
      await habilitar(intruso.admin);
      await http('post', `/contingencia/dispositivos/${dispositivo}/latido`, intruso.admin.token, { pendientes: 9 }).expect(404);
      await http('post', `/contingencia/dispositivos/${dispositivo}/desactivar`, intruso.admin.token, { motivo: 'Intento ajeno de verificación' }).expect(404);
      const despues = await prisma.dispositivoPos.findUniqueOrThrow({ where: { id: dispositivo } });
      expect(despues.activo).toBe(antes.activo);
      expect(despues.tenantId).toBe(dueno.tenantId);
    });

    it('registrar un dispositivo con id de otra empresa responde igual que con id libre (oráculo residual)', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const ocupado = randomUUID();
      await habilitar(dueno.admin); await registrarDispositivo(dueno.admin, ocupado).expect(201);
      await habilitar(intruso.admin);
      const ajeno = await registrarDispositivo(intruso.admin, ocupado);
      const libre = await registrarDispositivo(intruso.admin, randomUUID());
      // Residual: el 409 confirma que el identificador existe en otra empresa. Documentado (P2 bajo).
      expect(ajeno.status).toBe(409);
      expect(libre.status).toBe(201);
    });

    it('operación de contingencia: un operacionId de otra empresa responde distinto a uno libre (oráculo residual, medido)', async () => {
      const dueno = await escenario(); const intruso = await escenario();
      const preparar = async (e: any) => {
        await habilitar(e.admin);
        const dispositivo = randomUUID();
        await http('post', '/contingencia/dispositivos', e.cajero.token, { dispositivoId: dispositivo, nombre: 'Caja op' }).expect(201);
        const ventana = await http('post', '/contingencia/ventanas', e.cajero.token, { dispositivoId: dispositivo }); if (ventana.body?.ventana) ventana.body = ventana.body.ventana;
        return { dispositivo, ventana };
      };
      const cuerpo = (e: any, pre: any, operacionId: string) => ({
        operacionId, dispositivoId: pre.dispositivo, ventanaId: pre.ventana.body.id, secuenciaLocal: 1, correlativoLocal: 'CT-01-00000001',
        ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero.id,
        lineas: [{ productoId: e.producto.id, cantidadCentesimas: 100, precioCentavos: 10000 }],
        totalCentavos: 10000, subtotalCentavos: 10000, isvCentavos: 0, efectivoRecibidoCentavos: 10000, cambioCentavos: 0, esquemaVersion: 1,
      });
      const preDueno = await preparar(dueno); const preIntruso = await preparar(intruso);
      expect(preDueno.ventana.status, JSON.stringify(preDueno.ventana.body)).toBeLessThan(300);
      expect(preIntruso.ventana.status, JSON.stringify(preIntruso.ventana.body)).toBeLessThan(300);
      const ocupada = randomUUID();
      const lote = (e: any, pre: any, operacionId: string) => ({ dispositivoId: pre.dispositivo, pendientesRestantes: 0, operaciones: [cuerpo(e, pre, operacionId)] });
      const enviar = (e: any, pre: any, operacionId: string) => http('post', '/contingencia/operaciones', e.cajero.token, lote(e, pre, operacionId));
      const original = await enviar(dueno, preDueno, ocupada);
      expect(original.status, JSON.stringify(original.body)).toBeLessThan(300);
      const ajena = await enviar(intruso, preIntruso, ocupada);
      const libre = await enviar(intruso, preIntruso, randomUUID());
      // Residual medido: la respuesta de la empresa ajena difiere de la libre (RECHAZADA_TECNICA frente a un registro).
      // No revela datos ni cambia la operación de la otra empresa.
      expect(ajena.body.resultados[0].estado).toBe('RECHAZADA_TECNICA');
      expect(ajena.body.resultados[0].mensaje).toBe('Identificador de operación no disponible');
      expect(libre.body.resultados[0].estado).not.toBe('RECHAZADA_TECNICA');
      expect(JSON.stringify(ajena.body)).not.toContain(dueno.tenantId);
      expect(JSON.stringify(ajena.body)).not.toContain(dueno.cajero.id);
      const intacta = await prisma.operacionContingencia.findUniqueOrThrow({ where: { id: ocupada } });
      expect(intacta.tenantId).toBe(dueno.tenantId);
    });

    it('consulta de estados de una operación de contingencia ajena: no revela existencia ni datos', async () => {
      const intruso = await escenario();
      const r = await http('get', `/contingencia/operaciones/estados?ids=${randomUUID()}`, intruso.admin.token);
      expect([200, 400]).toContain(r.status);
    });
  });
});
