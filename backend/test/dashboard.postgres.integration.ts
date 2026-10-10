import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

// Dashboard contra PostgreSQL real con clúster temporal y cadena completa de migraciones.
// Nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Dashboard / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let dashboard: DashboardService;
  let tenantId: string;
  let app: INestApplication;
  let psqlEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-dashboard-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    psqlEnv = env;
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
    dashboard = new DashboardService(prisma);
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboard }, { provide: PrismaService, useValue: prisma }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: any) {
        context.switchToHttp().getRequest().user = { tenantId, type: 'tenant', rol: 'ADMIN' };
        return true;
      },
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  }, 120000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-dashboard-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Dashboard de prueba' } });
  });

  it('responde sin error con un negocio sin datos', async () => {
    const data = await dashboard.getDashboardData(tenantId);
    expect(data.ventasDelDia.total).toBe(0);
    expect(data.tendenciaSemanal).toHaveLength(7);
  });

  it('responde sin error con ventas, devoluciones, stock bajo y cotizaciones', async () => {
    const usuario = await prisma.usuario.create({ data: { tenantId, nombre: 'Cajero', email: `c-${tenantId}@prueba.test`, passwordHash: 'x', rol: 'ADMIN' } as any });
    const producto = await prisma.producto.create({ data: { tenantId, codigo: 'P-1', nombre: 'Clavo', precioVenta: 10, precioCosto: 5, stockActual: 1, stockMinimo: 5 } as any });
    const hace = (h: number) => new Date(Date.now() - h * 3600 * 1000);
    for (const [i, createdAt] of [[1, hace(1)], [2, hace(30)]] as const) {
      await prisma.venta.create({ data: { tenantId, numeroVenta: i, usuarioId: usuario.id, subtotal: 100, isv: 15, total: 115, estado: 'COMPLETADA', createdAt, detalles: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 100, subtotal: 100 }] } } as any });
    }
    const venta = await prisma.venta.findFirstOrThrow({ where: { tenantId, numeroVenta: 1 } });
    await prisma.devolucion.create({ data: { tenantId, ventaId: venta.id, usuarioId: usuario.id, solicitudHash: 'h', motivo: 'Prueba', monto: 10, creditoCancelado: 0, reembolso: 10, metodo: 'EFECTIVO' } as any });
    await prisma.cotizacion.create({ data: { tenantId, numeroCotizacion: 1, usuarioId: usuario.id, subtotal: 100, isv: 15, total: 115, fechaValidez: new Date(new Date().toISOString().slice(0, 10)), estado: 'ENVIADA' } as any });

    const data = await dashboard.getDashboardData(tenantId);

    expect(data.alertasStock.cantidad).toBe(1);
    expect(data.cotizacionesPendientes.cantidad).toBe(1);
    expect(data.ultimasVentas.length).toBeGreaterThan(0);
  });

  it.each([
    ['productos', 'version'],
    ['ventas', 'reserva_pendiente'],
    ['cotizaciones', 'cliente_email'],
  ])('no depende de %s.%s que el resumen no utiliza', async (tabla, columna) => {
    const usuario = await prisma.usuario.create({ data: { tenantId, nombre: 'Cajero real', email: `${tenantId}@example.test`, passwordHash: 'x' } });
    await prisma.venta.create({ data: { tenantId, usuarioId: usuario.id, numeroVenta: 1, subtotal: 125, isv: 0, total: 125 } });
    await prisma.producto.create({ data: { tenantId, codigo: 'P', nombre: 'Producto real', precioVenta: 10, precioCosto: 5, stockActual: 3, stockReservado: 2, stockMinimo: 1 } });
    await prisma.cotizacion.create({ data: { tenantId, usuarioId: usuario.id, numeroCotizacion: 1, subtotal: 10, isv: 0, total: 10, fechaValidez: new Date() } });
    // DDL exclusivamente en el clúster temporal. Renombrar conserva datos, índices y defaults.
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tabla}" RENAME COLUMN "${columna}" TO "${columna}_prueba"`);
    try {
      const { body: data } = await request(app.getHttpServer()).get('/dashboard').expect(200);
      expect(data.ultimasVentas).toHaveLength(1);
      expect(data.ultimasVentas[0]).toMatchObject({ total: 125, cajero: 'Cajero real' });
      expect(data.alertasStock.items[0]).toMatchObject({ nombre: 'Producto real', stockActual: '3' });
      expect(data.cotizacionesPendientes.cantidad).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${tabla}" RENAME COLUMN "${columna}_prueba" TO "${columna}"`);
    }
  });

  it('propaga P2022 si falta stock_reservado, necesario para calcular el stock disponible', async () => {
    await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN stock_reservado TO stock_reservado_prueba');
    try {
      await expect(dashboard.getDashboardData(tenantId)).rejects.toMatchObject({ code: 'P2022' });
      await request(app.getHttpServer()).get('/dashboard').expect(500);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN stock_reservado_prueba TO stock_reservado');
    }
  });

  it('ejecuta el diagnóstico con un rol sin permisos de escritura y detecta columnas ausentes', async () => {
    await prisma.$executeRawUnsafe('CREATE ROLE dashboard_lectura LOGIN');
    await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO dashboard_lectura');
    await prisma.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_lectura');
    await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN version TO version_prueba');
    try {
      const output = execFileSync(exe('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-f', resolve('scripts/diagnostico-dashboard-lectura.sql')], {
        env: { ...psqlEnv, PGUSER: 'dashboard_lectura' }, encoding: 'utf8', timeout: 30000,
      });
      expect(output).toContain('productos');
      expect(output).toContain('version');
      expect(output).toContain('ROLLBACK');
      expect(output).toContain('Sin tabla _prisma_migrations');
      const requiredSection = output.split('COLUMNAS DEL ESQUEMA COMPLETO')[0];
      expect(requiredSection).toContain('(0 rows)');
      expect(output).not.toContain('password_hash');
      expect(await prisma.producto.count({ where: { tenantId } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN version_prueba TO version');
      await prisma.$executeRawUnsafe('DROP OWNED BY dashboard_lectura');
      await prisma.$executeRawUnsafe('DROP ROLE dashboard_lectura');
    }
  });

  it('el resumen no devuelve registros de otro tenant', async () => {
    const otroTenant = await prisma.tenant.create({ data: { nombreComercial: 'Otro negocio' } });
    const usuario = await prisma.usuario.create({ data: { tenantId: otroTenant.id, nombre: 'Otro cajero', email: `${otroTenant.id}@example.test`, passwordHash: 'x' } });
    await prisma.venta.create({ data: { tenantId: otroTenant.id, usuarioId: usuario.id, numeroVenta: 1, subtotal: 900, isv: 0, total: 900 } });
    await prisma.producto.create({ data: { tenantId: otroTenant.id, codigo: 'OTRO', nombre: 'Otro producto', precioVenta: 10, precioCosto: 5, stockActual: 0, stockMinimo: 5 } });
    await prisma.cotizacion.create({ data: { tenantId: otroTenant.id, usuarioId: usuario.id, numeroCotizacion: 1, subtotal: 10, isv: 0, total: 10, fechaValidez: new Date() } });
    const { body } = await request(app.getHttpServer()).get('/dashboard').expect(200);
    expect(body.ultimasVentas).toEqual([]);
    expect(body.alertasStock.cantidad).toBe(0);
    expect(body.cotizacionesPendientes.cantidad).toBe(0);
    expect(body.ventasDelDia.total).toBe(0);
    expect(body.tendenciaSemanal.every((dia: { total: number }) => dia.total === 0)).toBe(true);
  });
});
