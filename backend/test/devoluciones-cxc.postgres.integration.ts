import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { diaCalendario, sumarDias } from '../src/common/zona-horaria';

// Control de pagos con tarjeta/transferencia y conciliación del POS bancario contra PostgreSQL real.
// Cadena completa de migraciones, clúster temporal. Llama a los servicios reales (sin mocks).
// Lo que NO cubre: el POS bancario físico ni la aprobación del banco (no hay integración bancaria).
describe('Devoluciones con crédito, saldo y reembolsos / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let ops: OperacionesService;
  let tenantA: string;
  let tenantB: string;
  let admin: string;
  let cajero: string;
  let vendedor: string;
  let adminB: string;
  let productoId: string;
  let clienteCredito: string;
  let clienteSinCredito: string;

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const venta = (usuario: string, extra: any = {}, tenant = tenantA) => ventas.create(tenant, usuario, {
    solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId, cantidad: 1 }], ...extra,
  } as any);
  const conciliar = (usuario: string, extra: any = {}, tenant = tenantA) => ops.registrarConciliacionBancaria(tenant, usuario, {
    solicitudId: randomUUID(), terminal: 'POS-01', fecha: diaCalendario(new Date()), totalBanco: 0, cantidadBanco: 0, ...extra,
  } as any);
  const aprobaciones = (tenant = tenantA) => sql('SELECT metodo, terminal, referencia, monto::float AS monto, origen FROM aprobaciones_bancarias WHERE tenant_id=$1 ORDER BY created_at', tenant);

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-devoluciones-cxc-'));
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
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-devoluciones-cxc-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantA = randomUUID(); tenantB = randomUUID();
    for (const id of [tenantA, tenantB]) await prisma.tenant.create({ data: { id, nombreComercial: 'Pagos', estado: 'ACTIVO' } as any });
    const crear = async (tenant: string, rol: string, nombre: string) => {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId: tenant, nombre, email: `${id}@test.invalid`, passwordHash: 'x', rol: rol as any, permisosConfigurados: false, permisos: [] } as any });
      return id;
    };
    admin = await crear(tenantA, 'ADMIN', 'Admin A');
    cajero = await crear(tenantA, 'CAJERO', 'Cajero A');
    vendedor = await crear(tenantA, 'VENDEDOR', 'Vendedor A');
    adminB = await crear(tenantB, 'ADMIN', 'Admin B');
    const p = await prisma.producto.create({ data: { tenantId: tenantA, codigo: `P-${randomUUID().slice(0, 6)}`, nombre: 'Taladro', precioCosto: 60, precioVenta: 100, stockActual: 100 } as any });
    productoId = p.id;
    clienteCredito = (await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Constructora Crédito', creditoHabilitado: true, limiteCredito: 10000, saldoPendiente: 0 } as any })).id;
    clienteSinCredito = (await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Sin Crédito', creditoHabilitado: false, saldoPendiente: 0 } as any })).id;
    await ops.abrir(tenantA, admin, { solicitudId: randomUUID(), monto: 500 } as any);
  });

  // Devolución: primero cancela el crédito pendiente y el excedente pagado se reembolsa desde caja (movimiento auditable).
  // Los pagos históricos no se modifican. Reintentos y concurrencia no duplican reembolsos.
  const lineasDe = (ventaId: string) => sql('SELECT id, cantidad::float AS cantidad, precio_unitario::float AS precio FROM detalles_venta WHERE venta_id=$1', ventaId);
  const destinoDe = async (ventaId: string) => (await sql('SELECT reserva_pendiente FROM ventas WHERE id=$1', ventaId))[0].reserva_pendiente ? 'NO_ENTREGADO' : 'INVENTARIO';
  const devolver = async (ventaId: string, cantidad: number, solicitudId = randomUUID(), linea?: string) => {
    const lineas = await lineasDe(ventaId);
    const destino = await destinoDe(ventaId);
    return ops.devolver(tenantA, admin, ventaId, { solicitudId, metodo: 'EFECTIVO', motivo: 'Devolución de prueba', items: [{ detalleId: linea ?? lineas[0].id, cantidad, destino }] } as any);
  };
  const cuentaDe = async (ventaId: string) => (await sql("SELECT id, saldo::float AS saldo FROM cuentas_operativas WHERE documento_id=$1 AND tipo='CXC'", ventaId))[0];
  const reembolsosCaja = (ventaId: string) => sql("SELECT COALESCE(SUM(monto),0)::float AS total, COUNT(*)::int AS n FROM movimientos_caja WHERE tipo='DEVOLUCION' AND referencia IN (SELECT id FROM devoluciones WHERE venta_id=$1)", ventaId);

  describe('devoluciones con crédito', () => {
    it('devolución parcial con deuda pendiente: cancela crédito proporcional y no reembolsa efectivo', async () => {
      const cliente = await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Cliente Parcial', creditoHabilitado: true, limiteCredito: 10000, saldoPendiente: 0 } as any });
      const v = await venta(admin, { clienteId: cliente.id, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2099-01-01', detalles: [{ productoId, cantidad: 2 }] });
      expect((await cuentaDe(v.id)).saldo).toBe(230);
      const linea = (await lineasDe(v.id))[0];
      await devolver(v.id, 1, randomUUID(), (await lineasDe(v.id))[0].id);
      expect((await cuentaDe(v.id)).saldo).toBe(115);
      expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })).saldoPendiente)).toBe(115);
      expect((await reembolsosCaja(v.id))[0]).toEqual({ total: 0, n: 0 });
      expect(linea.cantidad).toBe(2);
    });

    it('devolución de factura ya abonada: el abono queda intacto, se cancela lo pendiente y el excedente se reembolsa', async () => {
      const cliente = await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Cliente Abonado', creditoHabilitado: true, limiteCredito: 10000, saldoPendiente: 0 } as any });
      const v = await venta(admin, { clienteId: cliente.id, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2099-01-01' });
      const cuenta = await cuentaDe(v.id);
      await ops.pagar(tenantA, admin, cuenta.id, { solicitudId: randomUUID(), monto: 50, metodo: 'EFECTIVO' } as any);
      const pagoAntes = await sql('SELECT id, monto::float AS monto, created_at FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id);
      const devolucion = await devolver(v.id, 1);
      expect((await cuentaDe(v.id)).saldo).toBe(0);
      expect((await reembolsosCaja(v.id))[0]).toEqual({ total: -50, n: 1 });
      const pagoDespues = await sql('SELECT id, monto::float AS monto, created_at FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id);
      expect(pagoDespues).toEqual(pagoAntes);
      // La devolución registra la parte cancelada del crédito y el reembolso efectivo.
      expect([Number(devolucion.credito_cancelado), Number(devolucion.reembolso)]).toEqual([65, 50]);
    });

    it('reintentar la misma devolución (misma solicitud) no reembolsa dos veces', async () => {
      const v = await venta(admin, { metodoPago: 'EFECTIVO' });
      const solicitudId = randomUUID();
      const primera = await devolver(v.id, 1, solicitudId);
      const reintento = await devolver(v.id, 1, solicitudId);
      expect(reintento.id).toBe(primera.id);
      expect((await reembolsosCaja(v.id))[0].n).toBe(1);
      expect(await sql('SELECT COUNT(*)::int AS n FROM devoluciones WHERE venta_id=$1', v.id)).toEqual([{ n: 1 }]);
    });

    it('dos devoluciones simultáneas de la misma venta: solo se aplica la que cabe; el reembolso no supera lo cobrado', async () => {
      const v = await venta(admin, { metodoPago: 'EFECTIVO' });
      const resultados = await Promise.allSettled([devolver(v.id, 1), devolver(v.id, 1)]);
      expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect((await reembolsosCaja(v.id))[0]).toEqual({ total: -115, n: 1 });
      expect(await sql('SELECT COUNT(*)::int AS n FROM devoluciones WHERE venta_id=$1', v.id)).toEqual([{ n: 1 }]);
    });
  });

  describe('reembolsos electrónicos: evidencia del procesador', () => {
    const devolverTarjeta = (ventaId: string, pagoElectronico?: any, solicitudId = randomUUID()) => lineasDe(ventaId).then(async lineas => ops.devolver(tenantA, admin, ventaId, {
      solicitudId, metodo: 'TARJETA', motivo: 'Reembolso de prueba', pagoElectronico, items: [{ detalleId: lineas[0].id, cantidad: 1, destino: await destinoDe(ventaId) }],
    } as any));
    const auditoriaDevolucion = (ventaId: string) => sql("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='VENTA_DEVOLVER' AND datos->>'ventaId'=$2", tenantA, ventaId);

    it('reembolso con tarjeta sin comprobante del procesador responde 400, no registra devolución ni toca caja', async () => {
      const v = await venta(admin);
      const cajaAntes = await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja');
      await expect(devolverTarjeta(v.id)).rejects.toThrow('requiere el comprobante o autorización del procesador');
      expect(await sql('SELECT COUNT(*)::int AS n FROM devoluciones WHERE venta_id=$1', v.id)).toEqual([{ n: 0 }]);
      expect(await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja')).toEqual(cajaAntes);
      expect(await auditoriaDevolucion(v.id)).toEqual([]);
    });

    it('reembolso con tarjeta con comprobante: movimiento de caja negativo y comprobante normalizado en la auditoría', async () => {
      const v = await venta(admin);
      await devolverTarjeta(v.id, { referencia: 'dev-ok-01', terminal: 'pos-02' });
      expect((await reembolsosCaja(v.id))[0]).toEqual({ total: -115, n: 1 });
      const [fila] = await auditoriaDevolucion(v.id);
      expect(fila.datos.comprobanteProcesador).toEqual({ metodo: 'TARJETA', terminal: 'POS-02', referencia: 'DEV-OK-01' });
      expect(fila.datos.refund).toBe(115);
    });

    it('reintento con el mismo comprobante y la misma solicitud no duplica el reembolso', async () => {
      const v = await venta(admin);
      const solicitudId = randomUUID();
      await devolverTarjeta(v.id, { referencia: 'DEV-RET-03', terminal: 'POS-02' }, solicitudId);
      await devolverTarjeta(v.id, { referencia: 'DEV-RET-03', terminal: 'POS-02' }, solicitudId);
      expect((await reembolsosCaja(v.id))[0]).toEqual({ total: -115, n: 1 });
    });
  });
});
