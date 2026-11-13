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
import { AutorizacionesService } from '../src/autorizaciones/autorizaciones.service';
import { DashboardService } from '../src/dashboard/dashboard.service';

// Regresiones de la auditoría del 10-nov-2026 contra PostgreSQL real (clúster temporal exclusivo; nunca lee DATABASE_URL):
//  1. Devolución parcial de una venta convertida desde cotización con descuento por línea: se reembolsa lo pagado por esa línea.
//  2. GET /operaciones/resumen: la base es la base imponible (subtotal − descuento) y base + ISV = total.
//  3. Las respuestas de ventas y cotizaciones no llevan datos de crédito del cliente ni la configuración de la empresa fuera de ADMIN.
//  4. Cajero y Vendedor ven completas solo sus ventas; de una ajena, la búsqueda por número entrega lo mínimo para devolver.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Consolidación: devoluciones con descuento por línea, base del resumen y datos por rol / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let ops: OperacionesService;
  let cotizaciones: CotizacionesService;
  let autorizaciones: AutorizacionesService;
  const aprobarDescuento = async (cotizacionId: string) => {
    const solicitud = await prisma.solicitudAutorizacion.findFirstOrThrow({ where: { tenantId, entidadId: cotizacionId, estado: 'PENDIENTE' } });
    await autorizaciones.aprobar(tenantId, adminId, solicitud.id);
  };

  let tenantId: string;
  let adminId: string;
  let cajeroId: string;
  let otroCajeroId: string;
  let vendedorId: string;
  let clienteId: string;
  let productoA: string;
  let productoB: string;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-consolidacion-'));
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
    autorizaciones = new AutorizacionesService(prisma, cotizaciones);
  }, 120000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-consolidacion-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería sintética', configuracion: { interno: 'no debe salir en un comprobante' } } });
    const usuario = async (rol: string, extra: any = {}) => {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: `${rol} ${id.slice(0, 4)}`, email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol: rol as any, ...extra } });
      return id;
    };
    adminId = await usuario('ADMIN');
    cajeroId = await usuario('CAJERO', { descuentoMaximo: 20 });
    otroCajeroId = await usuario('CAJERO');
    vendedorId = await usuario('VENDEDOR');
    clienteId = (await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente con crédito', rtn: '08011990123456', email: 'cliente@test.invalid', direccion: 'Dirección sintética', creditoHabilitado: true, limiteCredito: 5000 } })).id;
    const producto = async (codigo: string) => (await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo, nombre: `Producto ${codigo}`, precioVenta: 100, precioCosto: 50, stockActual: 100, stockMinimo: 0 } })).id;
    productoA = await producto('A');
    productoB = await producto('B');
    for (const id of [adminId, cajeroId, otroCajeroId, vendedorId]) await ops.abrir(tenantId, id, { solicitudId: randomUUID(), monto: 1000 });
  });

  const devolver = (ventaId: string, detalleId: string, cantidad = 1) => ops.devolver(tenantId, adminId, ventaId, {
    solicitudId: randomUUID(), motivo: 'Devolución parcial de prueba', metodo: 'EFECTIVO', items: [{ detalleId, cantidad, destino: 'NO_ENTREGADO' }],
  } as any);

  describe('devolución parcial de venta convertida desde cotización', () => {
    it('reembolsa lo realmente pagado por la línea con descuento propio y el resto por la otra línea', async () => {
      // A: L 100 con L 20 de descuento de línea (paga 80 + ISV 12 = 92). B: L 100 sin descuento (115). Total 207.
      const cotizacion = await cotizaciones.create(tenantId, cajeroId, { detalles: [
        { productoId: productoA, cantidad: 1, descuento: 20, tipoDescuento: 'MONTO' }, { productoId: productoB, cantidad: 1 },
      ] } as any);
      expect(cotizacion.total).toBe(207);
      // Decisión del 2026-11-12: el descuento lo autoriza un ADMIN antes de convertir.
      await aprobarDescuento(cotizacion.id);
      const conversion = await cotizaciones.convertirAVenta(tenantId, cajeroId, cotizacion.id, 'EFECTIVO');
      const venta = await ops.buscarVenta(tenantId, String(conversion.numeroVenta), 'ADMIN', adminId);
      const lineaA = venta.items.find((i: any) => i.codigo === 'A');
      const lineaB = venta.items.find((i: any) => i.codigo === 'B');

      const primera = await devolver(venta.id, lineaA.id);
      expect(Number(primera.monto)).toBe(92);
      expect(Number(primera.reembolso)).toBe(92);

      // Antes del arreglo la línea descontada reembolsaba 103.50 y esta, 103.50: el total cuadraba pero cada parte no.
      const segunda = await ops.solicitarDevolucion(tenantId, cajeroId, venta.id, {
        solicitudId: randomUUID(), motivo: 'Devolución del resto', metodo: 'EFECTIVO', items: [{ detalleId: lineaB.id, cantidad: 1, destino: 'NO_ENTREGADO' }],
      } as any);
      expect(Number(segunda.monto_estimado)).toBe(115);
    });

    it('con descuento de línea y descuento general reparte el general en proporción al neto de cada línea', async () => {
      // A neto 80, B neto 100; descuento general L 18 (10 % de 180): base 162, ISV 24.30, total 186.30.
      const cotizacion = await cotizaciones.create(tenantId, cajeroId, { descuentoGeneral: 18, tipoDescuentoGeneral: 'MONTO', detalles: [
        { productoId: productoA, cantidad: 1, descuento: 20, tipoDescuento: 'MONTO' }, { productoId: productoB, cantidad: 1 },
      ] } as any);
      expect(cotizacion.total).toBe(186.3);
      // Decisión del 2026-11-12: el descuento lo autoriza un ADMIN antes de convertir.
      await aprobarDescuento(cotizacion.id);
      const conversion = await cotizaciones.convertirAVenta(tenantId, cajeroId, cotizacion.id, 'EFECTIVO');
      const venta = await ops.buscarVenta(tenantId, String(conversion.numeroVenta), 'ADMIN', adminId);
      const lineaA = venta.items.find((i: any) => i.codigo === 'A');
      // 186.30 × 80 / 180 = 82.80
      expect(Number((await devolver(venta.id, lineaA.id)).monto)).toBe(82.8);
    });

    it('una línea regalada (100 % de descuento propio) no genera reembolso', async () => {
      const cotizacion = await cotizaciones.create(tenantId, adminId, { detalles: [
        { productoId: productoA, cantidad: 1, descuento: 100, tipoDescuento: 'PORCENTAJE' }, { productoId: productoB, cantidad: 1 },
      ] } as any);
      const conversion = await cotizaciones.convertirAVenta(tenantId, adminId, cotizacion.id, 'EFECTIVO');
      const venta = await ops.buscarVenta(tenantId, String(conversion.numeroVenta), 'ADMIN', adminId);
      const lineaA = venta.items.find((i: any) => i.codigo === 'A');
      const devolucion = await devolver(venta.id, lineaA.id);
      expect(Number(devolucion.monto)).toBe(0);
      expect(Number(devolucion.reembolso)).toBe(0);
    });

    it('una venta directa del POS conserva el reparto proporcional de siempre', async () => {
      const venta = await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 20, detalles: [
        { productoId: productoA, cantidad: 1 }, { productoId: productoB, cantidad: 3 },
      ] } as any);
      // Subtotal 400, descuento 20, base 380, ISV 57, total 437. Devolver A (1 de 4 partes iguales): 437 / 4 = 109.25.
      expect(venta.total).toBe(437);
      const lineaA = venta.detalles.find((d: any) => d.productoId === productoA);
      expect(Number((await devolver(venta.id, lineaA.id)).monto)).toBe(109.25);
    });
  });

  describe('resumen de ventas', () => {
    it('la base es subtotal menos descuento y base + ISV = total también con descuentos', async () => {
      await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', descuento: 10, detalles: [{ productoId: productoA, cantidad: 1 }] } as any);
      await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: productoB, cantidad: 2 }] } as any);
      const dia = (desfase: number) => new Date(Date.now() + desfase * 86400000).toISOString().slice(0, 10);
      const resumen = await ops.resumen(tenantId, dia(-1), dia(1));
      const [efectivo] = resumen.metodos;
      // Venta 1: subtotal 100, descuento 10, ISV 13.50, total 103.50. Venta 2: subtotal 200, ISV 30, total 230.
      expect(Number(efectivo.subtotal_bruto)).toBe(300);
      expect(Number(efectivo.descuento)).toBe(10);
      expect(Number(efectivo.base)).toBe(290);
      expect(Number(efectivo.isv)).toBe(43.5);
      expect(Number(efectivo.total)).toBe(333.5);
      expect(Number(efectivo.base) + Number(efectivo.isv)).toBeCloseTo(Number(efectivo.total), 2);
    });
  });

  describe('datos de cliente y empresa por rol', () => {
    const ventaConCliente = (usuarioId: string) => ventas.create(tenantId, usuarioId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', clienteId, detalles: [{ productoId: productoA, cantidad: 1 }] } as any);
    const RESERVADOS = ['limiteCredito', 'saldoPendiente', 'plazoCreditoDias', 'email', 'direccion'];

    it('el cajero recibe solo los datos comerciales del cliente al vender y al consultar su venta', async () => {
      const venta = await ventaConCliente(cajeroId);
      expect(venta.cliente).toMatchObject({ id: clienteId, nombre: 'Cliente con crédito', rtn: '08011990123456', creditoHabilitado: true });
      for (const campo of RESERVADOS) expect(venta.cliente).not.toHaveProperty(campo);
      const detalle = await ventas.findById(tenantId, venta.id, cajeroId, 'CAJERO');
      for (const campo of RESERVADOS) expect(detalle.cliente).not.toHaveProperty(campo);
      expect(detalle.tenant).toMatchObject({ id: tenantId, nombreComercial: 'Ferretería sintética' });
      for (const campo of ['configuracion', 'plan', 'estado', 'logoStorageKey']) expect(detalle.tenant).not.toHaveProperty(campo);
      const reintento = await ventas.findSolicitud(tenantId, cajeroId, randomUUID(), 'CAJERO');
      expect(reintento.estado).toBe('NO_REGISTRADA');
    });

    it('el administrador conserva el cliente completo y tampoco recibe la configuración interna de la empresa', async () => {
      const venta = await ventaConCliente(adminId);
      expect(venta.cliente).toHaveProperty('limiteCredito');
      const detalle = await ventas.findById(tenantId, venta.id, undefined, 'ADMIN');
      expect(detalle.cliente).toHaveProperty('saldoPendiente');
      expect(detalle.tenant).not.toHaveProperty('configuracion');
    });

    it('la cotización conserva el contacto que imprime, sin crédito ni configuración fuera de ADMIN', async () => {
      const creada = await cotizaciones.create(tenantId, vendedorId, { clienteId, detalles: [{ productoId: productoA, cantidad: 1 }] } as any, undefined, 'VENDEDOR');
      expect(creada.cliente).toMatchObject({ nombre: 'Cliente con crédito', email: 'cliente@test.invalid', direccion: 'Dirección sintética' });
      for (const campo of ['limiteCredito', 'saldoPendiente', 'plazoCreditoDias']) expect(creada.cliente).not.toHaveProperty(campo);
      const consultada = await cotizaciones.findById(tenantId, creada.id, 'VENDEDOR');
      expect(consultada.clienteEmail).toBe('cliente@test.invalid');
      expect(consultada.tenant).not.toHaveProperty('configuracion');
      for (const campo of ['limiteCredito', 'saldoPendiente']) expect(consultada.cliente).not.toHaveProperty(campo);
      expect((await cotizaciones.findById(tenantId, creada.id, 'ADMIN')).cliente).toHaveProperty('limiteCredito');
    });
  });

  describe('inicio del administrador', () => {
    it('las últimas ventas muestran el nombre escrito en la venta cuando no hay cliente registrado', async () => {
      await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', clienteNombre: 'Constructora sin registro', detalles: [{ productoId: productoA, cantidad: 1 }] } as any);
      await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', clienteId, detalles: [{ productoId: productoA, cantidad: 1 }] } as any);
      await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: productoA, cantidad: 1 }] } as any);
      const { ultimasVentas } = await new DashboardService(prisma).getDashboardData(tenantId);
      expect(ultimasVentas.map((v: any) => v.cliente).sort()).toEqual(['Cliente con crédito', 'Constructora sin registro', 'Consumidor Final']);
    });
  });

  describe('ventas propias de Cajero y Vendedor', () => {
    it('la búsqueda por número entrega la venta completa a su autor y a ADMIN, y lo mínimo para devolver a otro cajero o vendedor', async () => {
      const venta = await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', clienteId, clienteRtn: '08011990123456', notas: 'Nota interna', detalles: [{ productoId: productoA, cantidad: 2 }] } as any);
      const numero = String(venta.numeroVenta);

      const propia = await ops.buscarVenta(tenantId, numero, 'CAJERO', cajeroId);
      expect(propia).toHaveProperty('cliente_id', clienteId);
      expect(propia).not.toHaveProperty('alcance');

      for (const [rol, usuarioId] of [['CAJERO', otroCajeroId], ['VENDEDOR', vendedorId]] as const) {
        const ajena = await ops.buscarVenta(tenantId, numero, rol, usuarioId);
        expect(ajena).toMatchObject({ id: venta.id, numero_venta: venta.numeroVenta, alcance: 'DEVOLUCION' });
        expect(Number(ajena.total)).toBe(230);
        expect(ajena.items).toHaveLength(1);
        expect(ajena.items[0]).not.toHaveProperty('costo_unitario');
        for (const campo of ['cliente_id', 'cliente_rtn', 'notas', 'caja_id', 'usuario_id', 'solicitud_hash']) expect(ajena).not.toHaveProperty(campo);
      }

      const administracion = await ops.buscarVenta(tenantId, numero, 'ADMIN', adminId);
      expect(administracion).toHaveProperty('notas', 'Nota interna');
      expect(administracion.items[0]).toHaveProperty('costo_unitario');
    });

    it('la devolución de una venta ajena se puede solicitar con los datos mínimos de la búsqueda', async () => {
      const venta = await ventas.create(tenantId, cajeroId, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: productoA, cantidad: 2 }] } as any);
      const ajena = await ops.buscarVenta(tenantId, String(venta.numeroVenta), 'CAJERO', otroCajeroId);
      const solicitud = await ops.solicitarDevolucion(tenantId, otroCajeroId, ajena.id, {
        solicitudId: randomUUID(), motivo: 'El cliente devuelve una unidad', metodo: 'EFECTIVO', items: [{ detalleId: ajena.items[0].id, cantidad: 1, destino: 'NO_ENTREGADO' }],
      } as any);
      expect(solicitud.estado).toBe('PENDIENTE');
      expect(Number(solicitud.monto_estimado)).toBe(115);
    });
  });
});
