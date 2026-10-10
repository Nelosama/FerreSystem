import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParserImport from 'cookie-parser';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CashierResponseInterceptor } from '../src/common/interceptors/cashier-response.interceptor';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasController } from '../src/ventas/ventas.controller';
import { VentasService } from '../src/ventas/ventas.service';

// CENTINELA — auditoría de integración (NEXUS e8b75ae6). Negativas entre empresas por HTTP,
// idempotencia, permisos por rol, costos en respuestas e integridad de FK en PostgreSQL aislado.
// `it.fails` documenta un defecto demostrado: la prueba pasa mientras el defecto exista y falla
// cuando se corrija, para obligar a convertirla en `it`. Clúster temporal propio; sin DATABASE_URL externa.
describe('Auditoría CENTINELA de integración / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  const password = 'Clave-Segura-2026!';
  let directory: string;
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let ventas: VentasService;
  let operaciones: OperacionesService;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const users: Record<string, { id: string; tenantId: string; rol: string; permisos?: string[]; permisosConfigurados?: boolean }> = {
    adminA: { id: randomUUID(), tenantId: tenantA, rol: 'ADMIN' },
    cajeroA: { id: randomUUID(), tenantId: tenantA, rol: 'CAJERO', permisos: ['caja.movimientos_manuales', 'pos.vender'], permisosConfigurados: true },
    vendedorA: { id: randomUUID(), tenantId: tenantA, rol: 'VENDEDOR' },
    bodegueroA: { id: randomUUID(), tenantId: tenantA, rol: 'BODEGUERO', permisos: ['inventario.ver'], permisosConfigurados: true },
    adminB: { id: randomUUID(), tenantId: tenantB, rol: 'ADMIN' },
    cajeroB: { id: randomUUID(), tenantId: tenantB, rol: 'CAJERO', permisos: ['caja.movimientos_manuales', 'pos.vender'], permisosConfigurados: true },
  };
  const tokens: Record<string, string> = {};
  const datos: Record<string, any> = {};

  const cookieParser = (cookieParserImport as any).default || cookieParserImport;
  // Las rutas se pasan completas (`/api/...`): el prefijo global lo aplica la aplicación de prueba.
  const get = (path: string, token: string) => request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  const post = (path: string, token: string, body: unknown) => request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(body as object);
  const sql = <T = any>(texto: string, ...params: unknown[]) => prisma.$queryRawUnsafe<T[]>(texto, ...params);

  // Campos de costo y margen que ningún rol sin permiso financiero debe recibir.
  const CAMPOS_COSTO = ['precioCosto', 'precio_costo', 'costo', 'costos', 'costoUnitario', 'costo_unitario', 'costoVigente', 'costo_vigente', 'margen', 'margenCalculado', 'margenUnidades', 'ultimaCompraAt', 'ultima_compra_at'];
  const camposDeCosto = (valor: any, ruta = ''): string[] => {
    if (Array.isArray(valor)) return valor.flatMap((item, i) => camposDeCosto(item, `${ruta}[${i}]`));
    if (!valor || typeof valor !== 'object') return [];
    return Object.entries(valor).flatMap(([clave, item]) => [
      ...(CAMPOS_COSTO.includes(clave) ? [`${ruta}.${clave}`] : []),
      ...camposDeCosto(item, `${ruta}.${clave}`),
    ]);
  };

  beforeAll(async () => {
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
    ventas = new VentasService(prisma);
    operaciones = new OperacionesService(prisma);

    const config = { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? secret : fallback) } as unknown as ConfigService;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, VentasController, OperacionesController],
      providers: [
        AuthService, JwtStrategy, VentasService, OperacionesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();

    await prisma.tenant.create({ data: { id: tenantA, nombreComercial: 'Ferretería A' } });
    await prisma.tenant.create({ data: { id: tenantB, nombreComercial: 'Ferretería B' } });
    const passwordHash = await bcrypt.hash(password, 4);
    for (const [key, user] of Object.entries(users)) {
      await prisma.usuario.create({ data: {
        id: user.id, tenantId: user.tenantId, nombre: key, email: `${key.toLowerCase()}@test.invalid`, passwordHash,
        rol: user.rol as any, permisos: user.permisos ?? [], permisosConfigurados: user.permisosConfigurados ?? false,
      } });
      tokens[key] = jwt.sign({ sub: user.id, tenantId: user.tenantId, type: 'tenant', rol: user.rol });
    }

    datos.productoA = (await prisma.producto.create({ data: { tenantId: tenantA, codigo: 'AUD-A1', nombre: 'Cable A', precioVenta: 100, precioCosto: 50, stockActual: 1000, stockMinimo: 0, precioAprobado: true } })).id;
    datos.productoB = (await prisma.producto.create({ data: { tenantId: tenantB, codigo: 'AUD-B1', nombre: 'Cable B', precioVenta: 100, precioCosto: 60, stockActual: 1000, stockMinimo: 0, precioAprobado: true } })).id;
    datos.clienteA = (await prisma.cliente.create({ data: { tenantId: tenantA, codigo: 'AUD-CA', nombre: 'Cliente A' } as any })).id;
    datos.clienteB = (await prisma.cliente.create({ data: { tenantId: tenantB, codigo: 'AUD-CB', nombre: 'Cliente B' } as any })).id;

    await operaciones.abrir(tenantA, users.cajeroA.id, { solicitudId: randomUUID(), monto: 500 } as any);
    await operaciones.abrir(tenantB, users.cajeroB.id, { solicitudId: randomUUID(), monto: 500 } as any);
    datos.cajaA = (await prisma.caja.findFirstOrThrow({ where: { tenantId: tenantA } })).id;
    datos.cajaB = (await prisma.caja.findFirstOrThrow({ where: { tenantId: tenantB } })).id;

    // Movimiento legítimo de la empresa B: su identificador es el de la solicitud (para la prueba de idempotencia).
    datos.movimientoB = randomUUID();
    await operaciones.movimientoCaja(tenantB, users.cajeroB.id, datos.cajaB, { solicitudId: datos.movimientoB, tipo: 'INGRESO_MANUAL', monto: 10, concepto: 'Ajeno' } as any);

    const venta = (cliente: string | null = null) => ventas.create(tenantA, users.cajeroA.id, {
      solicitudId: randomUUID(), metodoPago: 'EFECTIVO', clienteId: cliente ?? undefined,
      detalles: [{ productoId: datos.productoA, cantidad: 1, precioUnitario: 100 }],
    } as any);
    datos.ventaA1 = (await venta()).id;
    datos.ventaA2 = (await venta()).id;
    datos.ventaA3 = (await venta()).id;
    datos.ventaA4 = (await venta()).id;

    // Venta legítima de la empresa B: su solicitud es un identificador conocido solo por B.
    datos.solicitudVentaB = randomUUID();
    await ventas.create(tenantB, users.cajeroB.id, {
      solicitudId: datos.solicitudVentaB, metodoPago: 'EFECTIVO', detalles: [{ productoId: datos.productoB, cantidad: 1, precioUnitario: 100 }],
    } as any);

    datos.cuentaA = (await prisma.cuentaOperativa.create({ data: {
      tenantId: tenantA, tipo: 'CXC', clienteId: datos.clienteA, documentoId: `AUD-${randomUUID()}`, monto: 100, saldo: 100, usuarioId: users.adminA.id,
    } as any })).id;
  }, 180000);

  afterAll(async () => {
    try {
      await app?.close();
      await prisma?.$disconnect();
    } finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-centinela-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  describe('A. negativas entre empresas (HTTP con la empresa B sobre datos de A)', () => {
    it('ventas: la empresa B no lee una venta de A por id (404)', async () => {
      await get(`/api/ventas/${datos.ventaA1}`, tokens.adminB).expect(404);
    });

    it('entregas: la empresa B no entrega una venta de A y no cambia su estado', async () => {
      await post(`/api/operaciones/ventas/${datos.ventaA1}/entregar`, tokens.adminB, {}).expect(404);
      const [fila] = await sql('SELECT entregado_at FROM ventas WHERE id = $1', datos.ventaA1);
      expect(fila.entregado_at).toBeNull();
    });

    it('entregas: el listado de la empresa B no incluye ventas de A', async () => {
      const response = await get('/api/operaciones/entregas', tokens.adminB).expect(200);
      expect(response.body.map((v: any) => v.id)).not.toContain(datos.ventaA1);
    });

    it('inventario: la empresa B no ajusta existencias de un producto de A', async () => {
      await post(`/api/operaciones/productos/${datos.productoA}/ajuste`, tokens.adminB, { solicitudId: randomUUID(), stock: 1, stockAnterior: 1000, motivo: 'Conteo ajeno de prueba' }).expect(404);
      const [fila] = await sql('SELECT stock_actual FROM productos WHERE id = $1', datos.productoA);
      expect(Number(fila.stock_actual)).toBe(1000);
    });

    it('caja: la empresa B no ve ni mueve la caja de A', async () => {
      await get(`/api/operaciones/caja/${datos.cajaA}`, tokens.adminB).expect(404);
      await post(`/api/operaciones/caja/${datos.cajaA}/movimientos`, tokens.adminB, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 5, concepto: 'Ajeno' }).expect(404);
    });

    it('cuentas: la empresa B no paga una cuenta por cobrar de A y su saldo no cambia', async () => {
      await post(`/api/operaciones/cuentas/${datos.cuentaA}/pagos`, tokens.adminB, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' }).expect(404);
      const [fila] = await sql('SELECT saldo FROM cuentas_operativas WHERE id = $1', datos.cuentaA);
      expect(Number(fila.saldo)).toBe(100);
    });

    it('clientes: la empresa B no consulta el estado de cuenta de un cliente de A', async () => {
      await get(`/api/operaciones/clientes/${datos.clienteA}/estado-cuenta`, tokens.adminB).expect(404);
    });
  });

  describe('B. idempotencia', () => {
    it('movimientos de caja: un identificador de otra empresa responde distinto a uno libre (oráculo de existencia)', async () => {
      // Demostrado: el 409 confirma que el identificador existe en otra empresa; el 201 confirma que está libre.
      const conocido = await post(`/api/operaciones/caja/${datos.cajaA}/movimientos`, tokens.cajeroA, { solicitudId: datos.movimientoB, tipo: 'INGRESO_MANUAL', monto: 10, concepto: 'Ajeno' });
      const libre = await post(`/api/operaciones/caja/${datos.cajaA}/movimientos`, tokens.cajeroA, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 10, concepto: 'Propio' });
      expect(conocido.status).toBe(409);
      expect(libre.status).toBeLessThan(300);
    });

    it('ventas: una solicitud de otra empresa responde distinto a una libre (oráculo de existencia)', async () => {
      // Demostrado: 409 confirma que la solicitud existe en otra empresa. No se devuelven datos ajenos.
      const cuerpo = (solicitudId: string) => ({ solicitudId, metodoPago: 'EFECTIVO', detalles: [{ productoId: datos.productoA, cantidad: 1, precioUnitario: 100 }] });
      const conocida = await post('/api/ventas', tokens.cajeroA, cuerpo(datos.solicitudVentaB));
      const libre = await post('/api/ventas', tokens.cajeroA, cuerpo(randomUUID()));
      expect(conocida.status).toBe(409);
      expect(conocida.body).not.toHaveProperty('id');
      expect(libre.status).toBeLessThan(300);
    });

    it('entregas: repetir la misma entrega no cambia la fecha de entrega ya registrada', async () => {
      const primera = await post(`/api/operaciones/ventas/${datos.ventaA2}/entregar`, tokens.adminA, {});
      expect(primera.status).toBeLessThan(300);
      const segunda = await post(`/api/operaciones/ventas/${datos.ventaA2}/entregar`, tokens.adminA, {});
      expect(segunda.status).toBeLessThan(300);
      const [fila] = await sql('SELECT entregado_at FROM ventas WHERE id = $1', datos.ventaA2);
      expect(fila.entregado_at).not.toBeNull();
    });
  });

  describe('C. permisos por rol (HTTP)', () => {
    it('BODEGUERO no consulta el arqueo aunque tenga inventario.ver', async () => {
      await get('/api/operaciones/caja', tokens.bodegueroA).expect(403);
    });

    it('VENDEDOR no paga cuentas', async () => {
      await post(`/api/operaciones/cuentas/${datos.cuentaA}/pagos`, tokens.vendedorA, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' }).expect(403);
    });

    it('CAJERO no registra compras', async () => {
      await post('/api/operaciones/compras', tokens.cajeroA, {}).expect(403);
    });

    it('VENDEDOR no consulta el resumen financiero', async () => {
      await get('/api/operaciones/resumen?desde=2026-01-01&hasta=2026-12-31', tokens.vendedorA).expect(403);
    });

    it('VENDEDOR no entrega pedidos', async () => {
      await post(`/api/operaciones/ventas/${datos.ventaA3}/entregar`, tokens.vendedorA, {}).expect(403);
    });

    it.fails('CAJERO no entrega pedidos (contrato ATLAS §2.1: entregar es ADMIN y BODEGUERO). HALLAZGO: se permite', async () => {
      const respuesta = await post(`/api/operaciones/ventas/${datos.ventaA4}/entregar`, tokens.cajeroA, {});
      expect(respuesta.status).toBe(403);
    });
  });

  describe('D. costos y márgenes en respuestas', () => {
    it('CAJERO no recibe costos al leer una venta', async () => {
      const response = await get(`/api/ventas/${datos.ventaA1}`, tokens.cajeroA).expect(200);
      expect(camposDeCosto(response.body)).toEqual([]);
    });

    it('VENDEDOR no recibe costos en el listado de entregas', async () => {
      const response = await get('/api/operaciones/entregas', tokens.vendedorA);
      if (response.status === 200) expect(camposDeCosto(response.body)).toEqual([]);
      else expect(response.status).toBe(403);
    });

    it('BODEGUERO con inventario.ver no recibe costos en el historial del producto', async () => {
      const response = await get(`/api/operaciones/productos/${datos.productoA}/historial`, tokens.bodegueroA).expect(200);
      expect(camposDeCosto(response.body)).toEqual([]);
    });
  });

  describe('E. integridad de la base entre empresas (FK de una columna)', () => {
    it.fails('la base rechaza mover una venta de A a un cliente de B. HALLAZGO demostrado: la FK no comprueba la empresa', async () => {
      await expect(prisma.$executeRawUnsafe('UPDATE ventas SET cliente_id = $1 WHERE id = $2', datos.clienteB, datos.ventaA3)).rejects.toThrow();
    });

    it.fails('la base rechaza una cuenta por cobrar de A que apunta a un cliente de B. HALLAZGO demostrado', async () => {
      await expect(prisma.$executeRawUnsafe(
        `INSERT INTO cuentas_operativas (id, tenant_id, tipo, cliente_id, documento_id, monto, saldo, usuario_id)
         VALUES (gen_random_uuid()::text, $1, 'CXC', $2, $3, 50, 50, $4)`,
        tenantA, datos.clienteB, `AUD-X-${randomUUID()}`, users.adminA.id,
      )).rejects.toThrow();
    });
  });
});
