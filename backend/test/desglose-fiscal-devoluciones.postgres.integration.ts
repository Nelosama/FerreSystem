import { devolucionAutorizada } from './helpers/devolucion-autorizada';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';

// Desglose fiscal histórico por línea (migración 20261029000000_desglose_fiscal_linea) y devoluciones de ventas gravadas,
// exentas y mixtas. PostgreSQL real en un clúster temporal, cadena completa de migraciones, servicios reales, datos sintéticos.
// El interruptor FISCAL_DESGLOSE_POR_LINEA está apagado por defecto; las pruebas lo encienden solo donde lo indican.
describe('Desglose fiscal por línea y devoluciones / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let ops: OperacionesService;
  let cotizaciones: CotizacionesService;
  let tenant: string;
  let admin: string;
  let gravado: string;
  let exento: string;

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const conInterruptor = async <T>(fn: () => Promise<T>): Promise<T> => {
    const antes = process.env.FISCAL_DESGLOSE_POR_LINEA;
    process.env.FISCAL_DESGLOSE_POR_LINEA = 'true';
    try { return await fn(); } finally { if (antes === undefined) delete process.env.FISCAL_DESGLOSE_POR_LINEA; else process.env.FISCAL_DESGLOSE_POR_LINEA = antes; }
  };
  const lineas = (ventaId: string) => sql(`SELECT d.id, d.producto_id, d.cantidad::float AS cantidad, d.subtotal::float AS subtotal, d.exento,
      d.base_gravada::float AS base_gravada, d.base_exenta::float AS base_exenta, d.isv::float AS isv, d.tasa_isv::float AS tasa_isv
    FROM detalles_venta d WHERE d.venta_id=$1 ORDER BY d.subtotal DESC`, ventaId);
  const destino = async (ventaId: string) => (await sql('SELECT reserva_pendiente FROM ventas WHERE id=$1', ventaId))[0].reserva_pendiente ? 'NO_ENTREGADO' : 'INVENTARIO';
  const devolver = async (ventaId: string, detalleId: string, cantidad: number) => devolucionAutorizada(prisma, ops, tenant, admin, ventaId,
    { solicitudId: randomUUID(), metodo: 'EFECTIVO', motivo: 'Devolución de prueba', items: [{ detalleId, cantidad, destino: await destino(ventaId) }] } as any);
  const desgloseDevuelto = (devolucionId: string) => sql(`SELECT base_gravada::float AS base_gravada, base_exenta::float AS base_exenta, isv::float AS isv
    FROM detalles_devolucion WHERE devolucion_id=$1`, devolucionId);
  const suma = (filas: any[], campo: string) => Math.round(filas.reduce((s, f) => s + Number(f[campo]), 0) * 100) / 100;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-desglose-fiscal-'));
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
    ops = new OperacionesService(prisma);
    cotizaciones = new CotizacionesService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-desglose-fiscal-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenant = randomUUID(); admin = randomUUID();
    await prisma.tenant.create({ data: { id: tenant, nombreComercial: 'Desglose', estado: 'ACTIVO' } as any });
    await prisma.usuario.create({ data: { id: admin, tenantId: tenant, nombre: 'Admin', email: `${admin}@test.invalid`, passwordHash: 'x', rol: 'ADMIN', permisosConfigurados: false, permisos: [] } as any });
    gravado = (await prisma.producto.create({ data: { tenantId: tenant, codigo: 'GRAV', nombre: 'Martillo', precioCosto: 40, precioVenta: 100, stockActual: 100, precioAprobado: true } as any })).id;
    exento = (await prisma.producto.create({ data: { tenantId: tenant, codigo: 'EXEN', nombre: 'Producto exento sintético', precioCosto: 20, precioVenta: 50, stockActual: 100, precioAprobado: true } as any })).id;
    await ops.abrir(tenant, admin, { solicitudId: randomUUID(), monto: 1000 } as any);
  });

  it('interruptor apagado (por defecto): la venta queda sin desglose y la devolución usa la regla vigente', async () => {
    const v = await ventas.create(tenant, admin, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: gravado, cantidad: 3 }] } as any);
    const [l] = await lineas(v.id);
    expect([l.exento, l.base_gravada, l.base_exenta, l.isv, l.tasa_isv]).toEqual([null, null, null, null, null]);
    const d = await devolver(v.id, l.id, 1);
    expect(Number(d.monto)).toBe(115);
    expect(await desgloseDevuelto(d.id)).toEqual([{ base_gravada: null, base_exenta: null, isv: null }]);
  });

  it('venta gravada del POS con descuento: el desglose suma la venta y las parciales devuelven exactamente su ISV', async () => {
    await conInterruptor(async () => {
      const v = await ventas.create(tenant, admin, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 10, detalles: [{ productoId: gravado, cantidad: 3 }, { productoId: exento, cantidad: 1 }] } as any);
      expect([Number(v.subtotal), Number(v.descuento), Number(v.isv), Number(v.total)]).toEqual([350, 10, 51, 391]);
      const ls = await lineas(v.id);
      // El POS no conoce exenciones: ambas líneas quedan gravadas al 15 %.
      expect(ls.map(l => [l.exento, l.tasa_isv, l.base_exenta])).toEqual([[false, 15, 0], [false, 15, 0]]);
      expect([suma(ls, 'base_gravada'), suma(ls, 'isv')]).toEqual([340, 51]);
      const partes = [await devolver(v.id, ls[0].id, 1), await devolver(v.id, ls[0].id, 1), await devolver(v.id, ls[0].id, 1), await devolver(v.id, ls[1].id, 1)];
      expect(Math.round(partes.reduce((s, p) => s + Number(p.monto), 0) * 100) / 100).toBe(391);
      const devuelto = (await Promise.all(partes.map(p => desgloseDevuelto(p.id)))).flat();
      expect([suma(devuelto, 'base_gravada'), suma(devuelto, 'base_exenta'), suma(devuelto, 'isv')]).toEqual([340, 0, 51]);
    });
  });

  it('venta mixta desde cotización: la línea exenta conserva su condición y su devolución no reembolsa ISV', async () => {
    await conInterruptor(async () => {
      const cot = await cotizaciones.create(tenant, admin, { detalles: [{ productoId: gravado, cantidad: 1 }, { productoId: exento, cantidad: 2, exento: true }] } as any);
      expect([cot.subtotal, cot.isv, cot.total]).toEqual([200, 15, 215]);
      const { ventaId } = await cotizaciones.convertirAVenta(tenant, admin, cot.id);
      const ls = await lineas(ventaId);
      const g = ls.find(l => l.producto_id === gravado)!, e = ls.find(l => l.producto_id === exento)!;
      expect([g.exento, g.base_gravada, g.base_exenta, g.isv]).toEqual([false, 100, 0, 15]);
      expect([e.exento, e.base_gravada, e.base_exenta, e.isv]).toEqual([true, 0, 100, 0]);
      // Devolución parcial de la exenta: 1 de 2 → 50.00 sin ISV (la regla anterior, por proporción del total, daría 53.75).
      const d1 = await devolver(ventaId, e.id, 1);
      expect(Number(d1.monto)).toBe(50);
      expect(await desgloseDevuelto(d1.id)).toEqual([{ base_gravada: 0, base_exenta: 50, isv: 0 }]);
      const d2 = await devolver(ventaId, g.id, 1);
      expect(Number(d2.monto)).toBe(115);
      expect(await desgloseDevuelto(d2.id)).toEqual([{ base_gravada: 100, base_exenta: 0, isv: 15 }]);
      const d3 = await devolver(ventaId, e.id, 1);
      expect(Number(d1.monto) + Number(d2.monto) + Number(d3.monto)).toBe(215);
    });
  });

  it('ejemplo obligatorio: L 100 gravados + L 50 exentos; devolver solo la exenta reembolsa L 50 (no L 55)', async () => {
    await conInterruptor(async () => {
      const cot = await cotizaciones.create(tenant, admin, { detalles: [{ productoId: gravado, cantidad: 1 }, { productoId: exento, cantidad: 1, exento: true }] } as any);
      expect([cot.subtotal, cot.isv, cot.total]).toEqual([150, 15, 165]);
      const { ventaId } = await cotizaciones.convertirAVenta(tenant, admin, cot.id);
      const e = (await lineas(ventaId)).find(l => l.exento)!;
      const solicitud = randomUUID();
      const d = await devolucionAutorizada(prisma, ops, tenant, admin, ventaId,
        { solicitudId: solicitud, metodo: 'EFECTIVO', motivo: 'Devolución de la línea exenta', items: [{ detalleId: e.id, cantidad: 1, destino: await destino(ventaId) }] } as any);
      expect(Number(d.monto)).toBe(50);
      expect(Number(d.reembolso)).toBe(50);
      expect(await desgloseDevuelto(d.id)).toEqual([{ base_gravada: 0, base_exenta: 50, isv: 0 }]);
      // Reintento con la misma solicitud: devuelve la misma devolución, sin duplicar reembolso ni inventario.
      const repetida = await devolucionAutorizada(prisma, ops, tenant, admin, ventaId,
        { solicitudId: solicitud, metodo: 'EFECTIVO', motivo: 'Devolución de la línea exenta', items: [{ detalleId: e.id, cantidad: 1, destino: await destino(ventaId) }] } as any);
      expect(repetida.id).toBe(d.id);
      expect(await sql('SELECT COUNT(*)::int AS n FROM devoluciones WHERE venta_id=$1', ventaId)).toEqual([{ n: 1 }]);
    });
  });

  it('redondeo: descuento general de 0.01 sobre gravado + exento; parciales de 1 de 3 suman exacto el reembolso de la línea', async () => {
    await conInterruptor(async () => {
      const v = await ventas.create(tenant, admin, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 0.01, detalles: [{ productoId: gravado, cantidad: 3 }] } as any);
      const [l] = await lineas(v.id);
      const partes = [];
      for (let i = 0; i < 3; i++) partes.push(await devolver(v.id, l.id, 1));
      const total = partes.reduce((s, p) => s + Number(p.monto), 0);
      expect(Math.round(total * 100) / 100).toBe(Number(v.total));
      const isv = (await Promise.all(partes.map(p => desgloseDevuelto(p.id)))).flat().reduce((s, x) => s + Number(x.isv), 0);
      expect(Math.round(isv * 100) / 100).toBe(Number(v.isv));
    });
  });

  it('venta mixta con descuento general: reparte el descuento y deja el ISV histórico de la cotización solo en lo gravado', async () => {
    await conInterruptor(async () => {
      const cot = await cotizaciones.create(tenant, admin, { descuentoGeneral: 15, tipoDescuentoGeneral: 'MONTO', detalles: [{ productoId: gravado, cantidad: 1 }, { productoId: exento, cantidad: 1, exento: true }] } as any);
      expect([cot.subtotal, cot.descuento, cot.isv, cot.total]).toEqual([150, 15, 13.5, 148.5]);
      const { ventaId } = await cotizaciones.convertirAVenta(tenant, admin, cot.id);
      const ls = await lineas(ventaId);
      expect(ls.map(l => [l.exento, l.base_gravada, l.base_exenta, l.isv])).toEqual([[false, 90, 0, 13.5], [true, 0, 45, 0]]);
      const venta = await prisma.venta.findUniqueOrThrow({ where: { id: ventaId } });
      expect(suma(ls, 'base_gravada') + suma(ls, 'base_exenta') + suma(ls, 'isv')).toBe(Number(venta.total));
    });
  });

  it('compatibilidad: una venta registrada sin desglose sigue con la regla vigente aunque después se encienda el interruptor', async () => {
    const v = await ventas.create(tenant, admin, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: gravado, cantidad: 12 }] } as any);
    const [l] = await lineas(v.id);
    await conInterruptor(async () => {
      const d = await devolver(v.id, l.id, 9);
      expect(Number(d.monto)).toBe(1035);
      expect(await desgloseDevuelto(d.id)).toEqual([{ base_gravada: null, base_exenta: null, isv: null }]);
    });
  });

  it('las restricciones de la migración rechazan desgloses parciales o incoherentes', async () => {
    const v = await ventas.create(tenant, admin, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: gravado, cantidad: 1 }] } as any);
    const [l] = await lineas(v.id);
    const intentar = (set: string) => sql(`UPDATE detalles_venta SET ${set} WHERE id=$1`, l.id);
    await expect(intentar('exento=false')).rejects.toThrow(/desglose_completo/);
    await expect(intentar('exento=true, base_gravada=0, base_exenta=100, isv=15, tasa_isv=15')).rejects.toThrow(/desglose_valores/);
    await expect(intentar('exento=false, base_gravada=100, base_exenta=1, isv=15, tasa_isv=15')).rejects.toThrow(/desglose_valores/);
    await expect(intentar('exento=false, base_gravada=101, base_exenta=0, isv=15, tasa_isv=15')).rejects.toThrow(/desglose_valores/);
    await expect(intentar('exento=false, base_gravada=100, base_exenta=0, isv=15, tasa_isv=500')).rejects.toThrow(/desglose_valores/);
    await expect(intentar('exento=false, base_gravada=-1, base_exenta=0, isv=15, tasa_isv=15')).rejects.toThrow(/desglose_valores/);
    await intentar('exento=false, base_gravada=100, base_exenta=0, isv=15, tasa_isv=15');
    const d = await devolver(v.id, l.id, 1);
    await expect(sql('UPDATE detalles_devolucion SET base_gravada=-1, base_exenta=0, isv=0 WHERE devolucion_id=$1', d.id)).rejects.toThrow(/desglose_chk/);
  });
});
