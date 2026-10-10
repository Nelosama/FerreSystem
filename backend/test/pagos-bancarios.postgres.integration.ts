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
describe('Pagos bancarios, crédito y conciliación / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-pagos-bancarios-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-pagos-bancarios-')) {
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

  describe('ventas con tarjeta', () => {
    it('una venta con tarjeta sin autorización no se confirma: sin venta, sin movimiento de caja', async () => {
      const ventasAntes = await sql('SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id=$1', tenantA);
      await expect(venta(admin, { metodoPago: 'TARJETA' })).rejects.toThrow('autorización bancaria');
      await expect(venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AB', terminal: 'POS-01' } })).rejects.toThrow('autorización bancaria');
      await expect(venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-900' } })).rejects.toThrow('terminal');
      expect(await sql('SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id=$1', tenantA)).toEqual(ventasAntes);
      expect(await aprobaciones()).toEqual([]);
    });

    it('con autorización y terminal, la venta se confirma y la autorización queda registrada con su origen', async () => {
      const v = await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'aut-778899', terminal: 'pos-01' } });
      expect(v.metodoPago).toBe('TARJETA');
      const filas = await aprobaciones();
      expect(filas).toEqual([{ metodo: 'TARJETA', terminal: 'POS-01', referencia: 'AUT-778899', monto: 115, origen: 'VENTA' }]); // total con ISV 15%
      const [auditoria] = await sql("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='VENTA_CREAR' AND entidad_id=$2", tenantA, v.id);
      expect(auditoria.datos.aprobacion).toMatchObject({ metodo: 'TARJETA', terminal: 'POS-01', referencia: 'AUT-778899' });
      const movs = await sql("SELECT metodo FROM movimientos_caja WHERE referencia=$1", v.id);
      expect(movs.map((m: any) => m.metodo)).toEqual(['TARJETA']);
    });

    it('reintentar la misma solicitud no duplica la venta ni la autorización', async () => {
      const solicitudId = randomUUID();
      const dto = { solicitudId, metodoPago: 'TARJETA', detalles: [{ productoId, cantidad: 1 }], pagoElectronico: { referencia: 'AUT-REINTENTO', terminal: 'POS-01' } } as any;
      const primera = await ventas.create(tenantA, admin, dto);
      const reintento = await ventas.create(tenantA, admin, dto);
      expect(reintento.id).toBe(primera.id);
      expect((await aprobaciones()).filter(f => f.referencia === 'AUT-REINTENTO')).toHaveLength(1);
    });

    it('la misma autorización no sirve para dos ventas (evita cobrar dos veces)', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-UNICA', terminal: 'POS-01' } });
      const ventasAntes = await sql('SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id=$1', tenantA);
      await expect(venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'aut-unica', terminal: 'POS-01' } })).rejects.toThrow('ya fue registrada');
      expect(await sql('SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id=$1', tenantA)).toEqual(ventasAntes);
    });

    it('la misma referencia y terminal en otra empresa sí es válida (la unicidad es por empresa)', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-EMP', terminal: 'POS-01' } });
      const productoB = await prisma.producto.create({ data: { tenantId: tenantB, codigo: 'B-EMP', nombre: 'Taladro B', precioCosto: 60, precioVenta: 100, stockActual: 100 } as any });
      await ops.abrir(tenantB, adminB, { solicitudId: randomUUID(), monto: 500 } as any);
      await expect(ventas.create(tenantB, adminB, { solicitudId: randomUUID(), metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-EMP', terminal: 'POS-01' }, detalles: [{ productoId: productoB.id, cantidad: 1 }] } as any)).resolves.toBeTruthy();
    });

    it('la misma referencia en otra terminal sí es válida (cada POS tiene su propio voucher)', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-TERM', terminal: 'POS-01' } });
      await expect(venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-TERM', terminal: 'POS-02' } })).resolves.toBeTruthy();
    });

    it('efectivo no lleva autorización bancaria: rechaza el dato y no lo registra', async () => {
      await expect(venta(admin, { metodoPago: 'EFECTIVO', pagoElectronico: { referencia: 'AUT-EF' } })).rejects.toThrow('Solo los pagos con tarjeta o transferencia');
      expect(await aprobaciones()).toEqual([]);
    });

    it('transferencia exige referencia pero no terminal', async () => {
      await expect(venta(admin, { metodoPago: 'TRANSFERENCIA' })).rejects.toThrow('autorización bancaria');
      const v = await venta(admin, { metodoPago: 'TRANSFERENCIA', pagoElectronico: { referencia: 'TRF-2026-01' } });
      expect(v.metodoPago).toBe('TRANSFERENCIA');
      expect(await aprobaciones()).toEqual([{ metodo: 'TRANSFERENCIA', terminal: '', referencia: 'TRF-2026-01', monto: 115, origen: 'VENTA' }]);
    });

    it('la venta a crédito sigue siendo cuenta por cobrar: no registra autorización ni ingreso de efectivo', async () => {
      const v = await venta(admin, { clienteId: clienteCredito, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2026-12-31' });
      expect(await aprobaciones()).toEqual([]);
      const [cxc] = await sql("SELECT tipo, saldo::float AS saldo FROM cuentas_operativas WHERE documento_id=$1", v.id);
      expect(cxc).toEqual({ tipo: 'CXC', saldo: 115 });
      const movs = await sql('SELECT metodo FROM movimientos_caja WHERE referencia=$1', v.id);
      expect(movs.map((m: any) => m.metodo)).toEqual(['CREDITO']);
    });

    it('crédito a cliente sin crédito habilitado se rechaza', async () => {
      await expect(venta(admin, { clienteId: clienteSinCredito, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2026-12-31' })).rejects.toThrow();
    });
  });

  describe('abonos de crédito con tarjeta', () => {
    it('un abono con tarjeta sin autorización no se registra', async () => {
      const v = await venta(admin, { clienteId: clienteCredito, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2026-12-31' });
      const cuenta = (await sql("SELECT id FROM cuentas_operativas WHERE documento_id=$1", v.id))[0];
      await expect(ops.pagar(tenantA, admin, cuenta.id, { solicitudId: randomUUID(), monto: 30, metodo: 'TARJETA' } as any)).rejects.toThrow('autorización bancaria');
      expect(await sql('SELECT COUNT(*)::int AS n FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id)).toEqual([{ n: 0 }]);
    });

    it('un abono con autorización se aplica una vez, con su autorización y su movimiento de caja', async () => {
      const v = await venta(admin, { clienteId: clienteCredito, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2026-12-31' });
      const cuenta = (await sql("SELECT id FROM cuentas_operativas WHERE documento_id=$1", v.id))[0];
      const solicitudId = randomUUID();
      const dto = { solicitudId, monto: 40, metodo: 'TARJETA', pagoElectronico: { referencia: 'ABN-5511', terminal: 'POS-01' } } as any;
      const pago = await ops.pagar(tenantA, admin, cuenta.id, dto);
      await ops.pagar(tenantA, admin, cuenta.id, dto);
      expect(await sql('SELECT COUNT(*)::int AS n FROM pagos_cuenta WHERE cuenta_id=$1', cuenta.id)).toEqual([{ n: 1 }]);
      expect(await aprobaciones()).toEqual(expect.arrayContaining([expect.objectContaining({ referencia: 'ABN-5511', origen: 'ABONO', monto: 40 })]));
      const [saldo] = await sql('SELECT saldo::float AS saldo FROM cuentas_operativas WHERE id=$1', cuenta.id);
      expect(saldo.saldo).toBe(75); // 115 con ISV menos el abono de 40
      const movs = await sql("SELECT metodo, monto::float AS monto FROM movimientos_caja WHERE referencia=$1", pago.id);
      expect(movs).toEqual([{ metodo: 'TARJETA', monto: 40 }]);
    });

    it('la misma autorización no sirve para dos abonos ni para una venta', async () => {
      const v = await venta(admin, { clienteId: clienteCredito, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2026-12-31' });
      const cuenta = (await sql("SELECT id FROM cuentas_operativas WHERE documento_id=$1", v.id))[0];
      await ops.pagar(tenantA, admin, cuenta.id, { solicitudId: randomUUID(), monto: 10, metodo: 'TARJETA', pagoElectronico: { referencia: 'ABN-DUP', terminal: 'POS-01' } } as any);
      await expect(ops.pagar(tenantA, admin, cuenta.id, { solicitudId: randomUUID(), monto: 10, metodo: 'TARJETA', pagoElectronico: { referencia: 'ABN-DUP', terminal: 'POS-01' } } as any)).rejects.toThrow('ya fue registrada');
      await expect(venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'ABN-DUP', terminal: 'POS-01' } })).rejects.toThrow('ya fue registrada');
    });

    it('un pago electrónico a proveedor exige referencia o comprobante verificable', async () => {
      const proveedor = await prisma.proveedor.create({ data: { tenantId: tenantA, nombre: 'Proveedor' } });
      const orden = await ops.compra(tenantA, admin, { solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: 'FAC-CXP', isv: 0, items: [{ productoId, cantidad: 2, costo: 60 }] } as any);
      const cuenta = (await sql("SELECT id FROM cuentas_operativas WHERE documento_id=$1 AND tipo='CXP'", orden.id))[0];
      await expect(ops.pagar(tenantA, admin, cuenta.id, { solicitudId: randomUUID(), monto: 50, metodo: 'TARJETA' } as any)).rejects.toThrow('referencia o comprobante');
      await expect(ops.pagar(tenantA, admin, cuenta.id, { solicitudId: randomUUID(), monto: 50, metodo: 'TARJETA', pagoElectronico: { referencia: 'POS-PROV-50', terminal: 'POS-01' } } as any)).resolves.toBeTruthy();
    });
  });

  describe('conciliación del POS bancario (solo ADMIN)', () => {
    it('el total del sistema suma solo las tarjetas del terminal y del día; coincidencia no exige motivo', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'C-1', terminal: 'POS-01' } });
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'C-2', terminal: 'POS-01' } });
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'C-3', terminal: 'POS-02' } });
      await venta(admin, { metodoPago: 'TRANSFERENCIA', pagoElectronico: { referencia: 'C-4' } });
      const r = await conciliar(admin, { totalBanco: 230, cantidadBanco: 2 });
      expect(Number(r.total_sistema)).toBe(230);
      expect(r.cantidad_sistema).toBe(2);
      expect(Number(r.diferencia)).toBe(0);
      expect(r.motivo).toBeNull();
    });

    it('una diferencia exige motivo; con motivo se guarda y queda auditada', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'D-1', terminal: 'POS-01' } });
      await expect(conciliar(admin, { totalBanco: 90, cantidadBanco: 1 })).rejects.toThrow('Explique la diferencia');
      await expect(conciliar(admin, { totalBanco: 90, cantidadBanco: 1, motivo: 'corto' })).rejects.toThrow('Explique la diferencia');
      const r = await conciliar(admin, { totalBanco: 90, cantidadBanco: 1, motivo: 'Voucher anulado en el POS bancario' });
      expect(Number(r.diferencia)).toBe(-25);
      expect(r.motivo).toBe('Voucher anulado en el POS bancario');
      const [auditoria] = await sql("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CONCILIACION_BANCARIA' AND entidad_id=$2", tenantA, r.id);
      expect(auditoria.datos).toMatchObject({ terminal: 'POS-01', totalBanco: 90, totalSistema: 115, diferencia: -25 });
    });

    it('una sola conciliación por terminal y día; el reintento con la misma solicitud devuelve el original', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'E-1', terminal: 'POS-01' } });
      const solicitudId = randomUUID();
      const primera = await conciliar(admin, { solicitudId, totalBanco: 115, cantidadBanco: 1 });
      const reintento = await conciliar(admin, { solicitudId, totalBanco: 115, cantidadBanco: 1 });
      expect(reintento.id).toBe(primera.id);
      await expect(conciliar(admin, { totalBanco: 115, cantidadBanco: 1 })).rejects.toThrow('Ya existe una conciliación');
      await expect(conciliar(admin, { solicitudId, totalBanco: 999, cantidadBanco: 1 })).rejects.toThrow('ya fue utilizada');
    });

    it('no se concilia un día futuro ni una fecha mal formada', async () => {
      await expect(conciliar(admin, { fecha: '2099-01-01' })).rejects.toThrow('posterior a hoy');
      await expect(conciliar(admin, { fecha: '10/10/2026' })).rejects.toThrow('Fecha inválida');
    });

    it('CAJERO y VENDEDOR no concilian ni consultan (la autorización del servicio lo rechaza)', async () => {
      await expect(conciliar(cajero, { totalBanco: 0, cantidadBanco: 0 })).rejects.toThrow();
      await expect(conciliar(vendedor, { totalBanco: 0, cantidadBanco: 0 })).rejects.toThrow();
      await expect(ops.conciliacionesBancarias(tenantA, cajero)).rejects.toThrow();
    });

    it('otra empresa no ve las autorizaciones ni las conciliaciones de esta, y su total no cuenta estas tarjetas', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'F-1', terminal: 'POS-01' } });
      const ajeno = await conciliar(adminB, { totalBanco: 0, cantidadBanco: 0, terminal: 'POS-01' }, tenantB);
      expect(Number(ajeno.total_sistema)).toBe(0);
      expect((await ops.conciliacionesBancarias(tenantB, adminB)).map((c: any) => c.id)).toEqual([ajeno.id]);
      expect((await ops.conciliacionesBancarias(tenantA, admin)).map((c: any) => c.id)).not.toContain(ajeno.id);
      expect((await aprobaciones(tenantB))).toEqual([]);
    });

    it('la conciliación no altera ventas, autorizaciones ni cierres de caja', async () => {
      await venta(admin, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'G-1', terminal: 'POS-01' } });
      const antes = await sql("SELECT (SELECT COUNT(*) FROM ventas WHERE tenant_id=$1)::int AS v, (SELECT COUNT(*) FROM aprobaciones_bancarias WHERE tenant_id=$1)::int AS a, (SELECT COALESCE(SUM(monto),0)::text FROM movimientos_caja)::text AS m", tenantA);
      await conciliar(admin, { totalBanco: 115, cantidadBanco: 1 });
      const despues = await sql("SELECT (SELECT COUNT(*) FROM ventas WHERE tenant_id=$1)::int AS v, (SELECT COUNT(*) FROM aprobaciones_bancarias WHERE tenant_id=$1)::int AS a, (SELECT COALESCE(SUM(monto),0)::text FROM movimientos_caja)::text AS m", tenantA);
      expect(despues).toEqual(antes);
    });
  });

  describe('plazo de crédito (BALANCE)', () => {
    const vencimientoDe = async (cuentaId: string) => (await sql('SELECT vencimiento::date::text AS v FROM cuentas_operativas WHERE id=$1', cuentaId))[0].v;
    it('una factura a crédito vence según el plazo del cliente y conserva esa fecha aunque el plazo cambie después', async () => {
      const cliente = await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Cliente Plazo', creditoHabilitado: true, limiteCredito: 10000, saldoPendiente: 0, plazoCreditoDias: 15 } as any });
      const v = await venta(admin, { clienteId: cliente.id, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2099-01-01' });
      const cuenta = (await sql('SELECT id FROM cuentas_operativas WHERE documento_id=$1', v.id))[0];
      const esperado = sumarDias(diaCalendario(new Date()), 15);
      expect(await vencimientoDe(cuenta.id)).toBe(esperado);
      await prisma.cliente.update({ where: { id: cliente.id }, data: { plazoCreditoDias: 60 } });
      expect(await vencimientoDe(cuenta.id)).toBe(esperado);
    });
    it('el plazo de crédito fuera de 1 a 365 días lo rechaza la base de datos', async () => {
      await expect(prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Plazo inválido', plazoCreditoDias: 366 } as any })).rejects.toThrow();
      await expect(prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Plazo cero', plazoCreditoDias: 0 } as any })).rejects.toThrow();
    });

    it('sin plazo configurado, la factura conserva el vencimiento indicado (compatibilidad)', async () => {
      const cliente = await prisma.cliente.create({ data: { tenantId: tenantA, nombre: 'Cliente Sin Plazo', creditoHabilitado: true, limiteCredito: 10000, saldoPendiente: 0 } as any });
      const v = await venta(admin, { clienteId: cliente.id, tipoPago: 'CREDITO', metodoPago: 'CREDITO', vencimiento: '2030-06-30' });
      const cuenta = (await sql('SELECT id FROM cuentas_operativas WHERE documento_id=$1', v.id))[0];
      expect(await vencimientoDe(cuenta.id)).toBe('2030-06-30');
    });
  });
});
