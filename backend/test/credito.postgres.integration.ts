import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { ClientesService } from '../src/clientes/clientes.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';

// Ciclo de crédito contra PostgreSQL real: venta/cotización a crédito, abonos de clientes y devoluciones.
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL. Llama a los servicios reales (sin mocks).
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Crédito de clientes / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let cotizaciones: CotizacionesService;
  let clientes: ClientesService;
  let ops: OperacionesService;

  let tenantId: string;
  let otroTenantId: string;
  let adminId: string;
  let cajeroId: string;
  let clienteId: string;      // crédito habilitado, límite 250
  let clienteSinCredito: string;
  let clienteLimiteBajo: string; // crédito habilitado, límite 100
  let productoId: string;

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-credito-'));
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
    // Esquema real: cadena completa de migraciones en orden (incluye triggers de numeración de clientes).
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    ventas = new VentasService(prisma);
    cotizaciones = new CotizacionesService(prisma);
    clientes = new ClientesService(prisma);
    ops = new OperacionesService(prisma);
  }, 120000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-credito-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otroTenantId = randomUUID();
    for (const id of [tenantId, otroTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Crédito de prueba' } });
    adminId = randomUUID(); cajeroId = randomUUID();
    await prisma.usuario.create({ data: { id: adminId, tenantId, nombre: 'Admin', email: `${adminId}@test.invalid`, passwordHash: 'not-a-password', rol: 'ADMIN' } });
    await prisma.usuario.create({ data: { id: cajeroId, tenantId, nombre: 'Cajero', email: `${cajeroId}@test.invalid`, passwordHash: 'not-a-password', rol: 'CAJERO' } });
    // Caja abierta solo para el ADMIN (las ventas y abonos exigen caja del actor).
    await prisma.caja.create({ data: { tenantId, usuarioId: adminId, codigo: 'CAJA-ADMIN', montoApertura: 1000 } });
    const crear = async (nombre: string, creditoHabilitado: boolean, limiteCredito: number | null) => {
      const cliente = await clientes.create(tenantId, { nombre } as any);
      await prisma.cliente.update({ where: { id: cliente.id }, data: { creditoHabilitado, limiteCredito } });
      return cliente.id;
    };
    clienteId = await crear('Cliente crédito', true, 250);
    clienteLimiteBajo = await crear('Cliente límite bajo', true, 100);
    clienteSinCredito = await crear('Cliente sin crédito', false, null);
    productoId = (await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'CR-1', nombre: 'Producto crédito', precioVenta: 100, precioCosto: 50, stockActual: 1000, stockMinimo: 0 } })).id;
  });

  // Venta de 1 unidad a 100 + ISV 15 % = 115 de total.
  const ventaCredito = (cliente = clienteId, solicitudId = randomUUID()) => ventas.create(tenantId, adminId, {
    solicitudId, clienteId: cliente, tipoPago: 'CREDITO', metodoPago: 'CREDITO',
    detalles: [{ productoId, cantidad: 1, precioUnitario: 100 }],
  } as any);

  const cotizacionCredito = async (cliente: string) => {
    const cot = await cotizaciones.create(tenantId, adminId, { clienteId: cliente, detalles: [{ productoId, cantidad: 1, medida: 1, precioUnitario: 100 }] } as any);
    return cot.id;
  };

  const saldoCliente = async (id = clienteId) => Number((await prisma.cliente.findUniqueOrThrow({ where: { id } })).saldoPendiente);
  const cuentaDe = (ventaId: string) => prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXC', documentoId: ventaId } });
  const abono = (cliente: string, monto: number, extra: any = {}) => clientes.addPayment(tenantId, cliente, { monto, ...extra } as any);
  const pagoCuenta = (cuentaId: string, monto: number, metodo = 'EFECTIVO') => ops.pagar(tenantId, adminId, cuentaId, { solicitudId: randomUUID(), monto, metodo } as any);

  // ─── P0-A: conversión a crédito ─────────────────────────────────────────

  it('P0-A dos ventas a crédito que compiten por el mismo cupo: solo una se confirma y el saldo no supera el límite', async () => {
    // Límite 150: una venta de 115 cabe; dos no.
    await prisma.cliente.update({ where: { id: clienteId }, data: { limiteCredito: 150 } });
    const resultados = await Promise.allSettled([ventaCredito(), ventaCredito()]);
    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await saldoCliente()).toBe(115);
    const cuentas = await prisma.cuentaOperativa.findMany({ where: { tenantId, tipo: 'CXC', clienteId } });
    expect(cuentas.reduce((s, c) => s + Number(c.saldo), 0)).toBe(115);
  });

  it('P0-A una venta a crédito que supera el límite se rechaza sin dejar venta ni CxC', async () => {
    await expect(ventaCredito(clienteLimiteBajo)).rejects.toThrow(/límite/i); // 115 > 100
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXC' } })).toBe(0);
    expect(await saldoCliente(clienteLimiteBajo)).toBe(0);
  });

  it('P0-A una cotización convertida a crédito respeta el límite del cliente', async () => {
    const cotId = await cotizacionCredito(clienteLimiteBajo);
    await expect(cotizaciones.convertirAVenta(tenantId, adminId, cotId, 'CREDITO')).rejects.toThrow(/límite|crédito/i);
    expect(await saldoCliente(clienteLimiteBajo)).toBe(0);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });

  it('P0-A una cotización no puede convertirse a crédito para un cliente sin crédito habilitado', async () => {
    const cotId = await cotizacionCredito(clienteSinCredito);
    await expect(cotizaciones.convertirAVenta(tenantId, adminId, cotId, 'CREDITO')).rejects.toThrow(/crédito/i);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXC' } })).toBe(0);
  });

  it('P0-A una cotización a crédito deja la venta, el saldo del cliente y la CxC consistentes', async () => {
    const cotId = await cotizacionCredito(clienteId);
    const venta = await cotizaciones.convertirAVenta(tenantId, adminId, cotId, 'CREDITO') as any;
    const ventaId = venta.id ?? venta.ventaId;
    const v = await prisma.venta.findFirstOrThrow({ where: { id: ventaId } });
    expect(v.tipoPago).toBe('CREDITO');
    expect(Number(v.saldoCredito)).toBe(115);
    expect(await saldoCliente()).toBe(115);
    expect(Number((await cuentaDe(ventaId)).saldo)).toBe(115);
  });

  // ─── P0-B: abonos de clientes ───────────────────────────────────────────

  it('P0-B la ruta heredada de abonos de cliente queda bloqueada y no modifica saldos ni pagos', async () => {
    const venta = await ventaCredito();
    const solicitudId = randomUUID();
    await expect(abono(clienteId, 50, { solicitudId })).rejects.toThrow(/Cuentas y abonos/);
    await expect(abono(clienteId, 50, { solicitudId })).rejects.toThrow(/Cuentas y abonos/);
    expect(await saldoCliente()).toBe(115);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(115);
    expect(await prisma.pagoCuenta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.abonoCliente.count({ where: { tenantId } })).toBe(0);
  });

  it('P0-B un abono de CxC (ruta canónica) registra pago, movimiento de caja y auditoría', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    await pagoCuenta(cuenta.id, 50);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(1);
    expect((await sql("SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1 AND m.concepto='Abono de cliente'", tenantId))[0].n).toBe(1);
    expect((await sql("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CUENTA_PAGAR'", tenantId))[0].n).toBe(1);
  });

  it('P0-B un reintento de la misma solicitud de abono de CxC no se aplica dos veces', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    const dto = { solicitudId: randomUUID(), monto: 50, metodo: 'EFECTIVO' } as any;
    await ops.pagar(tenantId, adminId, cuenta.id, dto);
    await ops.pagar(tenantId, adminId, cuenta.id, dto);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(65);
    expect(await saldoCliente()).toBe(65);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(1);
  });

  it('P0-B un abono de CxC que supera el saldo se rechaza sin cambios parciales', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    await expect(pagoCuenta(cuenta.id, 116)).rejects.toThrow();
    expect(await saldoCliente()).toBe(115);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(0);
  });

  it('P0-B dos cajeros pagan la misma CxC al mismo tiempo: el total aplicado nunca supera el saldo', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    const resultados = await Promise.allSettled([pagoCuenta(cuenta.id, 80), pagoCuenta(cuenta.id, 80)]);
    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(35);
  });

  it('P0-B abonos parciales sucesivos hasta saldar exactamente: saldo de CxC, cliente y venta quedan en cero', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    await pagoCuenta(cuenta.id, 50);
    await pagoCuenta(cuenta.id, 65);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(0);
    expect(await saldoCliente()).toBe(0);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito)).toBe(0);
    await expect(pagoCuenta(cuenta.id, 0.01)).rejects.toThrow();
  });

  // ─── P0-C: cancelaciones de crédito ─────────────────────────────────────

  it('P0-C devolver una venta a crédito sin abonos cancela la deuda del cliente y de la venta', async () => {
    const venta = await ventaCredito();
    await ops.devolver(tenantId, adminId, venta.id, {
      solicitudId: randomUUID(), motivo: 'Cliente desistió', metodo: 'EFECTIVO',
      items: [{ detalleId: (await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: venta.id } })).id, cantidad: 1, destino: 'NO_ENTREGADO' }],
    } as any);
    expect(await saldoCliente()).toBe(0);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito)).toBe(0);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(0);
  });

  it('P0-C devolver una venta a crédito con abonos previos cancela el crédito pendiente y reembolsa el excedente pagado', async () => {
    const venta = await ventaCredito();
    await pagoCuenta((await cuentaDe(venta.id)).id, 50);
    const resultado = await ops.devolver(tenantId, adminId, venta.id, {
      solicitudId: randomUUID(), motivo: 'Cancelación', metodo: 'EFECTIVO',
      items: [{ detalleId: (await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: venta.id } })).id, cantidad: 1, destino: 'NO_ENTREGADO' }],
    } as any) as any;
    // Crédito pendiente 65 (115 − 50 abonados) se cancela; el excedente pagado (50) se reembolsa.
    expect(Number(resultado.credito_cancelado)).toBe(65);
    expect(Number(resultado.reembolso)).toBe(50);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(0);
    expect(await saldoCliente()).toBe(0);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito)).toBe(0);
  });

  // ─── Multi-tenant e invariantes ─────────────────────────────────────────

  it('multi-tenant: un ADMIN de otra empresa no puede abonar ni vender con el cliente o la CxC ajenos', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    const otroAdmin = randomUUID();
    await prisma.usuario.create({ data: { id: otroAdmin, tenantId: otroTenantId, nombre: 'Ajeno', email: `${otroAdmin}@test.invalid`, passwordHash: 'x', rol: 'ADMIN' } });
    await prisma.caja.create({ data: { tenantId: otroTenantId, usuarioId: otroAdmin, codigo: 'CAJA-AJENA', montoApertura: 100 } });
    await expect(ops.pagar(otroTenantId, otroAdmin, cuenta.id, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' } as any)).rejects.toThrow();
    await expect(clientes.addPayment(otroTenantId, clienteId, { monto: 10 } as any)).rejects.toThrow();
    await expect(ventas.create(otroTenantId, otroAdmin, { solicitudId: randomUUID(), clienteId, tipoPago: 'CREDITO', metodoPago: 'CREDITO', detalles: [] } as any)).rejects.toThrow();
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(115);
    expect(await saldoCliente()).toBe(115);
  });

  it('invariante: el saldo del cliente es igual a la suma de sus CxC de crédito abiertas', async () => {
    await ventaCredito();
    const v2 = await ventaCredito();
    await pagoCuenta((await cuentaDe(v2.id)).id, 15);
    await pagoCuenta((await cuentaDe(v2.id)).id, 100);
    const suma = (await sql('SELECT COALESCE(SUM(saldo),0)::numeric AS s FROM cuentas_operativas WHERE tenant_id=$1 AND tipo=\'CXC\' AND cliente_id=$2', tenantId, clienteId))[0].s;
    expect(Number(suma)).toBe(await saldoCliente());
  });

  it('invariante: el saldo de cada CxC = monto − pagos aplicados − crédito cancelado por devoluciones', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    await pagoCuenta(cuenta.id, 30);
    await pagoCuenta(cuenta.id, 20);
    const [fila] = await sql('SELECT c.monto, c.saldo, COALESCE((SELECT SUM(p.monto) FROM pagos_cuenta p WHERE p.cuenta_id=c.id),0) AS pagado FROM cuentas_operativas c WHERE c.id=$1', cuenta.id);
    const [dev] = await sql('SELECT COALESCE(SUM(credito_cancelado),0) AS cancelado FROM devoluciones WHERE venta_id=$1', venta.id);
    expect(Number(fila.monto) - Number(fila.pagado) - Number(dev.cancelado)).toBe(Number(fila.saldo));
  });

  // ─── Concurrencia, fallos intermedios e idempotencia ───────────────────

  it('caso 5: una devolución y un abono sobre la misma venta a crédito no dejan deuda ficticia ni saldos negativos', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    const resultados = await Promise.allSettled([
      ops.devolver(tenantId, adminId, venta.id, { solicitudId: randomUUID(), motivo: 'Desistió', metodo: 'EFECTIVO', items: [{ detalleId: (await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: venta.id } })).id, cantidad: 1, destino: 'NO_ENTREGADO' }] } as any),
      pagoCuenta(cuenta.id, 50),
    ]);
    const devolucionOk = resultados[0].status === 'fulfilled';
    const pagoOk = resultados[1].status === 'fulfilled';
    // Órdenes válidos: (1) la cancelación primero: el abono se rechaza porque la CxC ya está en cero;
    // (2) el abono primero: la cancelación cancela el resto (65) y reembolsa el excedente pagado (50).
    expect(devolucionOk).toBe(true);
    const reembolso = Number((resultados[0] as PromiseFulfilledResult<any>).value.reembolso);
    expect(reembolso).toBe(pagoOk ? 50 : 0);
    expect(Number((resultados[0] as PromiseFulfilledResult<any>).value.credito_cancelado)).toBe(115 - reembolso);
    const saldoCuenta = Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo);
    expect(saldoCuenta).toBe(0);
    expect(await saldoCliente()).toBe(0);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito)).toBe(0);
  });

  it('caso 6: un ADMIN que pierde el rol antes de que se ejecute su autorización impide la devolución', async () => {
    const venta = await ventaCredito();
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: venta.id } });
    const solicitud = await ops.solicitarDevolucion(tenantId, cajeroId, venta.id, { solicitudId: randomUUID(), motivo: 'Devolución', metodo: 'EFECTIVO', items: [{ detalleId: detalle.id, cantidad: 1, destino: 'NO_ENTREGADO' }] } as any) as any;
    await ops.decidirDevolucion(tenantId, adminId, solicitud.id, { decision: 'AUTORIZADA', motivo: 'Aprobado' } as any);
    await prisma.usuario.update({ where: { id: adminId }, data: { rol: 'CAJERO' } });
    await expect(ops.ejecutarAutorizada(tenantId, cajeroId, solicitud.id)).rejects.toThrow(/ya no es administrador/);
    expect(await saldoCliente()).toBe(115);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(115);
  });

  it('caso 7: un fallo entre escrituras de un abono revierte pago, saldo de CxC y auditoría', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    // Inconsistencia previa: el cliente tiene menos saldo que la CxC. El abono falla DESPUÉS de escribir la CxC y el pago.
    await prisma.cliente.update({ where: { id: clienteId }, data: { saldoPendiente: 10 } });
    await expect(pagoCuenta(cuenta.id, 50)).rejects.toThrow(/no coincide/);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(115);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(0);
    expect((await sql("SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1 AND m.concepto='Abono de cliente'", tenantId))[0].n).toBe(0);
    expect((await sql("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CUENTA_PAGAR'", tenantId))[0].n).toBe(0);
  });

  it('una misma solicitud de venta a crédito repetida no duplica la venta, la CxC ni el saldo del cliente', async () => {
    const solicitudId = randomUUID();
    const primera = await ventaCredito(clienteId, solicitudId);
    const reenvio = await ventaCredito(clienteId, solicitudId);
    expect(reenvio.id).toBe(primera.id);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXC' } })).toBe(1);
    expect(await saldoCliente()).toBe(115);
  });

  it('una cotización convertida a crédito no puede convertirse de nuevo: no duplica la CxC ni el saldo', async () => {
    const cotId = await cotizacionCredito(clienteId);
    await cotizaciones.convertirAVenta(tenantId, adminId, cotId, 'CREDITO');
    await expect(cotizaciones.convertirAVenta(tenantId, adminId, cotId, 'CREDITO')).rejects.toThrow(/ya fue convertida/);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXC' } })).toBe(1);
    expect(await saldoCliente()).toBe(115);
  });

  // ─── Revisión financiera de devoluciones con abonos previos ─────────────
  // Venta de 1 unidad a 100 + ISV = 115.00. Abono de 30 % = 34.50. Todas las cifras son decimales exactos.

  const cajaEfectivo = async () => Number((await sql("SELECT COALESCE(SUM(m.monto),0)::numeric AS s FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1 AND m.metodo='EFECTIVO'", tenantId))[0].s);
  const movimientosDevolucion = () => sql("SELECT m.monto, m.metodo, m.usuario_id FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1 AND m.concepto LIKE 'Devolución de venta%'", tenantId);
  const devolucionesDe = (ventaId: string) => sql('SELECT * FROM devoluciones WHERE venta_id=$1', ventaId);
  const auditoriaDevolucion = () => sql("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='VENTA_DEVOLVER'", tenantId);
  const devolverTodo = async (ventaId: string, solicitudId = randomUUID(), usuario = adminId): Promise<any> => {
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId } });
    return ops.devolver(tenantId, usuario, ventaId, {
      solicitudId, motivo: 'Cancelación', metodo: 'EFECTIVO',
      items: [{ detalleId: detalle.id, cantidad: 1, destino: 'NO_ENTREGADO' }],
    } as any);
  };

  it('Escenario A (sin abonos): cancela la deuda, restablece el crédito disponible y no registra reembolso ni movimiento de caja', async () => {
    const venta = await ventaCredito();
    const cajaAntes = await cajaEfectivo();
    const r = await devolverTodo(venta.id);
    expect(Number(r.credito_cancelado)).toBe(115);
    expect(Number(r.reembolso)).toBe(0);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(0);
    expect(await saldoCliente()).toBe(0);
    expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })).limiteCredito) - await saldoCliente()).toBe(250);
    expect(await cajaEfectivo()).toBe(cajaAntes);
    expect(await movimientosDevolucion()).toHaveLength(0);
    expect(await auditoriaDevolucion()).toEqual([{ n: 1 }]);
  });

  it('Escenario B (abono parcial 34.50): la deuda pendiente de 80.50 se cancela y el abonado 34.50 es reembolso efectivamente pagado de la caja', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    await pagoCuenta(cuenta.id, 34.5);
    const cajaAntes = await cajaEfectivo();
    const r = await devolverTodo(venta.id);
    expect(Number(r.credito_cancelado)).toBe(80.5);
    expect(Number(r.reembolso)).toBe(34.5);
    expect(Number(r.credito_cancelado) + Number(r.reembolso)).toBe(Number(r.monto));
    // Caja: un único movimiento de salida, por el reembolso ejecutado, con método y responsable.
    expect(await cajaEfectivo()).toBe(cajaAntes - 34.5);
    const movs = await movimientosDevolucion();
    expect(movs).toHaveLength(1);
    expect(Number(movs[0].monto)).toBe(-34.5);
    expect(movs[0].usuario_id).toBe(adminId);
    // Consistencia de la CxC, del cliente y de la venta.
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(0);
    expect(await saldoCliente()).toBe(0);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito)).toBe(0);
    // El abono legítimo se conserva como historial de pago.
    expect(Number((await sql('SELECT COALESCE(SUM(monto),0)::numeric AS s FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id))[0].s)).toBe(34.5);
    expect((await devolucionesDe(venta.id))[0].caja_id).not.toBeNull();
  });

  it('Escenario C (venta totalmente pagada 115): no hay deuda pendiente y el reembolso de 115 queda trazable a la caja, el responsable y el método', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    await pagoCuenta(cuenta.id, 115);
    const cajaAntes = await cajaEfectivo();
    const r = await devolverTodo(venta.id);
    expect(Number(r.credito_cancelado)).toBe(0);
    expect(Number(r.reembolso)).toBe(115);
    expect(await cajaEfectivo()).toBe(cajaAntes - 115);
    const [dev] = await devolucionesDe(venta.id);
    expect(dev).toMatchObject({ metodo: 'EFECTIVO', usuario_id: adminId });
    expect(dev.caja_id).not.toBeNull();
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(0);
    expect(await saldoCliente()).toBe(0);
    expect(Number((await sql('SELECT COALESCE(SUM(monto),0)::numeric AS s FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id))[0].s)).toBe(115);
  });

  it('Escenario D (reintentos): cancelar dos veces la misma venta no duplica cancelación, reembolso, caja ni auditoría', async () => {
    const venta = await ventaCredito();
    await pagoCuenta((await cuentaDe(venta.id)).id, 34.5);
    const solicitud = randomUUID();
    const primera = await devolverTodo(venta.id, solicitud);
    const cajaTrasPrimera = await cajaEfectivo();
    // Mismo identificador: se devuelve el resultado registrado, sin efectos nuevos.
    const reenvio = await devolverTodo(venta.id, solicitud);
    expect(reenvio.id).toBe(primera.id);
    expect(await cajaEfectivo()).toBe(cajaTrasPrimera);
    // Nueva solicitud sobre la misma venta ya cancelada: se rechaza y no mueve nada.
    await expect(devolverTodo(venta.id)).rejects.toThrow();
    expect(await devolucionesDe(venta.id)).toHaveLength(1);
    expect(await movimientosDevolucion()).toHaveLength(1);
    expect(await auditoriaDevolucion()).toEqual([{ n: 1 }]);
    expect(await saldoCliente()).toBe(0);
  });

  it('Escenario E (concurrencia): un abono de 34.50 y la cancelación completa en sesiones independientes son consistentes en cualquier orden', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    const cajaAntes = await cajaEfectivo();
    const [dev, pago] = await Promise.allSettled([devolverTodo(venta.id), pagoCuenta(cuenta.id, 34.5)]);
    const devolucionOk = dev.status === 'fulfilled';
    const pagoOk = pago.status === 'fulfilled';
    const saldoCuenta = Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo);
    const cajaDelta = (await cajaEfectivo()) - cajaAntes;
    if (devolucionOk) {
      const reembolso = Number(dev.value.reembolso);
      const credito = Number(dev.value.credito_cancelado);
      expect(credito + reembolso).toBe(115);
      expect(saldoCuenta).toBe(0);
      expect(await saldoCliente()).toBe(0);
      // El reembolso sale de caja solo si el abono se confirmó antes que la cancelación.
      expect(cajaDelta).toBe((pagoOk ? 34.5 : 0) - reembolso); // abono en efectivo (+) menos reembolso ejecutado (−)
      expect(reembolso).toBe(pagoOk ? 34.5 : 0);
    } else {
      // La cancelación no se aplicó: el abono, si se confirmó, es el único cambio financiero.
      expect(pagoOk).toBe(true);
      expect(saldoCuenta).toBe(80.5);
      expect(cajaDelta).toBe(34.5);
      expect(await devolucionesDe(venta.id)).toHaveLength(0);
    }
    expect(await saldoCliente()).toBe(saldoCuenta);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito)).toBe(saldoCuenta);
    expect(await movimientosDevolucion()).toHaveLength(devolucionOk && pagoOk ? 1 : 0);
  });

  it('Escenario E, orden 1 (abono confirmado antes): la cancelación cancela el resto y reembolsa exactamente el abono', async () => {
    const venta = await ventaCredito();
    await pagoCuenta((await cuentaDe(venta.id)).id, 34.5);
    const cajaAntes = await cajaEfectivo();
    const r = await devolverTodo(venta.id);
    expect(Number(r.credito_cancelado)).toBe(80.5);
    expect(Number(r.reembolso)).toBe(34.5);
    expect(await cajaEfectivo()).toBe(cajaAntes - 34.5);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(0);
    expect(await saldoCliente()).toBe(0);
  });

  it('Escenario E, orden 2 (cancelación confirmada antes): el abono posterior se rechaza y la caja no cambia', async () => {
    const venta = await ventaCredito();
    const cuenta = await cuentaDe(venta.id);
    const cajaAntes = await cajaEfectivo();
    const r = await devolverTodo(venta.id);
    expect(Number(r.credito_cancelado)).toBe(115);
    expect(Number(r.reembolso)).toBe(0);
    await expect(pagoCuenta(cuenta.id, 34.5)).rejects.toThrow(/saldo/i);
    expect(await cajaEfectivo()).toBe(cajaAntes);
    expect(Number((await sql('SELECT COALESCE(SUM(monto),0)::numeric AS s FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id))[0].s)).toBe(0);
    expect(await saldoCliente()).toBe(0);
  });

  it('devoluciones parciales sucesivas con abono: el reembolso total nunca supera lo pagado y la CxC cuadra en cada paso', async () => {
    // Venta de 2 unidades a 100 + ISV = 230.00; abono de 69.00 (30 %).
    const venta = await ventas.create(tenantId, adminId, {
      solicitudId: randomUUID(), clienteId, tipoPago: 'CREDITO', metodoPago: 'CREDITO',
      detalles: [{ productoId, cantidad: 2, precioUnitario: 100 }],
    } as any);
    const cuenta = await cuentaDe(venta.id);
    await pagoCuenta(cuenta.id, 69);
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: venta.id } });
    const devolverUna = () => ops.devolver(tenantId, adminId, venta.id, {
      solicitudId: randomUUID(), motivo: 'Parcial', metodo: 'EFECTIVO',
      items: [{ detalleId: detalle.id, cantidad: 1, destino: 'NO_ENTREGADO' }],
    } as any) as Promise<any>;
    const primera = await devolverUna();
    expect(Number(primera.monto)).toBe(115);
    expect(Number(primera.credito_cancelado)).toBe(115);   // el crédito pendiente (161) cubre la primera unidad
    expect(Number(primera.reembolso)).toBe(0);
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(46);
    expect(await saldoCliente()).toBe(46);
    const segunda = await devolverUna();
    expect(Number(segunda.monto)).toBe(115);
    expect(Number(segunda.credito_cancelado)).toBe(46);    // lo que queda de crédito
    expect(Number(segunda.reembolso)).toBe(69);            // exactamente lo pagado
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(0);
    expect(await saldoCliente()).toBe(0);
    const devoluciones = await devolucionesDe(venta.id);
    const totalReembolsos = devoluciones.reduce((acc: number, d: any) => acc + Number(d.reembolso), 0);
    const totalCredito = devoluciones.reduce((acc: number, d: any) => acc + Number(d.credito_cancelado), 0);
    expect(totalReembolsos).toBe(69);
    expect(totalCredito + totalReembolsos).toBe(230);
  });

  it('conciliación histórica de solo lectura: sin falsos positivos en flujos válidos y detecta anomalías sembradas', async () => {
    const consultas = readFileSync(resolve('scripts/conciliacion-credito-lectura.sql'), 'utf8')
      .split(/^-- @consulta /m).slice(1)
      .map(bloque => {
        const [nombre, ...lineas] = bloque.split('\n');
        return { nombre: nombre.trim(), sql: lineas.filter(l => !l.startsWith('--')).join('\n').trim() };
      });
    const ejecutar = async (tenant: string) => {
      const hallazgos: Record<string, number> = {};
      for (const { nombre, sql: texto } of consultas) {
        const filas = await prisma.$transaction(async tx => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          return tx.$queryRawUnsafe<any[]>(texto, tenant);
        });
        hallazgos[nombre] = filas.length;
      }
      return hallazgos;
    };
    const estadoDatos = async () => JSON.stringify([
      await sql('SELECT id, saldo_pendiente FROM clientes WHERE tenant_id=$1 ORDER BY id', tenantId),
      await sql('SELECT id, saldo, monto FROM cuentas_operativas WHERE tenant_id=$1 ORDER BY id', tenantId),
      await sql('SELECT id, saldo_credito, tipo_pago FROM ventas WHERE tenant_id=$1 ORDER BY id', tenantId),
    ]);

    // Flujos válidos: una venta devuelta con abono y otra abierta a crédito.
    const devuelta = await ventaCredito();
    await pagoCuenta((await cuentaDe(devuelta.id)).id, 34.5);
    await devolverTodo(devuelta.id);
    const abierta = await ventaCredito();
    expect(await saldoCliente()).toBe(115);
    const limpio = await ejecutar(tenantId);
    expect(Object.values(limpio).every(n => n === 0)).toBe(true);
    expect(await ejecutar(otroTenantId)).toEqual(limpio);

    // Anomalías sembradas por SQL en la base temporal (solo para demostrar la detección).
    await prisma.cliente.update({ where: { id: clienteId }, data: { saldoPendiente: { increment: 10 } } });
    await sql("UPDATE ventas SET tipo_pago='CONTADO' WHERE id=$1", abierta.id);
    await prisma.abonoCliente.create({ data: { tenantId, clienteId, ventaId: devuelta.id, monto: 5, fecha: new Date() } as any });
    const [dev] = await devolucionesDe(devuelta.id);
    await sql('UPDATE movimientos_caja SET monto=monto-1 WHERE referencia=$1', dev.id);

    const antes = await estadoDatos();
    const hallazgos = await ejecutar(tenantId);
    expect(await estadoDatos()).toBe(antes); // la consulta no modifica nada
    expect(hallazgos.saldo_cliente_no_concilia).toBe(1);
    expect(hallazgos.venta_metodo_credito_tipo_contado).toBe(1);
    expect(hallazgos.abono_cliente_heredado).toBe(1);
    expect(hallazgos.reembolso_sin_movimiento_de_caja).toBe(1);
    expect(hallazgos.cxc_sin_cliente).toBe(0);
    expect(hallazgos.venta_credito_sin_cxc).toBe(0);
  });

  it('Escenario F (fallo intermedio): un error entre escrituras de la cancelación deja la venta, la CxC, el cliente, la caja y el stock intactos', async () => {
    const venta = await ventaCredito();
    await pagoCuenta((await cuentaDe(venta.id)).id, 34.5);
    const estado = async () => ({
      saldoCuenta: Number((await cuentaDe(venta.id)).saldo),
      saldoCliente: await saldoCliente(),
      saldoCredito: Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito),
      caja: await cajaEfectivo(),
      devoluciones: (await devolucionesDe(venta.id)).length,
      movimientos: (await movimientosDevolucion()).length,
      auditoria: (await auditoriaDevolucion())[0].n,
      stock: Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual),
    });
    const antes = await estado();
    const solicitud = randomUUID();
    // Fallo controlado DESPUÉS de reducir CxC, cliente y venta, y de insertar la devolución (detalles_devolucion).
    await prisma.$executeRawUnsafe("CREATE OR REPLACE FUNCTION fallo_controlado_devolucion() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fallo controlado'; END $$ LANGUAGE plpgsql");
    await prisma.$executeRawUnsafe('CREATE TRIGGER fallo_devolucion BEFORE INSERT ON detalles_devolucion FOR EACH ROW EXECUTE FUNCTION fallo_controlado_devolucion()');
    try {
      await expect(devolverTodo(venta.id, solicitud)).rejects.toThrow(/fallo controlado/);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fallo_devolucion ON detalles_devolucion');
    }
    expect(await estado()).toEqual(antes);
    // Sin residuos: la misma solicitud, ya sin fallo, se ejecuta una sola vez y con el efecto correcto.
    const ok = await devolverTodo(venta.id, solicitud);
    expect(Number(ok.reembolso)).toBe(34.5);
    expect(await devolucionesDe(venta.id)).toHaveLength(1);
    expect(await movimientosDevolucion()).toHaveLength(1);
  });

  it('la ruta heredada de abonos (410) tampoco crea movimientos de caja ni registros financieros', async () => {
    await ventaCredito();
    const cajaAntes = await cajaEfectivo();
    const movimientosAntes = (await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1', tenantId))[0].n;
    await expect(abono(clienteId, 10, { solicitudId: randomUUID() })).rejects.toThrow(/Cuentas y abonos/);
    expect(await cajaEfectivo()).toBe(cajaAntes);
    expect((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1', tenantId))[0].n).toBe(movimientosAntes);
    expect(await prisma.abonoCliente.count({ where: { tenantId } })).toBe(0);
  });

  it('permisos: un CAJERO no puede cancelar directamente una venta a crédito, y otra empresa no puede cancelarla', async () => {
    const venta = await ventaCredito();
    await expect(devolverTodo(venta.id, randomUUID(), cajeroId)).rejects.toThrow(/administrador/);
    const otroAdmin = randomUUID();
    await prisma.usuario.create({ data: { id: otroAdmin, tenantId: otroTenantId, nombre: 'Ajeno', email: `${otroAdmin}@test.invalid`, passwordHash: 'x', rol: 'ADMIN' } });
    await prisma.caja.create({ data: { tenantId: otroTenantId, usuarioId: otroAdmin, codigo: 'CAJA-AJENA-2', montoApertura: 100 } });
    await expect(ops.devolver(otroTenantId, otroAdmin, venta.id, { solicitudId: randomUUID(), motivo: 'x', metodo: 'EFECTIVO', items: [] } as any)).rejects.toThrow();
    expect(Number((await cuentaDe(venta.id)).saldo)).toBe(115);
    expect(await saldoCliente()).toBe(115);
    expect(await devolucionesDe(venta.id)).toHaveLength(0);
  });

  it('una caja cerrada no cambia cuando se cancela una venta a crédito con abonos', async () => {
    const cerrada = await prisma.caja.create({ data: { tenantId, usuarioId: adminId, codigo: 'CAJA-CERRADA', montoApertura: 500, estado: 'CERRADA' as any } });
    await sql("INSERT INTO movimientos_caja (id,caja_id,usuario_id,tipo,monto,metodo,referencia,concepto) VALUES ($1,$2,$3,'VENTA_POS',50,'EFECTIVO',NULL,'Venta cerrada')", randomUUID(), cerrada.id, adminId);
    const antes = (await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja WHERE caja_id=$1', cerrada.id))[0].n;
    const venta = await ventaCredito();
    await pagoCuenta((await cuentaDe(venta.id)).id, 34.5);
    await devolverTodo(venta.id);
    expect((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja WHERE caja_id=$1', cerrada.id))[0].n).toBe(antes);
    expect(Number((await prisma.caja.findUniqueOrThrow({ where: { id: cerrada.id } })).montoApertura)).toBe(500);
  });
});
