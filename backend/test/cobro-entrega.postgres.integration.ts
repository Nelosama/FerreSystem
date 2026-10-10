import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { EntregasService } from '../src/entregas/entregas.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';

// Cobro y entrega contra PostgreSQL real: cadena completa de migraciones en un clúster temporal exclusivo.
// Nunca lee DATABASE_URL. Ejecutar como usuario no root (initdb lo exige).
// Cubre: entrega inmediata, reserva, entregas parciales, idempotencia con huella, concurrencia, devoluciones con
// y sin reingreso, aislamiento entre empresas, precio aprobado y contingencia offline.
describe('Cobro y entrega / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let entregas: EntregasService;
  let operaciones: OperacionesService;
  let contingencia: ContingenciaService;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-cobro-'));
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
    ventas = new VentasService(prisma);
    entregas = new EntregasService(prisma);
    operaciones = new OperacionesService(prisma);
    contingencia = new ContingenciaService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-cobro-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  let contador = 0;
  type Empresa = Awaited<ReturnType<typeof empresa>>;

  /** Empresa con ADMIN (caja abierta con fondo), CAJERO (caja abierta), BODEGUERO, VENDEDOR y tres productos. */
  async function empresa() {
    const tenantId = randomUUID();
    const ids = { admin: randomUUID(), cajero: randomUUID(), bodeguero: randomUUID(), vendedor: randomUUID() };
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: `Cobro ${++contador}`, estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: true } } as any } });
    for (const [rol, id] of [['ADMIN', ids.admin], ['CAJERO', ids.cajero], ['BODEGUERO', ids.bodeguero], ['VENDEDOR', ids.vendedor]] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: false, permisos: [] } as any });
    }
    await operaciones.abrir(tenantId, ids.cajero, { solicitudId: randomUUID(), monto: 100 } as any);
    await operaciones.abrir(tenantId, ids.admin, { solicitudId: randomUUID(), monto: 100000 } as any);
    const p1 = await prisma.producto.create({ data: { tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    const p2 = await prisma.producto.create({ data: { tenantId, codigo: 'BIS-1', nombre: 'Bisagra', precioVenta: 25, precioCosto: 10, stockActual: 8 } as any });
    const sinPrecio = await prisma.producto.create({ data: { tenantId, codigo: 'NEW-1', nombre: 'Pendiente de precio', precioVenta: 0, precioCosto: 0, stockActual: 10 } as any });
    const dispositivoId = randomUUID();
    await contingencia.registrarDispositivo(tenantId, ids.cajero, { dispositivoId, nombre: 'Caja principal' });
    return { tenantId, ...ids, p1: p1.id, p2: p2.id, sinPrecio: sinPrecio.id, dispositivoId };
  }

  const sql = <T = any>(texto: string, ...p: any[]) => prisma.$queryRawUnsafe(texto, ...p) as Promise<T[]>;
  const stock = async (id: string) => Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stockActual);
  const reservado = async (id: string) => Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stockReservado);
  const linea = async (id: string) => (await sql('SELECT * FROM detalles_venta WHERE id=$1', id))[0];
  const eventos = (tenantId: string, ventaId: string, tipo?: string) =>
    sql('SELECT * FROM entregas_eventos WHERE tenant_id=$1 AND venta_id=$2 AND ($3::text IS NULL OR tipo=$3) ORDER BY created_at, id', tenantId, ventaId, tipo ?? null);
  const movimientos = (tenantId: string, ventaId: string, tipo?: string) =>
    sql('SELECT * FROM movimientos_inventario WHERE tenant_id=$1 AND documento_id=$2 AND ($3::text IS NULL OR tipo=$3) ORDER BY created_at, id', tenantId, ventaId, tipo ?? null);

  const vender = (e: Empresa, detalles: any[], extra: any = {}) =>
    ventas.create(e.tenantId, e.cajero, { solicitudId: randomUUID(), detalles, ...extra } as any);
  const mostrador = (e: Empresa, productoId: string, cantidad: number) => vender(e, [{ productoId, cantidad, modoEntrega: 'MOSTRADOR' }]);
  const bodega = (e: Empresa, productoId: string, cantidad: number) => vender(e, [{ productoId, cantidad, modoEntrega: 'BODEGA' }]);
  const entregar = (e: Empresa, ventaId: string, lineas: { detalleId: string; cantidad: number }[], extra: { solicitudId?: string; receptor?: string; usuario?: string } = {}) =>
    entregas.entregar(e.tenantId, extra.usuario ?? e.bodeguero, ventaId, { solicitudId: extra.solicitudId ?? randomUUID(), receptorNombre: extra.receptor ?? 'María Pérez', lineas } as any);
  const devolver = (e: Empresa, ventaId: string, items: any[], motivo = 'Devolución de prueba de integración') =>
    operaciones.devolver(e.tenantId, e.admin, ventaId, { solicitudId: randomUUID(), motivo, metodo: 'EFECTIVO', items } as any);

  /** Invariantes I7 (reservas) e I1–I4 (por línea) de la empresa. */
  async function verificarInvariantes(e: Empresa) {
    const reservas = await sql<{ id: string; reservado: string; esperado: string }>(
      `SELECT p.id, p.stock_reservado AS reservado,
              COALESCE(SUM(d.cantidad - d.cantidad_entregada - d.cantidad_cancelada) FILTER (WHERE d.modo_entrega='BODEGA'), 0) AS esperado
         FROM productos p LEFT JOIN detalles_venta d ON d.producto_id=p.id AND d.tenant_id=p.tenant_id
        WHERE p.tenant_id=$1 GROUP BY p.id`, e.tenantId);
    for (const r of reservas) expect(Number(r.reservado), `I7 producto ${r.id}`).toBe(Number(r.esperado));
    const malas = await sql(
      `SELECT id FROM detalles_venta WHERE tenant_id=$1 AND modo_entrega<>'SIN_INVENTARIO' AND (
          cantidad_entregada > cantidad OR cantidad_entregada + cantidad_cancelada > cantidad
       OR cantidad_devuelta_reingresada + cantidad_devuelta_sin_reingreso > cantidad_entregada
       OR cantidad_preparada > cantidad - cantidad_entregada - cantidad_cancelada)`, e.tenantId);
    expect(malas).toEqual([]);
  }

  // ───────────────────────── Venta y entrega inmediata ─────────────────────────
  describe('entrega inmediata (mostrador)', () => {
    it('cobra, entrega y descuenta existencias una sola vez, con eventos y movimiento ligados a la línea', async () => {
      const e = await empresa();
      const venta = await mostrador(e, e.p1, 3);
      expect(await stock(e.p1)).toBe(17);
      expect(await reservado(e.p1)).toBe(0);
      const l = await linea(venta.detalles[0].id);
      expect(l.modo_entrega).toBe('MOSTRADOR');
      expect(Number(l.cantidad_entregada)).toBe(3);
      expect(l.tenant_id).toBe(e.tenantId);
      expect((await eventos(e.tenantId, venta.id)).map((x) => x.tipo).sort()).toEqual(['COBRO', 'ENTREGA']);
      const mov = await movimientos(e.tenantId, venta.id, 'ENTREGA');
      expect(mov).toHaveLength(1);
      expect(mov[0].evento_id).toBeTruthy();
      expect(mov[0].detalle_venta_id).toBe(l.id);
      expect([Number(mov[0].anterior), Number(mov[0].nuevo), Number(mov[0].cantidad)]).toEqual([20, 17, -3]);
      const [v] = await sql('SELECT reserva_pendiente FROM ventas WHERE id=$1', venta.id);
      expect(v.reserva_pendiente).toBe(false);
      await verificarInvariantes(e);
    });

    it('sin existencias disponibles no hay venta, ni caja, ni movimientos', async () => {
      const e = await empresa();
      const antes = await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja');
      await expect(mostrador(e, e.p1, 25)).rejects.toThrow(/No hay existencias disponibles/);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
      expect((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja'))[0].n).toBe(antes[0].n);
      expect(await stock(e.p1)).toBe(20);
    });

    it('las existencias reservadas por pedidos no se pueden entregar al cobrar en mostrador', async () => {
      const e = await empresa();
      await bodega(e, e.p1, 18);
      await expect(mostrador(e, e.p1, 5)).rejects.toThrow(/No hay existencias disponibles/);
      expect(await stock(e.p1)).toBe(20);
      expect(await reservado(e.p1)).toBe(18);
    });
  });

  // ───────────────────────── Reserva y entregas parciales ─────────────────────────
  describe('reserva y entregas posteriores', () => {
    it('cobrar para bodega reserva: no baja el stock físico y deja la línea pendiente', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 4);
      expect(await stock(e.p1)).toBe(20);
      expect(await reservado(e.p1)).toBe(4);
      const l = await linea(venta.detalles[0].id);
      expect([l.modo_entrega, Number(l.cantidad_entregada)]).toEqual(['BODEGA', 0]);
      expect((await eventos(e.tenantId, venta.id)).map((x) => x.tipo)).toEqual(['COBRO']);
      const [v] = await sql('SELECT reserva_pendiente, entregado_at FROM ventas WHERE id=$1', venta.id);
      expect([v.reserva_pendiente, v.entregado_at]).toEqual([true, null]);
      await verificarInvariantes(e);
    });

    it('dos entregas parciales legítimas de la misma línea: ambas se aplican, con eventos y movimientos distintos', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      const det = venta.detalles[0].id;
      const a = await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      expect(await stock(e.p1)).toBe(19);
      expect(await reservado(e.p1)).toBe(1);
      const b = await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      expect(a.eventoId).not.toBe(b.eventoId);
      expect(await stock(e.p1)).toBe(18);
      expect(await reservado(e.p1)).toBe(0);
      const l = await linea(det);
      expect(Number(l.cantidad_entregada)).toBe(2);
      expect(await movimientos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(2);
      const [v] = await sql('SELECT reserva_pendiente, entregado_at, entregado_por FROM ventas WHERE id=$1', venta.id);
      expect(v.reserva_pendiente).toBe(false);
      expect(v.entregado_at).toBeTruthy();
      expect(v.entregado_por).toBe(e.bodeguero);
      await verificarInvariantes(e);
    });

    it('una entrega que excede lo pendiente se rechaza sin efectos', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      const det = venta.detalles[0].id;
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 2 }]);
      await expect(entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }])).rejects.toThrow(/Solo quedan 0\.00|ya no está pendiente/);
      expect(await stock(e.p1)).toBe(18);
      expect(await movimientos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(1);
      await verificarInvariantes(e);
    });

    it('entregar sin nombre del receptor se rechaza', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 1);
      await expect(entregas.entregar(e.tenantId, e.bodeguero, venta.id, { solicitudId: randomUUID(), receptorNombre: '   ', lineas: [{ detalleId: venta.detalles[0].id, cantidad: 1 }] } as any))
        .rejects.toThrow(/nombre de quien recibe/);
      expect(await stock(e.p1)).toBe(20);
    });

    it('la mercancía entregada al cobrar no se puede entregar otra vez', async () => {
      const e = await empresa();
      const venta = await mostrador(e, e.p1, 1);
      await expect(entregar(e, venta.id, [{ detalleId: venta.detalles[0].id, cantidad: 1 }])).rejects.toThrow(/se entregó al cobrar/);
      expect(await stock(e.p1)).toBe(19);
    });

    it('un cajero no puede confirmar entregas; BODEGUERO y ADMIN sí', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      const det = venta.detalles[0].id;
      await expect(entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { usuario: e.cajero })).rejects.toThrow(/no tiene autorización/i);
      await expect(entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { usuario: e.vendedor })).rejects.toThrow(/no tiene autorización/i);
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { usuario: e.admin });
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { usuario: e.bodeguero });
      expect(await stock(e.p1)).toBe(18);
    });
  });

  // ───────────────────────── Reintentos, huella y concurrencia ─────────────────────────
  describe('idempotencia, huella canónica y concurrencia', () => {
    it('reintento de entrega con la misma solicitud y el mismo contenido: respuesta repetida, sin nuevos efectos', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      const det = venta.detalles[0].id;
      const solicitudId = randomUUID();
      const primera = await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { solicitudId });
      const segunda = await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { solicitudId });
      expect(segunda.repetido).toBe(true);
      expect(segunda.eventoId).toBe(primera.eventoId);
      expect(await stock(e.p1)).toBe(19);
      expect(await movimientos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(1);
      expect(await eventos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(1);
    });

    it('la misma solicitud con otra cantidad, otro receptor u otro usuario produce conflicto explícito sin efectos', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      const solicitudId = randomUUID();
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { solicitudId });
      const conflicto = /otro contenido/;
      await expect(entregar(e, venta.id, [{ detalleId: det, cantidad: 2 }], { solicitudId })).rejects.toThrow(conflicto);
      await expect(entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { solicitudId, receptor: 'Otra persona' })).rejects.toThrow(conflicto);
      await expect(entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { solicitudId, usuario: e.admin })).rejects.toThrow(conflicto);
      expect(await stock(e.p1)).toBe(19);
      expect(await movimientos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(1);
    });

    it('la huella no depende del orden de las líneas, de la forma de escribir la cantidad ni de los espacios del receptor', async () => {
      const e = await empresa();
      const venta = await vender(e, [{ productoId: e.p1, cantidad: 2, modoEntrega: 'BODEGA' }, { productoId: e.p2, cantidad: 2, modoEntrega: 'BODEGA' }]);
      const [d1, d2] = venta.detalles.map((d: any) => d.id);
      const solicitudId = randomUUID();
      const a = await entregar(e, venta.id, [{ detalleId: d1, cantidad: 1 }, { detalleId: d2, cantidad: 2 }], { solicitudId, receptor: 'Juan  Pérez' });
      const b = await entregar(e, venta.id, [{ detalleId: d2, cantidad: 2.0 }, { detalleId: d1, cantidad: 1.00 }], { solicitudId, receptor: ' Juan Pérez ' });
      expect(b.repetido).toBe(true);
      expect(b.eventoId).toBe(a.eventoId);
    });

    it('la misma solicitud en otra empresa no entra en conflicto', async () => {
      const a = await empresa();
      const b = await empresa();
      const va = await bodega(a, a.p1, 1);
      const vb = await bodega(b, b.p1, 1);
      const solicitudId = randomUUID();
      await entregar(a, va.id, [{ detalleId: va.detalles[0].id, cantidad: 1 }], { solicitudId });
      const r = await entregar(b, vb.id, [{ detalleId: vb.detalles[0].id, cantidad: 1 }], { solicitudId });
      expect(r.repetido).toBe(false);
      expect(await stock(b.p1)).toBe(19);
    });

    it('un identificador de solicitud que no es UUID v4 se rechaza', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 1);
      await expect(entregas.entregar(e.tenantId, e.bodeguero, venta.id, { solicitudId: 'no-es-uuid', receptorNombre: 'Ana', lineas: [{ detalleId: venta.detalles[0].id, cantidad: 1 }] } as any))
        .rejects.toThrow(/UUID v4/);
    });

    it('entregas simultáneas con solicitudes distintas: solo se aplican las que caben, nunca más de lo vendido', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      const resultados = await Promise.allSettled([1, 2, 3, 4].map(() => entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }])));
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(Number((await linea(det)).cantidad_entregada)).toBe(3);
      expect(await stock(e.p1)).toBe(17);
      expect(await reservado(e.p1)).toBe(0);
      expect(await movimientos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(3);
      await verificarInvariantes(e);
    });

    it('tres solicitudes simultáneas con el mismo identificador y contenidos distintos: exactamente un evento', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      const solicitudId = randomUUID();
      const resultados = await Promise.allSettled([1, 2, 3].map((n) => entregar(e, venta.id, [{ detalleId: det, cantidad: n }], { solicitudId })));
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await eventos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(1);
      expect(await movimientos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(1);
      await verificarInvariantes(e);
    });

    it('una solicitud que falla a mitad deja todo intacto y puede reintentarse con la misma solicitud', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      const det = venta.detalles[0].id;
      const solicitudId = randomUUID();
      // Entrega con cantidad que excede: falla, no queda rastro de la solicitud.
      await expect(entregar(e, venta.id, [{ detalleId: det, cantidad: 5 }], { solicitudId })).rejects.toThrow();
      expect(await sql('SELECT id FROM entregas_eventos WHERE tenant_id=$1 AND solicitud_id=$2', e.tenantId, solicitudId)).toEqual([]);
      const ok = await entregar(e, venta.id, [{ detalleId: det, cantidad: 2 }], { solicitudId });
      expect(ok.repetido).toBe(false);
      expect(await stock(e.p1)).toBe(18);
    });
  });

  // ───────────────────────── Venta duplicada y precio aprobado ─────────────────────────
  describe('venta duplicada y precio aprobado', () => {
    it('reenviar la misma venta (misma solicitud y contenido) devuelve la misma venta sin descontar dos veces', async () => {
      const e = await empresa();
      const solicitudId = randomUUID();
      const detalles = [{ productoId: e.p1, cantidad: 2, modoEntrega: 'MOSTRADOR' }];
      const a = await ventas.create(e.tenantId, e.cajero, { solicitudId, detalles } as any);
      const b = await ventas.create(e.tenantId, e.cajero, { solicitudId, detalles: [...detalles] } as any);
      expect(b.id).toBe(a.id);
      expect(await stock(e.p1)).toBe(18);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toHaveLength(1);
      expect(await movimientos(e.tenantId, a.id, 'ENTREGA')).toHaveLength(1);
    });

    it('la misma solicitud con otro contenido (cantidad o modo de entrega) es un conflicto y no cambia nada', async () => {
      const e = await empresa();
      const solicitudId = randomUUID();
      await ventas.create(e.tenantId, e.cajero, { solicitudId, detalles: [{ productoId: e.p1, cantidad: 2, modoEntrega: 'MOSTRADOR' }] } as any);
      await expect(ventas.create(e.tenantId, e.cajero, { solicitudId, detalles: [{ productoId: e.p1, cantidad: 3, modoEntrega: 'MOSTRADOR' }] } as any)).rejects.toThrow(/ya fue utilizada/);
      await expect(ventas.create(e.tenantId, e.cajero, { solicitudId, detalles: [{ productoId: e.p1, cantidad: 2, modoEntrega: 'BODEGA' }] } as any)).rejects.toThrow(/ya fue utilizada/);
      expect(await stock(e.p1)).toBe(18);
      expect(await reservado(e.p1)).toBe(0);
    });

    it('un producto sin precio de venta aprobado no se vende: sin venta, sin caja y sin movimientos', async () => {
      const e = await empresa();
      const antes = (await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja'))[0].n;
      await expect(mostrador(e, e.sinPrecio, 1)).rejects.toThrow(/precio de venta aprobado/);
      await expect(bodega(e, e.sinPrecio, 1)).rejects.toThrow(/precio de venta aprobado/);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
      expect((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja'))[0].n).toBe(antes);
      expect(await stock(e.sinPrecio)).toBe(10);
    });

    it('un precio unitario cero o un importe cero se rechaza', async () => {
      const e = await empresa();
      await expect(vender(e, [{ productoId: e.p1, cantidad: 1, precioUnitario: 0, modoEntrega: 'MOSTRADOR' }])).rejects.toThrow(/mayor que cero/);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
    });
  });

  // ───────────────────────── Liberación, preparación y cantidad preparada ─────────────────────────
  describe('preparación y liberación', () => {
    const preparar = (e: Empresa, ventaId: string, lineas: any[]) => entregas.preparar(e.tenantId, e.bodeguero, ventaId, { solicitudId: randomUUID(), lineas } as any);
    const liberar = (e: Empresa, ventaId: string, lineas: any[], extra: { usuario?: string; motivo?: string } = {}) =>
      entregas.liberar(e.tenantId, extra.usuario ?? e.admin, ventaId, { solicitudId: randomUUID(), motivo: extra.motivo ?? 'El cliente ya no retirará el pedido', lineas } as any);

    it('preparar no cambia existencias y no puede superar lo pendiente', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      await preparar(e, venta.id, [{ detalleId: det, cantidad: 2 }]);
      expect(Number((await linea(det)).cantidad_preparada)).toBe(2);
      expect(await stock(e.p1)).toBe(20);
      expect(await reservado(e.p1)).toBe(3);
      await expect(preparar(e, venta.id, [{ detalleId: det, cantidad: 2 }])).rejects.toThrow(/por preparar/);
    });

    it('la cantidad preparada nunca supera la reserva restante tras entregas y liberaciones (P = min(P, Rr))', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      await preparar(e, venta.id, [{ detalleId: det, cantidad: 2 }]);
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      expect(Number((await linea(det)).cantidad_preparada)).toBe(2); // Rr = 2
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      expect(Number((await linea(det)).cantidad_preparada)).toBe(1); // Rr = 1
      await liberar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      expect(Number((await linea(det)).cantidad_preparada)).toBe(0); // Rr = 0
      await verificarInvariantes(e);
    });

    it('liberar reserva (ADMIN, con motivo) baja la reserva y no toca el stock físico ni el dinero', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      const cajaAntes = (await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja'))[0].n;
      const r = await liberar(e, venta.id, [{ detalleId: det, cantidad: 2 }]);
      expect(r.requiereDevolucionFormal).toBe(true);
      expect(await reservado(e.p1)).toBe(1);
      expect(await stock(e.p1)).toBe(20);
      expect((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja'))[0].n).toBe(cajaAntes);
      expect(Number((await linea(det)).cantidad_cancelada)).toBe(2);
      await verificarInvariantes(e);
    });

    it('liberar más de lo pendiente, sin motivo o sin ser ADMIN se rechaza', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      const det = venta.detalles[0].id;
      await expect(liberar(e, venta.id, [{ detalleId: det, cantidad: 3 }])).rejects.toThrow(/Solo quedan/);
      await expect(liberar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { motivo: 'corto' })).rejects.toThrow(/al menos 10 caracteres/);
      await expect(liberar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { usuario: e.bodeguero })).rejects.toThrow(/no tiene autorización/i);
      await expect(liberar(e, venta.id, [{ detalleId: det, cantidad: 1 }], { usuario: e.cajero })).rejects.toThrow(/no tiene autorización/i);
      expect(await reservado(e.p1)).toBe(2);
    });

    it('liberar no afecta lo ya entregado', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 2 }]);
      await expect(liberar(e, venta.id, [{ detalleId: det, cantidad: 2 }])).rejects.toThrow(/Solo quedan/);
      await liberar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      const l = await linea(det);
      expect([Number(l.cantidad_entregada), Number(l.cantidad_cancelada)]).toEqual([2, 1]);
      expect(await stock(e.p1)).toBe(18);
      expect(await reservado(e.p1)).toBe(0);
      await verificarInvariantes(e);
    });
  });

  // ───────────────────────── Devoluciones ─────────────────────────
  describe('devoluciones con y sin reingreso', () => {
    it('devolución con reingreso: sube el stock una vez y registra el movimiento ligado al evento', async () => {
      const e = await empresa();
      const venta = await mostrador(e, e.p1, 3);
      const det = venta.detalles[0].id;
      await devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'INVENTARIO' }]);
      expect(await stock(e.p1)).toBe(18);
      const l = await linea(det);
      expect([Number(l.cantidad_devuelta_reingresada), Number(l.cantidad_devuelta_sin_reingreso)]).toEqual([1, 0]);
      const mov = await movimientos(e.tenantId, venta.id, 'DEVOLUCION');
      expect(mov).toHaveLength(1);
      expect(mov[0].evento_id).toBeTruthy();
      expect((await eventos(e.tenantId, venta.id, 'DEVOLUCION_REINGRESO'))).toHaveLength(1);
    });

    it('devolución sin reingreso (dañado o proveedor): no cambia las existencias', async () => {
      const e = await empresa();
      const venta = await mostrador(e, e.p1, 3);
      const det = venta.detalles[0].id;
      await devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'DAÑADO' }]);
      await devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'PROVEEDOR' }]);
      expect(await stock(e.p1)).toBe(17);
      const l = await linea(det);
      expect([Number(l.cantidad_devuelta_reingresada), Number(l.cantidad_devuelta_sin_reingreso)]).toEqual([0, 2]);
      expect(await movimientos(e.tenantId, venta.id, 'DEVOLUCION')).toHaveLength(0);
      expect(await eventos(e.tenantId, venta.id, 'DEVOLUCION_SIN_REINGRESO')).toHaveLength(2);
    });

    it('con y sin reingreso juntos nunca superan lo entregado', async () => {
      const e = await empresa();
      const venta = await mostrador(e, e.p1, 2);
      const det = venta.detalles[0].id;
      await devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'INVENTARIO' }]);
      await devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'DAÑADO' }]);
      await expect(devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'INVENTARIO' }])).rejects.toThrow(/Cantidad supera lo vendido pendiente de devolver/);
      expect(await stock(e.p1)).toBe(19);
      await verificarInvariantes(e);
    });

    it('no se puede devolver con reingreso mercancía que sigue pendiente de entrega', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      await expect(devolver(e, venta.id, [{ detalleId: venta.detalles[0].id, cantidad: 1, destino: 'INVENTARIO' }])).rejects.toThrow(/Cantidad supera lo vendido pendiente de devolver/);
      expect(await stock(e.p1)).toBe(20);
      expect(await reservado(e.p1)).toBe(2);
    });

    it('devolver como no entregado libera la reserva sin mover el stock físico; si ya se entregó, se rechaza', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      await devolver(e, venta.id, [{ detalleId: det, cantidad: 2, destino: 'NO_ENTREGADO' }]);
      expect(await reservado(e.p1)).toBe(0);
      expect(await stock(e.p1)).toBe(19);
      const l = await linea(det);
      expect([Number(l.cantidad_entregada), Number(l.cantidad_cancelada)]).toEqual([1, 2]);
      await expect(devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'NO_ENTREGADO' }])).rejects.toThrow(/supera lo pendiente de entrega/);
      const vm = await mostrador(e, e.p2, 1);
      await expect(devolver(e, vm.id, [{ detalleId: vm.detalles[0].id, cantidad: 1, destino: 'NO_ENTREGADO' }])).rejects.toThrow(/ya se entregó al cobrar/);
      await verificarInvariantes(e);
    });

    it('reintentar la misma devolución no vuelve a mover existencias', async () => {
      const e = await empresa();
      const venta = await mostrador(e, e.p1, 3);
      const det = venta.detalles[0].id;
      const dto = { solicitudId: randomUUID(), motivo: 'Devolución de prueba de integración', metodo: 'EFECTIVO', items: [{ detalleId: det, cantidad: 1, destino: 'INVENTARIO' }] } as any;
      await operaciones.devolver(e.tenantId, e.admin, venta.id, dto);
      await operaciones.devolver(e.tenantId, e.admin, venta.id, dto);
      expect(await stock(e.p1)).toBe(18);
      expect(await movimientos(e.tenantId, venta.id, 'DEVOLUCION')).toHaveLength(1);
    });
  });

  // ───────────────────────── Aislamiento entre empresas ─────────────────────────
  describe('validación final: precio revocado y devolución total', () => {
    it('una venta ya facturada se puede entregar aunque después se revoque la aprobación del precio', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      await prisma.producto.update({ where: { id: e.p1 }, data: { precioVenta: 0 } });
      const r = await entregar(e, venta.id, [{ detalleId: venta.detalles[0].id, cantidad: 2 }]);
      expect(r).toBeTruthy();
      expect(await stock(e.p1)).toBe(18);
      expect(await reservado(e.p1)).toBe(0);
      // El producto sigue sin poder venderse nuevamente.
      await expect(bodega(e, e.p1, 1)).rejects.toThrow();
      await verificarInvariantes(e);
    });

    it('devolución total de lo entregado: el stock vuelve al inicial y no se puede devolver más', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      const det = venta.detalles[0].id;
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 2 }]);
      expect(await stock(e.p1)).toBe(17);
      await devolver(e, venta.id, [{ detalleId: det, cantidad: 3, destino: 'INVENTARIO' }]);
      expect(await stock(e.p1)).toBe(20);
      expect(await reservado(e.p1)).toBe(0);
      const l = await linea(det);
      expect([Number(l.cantidad_entregada), Number(l.cantidad_devuelta_reingresada)]).toEqual([3, 3]);
      await expect(devolver(e, venta.id, [{ detalleId: det, cantidad: 1, destino: 'INVENTARIO' }])).rejects.toThrow(/supera/);
      expect(await stock(e.p1)).toBe(20);
      await verificarInvariantes(e);
    });
  });

  describe('aislamiento entre empresas', () => {
    it('otra empresa no puede ver, preparar, entregar ni liberar una venta ajena', async () => {
      const a = await empresa();
      const b = await empresa();
      const venta = await bodega(a, a.p1, 2);
      const det = venta.detalles[0].id;
      await expect(entregas.detalle(b.tenantId, b.admin, venta.id)).rejects.toThrow(/Venta no encontrada/);
      await expect(entregas.entregar(b.tenantId, b.bodeguero, venta.id, { solicitudId: randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: det, cantidad: 1 }] } as any)).rejects.toThrow(/Venta no encontrada/);
      await expect(entregas.preparar(b.tenantId, b.bodeguero, venta.id, { solicitudId: randomUUID(), lineas: [{ detalleId: det, cantidad: 1 }] } as any)).rejects.toThrow(/Venta no encontrada/);
      await expect(entregas.liberar(b.tenantId, b.admin, venta.id, { solicitudId: randomUUID(), motivo: 'Intento de otra empresa', lineas: [{ detalleId: det, cantidad: 1 }] } as any)).rejects.toThrow(/Venta no encontrada/);
      expect((await entregas.pendientes(b.tenantId, b.admin)).pendientes).toEqual([]);
      expect(await reservado(a.p1)).toBe(2);
    });

    it('una línea de otra empresa dentro de una venta propia no aparece (404 sin revelar existencia)', async () => {
      const a = await empresa();
      const b = await empresa();
      const va = await bodega(a, a.p1, 1);
      const vb = await bodega(b, b.p1, 1);
      await expect(entregar(a, va.id, [{ detalleId: vb.detalles[0].id, cantidad: 1 }])).rejects.toThrow(/Línea de venta no encontrada/);
      expect(await stock(b.p1)).toBe(20);
    });

    it('la base impide referencias cruzadas entre empresas (claves foráneas compuestas)', async () => {
      const a = await empresa();
      const b = await empresa();
      const va = await bodega(a, a.p1, 1);
      const vb = await bodega(b, b.p1, 1);
      const cruzado = /violates foreign key|foreign key constraint/i;
      // Evento de la empresa A sobre una venta de la B.
      await expect(prisma.$executeRawUnsafe(
        `INSERT INTO entregas_eventos (id,tenant_id,solicitud_id,huella,tipo,venta_id,usuario_id,origen) VALUES ($1,$2,$3,$4,'ENTREGA',$5,$6,'ONLINE')`,
        randomUUID(), a.tenantId, randomUUID(), 'a'.repeat(64), vb.id, a.bodeguero)).rejects.toThrow(cruzado);
      // Línea de evento de la empresa A sobre un detalle de la B.
      const evento = await entregar(a, va.id, [{ detalleId: va.detalles[0].id, cantidad: 1 }]);
      await expect(prisma.$executeRawUnsafe(
        `INSERT INTO entregas_eventos_lineas (tenant_id,evento_id,detalle_venta_id,cantidad) VALUES ($1,$2,$3,1)`,
        a.tenantId, evento.eventoId, vb.detalles[0].id)).rejects.toThrow(cruzado);
      // Movimiento de la empresa A con un producto de la B.
      await expect(prisma.$executeRawUnsafe(
        `INSERT INTO movimientos_inventario (id,tenant_id,usuario_id,producto_id,tipo,anterior,nuevo,cantidad,documento_id,motivo) VALUES ($1,$2,$3,$4,'AJUSTE',1,1,0,'x','prueba')`,
        randomUUID(), a.tenantId, a.admin, b.p1)).rejects.toThrow(cruzado);
      // Línea de venta con tenant distinto al de su venta.
      await expect(prisma.$executeRawUnsafe(
        `INSERT INTO detalles_venta (id,tenant_id,venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES ($1,$2,$3,$4,1,10,10)`,
        randomUUID(), b.tenantId, va.id, a.p1)).rejects.toThrow(cruzado);
    });

    it('la base impide dos movimientos de la misma línea en el mismo evento, pero permite uno por evento', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 2);
      const det = venta.detalles[0].id;
      const a = await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      await entregar(e, venta.id, [{ detalleId: det, cantidad: 1 }]);
      expect(await movimientos(e.tenantId, venta.id, 'ENTREGA')).toHaveLength(2);
      await expect(prisma.$executeRawUnsafe(
        `INSERT INTO movimientos_inventario (id,tenant_id,usuario_id,producto_id,tipo,anterior,nuevo,cantidad,documento_id,motivo,evento_id,detalle_venta_id)
         VALUES ($1,$2,$3,$4,'ENTREGA',1,1,0,$5,'duplicado',$6,$7)`,
        randomUUID(), e.tenantId, e.bodeguero, e.p1, venta.id, a.eventoId, det)).rejects.toThrow(/23505|already exists|duplicate key/i);
    });

    it('los eventos y las líneas de evento son de solo inserción', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 1);
      await entregar(e, venta.id, [{ detalleId: venta.detalles[0].id, cantidad: 1 }]);
      await expect(prisma.$executeRawUnsafe(`UPDATE entregas_eventos SET motivo='alterado' WHERE tenant_id=$1`, e.tenantId)).rejects.toThrow(/solo inserción/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM entregas_eventos_lineas WHERE tenant_id=$1`, e.tenantId)).rejects.toThrow(/solo inserción/);
    });

    it('el modo de entrega de una línea no puede cambiar después del cobro', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 1);
      await expect(prisma.$executeRawUnsafe(`UPDATE detalles_venta SET modo_entrega='MOSTRADOR' WHERE id=$1`, venta.detalles[0].id)).rejects.toThrow(/no puede cambiar/);
    });
  });

  // ───────────────────────── Consultas y alertas ─────────────────────────
  describe('pedidos pendientes y alertas', () => {
    it('lista los pedidos pendientes con cantidades, y cada rol ve lo que le corresponde', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 3);
      await entregar(e, venta.id, [{ detalleId: venta.detalles[0].id, cantidad: 1 }]);
      const bodeguero = await entregas.pendientes(e.tenantId, e.bodeguero);
      expect(bodeguero.pendientes).toHaveLength(1);
      const [l] = bodeguero.pendientes[0].lineas;
      expect([l.cantidad, l.entregada, l.pendiente, l.estado]).toEqual([3, 1, 2, 'PARCIAL']);
      expect((await entregas.pendientes(e.tenantId, e.cajero)).pendientes).toHaveLength(1);
      expect((await entregas.pendientes(e.tenantId, e.vendedor)).pendientes).toHaveLength(0); // no es su venta
      expect((await entregas.pendientes(e.tenantId, e.admin)).pendientes).toHaveLength(1);
    });

    it('un pedido completamente entregado deja de aparecer como pendiente', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 1);
      await entregar(e, venta.id, [{ detalleId: venta.detalles[0].id, cantidad: 1 }]);
      expect((await entregas.pendientes(e.tenantId, e.admin)).pendientes).toEqual([]);
    });

    it('la alerta depende de la antigüedad y de los umbrales configurables, y no cancela ninguna venta', async () => {
      const e = await empresa();
      const venta = await bodega(e, e.p1, 1);
      await sql(`UPDATE ventas SET created_at = now() - interval '30 hours' WHERE id=$1`, venta.id);
      let r = await entregas.pendientes(e.tenantId, e.admin);
      expect(r.pendientes[0].alerta).toBe('AVISO');
      await sql(`UPDATE ventas SET created_at = now() - interval '5 days' WHERE id=$1`, venta.id);
      r = await entregas.pendientes(e.tenantId, e.admin);
      expect(r.pendientes[0].alerta).toBe('ESCALAMIENTO');
      await sql(`UPDATE tenants SET configuracion = configuracion || '{"entregas":{"alertaEscalamientoDias":10}}'::jsonb WHERE id=$1`, e.tenantId);
      r = await entregas.pendientes(e.tenantId, e.admin);
      expect(r.pendientes[0].alerta).toBe('AVISO');
      // Ninguna venta pagada cambia de estado por el paso del tiempo.
      expect(await reservado(e.p1)).toBe(1);
      const [v] = await sql('SELECT estado, reserva_pendiente FROM ventas WHERE id=$1', venta.id);
      expect([v.estado, v.reserva_pendiente]).toEqual(['COMPLETADA', true]);
    });
  });

  // ───────────────────────── Secuencias aleatorias con invariantes ─────────────────────────
  describe('secuencias aleatorias: invariantes de reservas y existencias', () => {
    for (const semilla of [11, 29, 47]) {
      it(`semilla ${semilla}: tras cada operación se cumplen I1–I4, I7 e I8`, async () => {
        let estado = semilla;
        const azar = (n: number) => { estado = (estado * 1103515245 + 12345) & 0x7fffffff; return estado % n; };
        const e = await empresa();
        await prisma.producto.update({ where: { id: e.p1 }, data: { stockActual: 60 } });
        const inicial = 60;
        const ventasHechas: { id: string; detalle: string }[] = [];
        for (let paso = 0; paso < 45; paso++) {
          const accion = azar(7);
          const q = 1 + azar(3);
          const v = ventasHechas.length ? ventasHechas[azar(ventasHechas.length)] : undefined;
          try {
            if (accion === 0) { const x = await bodega(e, e.p1, q); ventasHechas.push({ id: x.id, detalle: x.detalles[0].id }); }
            else if (accion === 1) { const x = await mostrador(e, e.p1, q); ventasHechas.push({ id: x.id, detalle: x.detalles[0].id }); }
            else if (v && accion === 2) await entregas.preparar(e.tenantId, e.bodeguero, v.id, { solicitudId: randomUUID(), lineas: [{ detalleId: v.detalle, cantidad: q }] } as any);
            else if (v && accion === 3) await entregar(e, v.id, [{ detalleId: v.detalle, cantidad: q }]);
            else if (v && accion === 4) await entregas.liberar(e.tenantId, e.admin, v.id, { solicitudId: randomUUID(), motivo: 'Cliente desiste del pedido', lineas: [{ detalleId: v.detalle, cantidad: q }] } as any);
            else if (v && accion === 5) await devolver(e, v.id, [{ detalleId: v.detalle, cantidad: q, destino: 'INVENTARIO' }]);
            else if (v && accion === 6) await devolver(e, v.id, [{ detalleId: v.detalle, cantidad: q, destino: azar(2) ? 'DAÑADO' : 'PROVEEDOR' }]);
          } catch {
            // Las operaciones inválidas se rechazan sin efectos; las invariantes se verifican igual.
          }
          await verificarInvariantes(e);
        }
        // I8: existencias = inicial − Σ entregado + Σ reingresado.
        const [s] = await sql(`SELECT COALESCE(SUM(cantidad_entregada),0) AS e, COALESCE(SUM(cantidad_devuelta_reingresada),0) AS r FROM detalles_venta WHERE tenant_id=$1 AND producto_id=$2`, e.tenantId, e.p1);
        expect(await stock(e.p1)).toBe(inicial - Number(s.e) + Number(s.r));
        // I10: los contadores son iguales a la suma de las cantidades de los eventos.
        const desfases = await sql(
          `SELECT d.id FROM detalles_venta d WHERE d.tenant_id=$1 AND d.modo_entrega<>'SIN_INVENTARIO' AND (
             d.cantidad_entregada <> COALESCE((SELECT SUM(l.cantidad) FROM entregas_eventos_lineas l JOIN entregas_eventos ev ON ev.id=l.evento_id AND ev.tenant_id=l.tenant_id WHERE l.detalle_venta_id=d.id AND ev.tipo='ENTREGA'),0)
          OR d.cantidad_devuelta_reingresada <> COALESCE((SELECT SUM(l.cantidad) FROM entregas_eventos_lineas l JOIN entregas_eventos ev ON ev.id=l.evento_id AND ev.tenant_id=l.tenant_id WHERE l.detalle_venta_id=d.id AND ev.tipo='DEVOLUCION_REINGRESO'),0)
          OR d.cantidad_devuelta_sin_reingreso <> COALESCE((SELECT SUM(l.cantidad) FROM entregas_eventos_lineas l JOIN entregas_eventos ev ON ev.id=l.evento_id AND ev.tenant_id=l.tenant_id WHERE l.detalle_venta_id=d.id AND ev.tipo='DEVOLUCION_SIN_REINGRESO'),0)
          OR d.cantidad_cancelada <> COALESCE((SELECT SUM(l.cantidad) FROM entregas_eventos_lineas l JOIN entregas_eventos ev ON ev.id=l.evento_id AND ev.tenant_id=l.tenant_id WHERE l.detalle_venta_id=d.id AND ev.tipo='LIBERACION'),0))`, e.tenantId);
        expect(desfases).toEqual([]);
      }, 120000);
    }
  });

  // ───────────────────────── Contingencia offline ─────────────────────────
  describe('contingencia offline: precio aprobado, importes inválidos y sincronización', () => {
    function operacion(e: Empresa, ventanaId: string, productoId: string, extra: Partial<Record<string, any>> = {}) {
      const n = ++contador;
      return {
        operacionId: randomUUID(), dispositivoId: e.dispositivoId, ventanaId, secuenciaLocal: n,
        correlativoLocal: `CT-01-${String(n).padStart(4, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero,
        lineas: [{ productoId, cantidadCentesimas: 200, precioCentavos: 1000 }],
        subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
        esquemaVersion: 1, ...extra,
      };
    }
    const enviar = (e: Empresa, ops: any[]) => contingencia.recibirLote(e.tenantId, e.cajero, 'CAJERO', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: ops } as any);

    it('el catálogo offline no incluye productos sin precio aprobado', async () => {
      const e = await empresa();
      const { catalogo } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const ids = catalogo.productos.map((p: any) => p.id);
      expect(ids).toContain(e.p1);
      expect(ids).not.toContain(e.sinPrecio);
      expect(catalogo.productos.every((p: any) => p.precioCentavos > 0)).toBe(true);
    });

    it('la venta offline queda entregada en mostrador, con eventos y movimiento, y el reenvío no duplica nada', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const op = operacion(e, ventana.id, e.p1);
      const [r] = (await enviar(e, [op])).resultados;
      expect(r.estado).toBe('APLICADA');
      expect(await stock(e.p1)).toBe(18);
      const l = await linea((await sql('SELECT id FROM detalles_venta WHERE venta_id=$1', r.ventaId))[0].id);
      expect([l.modo_entrega, Number(l.cantidad_entregada), l.tenant_id]).toEqual(['MOSTRADOR', 2, e.tenantId]);
      expect((await eventos(e.tenantId, r.ventaId)).map((x) => [x.tipo, x.origen]).sort()).toEqual([['COBRO', 'OFFLINE'], ['ENTREGA', 'OFFLINE']]);
      const mov = await movimientos(e.tenantId, r.ventaId, 'ENTREGA');
      expect(mov).toHaveLength(1);
      expect(mov[0].evento_id).toBeTruthy();
      // Reintentos (red cortada, respuesta perdida, otra pestaña): la misma operación no vuelve a descontar.
      for (let i = 0; i < 3; i++) await enviar(e, [op]);
      expect(await stock(e.p1)).toBe(18);
      expect(await movimientos(e.tenantId, r.ventaId, 'ENTREGA')).toHaveLength(1);
      expect(await eventos(e.tenantId, r.ventaId, 'ENTREGA')).toHaveLength(1);
      await verificarInvariantes(e);
    });

    it('si el producto pierde su precio aprobado después de emitir la ventana, la operación va a revisión y no se vende', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      await prisma.producto.update({ where: { id: e.p1 }, data: { precioVenta: 0 } });
      const op = operacion(e, ventana.id, e.p1);
      const [r] = (await enviar(e, [op])).resultados;
      expect(r.estado).toBe('REVISION');
      expect(r.requiereRevision).toBe(true);
      expect(r.conflictos.map((c: any) => c.codigo)).toContain('PRODUCTO_SIN_PRECIO_APROBADO');
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
      expect(await stock(e.p1)).toBe(20);
      // La operación local queda registrada y un administrador no puede forzarla mientras el precio no esté aprobado.
      await contingencia.resolver(e.tenantId, e.admin, r.operacionId, { accion: 'ACEPTAR', nota: 'Intento de aceptar un producto sin precio' } as any).catch(() => undefined);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
      const [op1] = await sql('SELECT estado FROM operaciones_contingencia WHERE id=$1', r.operacionId);
      expect(op1.estado).toBe('REVISION');
      // Con el precio aprobado de nuevo, el administrador puede reintentarla y se aplica una sola vez.
      await prisma.producto.update({ where: { id: e.p1 }, data: { precioVenta: 10 } });
      await contingencia.resolver(e.tenantId, e.admin, r.operacionId, { accion: 'REINTENTAR', nota: 'Precio aprobado nuevamente por administración' } as any);
      const [op2] = await sql('SELECT estado, venta_id FROM operaciones_contingencia WHERE id=$1', r.operacionId);
      expect(op2.estado).toBe('APLICADA');
      expect(await stock(e.p1)).toBe(18);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toHaveLength(1);
    });

    it('una operación de importe cero se rechaza como técnica y permanente: no crea venta, caja ni movimientos', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const cajaAntes = (await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja'))[0].n;
      const op = operacion(e, ventana.id, e.p1, {
        lineas: [{ productoId: e.p1, cantidadCentesimas: 100, precioCentavos: 0 }],
        subtotalCentavos: 0, isvCentavos: 0, totalCentavos: 0, efectivoRecibidoCentavos: 0, cambioCentavos: 0,
      });
      const [r] = (await enviar(e, [op])).resultados;
      // El equipo recibe un rechazo permanente (no un error de red): conserva la venta local y la marca para revisión.
      expect(r.estado).toBe('RECHAZADA_TECNICA');
      expect(r.codigo).toBe('IMPORTE_INVALIDO');
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
      expect((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja'))[0].n).toBe(cajaAntes);
      expect(await stock(e.p1)).toBe(20);
    });

    it('un cobro menor al total también es un rechazo técnico permanente', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const op = operacion(e, ventana.id, e.p1, { efectivoRecibidoCentavos: 1000, cambioCentavos: 0 });
      const [r] = (await enviar(e, [op])).resultados;
      expect([r.estado, r.codigo]).toEqual(['RECHAZADA_TECNICA', 'IMPORTE_INVALIDO']);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
    });

    it('una línea con precio cero dentro de una operación con total positivo se guarda en revisión y no se puede forzar', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const op = operacion(e, ventana.id, e.p1, {
        lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }, { productoId: e.p2, cantidadCentesimas: 100, precioCentavos: 0 }],
      });
      const [r] = (await enviar(e, [op])).resultados;
      expect(r.estado).toBe('REVISION');
      expect(r.conflictos.map((c: any) => c.codigo)).toContain('IMPORTE_INVALIDO');
      await contingencia.resolver(e.tenantId, e.admin, r.operacionId, { accion: 'ACEPTAR', nota: 'Intento de forzar una línea sin precio' } as any).catch(() => undefined);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toEqual([]);
      expect(await stock(e.p1)).toBe(20);
    });

    it('un lote con una operación inválida no impide aplicar las válidas, y la inválida se rechaza sin registrar venta', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const invalida = operacion(e, ventana.id, e.p1, { lineas: [{ productoId: e.p1, cantidadCentesimas: 100, precioCentavos: 0 }], subtotalCentavos: 0, isvCentavos: 0, totalCentavos: 0, efectivoRecibidoCentavos: 0, cambioCentavos: 0 });
      const valida = operacion(e, ventana.id, e.p1);
      const { resultados } = await enviar(e, [invalida, valida]);
      expect(resultados.map((r: any) => r.estado)).toEqual(['RECHAZADA_TECNICA', 'APLICADA']);
      expect(await stock(e.p1)).toBe(18);
      expect(await sql('SELECT id FROM ventas WHERE tenant_id=$1', e.tenantId)).toHaveLength(1);
    });
  });
});
