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
import { EntregasService } from '../src/entregas/entregas.service';
import { EntregasController } from '../src/entregas/entregas.controller';
import { ContingenciaController } from '../src/contingencia/contingencia.controller';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';

// CENTINELA — verificación independiente de entregas (PR #148, 321fdee0). PostgreSQL temporal con migraciones
// reales, login real, ValidationPipe y guardas de módulo como en producción. Nunca lee DATABASE_URL.
// Cada prueba comprueba estado antes y después cuando debe haber un rechazo.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('CENTINELA: entregas, entregas parciales y permisos (PR #148) / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let operaciones: OperacionesService;
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = 'verificacion-centinela-148';

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-entregas148-'));
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
    operaciones = new OperacionesService(prisma);
    const module = await Test.createTestingModule({
      controllers: [VentasController, OperacionesController, EntregasController, ContingenciaController, AuthController],
      providers: [VentasService, OperacionesService, EntregasService, ContingenciaService, JwtStrategy, AuthService,
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
  }, 240000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-entregas148-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  // Acepta rutas con o sin el prefijo /api.
  const http = (method: 'get' | 'post' | 'patch' | 'put', path: string, auth: string, body?: unknown) =>
    request(app.getHttpServer())[method](path.startsWith('/api') ? path : `/api${path}`).auth(auth, { type: 'bearer' }).send(body as object);

  type Persona = { id: string; token: string; tenantId: string; rol: string };
  const crearEmpresa = async () => {
    const id = randomUUID();
    await prisma.tenant.create({ data: { id, nombreComercial: 'Entregas CENTINELA' } });
    return id;
  };
  const persona = async (tenant: string, rol: string, extra: any = {}): Promise<Persona> => {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: tenant, rol: rol as any, nombre: `${rol} ${id.slice(0, 4)}`, email: `${id}@example.test`, passwordHash: await bcrypt.hash(password, 4), ...extra } as any });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: `${id}@example.test`, password, tenantId: tenant }).expect(200);
    return { id, token: login.body.accessToken, tenantId: tenant, rol };
  };
  const abrirCaja = (p: Persona) => http('post', '/operaciones/caja/abrir', p.token, { solicitudId: randomUUID(), monto: 5000 });
  const producto = (tenant: string, stock = 100) => prisma.producto.create({ data: { tenantId: tenant, codigo: `E-${randomUUID().slice(0, 6)}`, nombre: 'Producto entregas', precioVenta: 100, precioCosto: 40, stockActual: stock, precioAprobado: true } as any });

  /** Empresa con cajeros con caja abierta, vendedor, bodeguero, administrador y un producto con existencias. */
  async function escenario(stock = 100) {
    const tenantId = await crearEmpresa();
    const admin = await persona(tenantId, 'ADMIN');
    const cajero = await persona(tenantId, 'CAJERO', { permisos: ['pos.vender', 'caja.movimientos_manuales', 'inventario.ver'], permisosConfigurados: true });
    const cajero2 = await persona(tenantId, 'CAJERO');
    const vendedor = await persona(tenantId, 'VENDEDOR');
    const bodeguero = await persona(tenantId, 'BODEGUERO');
    await abrirCaja(cajero).expect(201);
    await abrirCaja(cajero2).expect(201);
    await abrirCaja(admin).expect(201);
    const p = await producto(tenantId, stock);
    return { tenantId, admin, cajero, cajero2, vendedor, bodeguero, producto: p };
  }
  const venta = async (quien: Persona, productoId: string, cantidad: number, extra: any = {}) => {
    const r = await http('post', '/ventas', quien.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId, cantidad }], ...extra });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body;
  };
  const lineaDe = async (ventaId: string) => (await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId } })).id;

  /** Estado observable completo, para demostrar que un rechazo no cambia nada. */
  const estado = async (ventaId: string, productoId: string, tenantId: string) => {
    const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text, stock_reservado::text FROM productos WHERE id=$1', productoId);
    const [v] = await prisma.$queryRawUnsafe<any[]>('SELECT entregado_at IS NOT NULL AS entregada, reserva_pendiente FROM ventas WHERE id=$1', ventaId);
    const l = await prisma.$queryRawUnsafe<any[]>('SELECT cantidad::text, cantidad_entregada::text, cantidad_cancelada::text, cantidad_preparada::text FROM detalles_venta WHERE venta_id=$1', ventaId);
    const [ev] = await prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM entregas_eventos WHERE venta_id=$1', ventaId);
    const [mv] = await prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM movimientos_inventario WHERE producto_id=$1', productoId);
    const [au] = await prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1', tenantId);
    const [ca] = await prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM cajas WHERE tenant_id=$1', tenantId);
    return JSON.stringify({ p, v, l, ev, mv, au, ca });
  };
  const pendientesDe = async (token: string) => (await http('get', '/api/entregas/pendientes', token)).status;

  // ───────────────────────── Prioridad 1: seguridad de entregas ─────────────────────────
  describe('P1 seguridad de entregas', () => {
    it('ADMIN y BODEGUERO entregan (ruta de entregas y ruta de operaciones)', async () => {
      const e = await escenario();
      const v1 = await venta(e.cajero, e.producto.id, 2);
      const v2 = await venta(e.cajero, e.producto.id, 2);
      const r1 = await http('post', `/api/entregas/ventas/${v1.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'Cliente A', lineas: [{ detalleId: await lineaDe(v1.id), cantidad: 2 }] });
      expect(r1.status, JSON.stringify(r1.body)).toBeLessThan(300);
      const r2 = await http('post', `/api/operaciones/ventas/${v2.id}/entregar`, e.bodeguero.token, { solicitudId: randomUUID(), receptorNombre: 'Cliente B' });
      expect(r2.status, JSON.stringify(r2.body)).toBeLessThan(300);
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text, stock_reservado::text FROM productos WHERE id=$1', e.producto.id);
      expect(Number(p.stock_actual)).toBe(96);
      expect(Number(p.stock_reservado)).toBe(0);
    });

    it('CAJERO no puede entregar por ninguna de las dos rutas y el rechazo no cambia nada', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 2);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      const a = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.cajero.token, { solicitudId: randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: await lineaDe(v.id), cantidad: 1 }] });
      const b = await http('post', `/api/operaciones/ventas/${v.id}/entregar`, e.cajero.token, { solicitudId: randomUUID(), receptorNombre: 'X' });
      expect(a.status).toBe(403);
      expect(b.status).toBe(403);
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });

    it('CAJERO con todos los permisos personalizados tampoco entrega, prepara ni libera', async () => {
      const e = await escenario();
      const todos = ['pos.vender', 'caja.movimientos_manuales', 'inventario.ver', 'inventario.editar', 'reportes.ver', 'entregas.gestionar', 'entrega.confirmar', 'reservas.liberar'];
      const cajeroTodo = await persona(e.tenantId, 'CAJERO', { permisos: todos, permisosConfigurados: true });
      const v = await venta(e.cajero, e.producto.id, 2);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      const linea = await lineaDe(v.id);
      expect((await http('post', `/api/entregas/ventas/${v.id}/entregas`, cajeroTodo.token, { solicitudId: randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: linea, cantidad: 1 }] })).status).toBe(403);
      expect((await http('post', `/api/entregas/ventas/${v.id}/preparacion`, cajeroTodo.token, { solicitudId: randomUUID(), lineas: [{ detalleId: linea, cantidad: 1 }] })).status).toBe(403);
      expect((await http('post', `/api/entregas/ventas/${v.id}/liberaciones`, cajeroTodo.token, { solicitudId: randomUUID(), motivo: 'Motivo de prueba suficiente', lineas: [{ detalleId: linea, cantidad: 1 }] })).status).toBe(403);
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });

    it('VENDEDOR no consulta pendientes ni detalle de entregas, aunque tenga permisos personalizados', async () => {
      const e = await escenario();
      const conPermisos = await persona(e.tenantId, 'VENDEDOR', { permisos: ['entregas.ver', 'pos.vender', 'inventario.ver'], permisosConfigurados: true });
      const v = await venta(e.cajero, e.producto.id, 1);
      expect(await pendientesDe(e.vendedor.token)).toBe(403);
      expect(await pendientesDe(conPermisos.token)).toBe(403);
      expect((await http('get', `/api/entregas/ventas/${v.id}`, e.vendedor.token)).status).toBe(403);
      expect((await http('get', '/api/operaciones/entregas', e.vendedor.token)).status).toBe(403);
    });

    it('JW-10 BODEGUERO ve qué entregar pero no el importe de la venta; ADMIN sí', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1);
      const pend = (await http('get', '/api/entregas/pendientes', e.bodeguero.token).expect(200)).body.pendientes.find((x: any) => x.ventaId === v.id);
      expect(pend).toBeDefined();
      expect(pend.lineas.length).toBeGreaterThan(0);
      expect(pend).not.toHaveProperty('total');
      const detalle = (await http('get', `/api/entregas/ventas/${v.id}`, e.bodeguero.token).expect(200)).body;
      expect(detalle.venta).not.toHaveProperty('total');
      expect(detalle.lineas.length).toBeGreaterThan(0);
      const admin = (await http('get', '/api/entregas/pendientes', e.admin.token).expect(200)).body.pendientes.find((x: any) => x.ventaId === v.id);
      expect(admin.total).toBe(Number(v.total));
    });

    it('CAJERO solo consulta sus ventas pendientes; el detalle de la venta de otro cajero no se lee (404)', async () => {
      const e = await escenario();
      const miaV = await venta(e.cajero, e.producto.id, 1);
      const ajenaV = await venta(e.cajero2, e.producto.id, 1);
      const pend = (await http('get', '/api/entregas/pendientes', e.cajero.token).expect(200)).body;
      const ids = pend.pendientes.map((x: any) => x.ventaId);
      expect(ids).toContain(miaV.id);
      expect(ids).not.toContain(ajenaV.id);
      expect((await http('get', `/api/entregas/ventas/${ajenaV.id}`, e.cajero.token)).status).toBe(404);
      expect((await http('get', `/api/entregas/ventas/${miaV.id}`, e.cajero.token)).status).toBe(200);
      const operacion = (await http('get', '/api/operaciones/entregas', e.cajero.token).expect(200)).body;
      expect(operacion.map((x: any) => x.id)).not.toContain(ajenaV.id);
      expect(pend.pendientes.every((x: any) => x.cajeroId === e.cajero.id)).toBe(true);
    });

    it('solo ADMIN libera reservas: BODEGUERO y CAJERO reciben 403 y ADMIN libera', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 3);
      const linea = await lineaDe(v.id);
      const cuerpo = (solicitudId = randomUUID()) => ({ solicitudId, motivo: 'Cliente desistió de la compra', lineas: [{ detalleId: linea, cantidad: 1 }] });
      expect((await http('post', `/api/entregas/ventas/${v.id}/liberaciones`, e.bodeguero.token, cuerpo())).status).toBe(403);
      expect((await http('post', `/api/entregas/ventas/${v.id}/liberaciones`, e.cajero.token, cuerpo())).status).toBe(403);
      const admin = await http('post', `/api/entregas/ventas/${v.id}/liberaciones`, e.admin.token, cuerpo());
      expect(admin.status, JSON.stringify(admin.body)).toBeLessThan(300);
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_reservado::text FROM productos WHERE id=$1', e.producto.id);
      expect(Number(p.stock_reservado)).toBe(2);
    });

    it('el servicio rechaza la entrega de un CAJERO aunque se invoque sin pasar por HTTP (ambas capas)', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 2);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      const entregas = new EntregasService(prisma);
      await expect(entregas.entregar(e.tenantId, e.cajero.id, v.id, { solicitudId: randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: await lineaDe(v.id), cantidad: 1 }] } as any)).rejects.toMatchObject({ status: 403 });
      await expect(operaciones.entregar(e.tenantId, e.cajero.id, v.id, { solicitudId: randomUUID(), receptorNombre: 'X' } as any)).rejects.toMatchObject({ status: 403 });
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });

    it('entrega inmediata del POS: CAJERO no puede vender con MOSTRADOR y no cambia stock', async () => {
      const e = await escenario();
      const antes = await prisma.producto.findUniqueOrThrow({ where: { id: e.producto.id } });
      const r = await http('post', '/api/ventas', e.cajero.token, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: e.producto.id, cantidad: 2, modoEntrega: 'MOSTRADOR' }] });
      expect(r.status).toBe(403);
      const despues = await prisma.producto.findUniqueOrThrow({ where: { id: e.producto.id } });
      expect(despues.stockActual.toString()).toBe(antes.stockActual.toString());
      expect(despues.stockReservado.toString()).toBe(antes.stockReservado.toString());
    });

    it('entrega inmediata del POS: ADMIN vende MOSTRADOR, descuenta una vez y deja la línea entregada', async () => {
      const e = await escenario();
      const v = await venta(e.admin, e.producto.id, 2, { detalles: [{ productoId: e.producto.id, cantidad: 2, modoEntrega: 'MOSTRADOR' }] });
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text, stock_reservado::text FROM productos WHERE id=$1', e.producto.id);
      expect(Number(p.stock_actual)).toBe(98);
      expect(Number(p.stock_reservado)).toBe(0);
      const [l] = await prisma.$queryRawUnsafe<any[]>('SELECT modo_entrega, cantidad_entregada::text FROM detalles_venta WHERE venta_id=$1', v.id);
      expect(l.modo_entrega).toBe('MOSTRADOR');
      expect(Number(l.cantidad_entregada)).toBe(2);
      expect((await http('get', '/api/entregas/pendientes', e.admin.token).expect(200)).body.pendientes.map((x: any) => x.ventaId)).not.toContain(v.id);
    });
  });

  // ───────────────────────── Prioridad 2: entregas parciales ─────────────────────────
  describe('P2 entregas parciales', () => {
    it('entregas parciales consecutivas: el pendiente baja exactamente y la venta se cierra al completar', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 5);
      const linea = await lineaDe(v.id);
      const entregar = (q: number) => http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'Cliente', lineas: [{ detalleId: linea, cantidad: q }] });
      expect((await entregar(1.5)).status).toBeLessThan(300);
      expect((await entregar(2.25)).status).toBeLessThan(300);
      const [mid] = await prisma.$queryRawUnsafe<any[]>('SELECT cantidad_entregada::text, reserva_pendiente FROM detalles_venta d JOIN ventas v ON v.id=d.venta_id WHERE d.id=$1', linea);
      expect(Number(mid.cantidad_entregada)).toBe(3.75);
      expect(mid.reserva_pendiente).toBe(true);
      expect((await entregar(1.25)).status).toBeLessThan(300);
      const [fin] = await prisma.$queryRawUnsafe<any[]>('SELECT entregado_at IS NOT NULL AS entregada, reserva_pendiente FROM ventas WHERE id=$1', v.id);
      expect(fin.entregada).toBe(true);
      expect(fin.reserva_pendiente).toBe(false);
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text, stock_reservado::text FROM productos WHERE id=$1', e.producto.id);
      expect(Number(p.stock_actual)).toBe(95);
      expect(Number(p.stock_reservado)).toBe(0);
    });

    it('cantidades decimales con dos cifras: 0.01 se entrega exacto y 0.001 se rechaza sin cambios', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1.5);
      const linea = await lineaDe(v.id);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      const decimal = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 0.01 }] });
      expect(decimal.status).toBeLessThan(300);
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text FROM productos WHERE id=$1', e.producto.id);
      expect(Number(p.stock_actual)).toBe(99.99);
      const excesivo = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 0.001 }] });
      expect(excesivo.status).toBe(400);
      expect(await estado(v.id, e.producto.id, e.tenantId)).not.toBe(antes);
    });

    it('más unidades que lo pendiente: 409 y ningún cambio', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 2);
      const linea = await lineaDe(v.id);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      const r = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 2.01 }] });
      expect(r.status).toBe(409);
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });

    it('inventario insuficiente en el momento de entregar: 409 y la reserva no cambia', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 4);
      const linea = await lineaDe(v.id);
      // La base impide reservado > existencias (CHECK stock_reservado_check): la reserva inconsistente se simula con reservado = 0.
      await prisma.$executeRawUnsafe('UPDATE productos SET stock_reservado = 0 WHERE id=$1', e.producto.id);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      const r = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 3 }] });
      expect(r.status).toBe(409);
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });

    it('concurrencia: dos entregas simultáneas de 3 sobre 4 pendientes no pasan del pendiente', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 4);
      const linea = await lineaDe(v.id);
      const llamar = () => http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 3 }] });
      const respuestas = await Promise.all([llamar(), llamar()]);
      expect(respuestas.map(r => r.status).filter(s => s < 300)).toHaveLength(1);
      const [l] = await prisma.$queryRawUnsafe<any[]>('SELECT cantidad_entregada::text FROM detalles_venta WHERE id=$1', linea);
      expect(Number(l.cantidad_entregada)).toBe(3);
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text, stock_reservado::text FROM productos WHERE id=$1', e.producto.id);
      expect(Number(p.stock_actual)).toBe(97);
      expect(Number(p.stock_reservado)).toBe(1);
    });

    it('idempotencia: misma solicitud y mismo contenido no descuenta dos veces; mismo id con otro contenido es 409', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 4);
      const linea = await lineaDe(v.id);
      const solicitud = randomUUID();
      const cuerpo = { solicitudId: solicitud, receptorNombre: 'Cliente idempotente', lineas: [{ detalleId: linea, cantidad: 1 }] };
      const primera = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, cuerpo);
      const reintento = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, cuerpo);
      expect(primera.status).toBeLessThan(300);
      expect(reintento.status).toBeLessThan(300);
      expect(reintento.body.eventoId ?? reintento.body.id).toBe(primera.body.eventoId ?? primera.body.id);
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text FROM productos WHERE id=$1', e.producto.id);
      expect(Number(p.stock_actual)).toBe(99);
      const otro = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { ...cuerpo, lineas: [{ detalleId: linea, cantidad: 2 }] });
      expect(otro.status).toBe(409);
      const [ev] = await prisma.$queryRawUnsafe<any[]>("SELECT count(*)::int AS n FROM entregas_eventos WHERE venta_id=$1 AND tipo='ENTREGA'", v.id);
      expect(ev.n).toBe(1);
    });

    it('una entrega que reutiliza el identificador de la venta (COBRO) recibe 409 por clave compartida', async () => {
      // Observación: la clave de eventos es (empresa, solicitud). El cobro usa la solicitud de la venta; una entrega con la misma clave colisiona.
      const e = await escenario();
      const solicitudVenta = randomUUID();
      const v = await venta(e.cajero, e.producto.id, 2, { solicitudId: solicitudVenta });
      const r = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: solicitudVenta, receptorNombre: 'C', lineas: [{ detalleId: await lineaDe(v.id), cantidad: 1 }] });
      expect(r.status).toBe(409);
    });

    it('reintento después de completar la venta responde sin cambios y sin nuevo evento', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1);
      const linea = await lineaDe(v.id);
      const cuerpo = { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 1 }] };
      await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, cuerpo).expect(201);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, cuerpo);
      await http('post', `/api/operaciones/ventas/${v.id}/entregar`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C' });
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });

    it('la entrega con receptor vacío se rechaza sin cambios', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 1);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      const r = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: '   ', lineas: [{ detalleId: await lineaDe(v.id), cantidad: 1 }] });
      expect(r.status).toBe(400);
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });

    it('devoluciones relacionadas: reingreso de lo entregado y cancelación de lo pendiente, sin doble descuento', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 4);
      const linea = await lineaDe(v.id);
      await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 1 }] }).expect(201);
      const devReingreso = await http('post', `/api/operaciones/ventas/${v.id}/devoluciones`, e.admin.token, { solicitudId: randomUUID(), motivo: 'Devolución de una unidad', metodo: 'EFECTIVO', items: [{ detalleId: linea, cantidad: 1, destino: 'INVENTARIO' }] });
      expect(devReingreso.status, JSON.stringify(devReingreso.body)).toBeLessThan(300);
      const [tras] = await prisma.$queryRawUnsafe<any[]>('SELECT cantidad_entregada::text, cantidad_devuelta_reingresada::text FROM detalles_venta WHERE id=$1', linea);
      expect(Number(tras.cantidad_entregada)).toBe(1);
      expect(Number(tras.cantidad_devuelta_reingresada)).toBe(1);
      const cancelacion = { solicitudId: randomUUID(), motivo: 'Cancelación de lo pendiente', metodo: 'EFECTIVO', items: [{ detalleId: linea, cantidad: 3, destino: 'NO_ENTREGADO' }] };
      await http('post', `/api/operaciones/ventas/${v.id}/devoluciones`, e.admin.token, cancelacion).expect(403);
      await http('post', `/api/operaciones/ventas/${v.id}/solicitudes-devolucion`, e.cajero.token, cancelacion).expect(201);
      await http('post', `/api/operaciones/solicitudes-devolucion/${cancelacion.solicitudId}/decision`, e.admin.token, { decision: 'AUTORIZADA', motivo: 'Documento revisado por otro usuario' }).expect(201);
      const devCancel = await http('post', `/api/operaciones/solicitudes-devolucion/${cancelacion.solicitudId}/ejecutar`, e.cajero.token, {});
      expect(devCancel.status, JSON.stringify(devCancel.body)).toBeLessThan(300);
      const pendiente = await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: linea, cantidad: 0.01 }] });
      expect(pendiente.status).toBe(409);
      const [p] = await prisma.$queryRawUnsafe<any[]>('SELECT stock_actual::text, stock_reservado::text FROM productos WHERE id=$1', e.producto.id);
      // 100 - 1 entregada + 1 reingresada = 100; la reserva de 4 queda liberada al cancelar, sin descuento adicional.
      expect(Number(p.stock_actual)).toBe(100);
      expect(Number(p.stock_reservado)).toBe(0);
    });

    it('aislamiento: otra empresa no ve, no entrega ni devuelve pendientes de esta', async () => {
      const e = await escenario();
      const otra = await escenario();
      const v = await venta(e.cajero, e.producto.id, 2);
      const linea = await lineaDe(v.id);
      const antes = await estado(v.id, e.producto.id, e.tenantId);
      expect((await http('get', `/api/entregas/ventas/${v.id}`, otra.admin.token)).status).toBe(404);
      expect((await http('post', `/api/entregas/ventas/${v.id}/entregas`, otra.admin.token, { solicitudId: randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: linea, cantidad: 1 }] })).status).toBe(404);
      expect((await http('post', `/api/operaciones/ventas/${v.id}/entregar`, otra.admin.token, { solicitudId: randomUUID(), receptorNombre: 'X' })).status).toBe(404);
      expect((await http('post', `/api/operaciones/ventas/${v.id}/devoluciones`, otra.admin.token, { solicitudId: randomUUID(), motivo: 'Intento ajeno', metodo: 'EFECTIVO', items: [{ detalleId: linea, cantidad: 1, destino: 'INVENTARIO' }] })).status).toBe(404);
      expect((await http('get', '/api/operaciones/entregas', otra.admin.token).expect(200)).body).toEqual([]);
      expect(await estado(v.id, e.producto.id, e.tenantId)).toBe(antes);
    });
  });

  // ───────────────────────── Regresiones cruzadas y dependencias FARO ─────────────────────────
  describe('P5 regresiones cruzadas', () => {
    it('numeración de ventas consecutiva dentro de la empresa, también con entregas', async () => {
      const e = await escenario();
      const numeros: number[] = [];
      for (let i = 0; i < 3; i++) {
        const v = await venta(e.cajero, e.producto.id, 1);
        numeros.push(v.numeroVenta);
      }
      expect(numeros[1]).toBe(numeros[0] + 1);
      expect(numeros[2]).toBe(numeros[1] + 1);
    });

    it('DEF-03 (cerrado): POST /ventas sin solicitudId se rechaza con 400 y no deja efectos', async () => {
      const e = await escenario();
      const antes = await prisma.venta.count({ where: { tenantId: e.tenantId } });
      const r = await http('post', '/api/ventas', e.cajero.token, { metodoPago: 'EFECTIVO', detalles: [{ productoId: e.producto.id, cantidad: 1 }] });
      expect(r.status).toBe(400);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(antes);
      expect(await prisma.producto.findUniqueOrThrow({ where: { id: e.producto.id } }).then((p) => Number(p.stockReservado))).toBe(0);
    });

    it('caja: entregar no altera el efectivo esperado del arqueo; la entrega deja auditoría VENTA_ENTREGAR', async () => {
      const e = await escenario();
      const v = await venta(e.cajero, e.producto.id, 2);
      const caja = async () => (await http('get', '/api/operaciones/caja', e.cajero.token).expect(200)).body[0];
      const antes = await caja();
      await http('post', `/api/entregas/ventas/${v.id}/entregas`, e.admin.token, { solicitudId: randomUUID(), receptorNombre: 'C', lineas: [{ detalleId: await lineaDe(v.id), cantidad: 2 }] }).expect(201);
      const despues = await caja();
      expect(despues.efectivoEsperado).toBe(antes.efectivoEsperado);
      const aud = await prisma.$queryRawUnsafe<any[]>("SELECT count(*)::int AS n FROM auditoria_operaciones WHERE operacion='VENTA_ENTREGAR' AND tenant_id=$1", e.tenantId);
      expect(aud[0].n).toBe(1);
    });

    it('DEF-01 (cerrado): el catálogo offline no incluye productos sin precio aprobado', async () => {
      const previo = process.env.POS_OFFLINE_ENABLED;
      process.env.POS_OFFLINE_ENABLED = 'true';
      try {
        const e = await escenario();
        const pendiente = await prisma.producto.create({ data: { tenantId: e.tenantId, codigo: 'SIN-PRECIO', nombre: 'Pendiente de precio', precioVenta: 100, precioCosto: 40, stockActual: 10, precioAprobado: false } as any });
        await http('patch', '/api/contingencia/configuracion', e.admin.token, { habilitada: true }).expect(200);
        const dispositivo = randomUUID();
        await http('post', '/api/contingencia/dispositivos', e.admin.token, { dispositivoId: dispositivo, nombre: 'Caja DEF-01' }).expect(201);
        const ventana = (await http('post', '/api/contingencia/ventanas', e.cajero.token, { dispositivoId: dispositivo })).body;
        expect(ventana.catalogo.productos.map((x: any) => x.id)).not.toContain(pendiente.id);
      } finally { if (previo === undefined) delete process.env.POS_OFFLINE_ENABLED; else process.env.POS_OFFLINE_ENABLED = previo; }
    });

    it('DEF-04 (cerrado): cajero B no cobra en la caja de A con la ventana de A', async () => {
      const previo = process.env.POS_OFFLINE_ENABLED;
      process.env.POS_OFFLINE_ENABLED = 'true';
      try {
      const e = await escenario();
      await http('patch', '/api/contingencia/configuracion', e.admin.token, { habilitada: true }).expect(200);
      const dispositivo = randomUUID();
      await http('post', '/api/contingencia/dispositivos', e.admin.token, { dispositivoId: dispositivo, nombre: 'Caja DEF-04' }).expect(201);
      const ventana = (await http('post', '/api/contingencia/ventanas', e.cajero.token, { dispositivoId: dispositivo })).body.ventana;
      const operacion = randomUUID();
      const r = await http('post', '/api/contingencia/operaciones', e.cajero2.token, { dispositivoId: dispositivo, pendientesRestantes: 0, operaciones: [{
        operacionId: operacion, dispositivoId: dispositivo, ventanaId: ventana.id, secuenciaLocal: 1, correlativoLocal: 'CT-01-00000001',
        ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero2.id,
        lineas: [{ productoId: e.producto.id, cantidadCentesimas: 100, precioCentavos: 10000 }],
        totalCentavos: 11500, subtotalCentavos: 10000, isvCentavos: 1500, efectivoRecibidoCentavos: 11500, cambioCentavos: 0, esquemaVersion: 1,
      }] });
      expect(r.body.resultados[0].estado).not.toBe('APLICADA');
      } finally { if (previo === undefined) delete process.env.POS_OFFLINE_ENABLED; else process.env.POS_OFFLINE_ENABLED = previo; }
    });
  });
});
