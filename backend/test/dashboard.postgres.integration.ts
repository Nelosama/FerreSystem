import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { DashboardService } from '../src/dashboard/dashboard.service';

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
  }, 120000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
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
});
