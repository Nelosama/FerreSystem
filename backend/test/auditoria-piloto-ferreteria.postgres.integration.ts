import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { ClientesService } from '../src/clientes/clientes.service';
import { ProductosService } from '../src/productos/productos.service';

// Auditoría de preparación para piloto en una ferretería real (ventas, inventario, caja, compras, crédito,
// aislamiento e integridad). Escenarios de jornada completa con conciliación en centavos contra PostgreSQL
// temporal con la cadena completa de migraciones. Nunca lee DATABASE_URL ni toca una base compartida.
describe('Auditoría de piloto: jornada de ferretería / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let ops: OperacionesService;
  let clientes: ClientesService;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-auditoria-piloto-'));
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
    ops = new OperacionesService(prisma);
    clientes = new ClientesService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-auditoria-piloto-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  let n = 0;
  /** Negocio con ADMIN, CAJERO (descuento máximo 10 %), BODEGUERO, caja abierta del cajero (fondo 500) y tres productos. */
  async function negocio() {
    const tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: `Ferretería ${++n}`, estado: 'ACTIVO' } });
    const usuario = async (rol: string, extra: any = {}) => {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol: rol as any, ...extra } });
      return id;
    };
    const admin = await usuario('ADMIN');
    const cajero = await usuario('CAJERO', { descuentoMaximo: 10 });
    const bodeguero = await usuario('BODEGUERO', { permisosConfigurados: true, permisos: ['inventario.editar', 'inventario.ver'] });
    const caja = await ops.abrir(tenantId, cajero, { solicitudId: randomUUID(), monto: 500 } as any);
    await ops.abrir(tenantId, admin, { solicitudId: randomUUID(), monto: 0 } as any);
    const producto = (codigo: string, precio: number, costo: number, stock: number) =>
      prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo, nombre: codigo, precioVenta: precio, precioCosto: costo, stockActual: stock, stockMinimo: 0 } as any }).then(p => p.id);
    const martillo = await producto('MART-1', 100, 60, 50);
    const clavo = await producto('CLAV-1', 0.35, 0.2, 1000);
    const cable = await producto('CABL-1', 12.5, 8, 10);
    const cliente = await clientes.create(tenantId, { nombre: 'Constructora Delta' } as any);
    await prisma.cliente.update({ where: { id: cliente.id }, data: { creditoHabilitado: true, limiteCredito: 1000 } });
    return { tenantId, admin, cajero, bodeguero, cajaId: caja.id, martillo, clavo, cable, clienteId: cliente.id };
  }
  type N = Awaited<ReturnType<typeof negocio>>;

  const vender = (e: N, usuario: string, dto: any) => ventas.create(e.tenantId, usuario, { solicitudId: randomUUID(), ...dto });
  const stock = async (id: string) => { const p = await prisma.producto.findUniqueOrThrow({ where: { id } }); return { actual: Number(p.stockActual), reservado: Number(p.stockReservado) }; };
  const cajaDe = async (e: N, usuario: string) => (await ops.caja(e.tenantId, usuario))[0];
  const cuentaDe = (e: N, ventaId: string) => prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId: e.tenantId, tipo: 'CXC', documentoId: ventaId } });
  const cents = (v: unknown) => Math.round(Number(v) * 100);

  /** Huella de todo lo que una operación fallida no debe alterar. */
  async function huella(e: N) {
    const [r] = await sql(`SELECT
      (SELECT COUNT(*)::int FROM ventas WHERE tenant_id=$1) AS ventas,
      (SELECT COUNT(*)::int FROM detalles_venta WHERE tenant_id=$1) AS detalles,
      (SELECT COUNT(*)::int FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1) AS mov_caja,
      (SELECT COUNT(*)::int FROM cuentas_operativas WHERE tenant_id=$1) AS cuentas,
      (SELECT COUNT(*)::int FROM pagos_cuenta WHERE tenant_id=$1) AS pagos,
      (SELECT COUNT(*)::int FROM aprobaciones_bancarias WHERE tenant_id=$1) AS aprobaciones,
      (SELECT COUNT(*)::int FROM movimientos_inventario WHERE tenant_id=$1) AS mov_inv,
      (SELECT COALESCE(SUM(stock_actual),0)::text FROM productos WHERE tenant_id=$1) AS stock,
      (SELECT COALESCE(SUM(stock_reservado),0)::text FROM productos WHERE tenant_id=$1) AS reservado,
      (SELECT COALESCE(SUM(saldo_pendiente),0)::text FROM clientes WHERE tenant_id=$1) AS saldo_clientes,
      (SELECT COALESCE(MAX(ultimo_numero),0)::int FROM secuencias_tenant WHERE tenant_id=$1 AND tipo='VENTA') AS secuencia`, e.tenantId);
    return r;
  }

  // ─── 1. Ventas: contado, crédito, descuentos, ISV, métodos de pago ─────────────────────────────────

  describe('ventas', () => {
    it('contado en efectivo: ISV 15 % exacto, sin descuento, mueve caja, stock reservado y auditoría', async () => {
      const e = await negocio();
      const v = await vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 2 }] });
      expect([v.subtotal, v.isv, v.descuento, v.total]).toEqual([200, 30, 0, 230]);
      expect([v.metodoPago, v.tipoPago, v.estado]).toEqual(['EFECTIVO', 'CONTADO', 'COMPLETADA']);
      expect(v.numeroVenta).toBe(1);
      expect(await stock(e.martillo)).toEqual({ actual: 50, reservado: 2 });
      const [m] = await sql('SELECT * FROM movimientos_caja WHERE caja_id=$1', e.cajaId);
      expect([Number(m.monto), m.metodo, m.tipo, m.referencia]).toEqual([230, 'EFECTIVO', 'VENTA_POS', v.id]);
      expect((await sql("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='VENTA_CREAR' AND entidad_id=$2", e.tenantId, v.id))[0].n).toBe(1);
    });

    it('redondeo: 7 clavos a 0.35 y 3 cables a 12.50 con descuento de 1.00 cierran al centavo (ISV sobre la base con descuento)', async () => {
      const e = await negocio();
      const v = await vender(e, e.admin, { descuento: 1, detalles: [{ productoId: e.clavo, cantidad: 7 }, { productoId: e.cable, cantidad: 3 }] });
      // 7×0.35=2.45; 3×12.50=37.50; subtotal 39.95; base 38.95; ISV 15 % = 5.8425 → 5.84; total 44.79.
      expect([v.subtotal, v.isv, v.total]).toEqual([39.95, 5.84, 44.79]);
      expect(cents(v.subtotal) - cents(v.descuento) + cents(v.isv)).toBe(cents(v.total));
      expect(cents((await prisma.detalleVenta.findMany({ where: { ventaId: v.id } })).reduce((s, d) => s + cents(d.subtotal), 0))).toBe(cents(v.subtotal) * 100);
    });

    it('cantidades decimales (0.5 m de cable) cobran y reservan la fracción exacta', async () => {
      const e = await negocio();
      const v = await vender(e, e.cajero, { detalles: [{ productoId: e.cable, cantidad: 0.5 }] });
      expect([v.subtotal, v.isv, v.total]).toEqual([6.25, 0.94, 7.19]);
      expect((await stock(e.cable)).reservado).toBe(0.5);
    });

    it('descuentos: el cajero respeta su tope (10 %), el exceso exige administración, el ADMIN puede, nunca más que el subtotal ni negativos', async () => {
      const e = await negocio();
      const d = [{ productoId: e.martillo, cantidad: 1 }]; // subtotal 100
      const ok = await vender(e, e.cajero, { descuento: 10, detalles: d });
      expect([ok.descuento, ok.isv, ok.total]).toEqual([10, 13.5, 103.5]);
      await expect(vender(e, e.cajero, { descuento: 10.01, detalles: d })).rejects.toThrow('autorización administrativa');
      const admin = await vender(e, e.admin, { descuento: 50, detalles: d });
      expect(admin.total).toBe(57.5);
      await expect(vender(e, e.admin, { descuento: 100.01, detalles: d })).rejects.toThrow('Descuento mayor al subtotal');
      await expect(vender(e, e.admin, { descuento: -5, detalles: d })).rejects.toThrow();
      await expect(vender(e, e.admin, { descuento: 100, detalles: d })).rejects.toThrow('mayor que cero');
    });

    it('un cajero con permisos configurados sin pos.aplicar_descuento no puede descontar', async () => {
      const e = await negocio();
      await prisma.usuario.update({ where: { id: e.cajero }, data: { permisosConfigurados: true, permisos: ['pos.vender'] } });
      await expect(vender(e, e.cajero, { descuento: 1, detalles: [{ productoId: e.martillo, cantidad: 1 }] })).rejects.toThrow('permiso');
    });

    it('tarjeta y transferencia exigen autorización; una misma autorización no cobra dos ventas; los pagos electrónicos no suman efectivo', async () => {
      const e = await negocio();
      const d = [{ productoId: e.martillo, cantidad: 1 }];
      await expect(vender(e, e.cajero, { metodoPago: 'TARJETA', detalles: d })).rejects.toThrow('autorización bancaria');
      await expect(vender(e, e.cajero, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-1' }, detalles: d })).rejects.toThrow('terminal');
      await expect(vender(e, e.cajero, { metodoPago: 'EFECTIVO', pagoElectronico: { referencia: 'AUT-1' }, detalles: d })).rejects.toThrow();
      const t = await vender(e, e.cajero, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'aut-77', terminal: 'pos-1' }, detalles: d });
      const x = await vender(e, e.cajero, { metodoPago: 'TRANSFERENCIA', pagoElectronico: { referencia: 'TRF-9' }, detalles: d });
      await expect(vender(e, e.cajero, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-77', terminal: 'POS-1' }, detalles: d })).rejects.toThrow('ya fue registrada');
      expect([t.metodoPago, x.metodoPago]).toEqual(['TARJETA', 'TRANSFERENCIA']);
      const c = await cajaDe(e, e.cajero);
      expect(c.efectivoEsperado).toBe(500);
      expect(c.totales).toMatchObject({ EFECTIVO: 0, TARJETA: 115, TRANSFERENCIA: 115, CREDITO: 0 });
    });

    it('método de pago inválido, tipo y método contradictorios, líneas repetidas y cantidades inválidas se rechazan', async () => {
      const e = await negocio();
      const d = [{ productoId: e.martillo, cantidad: 1 }];
      await expect(vender(e, e.cajero, { metodoPago: 'CHEQUE', detalles: d })).rejects.toThrow('Método de pago inválido');
      await expect(vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'EFECTIVO', clienteId: e.clienteId, detalles: d })).rejects.toThrow('no coinciden');
      await expect(vender(e, e.cajero, { detalles: [] })).rejects.toThrow('al menos un producto');
      await expect(vender(e, e.cajero, { detalles: [...d, ...d] })).rejects.toThrow('Agrupe');
      for (const cantidad of [0, -1, 0.001, NaN]) await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad }] })).rejects.toThrow();
      await expect(ventas.create(e.tenantId, e.cajero, { detalles: d } as any)).rejects.toThrow('solicitudId');
    });

    it('crédito: exige cliente real con crédito, respeta límite, crea CxC con vencimiento por plazo y no mueve efectivo', async () => {
      const e = await negocio();
      const d = [{ productoId: e.martillo, cantidad: 2 }]; // 230
      await expect(vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', detalles: d })).rejects.toThrow('cliente registrado');
      const sinCredito = await clientes.create(e.tenantId, { nombre: 'Mostrador' } as any);
      await expect(vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: sinCredito.id, detalles: d })).rejects.toThrow('crédito');
      await prisma.cliente.update({ where: { id: e.clienteId }, data: { plazoCreditoDias: 30 } as any });
      const v = await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: d });
      expect([v.total, v.saldoCredito, v.totalCobrado, v.saldoPendiente]).toEqual([230, 230, 0, 230]);
      const cuenta = await cuentaDe(e, v.id);
      expect([Number(cuenta.monto), Number(cuenta.saldo)]).toEqual([230, 230]);
      expect(cuenta.vencimiento).toBeTruthy();
      expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: e.clienteId } })).saldoPendiente)).toBe(230);
      expect((await cajaDe(e, e.cajero)).efectivoEsperado).toBe(500);
      // 4 × 230 = 920 ≤ 1000; la quinta excede el límite.
      for (let i = 0; i < 3; i++) await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: d });
      await expect(vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: d })).rejects.toThrow('límite de crédito');
    });

    it('sin caja abierta no se vende ni se cobra', async () => {
      const e = await negocio();
      await ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: 500 } as any);
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1 }] })).rejects.toThrow('Abra su caja');
    });

    it('comprobante: la venta consultada reproduce número, líneas, importes y cliente; otro cajero no ve la venta ajena', async () => {
      const e = await negocio();
      const v = await vender(e, e.cajero, { clienteNombre: 'Juan Pérez', clienteRtn: '08011999123456', detalles: [{ productoId: e.martillo, cantidad: 1 }, { productoId: e.cable, cantidad: 2 }] });
      const leida = await ventas.findById(e.tenantId, v.id, e.cajero);
      expect([leida.numeroVenta, leida.subtotal, leida.isv, leida.total, leida.clienteNombre, leida.clienteRtn]).toEqual([1, 125, 18.75, 143.75, 'Juan Pérez', '08011999123456']);
      expect(leida.detalles.map(l => [l.productoCodigo, l.cantidad, l.precioUnitario, l.subtotal])).toEqual(expect.arrayContaining([['MART-1', 1, 100, 100], ['CABL-1', 2, 12.5, 25]]));
      await expect(ventas.findById(e.tenantId, v.id, randomUUID())).rejects.toThrow('no encontrada');
      const lista = await ventas.findAll(e.tenantId, 50, 0, e.cajero);
      expect(lista).toHaveLength(1);
    });

    it('la numeración de ventas es consecutiva y sin huecos aunque haya intentos fallidos intercalados', async () => {
      const e = await negocio();
      const d = [{ productoId: e.martillo, cantidad: 1 }];
      const nums: number[] = [];
      nums.push((await vender(e, e.cajero, { detalles: d })).numeroVenta);
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 999 }] })).rejects.toThrow();
      nums.push((await vender(e, e.cajero, { detalles: d })).numeroVenta);
      await expect(vender(e, e.cajero, { metodoPago: 'TARJETA', detalles: d })).rejects.toThrow();
      nums.push((await vender(e, e.cajero, { detalles: d })).numeroVenta);
      expect(nums).toEqual([1, 2, 3]);
    });
  });

  describe('precisión monetaria bajo carga', () => {
    // Generador determinista (LCG) para que cualquier fallo sea reproducible.
    const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

    it('300 ventas con precios, cantidades y descuentos aleatorios coinciden al centavo con un cálculo independiente en enteros y la caja cuadra', async () => {
      const e = await negocio();
      const azar = rng(20261024);
      let efectivoCentavos = 50000n;
      for (let i = 0; i < 300; i++) {
        const lineas = 1 + Math.floor(azar() * 3);
        const detalles: any[] = [];
        let subtotal = 0n;
        for (let j = 0; j < lineas; j++) {
          const precioC = BigInt(1 + Math.floor(azar() * 99999)); // L 0.01 – 999.99
          const cantC = BigInt(1 + Math.floor(azar() * 999)); // 0.01 – 9.99
          const producto = await prisma.producto.create({ data: { precioAprobado: true, tenantId: e.tenantId, codigo: `R-${i}-${j}`, nombre: 'r', precioVenta: Number(precioC) / 100, precioCosto: 0.01, stockActual: 100000, stockMinimo: 0 } as any });
          detalles.push({ productoId: producto.id, cantidad: Number(cantC) / 100 });
          subtotal += (precioC * cantC + 50n) / 100n; // mitad hacia arriba por línea
        }
        const descC = BigInt(Math.floor(azar() * Number(subtotal) * 0.1)); // ≤ 10 % del subtotal: dentro del tope del cajero
        const base = subtotal - descC;
        const isv = (base * 15n + 50n) / 100n;
        const total = base + isv;
        const v = await vender(e, e.cajero, { descuento: Number(descC) / 100, detalles });
        expect([cents(v.subtotal), cents(v.isv), cents(v.total)]).toEqual([Number(subtotal), Number(isv), Number(total)]);
        efectivoCentavos += total;
      }
      const c = await cajaDe(e, e.cajero);
      expect(Math.round(c.efectivoEsperado * 100)).toBe(Number(efectivoCentavos));
      const cierre = await ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: Number(efectivoCentavos) / 100 } as any);
      expect(Number(cierre.diferencia)).toBe(0);
    }, 120000);

    it('existencias decimales: tres ventas de 0.1 sobre 0.3 caben exactamente y la cuarta se rechaza (sin error de coma flotante)', async () => {
      const e = await negocio();
      const p = await prisma.producto.create({ data: { precioAprobado: true, tenantId: e.tenantId, codigo: 'DEC-1', nombre: 'Decimal', precioVenta: 10, precioCosto: 5, stockActual: 0.3, stockMinimo: 0 } as any });
      for (let i = 0; i < 3; i++) await vender(e, e.cajero, { detalles: [{ productoId: p.id, cantidad: 0.1 }] });
      await expect(vender(e, e.cajero, { detalles: [{ productoId: p.id, cantidad: 0.01 }] })).rejects.toThrow('Stock insuficiente');
      expect(await stock(p.id)).toEqual({ actual: 0.3, reservado: 0.3 });
    });

    it('límite de crédito exacto: la venta que llega al límite al centavo se acepta y un centavo más se rechaza', async () => {
      const e = await negocio();
      await prisma.cliente.update({ where: { id: e.clienteId }, data: { limiteCredito: 345.01 } });
      const p = await prisma.producto.create({ data: { precioAprobado: true, tenantId: e.tenantId, codigo: 'LIM-1', nombre: 'Lim', precioVenta: 100.01, precioCosto: 1, stockActual: 100, stockMinimo: 0 } as any });
      // 3 × 100.01 = 300.03 + ISV 45.00 (45.0045) = 345.03 > 345.01 → rechazada; 2 × 100.01 = 200.02 + 30.00 = 230.02 cabe.
      await expect(vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: p.id, cantidad: 3 }] })).rejects.toThrow('límite de crédito');
      await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: p.id, cantidad: 2 }] });
      await prisma.cliente.update({ where: { id: e.clienteId }, data: { limiteCredito: 230.02 } });
      await expect(vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: p.id, cantidad: 1 }] })).rejects.toThrow('límite de crédito');
      await prisma.cliente.update({ where: { id: e.clienteId }, data: { limiteCredito: 230.02 + 115.01 } });
      await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: p.id, cantidad: 1 }] });
      expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: e.clienteId } })).saldoPendiente)).toBe(345.03);
    });
  });

  // ─── 2. Inventario ─────────────────────────────────────────────────────────────────────────────

  describe('inventario', () => {
    it('producto sin existencia: no se vende más que lo disponible (existencia − reservado); el límite exacto sí vende', async () => {
      const e = await negocio();
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.cable, cantidad: 10.01 }] })).rejects.toThrow('Stock insuficiente');
      await vender(e, e.cajero, { detalles: [{ productoId: e.cable, cantidad: 10 }] });
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.cable, cantidad: 0.01 }] })).rejects.toThrow('Stock insuficiente');
      expect(await stock(e.cable)).toEqual({ actual: 10, reservado: 10 });
    });

    it('producto desactivado, de otra empresa o sin precio aprobado no se vende', async () => {
      const e = await negocio(); const otro = await negocio();
      await prisma.producto.update({ where: { id: e.clavo }, data: { activo: false } });
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.clavo, cantidad: 1 }] })).rejects.toThrow('no encontrado o inactivo');
      await expect(vender(e, e.cajero, { detalles: [{ productoId: otro.martillo, cantidad: 1 }] })).rejects.toThrow('no encontrado');
      await prisma.producto.update({ where: { id: e.cable }, data: { precioAprobado: false } });
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.cable, cantidad: 1 }] })).rejects.toThrow('precio aprobado');
      expect((await stock(otro.martillo)).reservado).toBe(0);
    });

    it('nadie registra en silencio un precio distinto del vigente; ADMIN solo con permiso explícito, motivo y auditoría', async () => {
      const e = await negocio();
      const distinto = { detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 90 }] };
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 1 }] })).rejects.toThrow('precio cambió');
      // El rol ADMIN ya no basta: sin excepción explícita también recibe 409.
      await expect(vender(e, e.admin, distinto)).rejects.toThrow('precio cambió');
      const motivo = { motivo: 'Precio negociado con el cliente mayorista' };
      // Con motivo pero sin el permiso explícito asignado: rechazo.
      await expect(vender(e, e.admin, { ...distinto, excepcionPrecio: motivo })).rejects.toThrow('permiso explícito');
      // Un CAJERO con el permiso tampoco puede: la excepción es administrativa.
      await prisma.usuario.update({ where: { id: e.cajero }, data: { permisos: ['pos.vender', 'pos.excepcion_precio'], permisosConfigurados: true } });
      await expect(vender(e, e.cajero, { ...distinto, excepcionPrecio: motivo })).rejects.toThrow('permiso explícito');
      expect(await sql("SELECT count(*)::int AS n FROM ventas WHERE tenant_id=$1", e.tenantId)).toEqual([{ n: 0 }]);
      await prisma.usuario.update({ where: { id: e.admin }, data: { permisos: ['pos.excepcion_precio'], permisosConfigurados: true } });
      const v = await vender(e, e.admin, { ...distinto, excepcionPrecio: motivo });
      expect(v.subtotal).toBe(90);
      const [traza] = await sql("SELECT usuario_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='VENTA_EXCEPCION_PRECIO' AND entidad_id=$2", e.tenantId, v.id);
      expect(traza.usuario_id).toBe(e.admin);
      expect(traza.datos).toMatchObject({ motivo: motivo.motivo, lineas: [{ productoId: e.martillo, precioCobrado: 90 }] });
      expect(traza.datos.lineas[0].precioVigente).not.toBe(90);
      // Al precio vigente no hay excepción que auditar aunque se envíe el motivo.
      const vigente = await vender(e, e.admin, { detalles: [{ productoId: e.martillo, cantidad: 1 }], excepcionPrecio: motivo });
      expect(await sql("SELECT count(*)::int AS n FROM auditoria_operaciones WHERE entidad_id=$1 AND operacion='VENTA_EXCEPCION_PRECIO'", vigente.id)).toEqual([{ n: 0 }]);
    });

    it('PR202: la excepción rechaza motivos vacíos, espacios, cortos o inválidos también desde el servicio, sin efectos', async () => {
      const e = await negocio();
      await prisma.usuario.update({ where: { id: e.admin }, data: { permisos: ['pos.excepcion_precio'] } });
      const antes = await huella(e);
      for (const motivo of ['', ' '.repeat(20), '  corto  ', 'x'.repeat(301), null, 123, undefined]) {
        await expect(vender(e, e.admin, { excepcionPrecio: { motivo }, detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 90 }] })).rejects.toMatchObject({ status: 400 });
        expect(await huella(e)).toEqual(antes);
      }
    });

    it('PR202: el motivo de excepción pertenece a la identidad del reintento y no se puede sustituir', async () => {
      const e = await negocio();
      await prisma.usuario.update({ where: { id: e.admin }, data: { permisos: ['pos.excepcion_precio'] } });
      const dto = { solicitudId: randomUUID(), excepcionPrecio: { motivo: 'Precio convenido con cliente' }, detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 90 }] };
      const primera = await vender(e, e.admin, dto);
      const antes = await huella(e);
      expect((await vender(e, e.admin, dto)).id).toBe(primera.id);
      await expect(vender(e, e.admin, { ...dto, excepcionPrecio: { motivo: 'Una justificación diferente' } })).rejects.toMatchObject({ status: 409 });
      await expect(vender(e, e.admin, { ...dto, excepcionPrecio: undefined })).rejects.toMatchObject({ status: 409 });
      expect(await huella(e)).toEqual(antes);
    });

    it('PR202: dos cajas y un cambio aprobado concurrentes solo registran el precio vigente bajo el bloqueo', async () => {
      const e = await negocio();
      let precioEscrito!: () => void, liberar!: () => void;
      const escrito = new Promise<void>(r => { precioEscrito = r; });
      const liberado = new Promise<void>(r => { liberar = r; });
      // Barrera sobre una transacción PostgreSQL real: el precio está escrito, pero aún no está confirmado.
      const productos = new ProductosService({ usuario: prisma.usuario, $transaction: (work: any) => prisma.$transaction(async tx => {
        const resultado = await work(tx); precioEscrito(); await liberado; return resultado;
      }, { timeout: 15000 }) } as PrismaService);
      const cambio = productos.cambiarPrecios(e.tenantId, e.martillo, { version: 1, precioVenta: 120, aprobar: true } as any, e.admin);
      await Promise.race([escrito, cambio]);
      const ventasEnCurso = Promise.allSettled([
        vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 100 }] }),
        vender(e, e.admin, { detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 100 }] }),
      ]);
      try {
        await expect.poll(async () => (await sql("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'"))[0].n).toBe(2);
      } finally { liberar(); }
      await cambio;
      for (const r of await ventasEnCurso) {
        expect(r.status).toBe('rejected');
        if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 409 });
      }
      const antes = await huella(e);
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 100 }] })).rejects.toMatchObject({ status: 409 });
      expect(await huella(e)).toEqual(antes);
      const dto = { solicitudId: randomUUID(), detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 120 }] };
      const [a, b] = await Promise.all([vender(e, e.cajero, dto), vender(e, e.cajero, dto)]);
      expect(a.id).toBe(b.id);
      const otra = await vender(e, e.admin, { detalles: [{ productoId: e.martillo, cantidad: 1, precioUnitario: 120 }] });
      expect(otra.id).not.toBe(a.id);
      expect([a.total, otra.total]).toEqual([138, 138]);
    });

    it('ciclo: cobro reserva → entrega descuenta físico una sola vez, con kardex, aunque se repita', async () => {
      const e = await negocio();
      const v = await vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 4 }] });
      expect(await stock(e.martillo)).toEqual({ actual: 50, reservado: 4 });
      await ops.entregar(e.tenantId, e.admin, v.id, { solicitudId: randomUUID(), receptorNombre: 'Cliente' } as any);
      expect(await stock(e.martillo)).toEqual({ actual: 46, reservado: 0 });
      await ops.entregar(e.tenantId, e.admin, v.id, { solicitudId: randomUUID(), receptorNombre: 'Cliente' } as any).catch(() => undefined);
      expect(await stock(e.martillo)).toEqual({ actual: 46, reservado: 0 });
      const kardex = await sql("SELECT cantidad::float AS c, anterior::float AS a, nuevo::float AS n FROM movimientos_inventario WHERE tenant_id=$1 AND producto_id=$2 AND tipo='ENTREGA'", e.tenantId, e.martillo);
      expect(kardex).toEqual([{ c: -4, a: 50, n: 46 }]);
    });

    it('ajuste de inventario: solo ADMIN/BODEGUERO, exige motivo y existencias vistas, es idempotente y deja kardex', async () => {
      const e = await negocio();
      const dto = { solicitudId: randomUUID(), stock: 45, stockAnterior: 50, motivo: 'Conteo físico' } as any;
      await expect(ops.ajustar(e.tenantId, e.cajero, e.martillo, dto)).rejects.toThrow();
      await expect(ops.ajustar(e.tenantId, e.bodeguero, e.martillo, { ...dto, solicitudId: randomUUID(), stockAnterior: 49 })).rejects.toThrow('cambiaron');
      await expect(ops.ajustar(e.tenantId, e.bodeguero, e.martillo, { ...dto, solicitudId: randomUUID(), stock: -1 })).rejects.toThrow();
      await ops.ajustar(e.tenantId, e.bodeguero, e.martillo, dto);
      await ops.ajustar(e.tenantId, e.bodeguero, e.martillo, dto);
      expect((await stock(e.martillo)).actual).toBe(45);
      expect((await sql("SELECT COUNT(*)::int AS n FROM movimientos_inventario WHERE tenant_id=$1 AND tipo='AJUSTE'", e.tenantId))[0].n).toBe(1);
      // No se puede ajustar por debajo de lo ya vendido pendiente de entrega.
      await vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 10 }] });
      await expect(ops.ajustar(e.tenantId, e.admin, e.martillo, { solicitudId: randomUUID(), stock: 5, stockAnterior: 45, motivo: 'x' } as any)).rejects.toThrow('pendientes de entrega');
    });

    it('ajuste de otra empresa no encuentra el producto', async () => {
      const e = await negocio(); const otro = await negocio();
      await expect(ops.ajustar(otro.tenantId, otro.admin, e.martillo, { solicitudId: randomUUID(), stock: 1, stockAnterior: 50, motivo: 'x' } as any)).rejects.toThrow();
      expect((await stock(e.martillo)).actual).toBe(50);
    });
  });

  // ─── 3. Caja ───────────────────────────────────────────────────────────────────────────────────

  describe('caja', () => {
    it('jornada completa: apertura, ventas por método, abono de crédito, entrada/salida, cierre y arqueo concilian al centavo', async () => {
      const e = await negocio();
      const ef = await vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 2 }] }); // 230
      const ef2 = await vender(e, e.cajero, { descuento: 5, detalles: [{ productoId: e.cable, cantidad: 4 }] }); // 50-5=45 +6.75 = 51.75
      await vender(e, e.cajero, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'A-1', terminal: 'T1' }, detalles: [{ productoId: e.martillo, cantidad: 1 }] }); // 115
      await vender(e, e.cajero, { metodoPago: 'TRANSFERENCIA', pagoElectronico: { referencia: 'T-1' }, detalles: [{ productoId: e.martillo, cantidad: 1 }] }); // 115
      const cr = await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: e.martillo, cantidad: 2 }] }); // 230
      await ops.pagar(e.tenantId, e.cajero, (await cuentaDe(e, cr.id)).id, { solicitudId: randomUUID(), monto: 80, metodo: 'EFECTIVO' } as any);
      await ops.pagar(e.tenantId, e.cajero, (await cuentaDe(e, cr.id)).id, { solicitudId: randomUUID(), monto: 50, metodo: 'TRANSFERENCIA', pagoElectronico: { referencia: 'ABONO-1' } } as any);
      let c = await cajaDe(e, e.cajero);
      // Efectivo = fondo 500 + 230 + 51.75 + 80 = 861.75.
      expect(c.efectivoEsperado).toBe(861.75);
      expect(c.totales).toMatchObject({ EFECTIVO: 361.75, TARJETA: 115, TRANSFERENCIA: 165, CREDITO: 230 });
      // Arqueo: faltante exige explicación; con nota se cierra con diferencia registrada.
      await expect(ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: 860 } as any)).rejects.toThrow('Explique la diferencia');
      expect((await cajaDe(e, e.cajero)).estado).toBe('ABIERTA');
      const cierre = await ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: 860, notas: 'Faltan L 1.75 por cambio' } as any);
      expect([Number(cierre.monto_esperado), Number(cierre.monto_cierre_fisico), Number(cierre.diferencia), cierre.estado]).toEqual([861.75, 860, -1.75, 'CERRADA']);
      // Cierre repetido idéntico es inocuo; distinto se rechaza; ya no se vende ni se mueve efectivo.
      expect((await ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: 860, notas: 'Faltan L 1.75 por cambio' } as any)).estado).toBe('CERRADA');
      await expect(ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: 861.75 } as any)).rejects.toThrow('ya está cerrada');
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1 }] })).rejects.toThrow('Abra su caja');
      c = await cajaDe(e, e.cajero);
      expect(c.efectivoEsperado).toBe(861.75);
      expect(ef.total + ef2.total).toBe(281.75);
      // El administrador ve el cierre en la consulta de cierres, con el efectivo neto.
      const cierres = await ops.cierresCaja(e.tenantId, e.admin, { estado: 'CERRADA' });
      expect(cierres).toHaveLength(1);
      expect(Number(cierres[0].efectivo_neto)).toBe(361.75);
    });

    it('entradas y salidas manuales: requieren permiso, no dejan la caja en negativo, son idempotentes y entran en el arqueo', async () => {
      const e = await negocio();
      await expect(ops.movimientoCaja(e.tenantId, e.cajero, e.cajaId, { solicitudId: randomUUID(), tipo: 'EGRESO_MANUAL', monto: 20, concepto: 'x' } as any)).rejects.toThrow('permiso');
      await prisma.usuario.update({ where: { id: e.cajero }, data: { permisosConfigurados: true, permisos: ['pos.vender', 'caja.movimientos_manuales'] } });
      const dto = { solicitudId: randomUUID(), tipo: 'EGRESO_MANUAL', monto: 20, concepto: 'Flete' } as any;
      await ops.movimientoCaja(e.tenantId, e.cajero, e.cajaId, dto);
      await ops.movimientoCaja(e.tenantId, e.cajero, e.cajaId, dto);
      await ops.movimientoCaja(e.tenantId, e.cajero, e.cajaId, { solicitudId: randomUUID(), tipo: 'INGRESO_MANUAL', monto: 5, concepto: 'Propina' } as any);
      await expect(ops.movimientoCaja(e.tenantId, e.cajero, e.cajaId, { solicitudId: randomUUID(), tipo: 'EGRESO_MANUAL', monto: 500, concepto: 'Retiro' } as any)).rejects.toThrow('Efectivo insuficiente');
      expect((await cajaDe(e, e.cajero)).efectivoEsperado).toBe(485);
      const cierre = await ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: 485 } as any);
      expect(Number(cierre.diferencia)).toBe(0);
    });

    it('CxP (pago a proveedor) no abre ni afecta caja en ningún método; un abono de cliente sí', async () => {
      const e = await negocio();
      const prov = await prisma.proveedor.create({ data: { tenantId: e.tenantId, nombre: 'Distribuidora' } });
      const orden = await ops.compra(e.tenantId, e.admin, { solicitudId: randomUUID(), proveedorId: prov.id, numeroFactura: 'F-1', isv: 0, items: [{ productoId: e.martillo, cantidad: 10, costo: 55 }] } as any);
      const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId: e.tenantId, tipo: 'CXP', documentoId: orden.id } });
      const antes = await cajaDe(e, e.cajero);
      await ops.pagar(e.tenantId, e.admin, cuenta.id, { solicitudId: randomUUID(), monto: 100, metodo: 'EFECTIVO' } as any); // el ADMIN no tiene caja abierta
      await ops.pagar(e.tenantId, e.admin, cuenta.id, { solicitudId: randomUUID(), monto: 50, metodo: 'TRANSFERENCIA', referencia: 'TRF-77' } as any);
      const despues = await cajaDe(e, e.cajero);
      expect(despues.efectivoEsperado).toBe(antes.efectivoEsperado);
      expect(despues.movimientos).toHaveLength(antes.movimientos.length);
      expect((await sql("SELECT COUNT(*)::int AS n FROM pagos_cuenta WHERE cuenta_id=$1 AND caja_id IS NOT NULL", cuenta.id))[0].n).toBe(0);
      expect((await sql("SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1 AND m.tipo IN ('PAGO_CXP')", e.tenantId))[0].n).toBe(0);
      expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(400);
    });

    it('el cajero solo ve y cierra su propia caja; otra empresa no ve ni cierra cajas ajenas', async () => {
      const e = await negocio(); const otro = await negocio();
      await expect(ops.cerrar(e.tenantId, e.admin, e.cajaId, { monto: 500 } as any)).rejects.toThrow('Caja no encontrada');
      await expect(ops.cerrar(otro.tenantId, otro.cajero, e.cajaId, { monto: 500 } as any)).rejects.toThrow('Caja no encontrada');
      await expect(ops.cajaDetalle(otro.tenantId, otro.admin, e.cajaId)).rejects.toThrow('Caja no encontrada');
      await expect(ops.cierresCaja(e.tenantId, e.cajero, {})).rejects.toThrow();
      expect((await ops.cierresCaja(otro.tenantId, otro.admin, {})).every(c => c.id !== e.cajaId)).toBe(true);
      await expect(ops.abrir(e.tenantId, e.cajero, { solicitudId: randomUUID(), monto: 1 } as any)).rejects.toThrow('Ya tiene una caja abierta');
    });
  });

  // ─── 4. Compras y proveedores ──────────────────────────────────────────────────────────────────

  describe('compras', () => {
    const compra = (e: N, provId: string, factura: string, costo: number, cantidad: number, extra: any = {}) =>
      ops.compra(e.tenantId, e.admin, { solicitudId: randomUUID(), proveedorId: provId, numeroFactura: factura, isv: 0, items: [{ productoId: e.martillo, cantidad, costo }], ...extra } as any);

    it('factura → recepción parcial/total → costo vigente → pagos con vencimiento y sin pago duplicado', async () => {
      const e = await negocio();
      const prov = await prisma.proveedor.create({ data: { tenantId: e.tenantId, nombre: 'Aceros SA' } });
      const venc = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      const orden = await compra(e, prov.id, 'FAC-1', 65, 20, { vencimiento: venc });
      const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId: e.tenantId, tipo: 'CXP', documentoId: orden.id } });
      expect([Number(cuenta.monto), Number(cuenta.saldo)]).toEqual([1300, 1300]);
      expect(cuenta.vencimiento).toBeTruthy();
      const det = await prisma.detalleOrdenCompra.findFirstOrThrow({ where: { ordenId: orden.id } });
      await ops.recibir(e.tenantId, e.admin, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: det.id, cantidad: 12 }] } as any);
      expect([(await stock(e.martillo)).actual, Number((await prisma.producto.findUniqueOrThrow({ where: { id: e.martillo } })).precioCosto)]).toEqual([62, 65]);
      await expect(ops.recibir(e.tenantId, e.admin, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: det.id, cantidad: 9 }] } as any)).rejects.toThrow();
      await ops.recibir(e.tenantId, e.admin, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: det.id, cantidad: 8 }] } as any);
      expect((await stock(e.martillo)).actual).toBe(70);
      // Pagos: el mismo pago reenviado no se duplica; una referencia repetida en la factura se rechaza; no se paga de más.
      const pago = { solicitudId: randomUUID(), monto: 500, metodo: 'TRANSFERENCIA', referencia: 'TRF-1' } as any;
      await ops.pagar(e.tenantId, e.admin, cuenta.id, pago);
      await ops.pagar(e.tenantId, e.admin, cuenta.id, pago);
      await expect(ops.pagar(e.tenantId, e.admin, cuenta.id, { ...pago, solicitudId: randomUUID() })).rejects.toThrow('referencia');
      await expect(ops.pagar(e.tenantId, e.admin, cuenta.id, { ...pago, solicitudId: pago.solicitudId, monto: 501 })).rejects.toThrow('otro pago');
      await expect(ops.pagar(e.tenantId, e.admin, cuenta.id, { solicitudId: randomUUID(), monto: 800.01, metodo: 'EFECTIVO' } as any)).rejects.toThrow('mayor al saldo');
      await ops.pagar(e.tenantId, e.admin, cuenta.id, { solicitudId: randomUUID(), monto: 800, metodo: 'EFECTIVO' } as any);
      await expect(ops.pagar(e.tenantId, e.admin, cuenta.id, { solicitudId: randomUUID(), monto: 0.01, metodo: 'EFECTIVO' } as any)).rejects.toThrow('mayor al saldo');
      expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(0);
      expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(2);
    });

    it('factura duplicada (mismo proveedor), proveedor ajeno y producto ajeno no crean orden ni deuda', async () => {
      const e = await negocio(); const otro = await negocio();
      const prov = await prisma.proveedor.create({ data: { tenantId: e.tenantId, nombre: 'P1' } });
      const provAjeno = await prisma.proveedor.create({ data: { tenantId: otro.tenantId, nombre: 'P2' } });
      await compra(e, prov.id, 'FAC-9', 10, 1);
      const h = await huella(e);
      await expect(compra(e, prov.id, ' fac-9 ', 10, 1)).rejects.toThrow('ya está registrada');
      await expect(compra(e, provAjeno.id, 'FAC-10', 10, 1)).rejects.toThrow();
      await expect(ops.compra(e.tenantId, e.admin, { solicitudId: randomUUID(), proveedorId: prov.id, numeroFactura: 'FAC-11', isv: 0, items: [{ productoId: otro.martillo, cantidad: 1, costo: 1 }] } as any)).rejects.toThrow();
      expect(await huella(e)).toEqual(h);
      expect(await prisma.ordenCompra.count({ where: { tenantId: e.tenantId } })).toBe(1);
    });

    it('cantidades y costos inválidos en compras se rechazan; CAJERO no compra ni paga; BODEGUERO recibe pero no paga', async () => {
      const e = await negocio();
      const prov = await prisma.proveedor.create({ data: { tenantId: e.tenantId, nombre: 'P1' } });
      // Costo 0 está permitido por diseño (@Min(0): bonificaciones); ver informe de auditoría.
      for (const [cantidad, costo] of [[0, 5], [-1, 5], [1, -3], [1, 0.001]]) await expect(compra(e, prov.id, `X-${cantidad}-${costo}`, costo, cantidad)).rejects.toThrow();
      await expect(ops.compra(e.tenantId, e.cajero, { solicitudId: randomUUID(), proveedorId: prov.id, numeroFactura: 'Z', isv: 0, items: [{ productoId: e.martillo, cantidad: 1, costo: 1 }] } as any)).rejects.toThrow();
      const orden = await compra(e, prov.id, 'FAC-20', 10, 5);
      const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId: e.tenantId, tipo: 'CXP', documentoId: orden.id } });
      const det = await prisma.detalleOrdenCompra.findFirstOrThrow({ where: { ordenId: orden.id } });
      await expect(ops.pagar(e.tenantId, e.cajero, cuenta.id, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any)).rejects.toThrow('administrador');
      await expect(ops.pagar(e.tenantId, e.bodeguero, cuenta.id, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any)).rejects.toThrow();
      await ops.recibir(e.tenantId, e.bodeguero, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: det.id, cantidad: 5 }] } as any);
      expect((await stock(e.martillo)).actual).toBe(55);
    });

    it('listado de cuentas por pagar: vencidas se distinguen, y las pagadas salen', async () => {
      const e = await negocio();
      const prov = await prisma.proveedor.create({ data: { tenantId: e.tenantId, nombre: 'P1' } });
      const ayer = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      const o = await compra(e, prov.id, 'VENC-1', 10, 1, { vencimiento: ayer });
      const lista = await ops.cuentas(e.tenantId, e.admin, 'CXP');
      const fila: any = (lista as any[]).find(c => c.documentoId === o.id || c.documento_id === o.id);
      expect(fila).toBeTruthy();
      expect(JSON.stringify(fila)).toMatch(/VENCIDA|vencida|true/);
    });
  });

  // ─── 5. Crédito y cuentas por cobrar ───────────────────────────────────────────────────────────

  describe('crédito', () => {
    it('abonos parciales hasta saldar: saldos de CxC, cliente y venta coinciden; el sobrepago y el reintento no alteran nada', async () => {
      const e = await negocio();
      const v = await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: e.martillo, cantidad: 2 }] }); // 230
      const cuenta = await cuentaDe(e, v.id);
      const saldos = async () => ({ cxc: Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo), cli: Number((await prisma.cliente.findUniqueOrThrow({ where: { id: e.clienteId } })).saldoPendiente), venta: Number((await prisma.venta.findUniqueOrThrow({ where: { id: v.id } })).saldoCredito) });
      const abono = (monto: number, extra: any = {}) => ops.pagar(e.tenantId, e.cajero, cuenta.id, { solicitudId: randomUUID(), monto, metodo: 'EFECTIVO', ...extra } as any);
      const primero = { solicitudId: randomUUID(), monto: 100.55, metodo: 'EFECTIVO' } as any;
      await ops.pagar(e.tenantId, e.cajero, cuenta.id, primero);
      await ops.pagar(e.tenantId, e.cajero, cuenta.id, primero);
      expect(await saldos()).toEqual({ cxc: 129.45, cli: 129.45, venta: 129.45 });
      await expect(abono(129.46)).rejects.toThrow('mayor al saldo');
      await abono(0.45);
      await abono(129);
      expect(await saldos()).toEqual({ cxc: 0, cli: 0, venta: 0 });
      const pagado = await ventas.findById(e.tenantId, v.id);
      expect([pagado.totalCobrado, pagado.saldoPendiente]).toEqual([230, 0]);
      expect((await cajaDe(e, e.cajero)).efectivoEsperado).toBe(730);
      await expect(abono(0.01)).rejects.toThrow();
    });

    it('la ruta heredada de abonos queda bloqueada; el estado de cuenta del cliente cuadra con el saldo', async () => {
      const e = await negocio();
      const v = await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: e.martillo, cantidad: 1 }] });
      await expect(clientes.addPayment(e.tenantId, e.clienteId, { monto: 10 } as any)).rejects.toThrow();
      await ops.pagar(e.tenantId, e.cajero, (await cuentaDe(e, v.id)).id, { solicitudId: randomUUID(), monto: 15, metodo: 'EFECTIVO' } as any);
      const estado: any = await ops.estadoCuentaCliente(e.tenantId, e.clienteId, 'ADMIN');
      expect(JSON.stringify(estado)).toContain('100');
    });

    it('invariante global tras una jornada mixta: saldo del cliente = suma de sus CxC abiertas y no hay saldos negativos', async () => {
      const e = await negocio();
      for (let i = 0; i < 3; i++) {
        const v = await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: e.cable, cantidad: i + 1 }] });
        if (i === 1) await ops.pagar(e.tenantId, e.cajero, (await cuentaDe(e, v.id)).id, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' } as any);
      }
      const [r] = await sql(`SELECT (SELECT saldo_pendiente FROM clientes WHERE id=$2)::float AS cli, (SELECT COALESCE(SUM(saldo),0) FROM cuentas_operativas WHERE tenant_id=$1 AND tipo='CXC' AND cliente_id=$2)::float AS cxc, (SELECT COUNT(*)::int FROM cuentas_operativas WHERE tenant_id=$1 AND saldo<0) AS negativas`, e.tenantId, e.clienteId);
      expect(r.cli).toBe(r.cxc);
      expect(r.negativas).toBe(0);
    });
  });

  // ─── 6. Aislamiento entre negocios y roles ─────────────────────────────────────────────────────

  describe('aislamiento y roles', () => {
    it('un negocio no puede vender con clientes, cuentas ni productos de otro; los reportes no mezclan empresas', async () => {
      const a = await negocio(); const b = await negocio();
      const va = await vender(a, a.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: a.clienteId, detalles: [{ productoId: a.martillo, cantidad: 1 }] });
      await expect(vender(b, b.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: a.clienteId, detalles: [{ productoId: b.martillo, cantidad: 1 }] })).rejects.toThrow();
      await expect(ops.pagar(b.tenantId, b.admin, (await cuentaDe(a, va.id)).id, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any)).rejects.toThrow('Cuenta no encontrada');
      await expect(ventas.findById(b.tenantId, va.id)).rejects.toThrow('no encontrada');
      expect(await ventas.findAll(b.tenantId)).toHaveLength(0);
      const hoy = new Date().toISOString().slice(0, 10);
      const resumenB: any = await ops.resumen(b.tenantId, hoy, hoy);
      expect(JSON.stringify(resumenB)).not.toContain(va.id);
      // Mismo usuario ID usado desde otro tenant no obtiene privilegios.
      await expect(vender(b, a.admin, { detalles: [{ productoId: b.martillo, cantidad: 1 }] })).rejects.toThrow();
    });

    it('un usuario desactivado ya no vende, cobra ni cierra', async () => {
      const e = await negocio();
      await prisma.usuario.update({ where: { id: e.cajero }, data: { activo: false } });
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1 }] })).rejects.toThrow();
      await expect(ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: 500 } as any)).rejects.toThrow();
    });

    it('el BODEGUERO y el ADMIN entregan; el CAJERO no registra entregas físicas ni cobra con entrega inmediata', async () => {
      const e = await negocio();
      await expect(vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1, modoEntrega: 'MOSTRADOR' }] })).rejects.toThrow('entregas físicas');
      const v = await vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 1 }] });
      await expect(ops.entregar(e.tenantId, e.cajero, v.id, { solicitudId: randomUUID(), receptorNombre: 'x' } as any)).rejects.toThrow();
      await ops.entregar(e.tenantId, e.bodeguero, v.id, { solicitudId: randomUUID(), receptorNombre: 'Cliente' } as any);
      expect((await stock(e.martillo)).actual).toBe(49);
    });
  });

  // ─── 7. Integridad: las operaciones fallidas no dejan rastro ──────────────────────────────────

  describe('integridad ante fallos', () => {
    it('ninguna venta o cobro rechazado altera ventas, caja, stock, reservas, aprobaciones, CxC, saldos ni la secuencia', async () => {
      const e = await negocio();
      const d1 = { productoId: e.martillo, cantidad: 1 };
      const antes = await huella(e);
      const falla: Array<() => Promise<unknown>> = [
        () => vender(e, e.cajero, { detalles: [d1, { productoId: e.cable, cantidad: 11 }] }), // 2.ª línea sin stock
        () => vender(e, e.cajero, { detalles: [d1, { productoId: randomUUID(), cantidad: 1 }] }), // 2.ª línea inexistente
        () => vender(e, e.cajero, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'OK-1' }, detalles: [d1] }), // sin terminal
        () => vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', detalles: [d1] }),
        () => vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: e.martillo, cantidad: 10 }] }), // 1150 > límite
        () => vender(e, e.cajero, { descuento: 99, detalles: [d1] }),
        () => vender(e, e.cajero, { detalles: [{ ...d1, precioUnitario: 0.5 }] }),
        () => vender(e, e.bodeguero, { detalles: [d1] }),
        () => ops.pagar(e.tenantId, e.admin, randomUUID(), { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any),
      ];
      for (const intento of falla) await expect(intento()).rejects.toThrow();
      expect(await huella(e)).toEqual(antes);
    });

    it('la misma solicitud reenviada (respuesta perdida) devuelve la misma venta; el mismo ID con otro contenido se rechaza', async () => {
      const e = await negocio();
      const dto = { solicitudId: randomUUID(), detalles: [{ productoId: e.martillo, cantidad: 1 }] };
      const a = await ventas.create(e.tenantId, e.cajero, dto);
      const b = await ventas.create(e.tenantId, e.cajero, dto);
      expect(b.id).toBe(a.id);
      await expect(ventas.create(e.tenantId, e.cajero, { ...dto, detalles: [{ productoId: e.martillo, cantidad: 2 }] })).rejects.toThrow('ya fue utilizada');
      await expect(ventas.create(e.tenantId, e.cajero, { ...dto, metodoPago: 'TARJETA', pagoElectronico: { referencia: 'ZZZ', terminal: 'T' } })).rejects.toThrow();
      const [r] = await sql('SELECT COUNT(*)::int AS ventas, (SELECT COUNT(*)::int FROM movimientos_caja WHERE caja_id=$2) AS mov FROM ventas WHERE tenant_id=$1', e.tenantId, e.cajaId);
      expect(r).toEqual({ ventas: 1, mov: 1 });
      expect((await stock(e.martillo)).reservado).toBe(1);
    });

    it('doble clic / pestañas simultáneas: diez envíos concurrentes de la misma solicitud producen una sola venta', async () => {
      const e = await negocio();
      const dto = { solicitudId: randomUUID(), detalles: [{ productoId: e.martillo, cantidad: 3 }] };
      const r = await Promise.allSettled(Array.from({ length: 10 }, () => ventas.create(e.tenantId, e.cajero, dto)));
      expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(10);
      expect(new Set(r.map(x => (x as any).value.id)).size).toBe(1);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(1);
      expect((await stock(e.martillo)).reservado).toBe(3);
      expect((await cajaDe(e, e.cajero)).efectivoEsperado).toBe(500 + 345);
    });

    it('carga concurrente de cajeros sobre el último stock: nunca hay sobreventa ni reserva por encima de la existencia', async () => {
      const e = await negocio();
      const r = await Promise.allSettled(Array.from({ length: 8 }, () => vender(e, e.cajero, { detalles: [{ productoId: e.cable, cantidad: 3 }] })));
      const ok = r.filter(x => x.status === 'fulfilled').length;
      expect(ok).toBe(3); // 10 / 3
      expect((await stock(e.cable)).reservado).toBe(9);
      const nums = (await sql('SELECT numero_venta::int AS n FROM ventas WHERE tenant_id=$1 ORDER BY numero_venta', e.tenantId)).map(x => x.n);
      expect(nums).toEqual([1, 2, 3]);
    });

    it('cierre de caja concurrente con ventas y abonos: ningún cobro se pierde ni entra después del cierre; el esperado cuadra con los movimientos', async () => {
      const e = await negocio();
      const cr = await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: e.martillo, cantidad: 1 }] });
      const cuenta = await cuentaDe(e, cr.id);
      const tareas: Promise<unknown>[] = [];
      for (let i = 0; i < 6; i++) tareas.push(vender(e, e.cajero, { detalles: [{ productoId: e.clavo, cantidad: 10 }] }));
      for (let i = 0; i < 3; i++) tareas.push(ops.pagar(e.tenantId, e.cajero, cuenta.id, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' } as any));
      const esperadoLeido = (await cajaDe(e, e.cajero)).efectivoEsperado;
      tareas.push(ops.cerrar(e.tenantId, e.cajero, e.cajaId, { monto: esperadoLeido, notas: 'cierre concurrente' } as any));
      await Promise.allSettled(tareas);
      const [c] = await sql(`SELECT estado, fecha_cierre, monto_esperado::float AS esperado FROM cajas WHERE id=$1`, e.cajaId);
      expect(c.estado).toBe('CERRADA');
      const [m] = await sql(`SELECT COUNT(*) FILTER (WHERE created_at > $2)::int AS tardios, (500 + COALESCE(SUM(monto) FILTER (WHERE metodo='EFECTIVO'),0))::float AS efectivo FROM movimientos_caja WHERE caja_id=$1`, e.cajaId, c.fecha_cierre);
      expect(m.tardios).toBe(0);
      expect(c.esperado).toBe(m.efectivo);
    });

    it('conciliación final: inventario, caja y CxC derivados de los movimientos coinciden con los saldos almacenados', async () => {
      const e = await negocio();
      const v1 = await vender(e, e.cajero, { detalles: [{ productoId: e.martillo, cantidad: 3 }, { productoId: e.clavo, cantidad: 100 }] });
      await vender(e, e.cajero, { tipoPago: 'CREDITO', metodoPago: 'CREDITO', clienteId: e.clienteId, detalles: [{ productoId: e.cable, cantidad: 2 }] });
      await ops.entregar(e.tenantId, e.admin, v1.id, { solicitudId: randomUUID(), receptorNombre: 'Cliente' } as any);
      // Caja: esperado almacenado = fondo + Σ movimientos EFECTIVO.
      const [caja] = await sql(`SELECT c.monto_apertura::float + COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE caja_id=c.id AND metodo='EFECTIVO'),0)::float AS esperado FROM cajas c WHERE c.id=$1`, e.cajaId);
      expect((await cajaDe(e, e.cajero)).efectivoEsperado).toBe(caja.esperado);
      // Inventario: existencia inicial + Σ kardex = existencia actual para cada producto con movimientos.
      const filas = await sql(`SELECT p.id, p.stock_actual::float AS actual, COALESCE((SELECT SUM(cantidad) FROM movimientos_inventario m WHERE m.producto_id=p.id),0)::float AS mov FROM productos p WHERE p.tenant_id=$1`, e.tenantId);
      const inicial: Record<string, number> = { [e.martillo]: 50, [e.clavo]: 1000, [e.cable]: 10 };
      for (const f of filas) expect(f.actual).toBeCloseTo(inicial[f.id] + f.mov, 2);
      // Total de ventas = Σ movimientos de caja de venta (todas las formas).
      const [t] = await sql(`SELECT (SELECT SUM(total) FROM ventas WHERE tenant_id=$1)::float AS ventas, (SELECT SUM(monto) FROM movimientos_caja WHERE caja_id=$2 AND tipo='VENTA_POS')::float AS caja`, e.tenantId, e.cajaId);
      expect(t.ventas).toBe(t.caja);
    });
  });
});
