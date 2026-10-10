import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { VentasService } from '../src/ventas/ventas.service';

// Flujo completo del piloto contra PostgreSQL real: proveedor, compra, recepción, costo vigente,
// venta en línea, venta en contingencia, sincronización, conciliación de inventario y caja, y consulta administrativa.
// Cadena completa de migraciones en clúster temporal exclusivo. Nunca lee DATABASE_URL. Ejecutar como usuario no root.
describe('Piloto: flujo completo POS offline con PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let contingencia: ContingenciaService;
  let operaciones: OperacionesService;
  let ventas: VentasService;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-piloto-'));
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
    contingencia = new ContingenciaService(prisma);
    operaciones = new OperacionesService(prisma);
    ventas = new VentasService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-piloto-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  let contador = 0;
  /** Empresa con administrador, cajero con caja abierta (apertura L 100), un producto y un dispositivo. */
  async function empresa() {
    const tenantId = randomUUID();
    const admin = randomUUID();
    const cajero = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: `Piloto ${++contador}`, estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: true } } as any } });
    for (const [id, rol] of [[admin, 'ADMIN'], [cajero, 'CAJERO']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: false, permisos: [] } as any });
    }
    await operaciones.abrir(tenantId, cajero, { solicitudId: randomUUID(), monto: 100 } as any);
    const producto = await prisma.producto.create({ data: { tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    const dispositivoId = randomUUID();
    await contingencia.registrarDispositivo(tenantId, cajero, { dispositivoId, nombre: 'Caja principal' });
    return { tenantId, admin, cajero, producto: producto.id, dispositivoId };
  }

  function operacionOffline(e: Awaited<ReturnType<typeof empresa>>, ventanaId: string, cantidad: number, precioCentavos: number) {
    const n = ++contador;
    const subtotal = cantidad * precioCentavos;
    const isv = Math.round(subtotal * 0.15);
    const total = subtotal + isv;
    const recibido = Math.ceil(total / 100) * 100;
    return {
      operacionId: randomUUID(), dispositivoId: e.dispositivoId, ventanaId, secuenciaLocal: n,
      correlativoLocal: `CT-01-${String(n).padStart(4, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero,
      lineas: [{ productoId: e.producto, cantidadCentesimas: cantidad * 100, precioCentavos }],
      subtotalCentavos: subtotal, isvCentavos: isv, totalCentavos: total, efectivoRecibidoCentavos: recibido, cambioCentavos: recibido - total,
      esquemaVersion: 1,
    };
  }
  const enviar = (e: Awaited<ReturnType<typeof empresa>>, ops: any[], rol = 'CAJERO', usuarioId = e.cajero) =>
    contingencia.recibirLote(e.tenantId, usuarioId, rol, { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: ops } as any);
  const stock = async (id: string) => Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stockActual);

  describe('flujo completo', () => {
    it('proveedor, compra, recepción, costo vigente, venta en línea, venta en contingencia, recuperación, sincronización, conciliación y consulta administrativa', async () => {
      const e = await empresa();

      // 1. Registrar proveedor (administrador).
      const proveedor = await operaciones.proveedor(e.tenantId, e.admin, { solicitudId: randomUUID(), nombre: 'Distribuidora Norte' } as any);
      expect(proveedor.id).toBeTruthy();

      // 2. Registrar compra de 10 tornillos a 6.00 y 3. recibir inventario.
      const compra = await operaciones.compra(e.tenantId, e.admin, {
        solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: 'FAC-PILOTO-1', isv: 0,
        items: [{ productoId: e.producto, cantidad: 10, costo: 6 }],
      } as any);
      const detalle = await prisma.detalleOrdenCompra.findFirstOrThrow({ where: { ordenId: compra.id } });
      await operaciones.recibir(e.tenantId, e.admin, compra.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 10 }] } as any);
      expect(await stock(e.producto)).toBe(30);

      // 4. Costo vigente actualizado por la recepción (4.00 → 6.00) y asociado al proveedor.
      const producto = await prisma.producto.findUniqueOrThrow({ where: { id: e.producto } });
      expect(Number(producto.precioCosto)).toBe(6);
      const asociacion = await prisma.productoProveedor.findFirstOrThrow({ where: { tenantId: e.tenantId, productoId: e.producto, proveedorId: proveedor.id } });
      expect(Number(asociacion.ultimoCosto)).toBe(6);

      // 5. Venta con conexión (2 tornillos a 10.00).
      const enLinea = await ventas.create(e.tenantId, e.cajero, { detalles: [{ productoId: e.producto, cantidad: 2, precioUnitario: 10 }], solicitudId: randomUUID() } as any);
      expect(enLinea.id).toBeTruthy();
      // La venta en línea reserva; el stock físico baja al entregar (flujo existente de entregas).
      const reservado = async () => Number((await prisma.producto.findUniqueOrThrow({ where: { id: e.producto } })).stockReservado);
      expect(await reservado()).toBe(2);
      expect(await stock(e.producto)).toBe(30);
      const lineaEnLinea = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: enLinea.id } });
      expect(Number(lineaEnLinea.costoUnitario)).toBe(6);
      await operaciones.entregar(e.tenantId, e.cajero, enLinea.id);
      expect(await reservado()).toBe(0);
      expect(await stock(e.producto)).toBe(28);

      // 6. Venta en contingencia: el equipo emite su ventana con la existencia actual (28) y cobra 2 tornillos.
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const offline = operacionOffline(e, ventana.id, 2, 1000);

      // 7. Recuperar conexión y 8. sincronizar: el lote llega, se aplica una vez.
      const [resultado] = (await enviar(e, [offline])).resultados;
      expect(resultado.estado).toBe('APLICADA');
      expect(resultado.requiereRevision).toBe(false);
      expect(await stock(e.producto)).toBe(26);
      const ventaOffline = await prisma.venta.findUniqueOrThrow({ where: { id: resultado.ventaId } });
      expect(ventaOffline.origen).toBe('CONTINGENCIA');
      expect(ventaOffline.correlativoLocal).toBe(offline.correlativoLocal);
      // La venta offline conserva el costo vigente al emitir la ventana (6.00).
      const lineaOffline = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: resultado.ventaId } });
      expect(Number(lineaOffline.costoUnitario)).toBe(6);

      // Reenvío tras pérdida de respuesta: no duplica venta, stock ni caja.
      const [reenvio] = (await enviar(e, [offline])).resultados;
      expect(reenvio.ventaId).toBe(resultado.ventaId);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(2);
      expect(await stock(e.producto)).toBe(26);

      // 9. Conciliar inventario: existencias = 20 iniciales + 10 recibidas − 2 en línea − 2 en contingencia.
      expect(await stock(e.producto)).toBe(20 + 10 - 2 - 2);

      // 9. Conciliar caja: efectivo esperado = apertura + ventas en efectivo (total de cada venta).
      const ventaEnLinea = await prisma.venta.findUniqueOrThrow({ where: { id: enLinea.id } });
      const efectivoEsperado = 100 + Number(ventaEnLinea.total) + Number(ventaOffline.total);
      const cierre = await operaciones.cerrar(e.tenantId, e.cajero, (await prisma.caja.findFirstOrThrow({ where: { tenantId: e.tenantId, usuarioId: e.cajero } })).id, { monto: efectivoEsperado } as any);
      expect(Number(cierre.diferencia)).toBe(0);

      // 10. Consulta administrativa: la operación aparece como aplicada y el resumen separa el origen.
      const listado = await contingencia.listar(e.tenantId, { soloRevision: false });
      expect(listado.map((f) => f.estado)).toEqual(['APLICADA']);
      expect(listado[0].cajero).toBe('CAJERO');
      const resumen = await contingencia.resumen(e.tenantId);
      const offlineResumen = resumen.ventasDelDia.find((v) => v.origen === 'CONTINGENCIA');
      expect(offlineResumen?.cantidad).toBe(1);
    });
  });

  describe('pruebas negativas', () => {
    it('un cajero no puede registrar proveedores ni compras', async () => {
      const e = await empresa();
      await expect(operaciones.proveedor(e.tenantId, e.cajero, { solicitudId: randomUUID(), nombre: 'Intruso' } as any)).rejects.toThrow();
      await expect(operaciones.compra(e.tenantId, e.cajero, {
        solicitudId: randomUUID(), proveedorId: randomUUID(), numeroFactura: 'X', isv: 0, items: [{ productoId: e.producto, cantidad: 1, costo: 1 }],
      } as any)).rejects.toThrow();
      expect(await prisma.proveedor.count({ where: { tenantId: e.tenantId } })).toBe(0);
    });

    it('un cajero no puede resolver operaciones en revisión', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      // Sin stock suficiente en la nube: queda en revisión.
      await prisma.producto.update({ where: { id: e.producto }, data: { stockActual: 0 } });
      const [res] = (await enviar(e, [operacionOffline(e, ventana.id, 2, 1000)])).resultados;
      expect(res.requiereRevision).toBe(true);
      await expect(contingencia.resolver(e.tenantId, e.cajero, res.operacionId, { accion: 'ACEPTAR', nota: 'intento de cajero sin permiso' } as any)).rejects.toThrow();
    });

    it('un lote enviado por un cajero no puede registrar operaciones de otro cajero', async () => {
      const e = await empresa();
      const otro = randomUUID();
      await prisma.usuario.create({ data: { id: otro, tenantId: e.tenantId, nombre: 'Otro', email: `${otro}@test.invalid`, passwordHash: 'x', rol: 'CAJERO', permisosConfigurados: false, permisos: [] } as any });
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const ajena = { ...operacionOffline(e, ventana.id, 1, 1000), cajeroId: otro };
      const [res] = (await enviar(e, [ajena])).resultados;
      expect(res.estado).not.toBe('APLICADA');
      expect(await stock(e.producto)).toBe(20);
    });

    it('la idempotencia: el mismo UUID con otro contenido no se aplica ni sobrescribe', async () => {
      const e = await empresa();
      const { ventana } = await contingencia.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const original = operacionOffline(e, ventana.id, 1, 1000);
      const [primera] = (await enviar(e, [original])).resultados;
      expect(primera.estado).toBe('APLICADA');
      const alterada = { ...original, totalCentavos: 1, subtotalCentavos: 1, isvCentavos: 0, cambioCentavos: 0 };
      const [segunda] = (await enviar(e, [alterada])).resultados;
      expect(segunda.requiereRevision).toBe(true);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(1);
      expect(await stock(e.producto)).toBe(19);
    });

    it('aislamiento: otra empresa no ve ni puede resolver las operaciones de esta', async () => {
      const a = await empresa();
      const b = await empresa();
      const { ventana } = await contingencia.emitirVentana(a.tenantId, a.cajero, { dispositivoId: a.dispositivoId });
      const [res] = (await enviar(a, [operacionOffline(a, ventana.id, 1, 1000)])).resultados;
      expect(await contingencia.listar(b.tenantId, {})).toEqual([]);
      await expect(contingencia.resolver(b.tenantId, b.admin, res.operacionId, { accion: 'ACEPTAR', nota: 'otra empresa intenta resolver' } as any)).rejects.toThrow();
      expect(await stock(a.producto)).toBe(19);
    });
  });
});
