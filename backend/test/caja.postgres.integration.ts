import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';

// Caja y arqueo contra PostgreSQL real: apertura, ventas por método, pagos de clientes, devoluciones,
// entradas/salidas autorizadas, diferencias, cierres, concurrencia, idempotencia, permisos y aislamiento.
// Crea un clúster temporal exclusivo y aplica la cadena completa de migraciones; nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Caja y arqueo / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let ops: OperacionesService;

  let tenantId: string;
  let otroTenantId: string;
  let adminId: string;
  let cajeroId: string;
  let cajeroPermisoId: string;
  let otroAdminId: string;
  let clienteId: string;
  let productoId: string;

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const cajaDe = async (userId: string) => (await ops.caja(tenantId, userId))[0];

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-caja-'));
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
  }, 120000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-caja-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otroTenantId = randomUUID();
    for (const id of [tenantId, otroTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Caja de prueba' } });
    adminId = randomUUID(); cajeroId = randomUUID(); cajeroPermisoId = randomUUID(); otroAdminId = randomUUID();
    const usuario = (id: string, tenant: string, rol: string, extra: any = {}) => prisma.usuario.create({ data: { id, tenantId: tenant, nombre: `${rol} ${id.slice(0, 4)}`, email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol: rol as any, ...extra } });
    await usuario(adminId, tenantId, 'ADMIN');
    await usuario(cajeroId, tenantId, 'CAJERO');
    await usuario(cajeroPermisoId, tenantId, 'CAJERO', { permisos: ['caja.movimientos_manuales'], permisosConfigurados: true });
    await usuario(otroAdminId, otroTenantId, 'ADMIN');
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente con crédito', creditoHabilitado: true, limiteCredito: 1000 } });
    clienteId = cliente.id;
    productoId = (await prisma.producto.create({ data: { tenantId, codigo: 'CJ-1', nombre: 'Producto de caja', precioVenta: 100, precioCosto: 50, stockActual: 1000, stockMinimo: 0 } })).id;
  });

  // Venta de 1 unidad a 100 + ISV 15 % = 115.
  const venta = (userId: string, metodoPago = 'EFECTIVO', extra: any = {}, solicitudId = randomUUID()) => ventas.create(tenantId, userId, {
    solicitudId, metodoPago, detalles: [{ productoId, cantidad: 1, precioUnitario: 100 }], ...extra,
  } as any);
  const ventaCredito = (userId: string) => venta(userId, 'CREDITO', { clienteId, tipoPago: 'CREDITO' });
  const abrir = (userId: string, monto: number) => ops.abrir(tenantId, userId, { solicitudId: randomUUID(), monto } as any);
  const cerrar = (userId: string, cajaId: string, monto: number, notas?: string) => ops.cerrar(tenantId, userId, cajaId, { monto, notas } as any);
  const esperado = async (userId: string) => (await cajaDe(userId)).efectivoEsperado;

  it('apertura: registra fondo, responsable y fecha; el reintento no duplica y una segunda caja abierta se rechaza', async () => {
    const solicitud = randomUUID();
    const primera = await ops.abrir(tenantId, cajeroId, { solicitudId: solicitud, monto: 500 } as any);
    expect(Number(primera.monto_apertura)).toBe(500);
    expect(primera.usuario_id).toBe(cajeroId);
    expect(primera.fecha_apertura).toBeInstanceOf(Date);
    const reintento = await ops.abrir(tenantId, cajeroId, { solicitudId: solicitud, monto: 500 } as any);
    expect(reintento.id).toBe(primera.id);
    await expect(ops.abrir(tenantId, cajeroId, { solicitudId: solicitud, monto: 900 } as any)).rejects.toThrow('otra apertura');
    await expect(abrir(cajeroId, 100)).rejects.toThrow('Ya tiene una caja abierta');
    expect(await sql('SELECT COUNT(*)::int AS n FROM cajas WHERE tenant_id=$1 AND usuario_id=$2', tenantId, cajeroId)).toEqual([{ n: 1 }]);
    const auditoria = await sql("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CAJA_ABRIR'", tenantId);
    expect(auditoria[0].n).toBe(1);
  });

  it('ventas en efectivo, con tarjeta y por transferencia: solo el efectivo cambia el esperado en caja', async () => {
    await abrir(cajeroId, 1000);
    await venta(cajeroId, 'EFECTIVO');
    expect(await esperado(cajeroId)).toBe(1115);
    await venta(cajeroId, 'TARJETA');
    expect(await esperado(cajeroId)).toBe(1115);
    await venta(cajeroId, 'TRANSFERENCIA');
    const caja = await cajaDe(cajeroId);
    expect(caja.efectivoEsperado).toBe(1115);
    expect(caja.totales).toMatchObject({ EFECTIVO: 115, TARJETA: 115, TRANSFERENCIA: 115, CREDITO: 0 });
    expect(caja.resumen).toMatchObject({ fondoInicial: 1000, ingresosEfectivo: 115, egresosEfectivo: 0, efectivoEsperado: 1115 });
  });

  it('pagos de clientes: un abono en efectivo entra a la caja; un abono con tarjeta no cambia el efectivo', async () => {
    await abrir(cajeroId, 1000);
    await ventaCredito(cajeroId);
    const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXC' } });
    const solicitud = randomUUID();
    await ops.pagar(tenantId, cajeroId, cuenta.id, { solicitudId: solicitud, monto: 50, metodo: 'EFECTIVO' } as any);
    expect(await esperado(cajeroId)).toBe(1050);
    await ops.pagar(tenantId, cajeroId, cuenta.id, { solicitudId: randomUUID(), monto: 15, metodo: 'TARJETA' } as any);
    const caja = await cajaDe(cajeroId);
    expect(caja.efectivoEsperado).toBe(1050);
    expect(caja.totales).toMatchObject({ EFECTIVO: 50, TARJETA: 15, CREDITO: 115 });
    // Reintento del mismo abono: no cambia la caja ni crea otro pago.
    await ops.pagar(tenantId, cajeroId, cuenta.id, { solicitudId: solicitud, monto: 50, metodo: 'EFECTIVO' } as any);
    expect(await esperado(cajeroId)).toBe(1050);
    expect(await sql('SELECT COUNT(*)::int AS n FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id)).toEqual([{ n: 2 }]);
  });

  it('devolución en efectivo: el reembolso sale de la caja del solicitante y deja la venta anulada', async () => {
    await abrir(adminId, 1000);
    const vendida = await venta(adminId, 'EFECTIVO');
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: vendida.id } });
    await ops.entregar(tenantId, adminId, vendida.id);
    const devolucion = await ops.devolver(tenantId, adminId, vendida.id, {
      solicitudId: randomUUID(), motivo: 'Producto defectuoso', metodo: 'EFECTIVO',
      items: [{ detalleId: detalle.id, cantidad: 1, destino: 'INVENTARIO' }],
    } as any) as any;
    expect(Number(devolucion.reembolso)).toBe(115);
    const caja = await cajaDe(adminId);
    expect(caja.efectivoEsperado).toBe(1000);
    expect(caja.totales.EFECTIVO).toBe(0);
    expect(caja.movimientos.map((m: any) => m.tipo)).toEqual(['VENTA_POS', 'DEVOLUCION']);
  });

  it('entradas y salidas manuales: exigen permiso, no superan el efectivo y dejan evidencia', async () => {
    await abrir(cajeroId, 1000);
    await expect(ops.movimientoCaja(tenantId, cajeroId, (await cajaDe(cajeroId)).id, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 20, concepto: 'Cambio' } as any))
      .rejects.toThrow('permiso requerido');

    await abrir(cajeroPermisoId, 1000);
    const caja = await cajaDe(cajeroPermisoId);
    await ops.movimientoCaja(tenantId, cajeroPermisoId, caja.id, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 50, concepto: 'Cambio recibido' } as any);
    expect(await esperado(cajeroPermisoId)).toBe(1050);
    await expect(ops.movimientoCaja(tenantId, cajeroPermisoId, caja.id, { solicitudId: randomUUID(), tipo: 'EGRESO_MANUAL', monto: 2000, concepto: 'Retiro grande' } as any))
      .rejects.toThrow('Efectivo insuficiente');
    const salida = randomUUID();
    await ops.movimientoCaja(tenantId, cajeroPermisoId, caja.id, { solicitudId: salida, tipo: 'EGRESO_MANUAL', monto: 200, concepto: 'Pago de mensajería', referencia: 'Factura 88' } as any);
    expect(await esperado(cajeroPermisoId)).toBe(850);
    // Reintento idéntico: no duplica la salida. Reutilizar la solicitud con otro monto se rechaza.
    await ops.movimientoCaja(tenantId, cajeroPermisoId, caja.id, { solicitudId: salida, tipo: 'EGRESO_MANUAL', monto: 200, concepto: 'Pago de mensajería', referencia: 'Factura 88' } as any);
    expect(await esperado(cajeroPermisoId)).toBe(850);
    await expect(ops.movimientoCaja(tenantId, cajeroPermisoId, caja.id, { solicitudId: salida, tipo: 'EGRESO_MANUAL', monto: 300, concepto: 'Pago de mensajería' } as any)).rejects.toThrow('otro movimiento');
    const evidencia = await sql("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CAJA_MOVIMIENTO_MANUAL' ORDER BY created_at", tenantId);
    // Un registro por movimiento real: el reintento no genera otra evidencia.
    expect(evidencia).toHaveLength(2);
    expect(evidencia[1].datos).toMatchObject({ tipo: 'EGRESO_MANUAL', monto: 200, autorizacion: 'PERMISO_CAJA' });
  });

  it('diferencia de caja: el cierre exige explicación y registra el faltante', async () => {
    const caja = await abrir(cajeroId, 1000);
    await venta(cajeroId, 'EFECTIVO');
    await expect(cerrar(cajeroId, caja.id, 1100)).rejects.toThrow('Explique la diferencia');
    const cerrada = await cerrar(cajeroId, caja.id, 1100, 'Faltante por cambio mal dado') as any;
    expect(cerrada.estado).toBe('CERRADA');
    expect(Number(cerrada.monto_esperado)).toBe(1115);
    expect(Number(cerrada.diferencia)).toBe(-15);
    expect(cerrada.resumen).toMatchObject({ efectivoEsperado: 1115, efectivoContado: 1100, diferencia: -15 });
  });

  it('cierre con sobrante y totales por método: el esperado excluye tarjeta y transferencia', async () => {
    const caja = await abrir(cajeroId, 1000);
    await venta(cajeroId, 'TARJETA');
    await venta(cajeroId, 'TRANSFERENCIA');
    await venta(cajeroId, 'EFECTIVO');
    const cerrada = await cerrar(cajeroId, caja.id, 1120, 'Propina del cliente') as any;
    expect(Number(cerrada.monto_esperado)).toBe(1115);
    expect(Number(cerrada.diferencia)).toBe(5);
  });

  it('cierre: repetir el mismo cierre responde igual; otro monto se rechaza y el cierre confirmado no cambia', async () => {
    const caja = await abrir(cajeroId, 1000);
    await venta(cajeroId, 'EFECTIVO');
    await cerrar(cajeroId, caja.id, 1115, 'Cuadra');
    await expect(cerrar(cajeroId, caja.id, 1115, 'Cuadra')).resolves.toMatchObject({ estado: 'CERRADA' });
    await expect(cerrar(cajeroId, caja.id, 1200, 'Otro conteo')).rejects.toThrow('ya está cerrada');
    const [fila] = await sql('SELECT monto_cierre_fisico, diferencia, notas FROM cajas WHERE id=$1', caja.id);
    expect(Number(fila.monto_cierre_fisico)).toBe(1115);
    expect(Number(fila.diferencia)).toBe(0);
    // Tras el cierre no entran ventas, abonos ni movimientos manuales nuevos.
    await expect(venta(cajeroId, 'EFECTIVO')).rejects.toThrow('Abra su caja');
    await expect(ops.movimientoCaja(tenantId, cajeroId, caja.id, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 10, concepto: 'Tarde' } as any)).rejects.toThrow('permiso requerido');
    expect(await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja WHERE caja_id=$1', caja.id)).toEqual([{ n: 1 }]);
  });

  it('concurrencia: dos cierres distintos a la vez; solo uno se confirma', async () => {
    const caja = await abrir(cajeroId, 1000);
    const resultados = await Promise.allSettled([cerrar(cajeroId, caja.id, 1000, 'Conteo A'), cerrar(cajeroId, caja.id, 1005, 'Conteo B')]);
    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter(r => r.status === 'rejected')).toHaveLength(1);
    const [fila] = await sql('SELECT monto_cierre_fisico, estado FROM cajas WHERE id=$1', caja.id);
    expect(fila.estado).toBe('CERRADA');
    expect([1000, 1005]).toContain(Number(fila.monto_cierre_fisico));
  });

  it('concurrencia: una venta en efectivo y un cierre simultáneos; el cierre refleja solo lo confirmado', async () => {
    const caja = await abrir(cajeroId, 1000);
    const [ventaResultado, cierreResultado] = await Promise.allSettled([venta(cajeroId, 'EFECTIVO'), cerrar(cajeroId, caja.id, 1000, 'Cierre simultáneo')]);
    expect(cierreResultado.status).toBe('fulfilled');
    const vendio = ventaResultado.status === 'fulfilled';
    const cierre = (cierreResultado as PromiseFulfilledResult<any>).value;
    expect(Number(cierre.monto_esperado)).toBe(vendio ? 1115 : 1000);
    expect(Number(cierre.diferencia)).toBe(vendio ? -115 : 0);
    expect(await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja WHERE caja_id=$1', caja.id)).toEqual([{ n: vendio ? 1 : 0 }]);
  });

  it('concurrencia: dos entradas manuales con la misma solicitud crean un solo movimiento', async () => {
    const caja = await abrir(cajeroPermisoId, 1000);
    const solicitud = randomUUID();
    const body = { solicitudId: solicitud, tipo: 'INGRESO_MANUAL', monto: 30, concepto: 'Cambio' } as any;
    const resultados = await Promise.allSettled([ops.movimientoCaja(tenantId, cajeroPermisoId, caja.id, body), ops.movimientoCaja(tenantId, cajeroPermisoId, caja.id, body)]);
    expect(resultados.every(r => r.status === 'fulfilled')).toBe(true);
    expect(await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja WHERE caja_id=$1', caja.id)).toEqual([{ n: 1 }]);
    expect(await esperado(cajeroPermisoId)).toBe(1030);
  });

  it('idempotencia: reintentar una venta con la misma solicitud no duplica la venta ni el efectivo', async () => {
    await abrir(cajeroId, 1000);
    const solicitud = randomUUID();
    const primera = await venta(cajeroId, 'EFECTIVO', {}, solicitud);
    const segunda = await venta(cajeroId, 'EFECTIVO', {}, solicitud);
    expect(segunda.id).toBe(primera.id);
    expect(await esperado(cajeroId)).toBe(1115);
    expect(await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja WHERE caja_id=(SELECT id FROM cajas WHERE usuario_id=$1 AND tenant_id=$2)', cajeroId, tenantId)).toEqual([{ n: 1 }]);
  });

  it('permisos: el cajero no consulta cierres de la empresa ni cajas ajenas; el administrador sí', async () => {
    const cajaCajero = await abrir(cajeroId, 1000);
    const cajaAdmin = await abrir(adminId, 500);
    await expect(ops.cierresCaja(tenantId, cajeroId, {})).rejects.toThrow('rol de usuario');
    await expect(ops.cajaDetalle(tenantId, cajeroId, cajaAdmin.id)).rejects.toThrow('no encontrada');
    expect((await ops.cajaDetalle(tenantId, cajeroId, cajaCajero.id)).id).toBe(cajaCajero.id);
    const cierres = await ops.cierresCaja(tenantId, adminId, {});
    expect(cierres.map((c: any) => c.id).sort()).toEqual([cajaCajero.id, cajaAdmin.id].sort());
    expect(cierres.find((c: any) => c.id === cajaCajero.id).usuario_nombre).toMatch(/^CAJERO/);
    expect((await ops.cajaDetalle(tenantId, adminId, cajaCajero.id)).movimientos).toEqual([]);
    expect((await ops.cierresCaja(tenantId, adminId, { estado: 'CERRADA' })).length).toBe(0);
  });

  it('aislamiento por empresa: otra empresa no ve, no cierra ni mueve cajas ajenas', async () => {
    const cajaA = await abrir(cajeroId, 1000);
    await ops.abrir(otroTenantId, otroAdminId, { solicitudId: randomUUID(), monto: 10 } as any);
    await expect(ops.cajaDetalle(otroTenantId, otroAdminId, cajaA.id)).rejects.toThrow('no encontrada');
    await expect(ops.cerrar(otroTenantId, otroAdminId, cajaA.id, { monto: 1000, notas: 'Ajena' } as any)).rejects.toThrow('no encontrada');
    await expect(ops.movimientoCaja(otroTenantId, otroAdminId, cajaA.id, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 5, concepto: 'Ajeno' } as any)).rejects.toThrow('no encontrada');
    const visibles = await ops.cierresCaja(otroTenantId, otroAdminId, {});
    expect(visibles.map((c: any) => c.id)).not.toContain(cajaA.id);
    expect(visibles).toHaveLength(1);
    expect(await sql('SELECT estado FROM cajas WHERE id=$1', cajaA.id)).toEqual([{ estado: 'ABIERTA' }]);
  });
});
