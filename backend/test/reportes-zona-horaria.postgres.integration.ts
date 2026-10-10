import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { ZONA_HORARIA_NEGOCIO } from '../src/common/zona-horaria';

// FS-05: reportes por día calendario de America/Tegucigalpa sobre PostgreSQL real.
// Nunca lee DATABASE_URL: crea un clúster exclusivo y temporal, sin datos existentes.
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
const executable = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));

// Zonas de sesión de PostgreSQL con las que se repite la prueba. El resultado debe ser idéntico en todas.
const ZONAS_SESION = ['UTC', 'Asia/Tokyo', ZONA_HORARIA_NEGOCIO, 'Pacific/Pago_Pago'];

// Ventas (hora local Tegucigalpa = UTC-6) alrededor de la medianoche del 9 de octubre.
const FIXTURE = {
  // 2026-10-08 23:59:59.999 local: último ms del día anterior.
  anteriorUltimoMs: { instante: '2026-10-09T05:59:59.999Z', estado: 'COMPLETADA', metodo: 'EFECTIVO', total: 1000, cantidad: 100 },
  // 2026-10-09 00:00:00.000 local: primer ms del día.
  primerMs: { instante: '2026-10-09T06:00:00.000Z', estado: 'COMPLETADA', metodo: 'EFECTIVO', total: 10, cantidad: 1 },
  // 2026-10-09 20:30 local (02:30 UTC del día 10): caso que el filtro UTC asignaba al día siguiente.
  noche: { instante: '2026-10-10T02:30:00.000Z', estado: 'COMPLETADA', metodo: 'TARJETA', total: 20, cantidad: 2 },
  // 2026-10-09 23:59:59.999 local: último ms del día.
  ultimoMs: { instante: '2026-10-10T05:59:59.999Z', estado: 'COMPLETADA', metodo: 'EFECTIVO', total: 30, cantidad: 3 },
  // 2026-10-10 00:00:00.000 local: primer ms del día siguiente.
  siguientePrimerMs: { instante: '2026-10-10T06:00:00.000Z', estado: 'COMPLETADA', metodo: 'TARJETA', total: 2000, cantidad: 7 },
  // Anulada el 9 de octubre: nunca debe contar.
  anulada: { instante: '2026-10-09T18:00:00.000Z', estado: 'ANULADA', metodo: 'EFECTIVO', total: 500, cantidad: 50 },
} as const;

describe('Reportes FS-05 / PostgreSQL aislado', () => {
  let directory: string;
  let started = false;
  let port: number;
  let databaseUrl: string;
  let prisma: PrismaService;

  // Ejecuta psql contra el clúster temporal.
  const psql = (sql: string) => execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
  const psqlFile = (file: string) => execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', file], { windowsHide: true, timeout: 30000, stdio: 'ignore' });

  // Crea una conexión nueva cuyas sesiones usan la zona indicada como zona por defecto de la base.
  async function conectarConZonaSesion(zona: string) {
    if (prisma) await prisma.$disconnect();
    psql(`ALTER DATABASE postgres SET timezone TO '${zona}'`);
    prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    const [{ timezone }] = await prisma.$queryRawUnsafe<{ timezone: string }[]>("SELECT current_setting('TimeZone') AS timezone");
    expect(timezone).toBe(zona);
  }

  beforeAll(async () => {
    if (!existsSync(executable('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-postgres-'));
    execFileSync(executable('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8'], { windowsHide: true, timeout: 30000 });
    const server = createServer();
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
    } catch (error) {
      if (existsSync(join(directory, 'postgres.log'))) console.error(readFileSync(join(directory, 'postgres.log'), 'utf8'));
      throw error;
    }
    started = true;
    // Mismo arranque que test/ventas.postgres.integration.ts: esquema anterior + migraciones reales.
    const oldSchema = readFileSync(resolve('test/fixtures/schema-main.prisma'), 'utf8')
      .replace(/^.*secuenciaCliente SecuenciaCliente\?.*\r?\n/m, '')
      .replace(/^.*numeroCliente Int.*\r?\n/m, '')
      .replace(/^.*@@unique\(\[tenantId, numeroCliente\]\).*\r?\n/m, '')
      .replace(/\r?\nmodel SecuenciaCliente \{[\s\S]*?\r?\n\}/, '');
    writeFileSync(join(directory, 'old-schema.prisma'), oldSchema);
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', join(directory, 'old-schema.prisma'), '--script'], { windowsHide: true, timeout: 30000 });
    writeFileSync(join(directory, 'schema.sql'), ddl);
    psqlFile(join(directory, 'schema.sql'));
    for (const migration of [
      '20260930000000_alter_stock_decimal_and_operational_models',
      '20261002000000_add_customer_numbers',
      '20261004000000_operacion_ferreteria',
      '20261005000000_autorizaciones_devolucion',
      '20261005000000_compras_proveedor_y_costo_vigente',
      '20261006000000_clientes_credito',
      '20261006000100_tenant_configuration',
      '20261009000000_levantamiento_multiusuario', '20261009120000_fs06_marca_idempotencia_levantamiento', '20261009130000_fs07_version_producto', '20261010140000_productos_proveedores',
    ]) {
      psqlFile(resolve(`prisma/migrations/${migration}/migration.sql`));
    }
    databaseUrl = `postgresql://postgres@127.0.0.1:${port}/postgres?connection_limit=8`;
    await conectarConZonaSesion('UTC');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (started) execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
    // Solo se elimina la carpeta aleatoria que este test acaba de crear.
    if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-postgres-')) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  // Siembra un tenant con las ventas del fixture. Cada prueba usa su propio tenant.
  async function sembrar() {
    const tenantId = randomUUID();
    const usuarioId = randomUUID();
    const productoId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería prueba' } });
    await prisma.usuario.create({ data: { id: usuarioId, tenantId, nombre: 'Cajero prueba', email: `${usuarioId}@example.test`, passwordHash: 'test-only' } });
    await prisma.producto.create({ data: { id: productoId, tenantId, codigo: 'P1', nombre: 'Cable', precioVenta: 10, precioCosto: 5, stockActual: 1000, stockMinimo: 0 } });
    let numero = 0;
    const ventaIds: Record<string, string> = {};
    for (const [clave, v] of Object.entries(FIXTURE)) {
      const id = randomUUID();
      ventaIds[clave] = id;
      await prisma.venta.create({
        data: {
          id, tenantId, usuarioId, numeroVenta: ++numero, subtotal: v.total, isv: 0, total: v.total,
          metodoPago: v.metodo as any, estado: v.estado as any, createdAt: new Date(v.instante),
          detalles: { create: [{ productoId, cantidad: v.cantidad, precioUnitario: v.total / v.cantidad, subtotal: v.total }] },
        },
      });
    }
    // Devolución el 9 de octubre a las 23:30 local (cuenta) y otra el 10 a las 00:00 local (no cuenta el 9).
    const solicitudBase = { tenantId, usuarioId, ventaId: ventaIds.primerMs, motivo: 'prueba', creditoCancelado: 0, reembolso: 0, metodo: 'EFECTIVO', solicitudHash: randomUUID() };
    await prisma.devolucion.create({ data: { ...solicitudBase, monto: 15, createdAt: new Date('2026-10-10T05:30:00.000Z') } });
    await prisma.devolucion.create({ data: { ...solicitudBase, solicitudHash: randomUUID(), monto: 99, createdAt: new Date('2026-10-10T06:00:00.000Z') } });
    return { tenantId, productoId };
  }

  const ops = () => new OperacionesService(prisma);
  const porMetodo = (metodos: any[]) => Object.fromEntries(metodos.map((m) => [m.metodo_pago, { cantidad: m.cantidad, total: Number(m.total) }]));

  describe.each(ZONAS_SESION)('con zona de sesión PostgreSQL %s', (zonaSesion) => {
    beforeAll(async () => {
      await conectarConZonaSesion(zonaSesion);
    });

    it('incluye exactamente los instantes del día local y excluye los bordes', async () => {
      const { tenantId } = await sembrar();
      const r = await ops().resumen(tenantId, '2026-10-09', '2026-10-09');
      // EFECTIVO: primerMs (10) + ultimoMs (30); TARJETA: noche (20). Excluidos: anterior 23:59:59.999, siguiente 00:00, anulada.
      expect(porMetodo(r.metodos)).toEqual({ EFECTIVO: { cantidad: 2, total: 40 }, TARJETA: { cantidad: 1, total: 20 } });
      expect(r.rotacion).toHaveLength(1);
      expect(Number(r.rotacion[0].cantidad)).toBe(FIXTURE.primerMs.cantidad + FIXTURE.noche.cantidad + FIXTURE.ultimoMs.cantidad);
      expect(r.devoluciones[0]).toMatchObject({ cantidad: 1 });
      expect(Number(r.devoluciones[0].monto)).toBe(15);
    });

    it('la venta de las 20:30 local queda el 9 de octubre, no el 10', async () => {
      const { tenantId } = await sembrar();
      const dia10 = await ops().resumen(tenantId, '2026-10-10', '2026-10-10');
      expect(porMetodo(dia10.metodos)).toEqual({ TARJETA: { cantidad: 1, total: 2000 } });
    });

    it('días consecutivos particionan las ventas: cada una cuenta una sola vez', async () => {
      const { tenantId } = await sembrar();
      const dias = ['2026-10-08', '2026-10-09', '2026-10-10'];
      const por = await Promise.all(dias.map((d) => ops().resumen(tenantId, d, d)));
      const cantidad = por.reduce((s, r) => s + r.metodos.reduce((a: number, m: any) => a + m.cantidad, 0), 0);
      const total = por.reduce((s, r) => s + r.metodos.reduce((a: number, m: any) => a + Number(m.total), 0), 0);
      const completadas = Object.values(FIXTURE).filter((v) => v.estado === 'COMPLETADA');
      expect(cantidad).toBe(completadas.length);
      expect(total).toBe(completadas.reduce((s, v) => s + v.total, 0));
      expect(porMetodo(por[0].metodos)).toEqual({ EFECTIVO: { cantidad: 1, total: 1000 } });
      expect(porMetodo(por[2].metodos)).toEqual({ TARJETA: { cantidad: 1, total: 2000 } });
    });

    it('rango multi-día inclusivo: 8 al 10 incluye el último día completo', async () => {
      const { tenantId } = await sembrar();
      const r = await ops().resumen(tenantId, '2026-10-08', '2026-10-10');
      const cantidad = r.metodos.reduce((a: number, m: any) => a + m.cantidad, 0);
      const total = r.metodos.reduce((a: number, m: any) => a + Number(m.total), 0);
      expect(cantidad).toBe(5);
      expect(total).toBe(3060);
      // Devolución del 9 a las 23:30 local (15) y la del 10 a las 00:00 local (99): ambas dentro del rango.
      expect(Number(r.devoluciones[0].monto)).toBe(114);
      expect(r.devoluciones[0].cantidad).toBe(2);
    });

    it('POS, reportes y dashboard coinciden en el neto de hoy', async () => {
      const { tenantId } = await sembrar();
      // 2026-10-10 03:30 UTC = 2026-10-09 21:30 local.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-10T03:30:00.000Z'));
      try {
        const dash = await new DashboardService(prisma).getDashboardData(tenantId);
        const r = await ops().resumen(tenantId, '2026-10-09', '2026-10-09');
        const netoReporte = r.metodos.reduce((a: number, m: any) => a + Number(m.total), 0) - Number(r.devoluciones[0].monto);
        expect(dash.ventasDelDia.cantidad).toBe(3);
        expect(dash.ventasDelDia.total).toBe(netoReporte);
        expect(dash.ventasDelDia.total).toBe(45);
        expect(dash.tendenciaSemanal.at(-1)).toMatchObject({ fecha: '2026-10-09', esHoy: true });
        expect(dash.tendenciaSemanal.at(-1)!.total).toBe(60);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
