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
    const p = await prisma.producto.create({ data: { tenantId: tenantA, codigo: `P-${randomUUID().slice(0, 6)}`, nombre: 'Taladro', precioCosto: 60, precioVenta: 100, stockActual: 100, precioAprobado: true } as any });
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
    return devolucionAutorizada(prisma, ops, tenantA, admin, ventaId, { solicitudId, metodo: 'EFECTIVO', motivo: 'Devolución de prueba', items: [{ detalleId: linea ?? lineas[0].id, cantidad, destino }] } as any);
  };
  const cuentaDe = async (ventaId: string) => (await sql("SELECT id, saldo::float AS saldo FROM cuentas_operativas WHERE documento_id=$1 AND tipo='CXC'", ventaId))[0];
  const reembolsosCaja = (ventaId: string) => sql("SELECT COALESCE(SUM(monto),0)::float AS total, COUNT(*)::int AS n FROM movimientos_caja WHERE tipo='DEVOLUCION' AND referencia IN (SELECT id FROM devoluciones WHERE venta_id=$1)", ventaId);

  it('prorrateo exacto: 9 de 12 unidades a 0.21 devuelve 2.18 y el remanente completa 2.90', async () => {
    await prisma.producto.update({ where: { id: productoId }, data: { precioVenta: 0.21 } });
    const v = await venta(admin, { detalles: [{ productoId, cantidad: 12 }] });
    expect(Number(v.total)).toBe(2.90);
    const primera = await devolver(v.id, 9);
    expect([Number(primera.monto), Number(primera.reembolso)]).toEqual([2.18, 2.18]);
    const segunda = await devolver(v.id, 3);
    expect(Number(segunda.monto)).toBe(0.72);
    expect((await reembolsosCaja(v.id))[0]).toEqual({ total: -2.90, n: 2 });
  });

  it('prorrateo con abono: cancela 1.89 de crédito y reembolsa 0.29 más 0.72 sin residuo', async () => {
    await prisma.producto.update({ where: { id: productoId }, data: { precioVenta: 0.21 } });
    const v = await venta(admin, { clienteId: clienteCredito, metodoPago: 'CREDITO', detalles: [{ productoId, cantidad: 12 }] });
    const cuenta = await cuentaDe(v.id);
    await ops.pagar(tenantA, admin, cuenta.id, { solicitudId: randomUUID(), monto: 1.01, metodo: 'EFECTIVO' } as any);
    const primera = await devolver(v.id, 9);
    expect([Number(primera.monto), Number(primera.credito_cancelado), Number(primera.reembolso)]).toEqual([2.18, 1.89, 0.29]);
    expect((await cuentaDe(v.id)).saldo).toBe(0);
    expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: clienteCredito } })).saldoPendiente)).toBe(0);
    const segunda = await devolver(v.id, 3);
    expect([Number(segunda.credito_cancelado), Number(segunda.reembolso)]).toEqual([0, 0.72]);
    expect((await reembolsosCaja(v.id))[0]).toEqual({ total: -1.01, n: 2 });
  });

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
      // Un reintento reenvía exactamente el mismo comando: el destino se fija una vez (tras devolver todo lo pendiente la venta deja de estar reservada).
      const comando = { solicitudId, metodo: 'EFECTIVO', motivo: 'Devolución de prueba', items: [{ detalleId: (await lineasDe(v.id))[0].id, cantidad: 1, destino: await destinoDe(v.id) }] } as any;
      const primera = await devolucionAutorizada(prisma, ops, tenantA, admin, v.id, comando);
      const reintento = await devolucionAutorizada(prisma, ops, tenantA, admin, v.id, { ...comando });
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
  describe('Cancelación POS y anulación administrativa', () => {
    const comandoAnulacion = async (v: any) => ({ solicitudId: randomUUID(), anulacion: true, motivo: 'Cliente abandonó la operación confirmada', metodo: 'EFECTIVO', items: [{ detalleId: (await lineasDe(v.id))[0].id, cantidad: 1, destino: 'NO_ENTREGADO' }] });
    const foto = async () => ({
      producto: await prisma.producto.findUniqueOrThrow({ where: { id: productoId } }),
      ventas: await prisma.venta.findMany({ where: { tenantId: tenantA } }),
      caja: await sql('SELECT * FROM movimientos_caja WHERE caja_id IN (SELECT id FROM cajas WHERE tenant_id=$1) ORDER BY id', tenantA),
    });

    it('descarte durable, idempotente y auditable sin venta, stock ni caja; bloquea un POST retrasado', async () => {
      const solicitudId = randomUUID();
      const antes = await foto();
      await expect(ventas.descartarSolicitud(tenantA, admin, solicitudId)).resolves.toEqual({ estado: 'DESCARTADA' });
      await expect(ventas.descartarSolicitud(tenantA, admin, solicitudId)).resolves.toEqual({ estado: 'DESCARTADA' });
      await expect(ventas.findSolicitud(tenantA, admin, solicitudId)).resolves.toEqual({ estado: 'DESCARTADA' });
      await expect(venta(admin, { solicitudId })).rejects.toMatchObject({ status: 409 });
      expect(await foto()).toEqual(antes);
      const auditoria = await sql("SELECT * FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='VENTA_DESCARTAR'", tenantA);
      expect(auditoria).toHaveLength(1);
      expect(auditoria[0]).toMatchObject({ usuario_id: admin, datos: expect.objectContaining({ solicitudId }) });
    });

    it('una venta ya confirmada se recupera sin descartarla ni alterar sus movimientos', async () => {
      const solicitudId = randomUUID();
      const v = await venta(admin, { solicitudId });
      const antes = await foto();
      expect(await ventas.descartarSolicitud(tenantA, admin, solicitudId)).toMatchObject({ estado: 'REGISTRADA', venta: { id: v.id } });
      expect(await foto()).toEqual(antes);
    });

    it('descarte y confirmación concurrentes resuelven a una venta íntegra o a un descarte durable', async () => {
      for (let i = 0; i < 8; i++) {
        const solicitudId = randomUUID();
        const tareas = [() => ventas.descartarSolicitud(tenantA, admin, solicitudId), () => venta(admin, { solicitudId })];
        const resultados = await Promise.allSettled((i % 2 ? tareas.reverse() : tareas).map(run => run()));
        const estado = await ventas.findSolicitud(tenantA, admin, solicitudId);
        expect(['REGISTRADA', 'DESCARTADA']).toContain(estado.estado);
        if (estado.estado === 'DESCARTADA') expect(resultados.some(r => r.status === 'rejected')).toBe(true);
        else expect(resultados.every(r => r.status === 'fulfilled')).toBe(true);
      }
      const [conteo] = await sql("SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id=$1", tenantA);
      const [caja] = await sql("SELECT COUNT(*)::int AS n FROM movimientos_caja WHERE tipo='VENTA_POS' AND caja_id IN (SELECT id FROM cajas WHERE tenant_id=$1)", tenantA);
      expect(caja.n).toBe(conteo.n);
      expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockReservado)).toBe(conteo.n);
    });

    it('el descarte respeta tenant, permisos revocados y pertenencia de ventas confirmadas', async () => {
      const solicitudId = randomUUID();
      await ventas.descartarSolicitud(tenantA, admin, solicitudId);
      expect(await ventas.findSolicitud(tenantB, adminB, solicitudId)).toEqual({ estado: 'NO_REGISTRADA' });
      await prisma.usuario.update({ where: { id: cajero }, data: { permisosConfigurados: true, permisos: [] } });
      await expect(ventas.descartarSolicitud(tenantA, cajero, randomUUID())).rejects.toMatchObject({ status: 403 });
      await expect(ventas.descartarSolicitud(tenantA, adminB, randomUUID())).rejects.toMatchObject({ status: 403 });
      const otroId = randomUUID();
      await venta(admin, { solicitudId: otroId });
      await expect(ventas.descartarSolicitud(tenantA, vendedor, otroId)).rejects.toMatchObject({ status: 409 });
    });

    it('anulación total exige solicitud, motivo y otro Admin; no acepta ruta directa ni autoautorización', async () => {
      const v = await venta(admin);
      const dto = await comandoAnulacion(v);
      await expect(ops.devolver(tenantA, admin, v.id, dto)).rejects.toMatchObject({ status: 403 });
      const { anulacion: _flag, ...sinMarca } = dto;
      await expect(ops.devolver(tenantA, admin, v.id, sinMarca)).rejects.toMatchObject({ status: 403 });
      await expect(ops.solicitarDevolucion(tenantA, admin, v.id, { ...dto, motivo: ' ' })).rejects.toMatchObject({ status: 400 });
      await ops.solicitarDevolucion(tenantA, admin, v.id, dto);
      await expect(ops.decidirDevolucion(tenantA, admin, dto.solicitudId, { decision: 'AUTORIZADA', motivo: 'Soy el solicitante' })).rejects.toMatchObject({ status: 403 });
      await expect(ops.decidirDevolucion(tenantA, cajero, dto.solicitudId, { decision: 'AUTORIZADA', motivo: 'Intento de cajero' })).rejects.toMatchObject({ status: 403 });
      await expect(ops.decidirDevolucion(tenantB, adminB, dto.solicitudId, { decision: 'AUTORIZADA', motivo: 'Otra empresa' })).rejects.toMatchObject({ status: 404 });
      await expect(ops.ejecutarAutorizada(tenantA, admin, dto.solicitudId)).rejects.toMatchObject({ status: 403 });
    });

    it('solicitudes de anulación concurrentes no duplican el trámite; el rechazo no mueve saldos', async () => {
      const v = await venta(admin);
      const dto = await comandoAnulacion(v);
      const antes = await foto();
      const estados = await Promise.allSettled([ops.solicitarDevolucion(tenantA, admin, v.id, dto), ops.solicitarDevolucion(tenantA, admin, v.id, { ...dto, solicitudId: randomUUID() })]);
      expect(estados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      const solicitud = estados.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
      // Un Admin distinto decide con su sesión; la cuenta no se usa para autenticar al solicitante.
      await prisma.usuario.update({ where: { id: vendedor }, data: { rol: 'ADMIN' } });
      await ops.decidirDevolucion(tenantA, vendedor, solicitud.value.id, { decision: 'RECHAZADA', motivo: 'El cliente sí recibió su pedido' });
      await expect(ops.ejecutarAutorizada(tenantA, admin, solicitud.value.id)).rejects.toMatchObject({ status: 403 });
      expect(await foto()).toEqual(antes);
    });

    it('autorizar y ejecutar dos veces genera un solo documento compensatorio y trazabilidad completa', async () => {
      const v = await venta(admin);
      const dto = await comandoAnulacion(v);
      await prisma.usuario.update({ where: { id: vendedor }, data: { rol: 'ADMIN' } });
      await ops.solicitarDevolucion(tenantA, admin, v.id, dto);
      await ops.decidirDevolucion(tenantA, vendedor, dto.solicitudId, { decision: 'AUTORIZADA', motivo: 'Revisé documento y mercancía' });
      expect((await reembolsosCaja(v.id))[0].n).toBe(0);
      const resultados = await Promise.all([ops.ejecutarAutorizada(tenantA, admin, dto.solicitudId), ops.ejecutarAutorizada(tenantA, admin, dto.solicitudId)]);
      expect(resultados[0].id).toBe(resultados[1].id);
      expect((await reembolsosCaja(v.id))[0]).toMatchObject({ n: 1, total: -115 });
      const p = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
      expect(Number(p.stockActual)).toBe(100); expect(Number(p.stockReservado)).toBe(0);
      expect(await prisma.venta.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ estado: 'COMPLETADA', numeroVenta: v.numeroVenta });
      const trace = await ops.consultarDevolucion(tenantA, admin, dto.solicitudId);
      expect(trace).toMatchObject({ solicitante_id: admin, administrador_id: vendedor, estado: 'EJECUTADA', comando: { motivo: dto.motivo, anulacion: true }, resultado: { id: resultados[0].id } });
      expect(trace.decidida_at).toBeTruthy(); expect(trace.created_at).toBeTruthy();
      const [audit] = await sql("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='DEVOLUCION_EJECUTAR_AUTORIZADA'", tenantA);
      expect(audit.datos).toMatchObject({ administradorId: vendedor, solicitanteId: admin, ventaId: v.id, motivo: dto.motivo, anulacion: true });
      await expect(ops.solicitarDevolucion(tenantA, admin, v.id, { ...dto, solicitudId: randomUUID() })).rejects.toThrow();
    });
  });

});
