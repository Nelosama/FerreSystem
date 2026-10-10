import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { calcularTotales } from '../src/common/dinero';

// POS offline de contingencia contra PostgreSQL real: cadena completa de migraciones, clúster temporal exclusivo.
// Nunca lee DATABASE_URL. Ejecutar como usuario no root (initdb lo exige).
describe('Contingencia offline: precio aprobado y reconexión / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let svc: ContingenciaService;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-precio-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((done) => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const options = { windowsHide: true, timeout: 60000, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    svc = new ContingenciaService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-precio-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  let contador = 0;
  /** Empresa nueva con un administrador, un cajero con caja abierta, dos productos y un dispositivo registrado. */
  async function empresa(opciones: { habilitada?: boolean } = {}) {
    const tenantId = randomUUID();
    const admin = randomUUID();
    const cajero = randomUUID();
    const hab = opciones.habilitada ?? true;
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: `Ferretería ${++contador}`, estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: hab } } as any } });
    for (const [id, rol] of [[admin, 'ADMIN'], [cajero, 'CAJERO']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: false, permisos: [] } as any });
    }
    await prisma.caja.create({ data: { tenantId, codigo: 'CAJA-1', usuarioId: cajero, montoApertura: 100, estado: 'ABIERTA' } as any });
    const p1 = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    const p2 = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'BIS-1', nombre: 'Bisagra', precioVenta: 25.5, precioCosto: 10, stockActual: 8 } as any });
    const dispositivoId = randomUUID();
    if (hab) await svc.registrarDispositivo(tenantId, cajero, { dispositivoId, nombre: 'Caja principal' });
    else await prisma.dispositivoPos.create({ data: { id: dispositivoId, tenantId, codigo: '01', nombre: 'Caja principal', registradoPor: admin } });
    return { tenantId, admin, cajero, p1: p1.id, p2: p2.id, dispositivoId };
  }

  /** Emite la ventana y devuelve la instantánea. */
  async function ventana(e: Awaited<ReturnType<typeof empresa>>) {
    const r = await svc.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
    return r.ventana;
  }

  /** Operación de un TOR-1 × 2 (20.00) + ISV 3.00 = 23.00, recibe 25.00, cambio 2.00. */
  function operacion(e: Awaited<ReturnType<typeof empresa>>, ventanaId: string, extra: Partial<Record<string, any>> = {}) {
    const n = ++contador;
    return {
      operacionId: randomUUID(), dispositivoId: e.dispositivoId, ventanaId, secuenciaLocal: n,
      correlativoLocal: `CT-01-${String(n).padStart(4, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero,
      lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }],
      subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
      esquemaVersion: 1, ...extra,
    };
  }
  const enviar = (e: Awaited<ReturnType<typeof empresa>>, ops: any[]) => svc.recibirLote(e.tenantId, e.cajero, 'CAJERO', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: ops } as any);
  const stock = async (id: string) => Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stockActual);
  const ventas = (tenantId: string) => prisma.venta.count({ where: { tenantId } });

  const estadoOp = (id: string) => prisma.operacionContingencia.findUniqueOrThrow({ where: { id } });
  const movimientosCaja = async (tenantId: string) => prisma.movimientoCaja.count({ where: { cajaId: { in: (await prisma.caja.findMany({ where: { tenantId }, select: { id: true } })).map(c => c.id) } } });

  it('el catálogo descargado no incluye productos pendientes de precio ni con precio cero', async () => {
    const e = await empresa();
    const pendiente = await prisma.producto.create({ data: { tenantId: e.tenantId, codigo: 'NUEVO-1', nombre: 'Lámina', precioVenta: 0, precioCosto: 0, stockActual: 30, precioAprobado: false } as any });
    await prisma.producto.update({ where: { id: e.p2 }, data: { precioVenta: 0 } });
    const v = await ventana(e);
    const instantanea = await prisma.catalogoInstantanea.findUniqueOrThrow({ where: { tenantId_hash: { tenantId: e.tenantId, hash: v.catalogoHash } } });
    const ids = (instantanea.datos as any).productos.map((p: any) => p.id);
    expect(ids).toContain(e.p1);
    expect(ids).not.toContain(pendiente.id);
    expect(ids).not.toContain(e.p2);
  });

  it('una venta cuyo producto perdió la aprobación antes de sincronizar queda en revisión: sin venta, stock, caja ni cobro', async () => {
    const e = await empresa();
    const v = await ventana(e);
    await prisma.producto.update({ where: { id: e.p1 }, data: { precioAprobado: false } });
    const op = operacion(e, v.id);
    await enviar(e, [op]);
    const fila = await estadoOp(op.operacionId);
    expect(fila.estado).toBe('REVISION');
    expect((fila.conflictos as any[]).map(c => c.codigo)).toContain('PRODUCTO_SIN_PRECIO_APROBADO');
    expect(await ventas(e.tenantId)).toBe(0);
    expect(await stock(e.p1)).toBe(20);
    expect(await prisma.venta.count({ where: { tenantId: e.tenantId, origen: 'CONTINGENCIA' } })).toBe(0);
  });

  it('una línea cobrada a L 0 de un producto aprobado no se confirma, ni con forzado de administrador', async () => {
    const e = await empresa();
    const v = await ventana(e);
    // Venta con total positivo: una línea a L 0 y otra válida. Sin la revisión, la venta se confirmaría con un ingreso parcial a cero.
    const lineas = [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 0 }, { productoId: e.p2, cantidadCentesimas: 100, precioCentavos: 2550 }];
    const t = calcularTotales(lineas.map(l => ({ precioCentavos: l.precioCentavos, cantidadCentesimas: l.cantidadCentesimas })));
    const op = operacion(e, v.id, { lineas, subtotalCentavos: t.subtotal, isvCentavos: t.isv, totalCentavos: t.total, efectivoRecibidoCentavos: t.total, cambioCentavos: 0 });
    await enviar(e, [op]);
    const fila = await estadoOp(op.operacionId);
    expect(fila.estado).toBe('REVISION');
    expect((fila.conflictos as any[]).map(c => c.codigo)).toContain('PRECIO_NO_VALIDO');
    // Un administrador no puede aceptar una línea a L 0: PRECIO_NO_VALIDO no es superable.
    await (svc as any).aplicarYResumir(e.tenantId, op.operacionId, { forzar: true, resueltoPor: e.admin });
    expect((await estadoOp(op.operacionId)).estado).toBe('REVISION');
    expect(await ventas(e.tenantId)).toBe(0);
    expect(await stock(e.p1)).toBe(20);
    expect(await stock(e.p2)).toBe(8);
  });

  it('precio de venta del servidor en cero con producto aprobado: no se aplica aunque el equipo cobre un precio válido', async () => {
    const e = await empresa();
    const v = await ventana(e);
    await prisma.producto.update({ where: { id: e.p1 }, data: { precioVenta: 0 } });
    const op = operacion(e, v.id);
    await enviar(e, [op]);
    expect((await estadoOp(op.operacionId)).estado).toBe('REVISION');
    expect((await estadoOp(op.operacionId)).conflictos).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'PRECIO_NO_VALIDO' })]));
    expect(await ventas(e.tenantId)).toBe(0);
  });

  it('reconexión: reenvíos mientras el precio está pendiente no crean venta; tras aprobar, una sola venta, un descuento y un movimiento de caja', async () => {
    const e = await empresa();
    const v = await ventana(e);
    await prisma.producto.update({ where: { id: e.p1 }, data: { precioAprobado: false } });
    const op = operacion(e, v.id);
    await enviar(e, [op]);
    await enviar(e, [op]);
    await Promise.all([enviar(e, [op]), enviar(e, [op])]);
    expect((await estadoOp(op.operacionId)).estado).toBe('REVISION');
    expect(await ventas(e.tenantId)).toBe(0);
    expect(await movimientosCaja(e.tenantId)).toBe(0);

    // El administrador aprueba el precio y el equipo reconecta: el mismo UUID se valida de nuevo.
    await prisma.producto.update({ where: { id: e.p1 }, data: { precioAprobado: true, precioVenta: 10 } });
    await Promise.all([enviar(e, [op]), enviar(e, [op]), enviar(e, [op])]);
    await enviar(e, [op]);
    const fila = await estadoOp(op.operacionId);
    expect(fila.estado).toBe('APLICADA');
    expect(await ventas(e.tenantId)).toBe(1);
    expect(await prisma.venta.count({ where: { tenantId: e.tenantId, id: op.operacionId } })).toBe(1);
    expect(await stock(e.p1)).toBe(18);
    expect(await movimientosCaja(e.tenantId)).toBe(1);
  });

  it('una revisión por otro motivo (no de precio) no se revalida sola al reenviar', async () => {
    const e = await empresa();
    const v = await ventana(e);
    const op = operacion(e, v.id, { efectivoRecibidoCentavos: 2600 });
    await enviar(e, [op]);
    expect((await estadoOp(op.operacionId)).estado).toBe('REVISION');
    await prisma.producto.update({ where: { id: e.p1 }, data: { stockActual: 100 } });
    await enviar(e, [op]);
    expect((await estadoOp(op.operacionId)).estado).toBe('REVISION');
    expect(await ventas(e.tenantId)).toBe(0);
  });
});
