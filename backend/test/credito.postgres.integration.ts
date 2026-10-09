import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
    productoId = (await prisma.producto.create({ data: { tenantId, codigo: 'CR-1', nombre: 'Producto crédito', precioVenta: 100, precioCosto: 50, stockActual: 1000, stockMinimo: 0 } })).id;
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
    expect(devolucionOk !== pagoOk).toBe(true); // exactamente una de las dos operaciones prospera
    const saldoCuenta = Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo);
    expect(saldoCuenta).toBe(devolucionOk ? 0 : 65);
    expect(await saldoCliente()).toBe(saldoCuenta);
    expect(Number((await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } })).saldoCredito)).toBe(saldoCuenta);
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
});
