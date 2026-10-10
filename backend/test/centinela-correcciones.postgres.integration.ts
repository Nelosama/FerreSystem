import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductosService } from '../src/productos/productos.service';
import { ProductosController } from '../src/productos/productos.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { VentasService } from '../src/ventas/ventas.service';
import { VentasController } from '../src/ventas/ventas.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ClientesService } from '../src/clientes/clientes.service';
import { ClientesController } from '../src/clientes/clientes.controller';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { diaCalendario } from '../src/common/zona-horaria';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';
import { Reflector } from '@nestjs/core';

// Ciclo operativo HTTP con PostgreSQL temporal y todas las migraciones reales.
// Nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

// Tarjeta y transferencia exigen autorización bancaria: cada cobro recibe una referencia única.
const autorizacion = (metodo: string) => (metodo === 'EFECTIVO' || metodo === 'CREDITO') ? {} : { pagoElectronico: { referencia: `AUT-${randomUUID().slice(0, 12)}`, ...(metodo === 'TARJETA' ? { terminal: 'POS-01' } : {}) } };

describe('Correcciones CENTINELA D1/D3/R1 / HTTP y PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = "qa-local-password";
  let token: string;
  let usuarioId: string;
  let cajaId: string;
  let tenantId: string;
  let app: INestApplication;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-centinela-'));
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
      controllers: [ProductosController, CotizacionesController, VentasController, OperacionesController, AuthController, ClientesController, DashboardController],
      providers: [ProductosService, CotizacionesService, VentasService, OperacionesService, JwtStrategy, AuthService, ClientesService, DashboardService,
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
  }, 120000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-centinela-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const http = (method: 'get' | 'post', path: string, auth: string, body?: unknown) =>
    request(app.getHttpServer())[method](`/api${path}`).auth(auth, { type: 'bearer' }).send(body);

  type Persona = { id: string; token: string; tenantId: string; rol: string };
  const crearEmpresa = async () => {
    const id = randomUUID();
    await prisma.tenant.create({ data: { id, nombreComercial: 'CENTINELA' } });
    return id;
  };
  const persona = async (tenant: string, rol: string, extra: any = {}): Promise<Persona> => {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: tenant, rol: rol as any, nombre: `${rol} ${id.slice(0, 4)}`, email: `${id}@example.test`, passwordHash: await bcrypt.hash(password, 4), ...extra } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: `${id}@example.test`, password, tenantId: tenant }).expect(200);
    return { id, token: login.body.accessToken, tenantId: tenant, rol };
  };
  const abrirCaja = (p: Persona, solicitudId = randomUUID()) => http('post', '/operaciones/caja/abrir', p.token, { solicitudId, monto: 100 });
  const producto = (tenant: string, stock = 10) => prisma.producto.create({ data: { tenantId: tenant, codigo: `P-${randomUUID().slice(0, 6)}`, nombre: 'Producto CENTINELA', precioVenta: 100, precioCosto: 40, stockActual: stock, precioAprobado: true, precioAprobadoAt: new Date() } as any });
  const stockDe = async (id: string) => { const p = await prisma.producto.findUniqueOrThrow({ where: { id } }); return { actual: Number(p.stockActual), reservado: Number(p.stockReservado) }; };

  /** Empresa con cajero (caja abierta), segundo cajero, vendedor, bodeguero y administrador, más una venta pendiente de entrega. */
  async function escenario() {
    const tenantId = await crearEmpresa();
    const admin = await persona(tenantId, 'ADMIN');
    const cajero = await persona(tenantId, 'CAJERO');
    const cajero2 = await persona(tenantId, 'CAJERO');
    const vendedor = await persona(tenantId, 'VENDEDOR');
    const bodeguero = await persona(tenantId, 'BODEGUERO');
    await abrirCaja(cajero).expect(201);
    await abrirCaja(cajero2).expect(201);
    const p = await producto(tenantId);
    const venta = async (quien: Persona, cantidad = 2) => { const r = await http('post', '/ventas', quien.token, { solicitudId: randomUUID(), detalles: [{ productoId: p.id, cantidad }] }); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body; };
    return { tenantId, admin, cajero, cajero2, vendedor, bodeguero, producto: p, venta };
  }
  const eventosEntrega = (ventaId: string) => prisma.$queryRawUnsafe<any[]>("SELECT id FROM movimientos_inventario WHERE documento_id=$1 AND tipo='ENTREGA'", ventaId);
  const auditoriaEntrega = (ventaId: string) => prisma.$queryRawUnsafe<any[]>("SELECT id FROM auditoria_operaciones WHERE entidad_id=$1 AND operacion='VENTA_ENTREGAR'", ventaId);

  describe('D1 — solo ADMIN y BODEGUERO entregan mercancía', () => {
    it('CAJERO y VENDEDOR reciben 403 y la denegación no cambia inventario, venta, movimientos ni auditoría', async () => {
      const e = await escenario();
      const venta = await e.venta(e.cajero);
      const antes = await stockDe(e.producto.id);
      expect(antes).toEqual({ actual: 10, reservado: 2 });
      for (const quien of [e.cajero, e.cajero2, e.vendedor]) {
        const r = await http('post', `/operaciones/ventas/${venta.id}/entregar`, quien.token, {});
        expect(r.status, quien.rol).toBe(403);
      }
      expect(await stockDe(e.producto.id)).toEqual(antes);
      const [v] = await prisma.$queryRawUnsafe<any[]>('SELECT reserva_pendiente, entregado_at FROM ventas WHERE id=$1', venta.id);
      expect([v.reserva_pendiente, v.entregado_at]).toEqual([true, null]);
      expect(await eventosEntrega(venta.id)).toHaveLength(0);
      expect(await auditoriaEntrega(venta.id)).toHaveLength(0);
    });

    it('un cajero con permisos personalizados tampoco puede entregar (el rol manda)', async () => {
      const e = await escenario();
      const conPermisos = await persona(e.tenantId, 'CAJERO', { permisosConfigurados: true, permisos: ['pos.vender', 'inventario.editar'] });
      const venta = await e.venta(e.cajero);
      await http('post', `/operaciones/ventas/${venta.id}/entregar`, conPermisos.token, {}).expect(403);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 10, reservado: 2 });
    });

    it('el servicio también lo rechaza aunque se invoque sin pasar por HTTP', async () => {
      const e = await escenario();
      const venta = await e.venta(e.cajero);
      const ops = app.get(OperacionesService);
      await expect(ops.entregar(e.tenantId, e.cajero.id, venta.id)).rejects.toThrow(/no tiene autorización/);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 10, reservado: 2 });
    });

    it('BODEGUERO y ADMIN entregan; el descuento ocurre una sola vez aunque se repita o llegue en paralelo', async () => {
      const e = await escenario();
      const venta = await e.venta(e.cajero);
      await Promise.all([
        http('post', `/operaciones/ventas/${venta.id}/entregar`, e.bodeguero.token, {}).expect(201),
        http('post', `/operaciones/ventas/${venta.id}/entregar`, e.admin.token, {}).expect(201),
        http('post', `/operaciones/ventas/${venta.id}/entregar`, e.bodeguero.token, {}).expect(201),
      ]);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 8, reservado: 0 });
      expect(await eventosEntrega(venta.id)).toHaveLength(1);
      const segunda = await e.venta(e.cajero, 3);
      await http('post', `/operaciones/ventas/${segunda.id}/entregar`, e.admin.token, {}).expect(201);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 5, reservado: 0 });
    });

    it('un administrador de otra empresa no puede entregar la venta ajena y nada cambia', async () => {
      const e = await escenario();
      const venta = await e.venta(e.cajero);
      const otraEmpresa = await crearEmpresa();
      const otroAdmin = await persona(otraEmpresa, 'ADMIN');
      const r = await http('post', `/operaciones/ventas/${venta.id}/entregar`, otroAdmin.token, {});
      expect(r.status).toBe(404);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 10, reservado: 2 });
    });

    it('el cajero sigue pudiendo vender y consultar; la entrega quedó solo para bodega o administración', async () => {
      const e = await escenario();
      await e.venta(e.cajero);
      await http('get', '/operaciones/entregas', e.cajero.token).expect(200);
    });
  });

  describe('R1 — consulta de entregas pendientes por rol', () => {
    it('CAJERO ve únicamente sus ventas; ADMIN y BODEGUERO ven todas las de su empresa; otra empresa no ve nada', async () => {
      const e = await escenario();
      const deCajero = await e.venta(e.cajero);
      const deCajero2 = await e.venta(e.cajero2);
      const ids = (r: request.Response) => r.body.map((v: any) => v.id).sort();
      expect(ids(await http('get', '/operaciones/entregas', e.cajero.token).expect(200))).toEqual([deCajero.id]);
      expect(ids(await http('get', '/operaciones/entregas', e.cajero2.token).expect(200))).toEqual([deCajero2.id]);
      expect(ids(await http('get', '/operaciones/entregas', e.admin.token).expect(200))).toEqual([deCajero.id, deCajero2.id].sort());
      expect(ids(await http('get', '/operaciones/entregas', e.bodeguero.token).expect(200))).toEqual([deCajero.id, deCajero2.id].sort());
      const otro = await persona(await crearEmpresa(), 'ADMIN');
      expect(ids(await http('get', '/operaciones/entregas', otro.token).expect(200))).toEqual([]);
      await http('get', '/operaciones/entregas', e.vendedor.token).expect(403);
    });

    it('al entregarse, la venta sale de la lista de todos; la lista del bodeguero no expone costos', async () => {
      const e = await escenario();
      const venta = await e.venta(e.cajero);
      const lista = await http('get', '/operaciones/entregas', e.bodeguero.token).expect(200);
      const texto = JSON.stringify(lista.body);
      expect(texto).not.toMatch(/costo_unitario|precio_costo/);
      await http('post', `/operaciones/ventas/${venta.id}/entregar`, e.bodeguero.token, {}).expect(201);
      for (const quien of [e.cajero, e.admin, e.bodeguero]) expect((await http('get', '/operaciones/entregas', quien.token).expect(200)).body).toEqual([]);
    });
  });

  describe('D3 — un identificador de solicitud de otra empresa no se distingue de uno libre', () => {
    type Caso = { nombre: string; preparar?: (t: string) => Promise<any>; ejecutar: (p: Persona, id: string, ctx: any) => Promise<request.Response>; rol: string };
    const casos: Caso[] = [
      { nombre: 'crear proveedor', rol: 'ADMIN', ejecutar: (p, id) => http('post', '/operaciones/proveedores', p.token, { solicitudId: id, nombre: 'Proveedor D3' }) },
      { nombre: 'abrir caja', rol: 'CAJERO', ejecutar: (p, id) => abrirCaja(p, id) },
      { nombre: 'movimiento de caja', rol: 'ADMIN', preparar: async () => undefined,
        ejecutar: async (p, id) => { const caja = (await abrirCaja(p)).body; return http('post', `/operaciones/caja/${caja.id}/movimientos`, p.token, { solicitudId: id, tipo: 'INGRESO_MANUAL', monto: 5, concepto: 'Ingreso D3' }); } },
      { nombre: 'crear compra', rol: 'ADMIN',
        ejecutar: async (p, id, ctx) => { const prov = (await http('post', '/operaciones/proveedores', p.token, { solicitudId: randomUUID(), nombre: 'Proveedor compra' })).body; const prod = await producto(p.tenantId); return http('post', '/operaciones/compras', p.token, { solicitudId: id, proveedorId: prov.id, numeroFactura: 'D3', isv: 0, items: [{ productoId: prod.id, cantidad: 1, costo: 10 }] }); } },
      { nombre: 'solicitar devolución', rol: 'ADMIN',
        ejecutar: async (p, id) => { const prod = await producto(p.tenantId); await abrirCaja(p); const v = (await http('post', '/ventas', p.token, { solicitudId: randomUUID(), detalles: [{ productoId: prod.id, cantidad: 2 }] }).expect(201)).body; const det = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM detalles_venta WHERE venta_id=$1', v.id); return http('post', `/operaciones/ventas/${v.id}/solicitudes-devolucion`, p.token, { solicitudId: id, motivo: 'D3', metodo: 'EFECTIVO', items: [{ detalleId: det[0].id, cantidad: 1, destino: 'NO_ENTREGADO' }] }); } },
      { nombre: 'devolución directa', rol: 'ADMIN',
        ejecutar: async (p, id) => { const prod = await producto(p.tenantId); await abrirCaja(p); const v = (await http('post', '/ventas', p.token, { solicitudId: randomUUID(), detalles: [{ productoId: prod.id, cantidad: 2 }] }).expect(201)).body; const det = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM detalles_venta WHERE venta_id=$1', v.id); return http('post', `/operaciones/ventas/${v.id}/devoluciones`, p.token, { solicitudId: id, motivo: 'D3', metodo: 'EFECTIVO', items: [{ detalleId: det[0].id, cantidad: 1, destino: 'NO_ENTREGADO' }] }); } },
    ];
    for (const caso of casos) {
      it(`${caso.nombre}: con el identificador de otra empresa responde igual que con uno libre`, async () => {
        const empresaA = await crearEmpresa(); const empresaB = await crearEmpresa();
        const dueño = await persona(empresaA, caso.rol);
        const intruso = await persona(empresaB, caso.rol);
        const control = await persona(empresaB, caso.rol);
        const ocupado = randomUUID();
        const original = await caso.ejecutar(dueño, ocupado, {});
        expect(original.status, `original: ${JSON.stringify(original.body)}`).toBeLessThan(300);
        const libre = await caso.ejecutar(control, randomUUID(), {});
        const ajeno = await caso.ejecutar(intruso, ocupado, {});
        expect(ajeno.status, `ajeno: ${JSON.stringify(ajeno.body)}`).toBe(libre.status);
        expect(Object.keys(ajeno.body).sort()).toEqual(Object.keys(libre.body).sort());
        // La operación de la otra empresa queda registrada en su propio ámbito y la original no se altera.
        if (ajeno.body?.id) expect(ajeno.body.tenant_id ?? empresaB).toBe(empresaB);
        if (original.body?.id && ajeno.body?.id) expect(ajeno.body.id).not.toBe(original.body.id);
        // Reintento del dueño: misma solicitud y mismo contenido devuelve lo original sin duplicar.
        if (caso.nombre !== 'abrir caja' && caso.nombre !== 'movimiento de caja' && caso.nombre !== 'crear compra' && caso.nombre !== 'solicitar devolución' && caso.nombre !== 'devolución directa') {
          const repetido = await caso.ejecutar(dueño, ocupado, {});
          expect(repetido.status).toBe(original.status);
          expect(repetido.body.id).toBe(original.body.id);
        }
      });
    }
  });

  describe('D3 — idempotencia dentro de la empresa intacta', () => {
    it('venta: el mismo identificador en dos empresas crea dos ventas independientes; el reintento de cada una devuelve la suya sin duplicar ni descontar dos veces', async () => {
      const a = await escenario(); const b = await escenario();
      const solicitudId = randomUUID();
      const cuerpoA = { solicitudId, detalles: [{ productoId: a.producto.id, cantidad: 2 }] };
      const cuerpoB = { solicitudId, detalles: [{ productoId: b.producto.id, cantidad: 3 }] };
      const ventaA = await http('post', '/ventas', a.cajero.token, cuerpoA).expect(201);
      const ventaB = await http('post', '/ventas', b.cajero.token, cuerpoB).expect(201);
      expect(ventaA.body.id).not.toBe(ventaB.body.id);
      const reA = await http('post', '/ventas', a.cajero.token, cuerpoA).expect(201);
      const reB = await http('post', '/ventas', b.cajero.token, cuerpoB).expect(201);
      expect([reA.body.id, reB.body.id]).toEqual([ventaA.body.id, ventaB.body.id]);
      expect(await stockDe(a.producto.id)).toEqual({ actual: 10, reservado: 2 });
      expect(await stockDe(b.producto.id)).toEqual({ actual: 10, reservado: 3 });
      // Dentro de la misma empresa, reutilizar la solicitud con otro contenido sigue siendo conflicto.
      await http('post', '/ventas', a.cajero.token, { solicitudId, detalles: [{ productoId: a.producto.id, cantidad: 5 }] }).expect(409);
      expect(await stockDe(a.producto.id)).toEqual({ actual: 10, reservado: 2 });
      // La consulta de recuperación solo ve la venta propia.
      const propia = await http('get', `/ventas/solicitudes/${solicitudId}`, a.cajero.token).expect(200);
      expect(propia.body).toMatchObject({ estado: 'REGISTRADA' });
      expect(propia.body.venta.id).toBe(ventaA.body.id);
      const libre = await http('get', `/ventas/solicitudes/${randomUUID()}`, a.cajero.token).expect(200);
      expect(libre.body).toEqual({ estado: 'NO_REGISTRADA' });
    });

    it('venta: consultar la solicitud de otra empresa responde igual que una solicitud libre', async () => {
      const a = await escenario(); const b = await escenario();
      const solicitudId = randomUUID();
      await http('post', '/ventas', a.cajero.token, { solicitudId, detalles: [{ productoId: a.producto.id, cantidad: 1 }] }).expect(201);
      const ajena = await http('get', `/ventas/solicitudes/${solicitudId}`, b.cajero.token).expect(200);
      expect(ajena.body).toEqual({ estado: 'NO_REGISTRADA' });
    });

    it('proveedor, caja y compra: el reintento propio devuelve el registro original una sola vez y otro contenido es conflicto', async () => {
      const tenant = await crearEmpresa();
      const admin = await persona(tenant, 'ADMIN');
      const solicitudId = randomUUID();
      const cuerpo = { solicitudId, nombre: 'Proveedor reintento' };
      const p1 = await http('post', '/operaciones/proveedores', admin.token, cuerpo).expect(201);
      const p2 = await http('post', '/operaciones/proveedores', admin.token, cuerpo).expect(201);
      expect(p2.body.id).toBe(p1.body.id);
      await http('post', '/operaciones/proveedores', admin.token, { solicitudId, nombre: 'Otro nombre' }).expect(409);
      expect(await prisma.proveedor.count({ where: { tenantId: tenant } })).toBe(1);
      const caja = randomUUID();
      const c1 = await abrirCaja(admin, caja).expect(201);
      const c2 = await abrirCaja(admin, caja).expect(201);
      expect(c2.body.id).toBe(c1.body.id);
      const compra = { solicitudId: randomUUID(), proveedorId: p1.body.id, numeroFactura: 'R-1', isv: 0, items: [{ productoId: (await producto(tenant)).id, cantidad: 1, costo: 10 }] };
      const o1 = await http('post', '/operaciones/compras', admin.token, compra).expect(201);
      const o2 = await http('post', '/operaciones/compras', admin.token, compra).expect(201);
      expect(o2.body.id).toBe(o1.body.id);
      expect(await prisma.ordenCompra.count({ where: { tenantId: tenant } })).toBe(1);
    });

    it('registros creados antes del cambio (identificador igual a la solicitud) se siguen reconociendo en reintentos', async () => {
      const tenant = await crearEmpresa();
      const admin = await persona(tenant, 'ADMIN');
      const solicitudId = randomUUID();
      await prisma.proveedor.create({ data: { id: solicitudId, tenantId: tenant, nombre: 'Proveedor heredado' } as any });
      await prisma.$executeRawUnsafe("INSERT INTO auditoria_operaciones (id,tenant_id,usuario_id,operacion,entidad_id,datos) VALUES ($1,$2,$3,'PROVEEDOR_CREAR',$4,$5::jsonb)",
        randomUUID(), tenant, admin.id, solicitudId, JSON.stringify({ hash: createHash('sha256').update(JSON.stringify({ userId: admin.id, dto: { solicitudId, nombre: 'Proveedor heredado' } })).digest('hex') }));
      const r = await http('post', '/operaciones/proveedores', admin.token, { solicitudId, nombre: 'Proveedor heredado' });
      expect(r.status).toBe(201);
      expect(r.body.id).toBe(solicitudId);
      expect(await prisma.proveedor.count({ where: { tenantId: tenant } })).toBe(1);
    });

    it('devolución autorizada de punta a punta con identificadores derivados: solicitar, decidir, ejecutar y consultar, con reintentos', async () => {
      const e = await escenario();
      await abrirCaja(e.admin).expect(201);
      const venta = await e.venta(e.cajero);
      await http('post', `/operaciones/ventas/${venta.id}/entregar`, e.bodeguero.token, {}).expect(201);
      const det = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM detalles_venta WHERE venta_id=$1', venta.id);
      const solicitudId = randomUUID();
      const cuerpo = { solicitudId, motivo: 'Cliente devolvió una unidad', metodo: 'EFECTIVO', items: [{ detalleId: det[0].id, cantidad: 1, destino: 'INVENTARIO' }] };
      const s1 = await http('post', `/operaciones/ventas/${venta.id}/solicitudes-devolucion`, e.cajero.token, cuerpo).expect(201);
      const s2 = await http('post', `/operaciones/ventas/${venta.id}/solicitudes-devolucion`, e.cajero.token, cuerpo).expect(201);
      expect(s2.body.id).toBe(s1.body.id);
      // La interfaz puede usar la solicitud original o el identificador de la lista.
      for (const ref of [solicitudId, s1.body.id]) await http('get', `/operaciones/solicitudes-devolucion/${ref}`, e.cajero.token).expect(200);
      await http('post', `/operaciones/solicitudes-devolucion/${solicitudId}/decision`, e.admin.token, { decision: 'AUTORIZADA', motivo: 'Mercadería revisada' }).expect(201);
      const x1 = await http('post', `/operaciones/solicitudes-devolucion/${s1.body.id}/ejecutar`, e.cajero.token, {}).expect(201);
      const x2 = await http('post', `/operaciones/solicitudes-devolucion/${solicitudId}/ejecutar`, e.cajero.token, {}).expect(201);
      expect(x2.body.id).toBe(x1.body.id);
      expect(await stockDe(e.producto.id)).toEqual({ actual: 9, reservado: 0 });
      const consulta = await http('get', `/operaciones/solicitudes-devolucion/${solicitudId}`, e.cajero.token).expect(200);
      expect(consulta.body.resultado.id).toBe(x1.body.id);
    });
  });
});
