import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';

// Compra al contado (D1) contra PostgreSQL real: pago en el registro sin caja (FS-09), solo ADMIN, reintento sin doble pago,
// compra a crédito sin cambios, y atomicidad si falla la auditoría. Cadena completa de migraciones, clúster temporal.
describe('Compra al contado y crédito de proveedor / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ops: OperacionesService;
  let tenantId: string;
  let otherTenantId: string;
  let productoId: string;
  let proveedorA: string;
  let proveedorB: string;
  const userIds: Record<string, string> = {};

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const vinculos = (producto = productoId) => sql(
    'SELECT proveedor_id, codigo_proveedor, es_preferido, ultimo_costo::float AS ultimo_costo, ultima_compra_at FROM productos_proveedores WHERE tenant_id=$1 AND producto_id=$2 ORDER BY proveedor_id', tenantId, producto);
  const comprar = async (proveedorId: string, costo: number, cantidad = 10, numeroFactura = `FAC-${randomUUID().slice(0, 8)}`) => {
    const orden = await ops.compra(tenantId, userIds.ADMIN, {
      solicitudId: randomUUID(), proveedorId, numeroFactura, isv: 0, items: [{ productoId, cantidad, costo }],
    } as any);
    return orden;
  };
  const recibir = async (ordenId: string, cantidad = 10) => {
    const detalle = (await sql('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', ordenId))[0];
    return ops.recibir(tenantId, userIds.BODEGUERO, ordenId, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad }] } as any);
  };

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contado-'));
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
    ops = new OperacionesService(prisma);

    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Proveedores', estado: 'ACTIVO' } });
    for (const [clave, tenant, rol, permisos] of [
      ['ADMIN', tenantId, 'ADMIN', []],
      ['BODEGUERO', tenantId, 'BODEGUERO', ['inventario.editar', 'inventario.ver']],
      ['CAJERO', tenantId, 'CAJERO', []],
      ['OTRO_ADMIN', otherTenantId, 'ADMIN', []],
    ] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId: tenant, nombre: clave, email: `${id}@test.invalid`, passwordHash: 'x', rol: rol as any, permisosConfigurados: rol === 'BODEGUERO', permisos: [...permisos] } as any });
      userIds[clave] = id;
    }

    const producto = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'PRV-001', nombre: 'Tornillo 2 pulgadas', precioCosto: 10, precioVenta: 15, stockActual: 0 } as any });
    productoId = producto.id;
    proveedorA = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Distribuidora Norte' } })).id;
    proveedorB = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Ferretera Sur' } })).id;

  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contado-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const compra = (extra: any = {}, numeroFactura = `FAC-${randomUUID().slice(0, 8)}`) => ({
    solicitudId: randomUUID(), proveedorId: proveedorA, numeroFactura, isv: 0,
    items: [{ productoId, cantidad: 10, costo: 25 }], ...extra,
  });
  const cuentaDe = (ordenId: string) => prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP', documentoId: ordenId } });

  it('compra al contado: la factura queda pagada por el total, sin caja y sin movimientos de caja', async () => {
    const caja = await ops.abrir(tenantId, userIds.CAJERO, { solicitudId: randomUUID(), monto: 500 } as any);
    const movimientosAntes = await prisma.movimientoCaja.count({ where: { cajaId: caja.id } });
    const dto = compra({ pagoContado: { metodo: 'EFECTIVO' } });
    const orden = await ops.compra(tenantId, userIds.ADMIN, dto as any);
    const cuenta = await cuentaDe(orden.id);
    expect(Number(cuenta.monto)).toBe(250);
    expect(Number(cuenta.saldo)).toBe(0);
    const pagos = await prisma.pagoCuenta.findMany({ where: { cuentaId: cuenta.id } });
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ metodo: 'EFECTIVO', cajaId: null, usuarioId: userIds.ADMIN });
    expect(Number(pagos[0].monto)).toBe(250);
    expect(await prisma.movimientoCaja.count({ where: { cajaId: caja.id } })).toBe(movimientosAntes);
    const abierta = await prisma.caja.findUniqueOrThrow({ where: { id: caja.id } });
    expect(abierta.estado).toBe('ABIERTA');
  });

  it('la compra al contado no cambia el inventario hasta recibir mercancía, y luego sí suma existencias', async () => {
    const orden = await ops.compra(tenantId, userIds.ADMIN, compra({ pagoContado: { metodo: 'TRANSFERENCIA' } }) as any);
    const antes = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    const detalle = (await sql('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', orden.id))[0];
    await ops.recibir(tenantId, userIds.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 10 }] } as any);
    const despues = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect(Number(despues.stockActual)).toBe(Number(antes.stockActual) + 10);
    expect(await prisma.pagoCuenta.count({ where: { cuenta: { documentoId: orden.id } } })).toBe(1);
  });

  it('solo ADMIN paga al contado: BODEGUERO recibe 403 y no queda factura ni pago', async () => {
    const dto = compra({ pagoContado: { metodo: 'EFECTIVO' } });
    await expect(ops.compra(tenantId, userIds.BODEGUERO, dto as any)).rejects.toThrow('requiere administrador');
    expect(await prisma.ordenCompra.count({ where: { tenantId, numeroFactura: dto.numeroFactura } })).toBe(0);
  });

  it('reintentar la misma compra al contado no paga dos veces ni duplica la factura', async () => {
    const dto = compra({ pagoContado: { metodo: 'TARJETA' } });
    const primera = await ops.compra(tenantId, userIds.ADMIN, dto as any);
    const reintento = await ops.compra(tenantId, userIds.ADMIN, dto as any);
    expect(reintento.id).toBe(primera.id);
    expect(await prisma.pagoCuenta.count({ where: { cuenta: { documentoId: primera.id } } })).toBe(1);
    await expect(ops.compra(tenantId, userIds.ADMIN, { ...dto, pagoContado: { metodo: 'EFECTIVO' } } as any)).rejects.toThrow('otra compra');
  });

  it('un método de pago no válido (p. ej. crédito) no registra la compra', async () => {
    const dto = compra({ pagoContado: { metodo: 'CREDITO' } });
    await expect(ops.compra(tenantId, userIds.ADMIN, dto as any)).rejects.toThrow('Método de pago inválido');
    expect(await prisma.ordenCompra.count({ where: { tenantId, numeroFactura: dto.numeroFactura } })).toBe(0);
  });

  it('la compra a crédito sigue igual: CxP por el total con saldo abierto', async () => {
    const orden = await ops.compra(tenantId, userIds.ADMIN, compra() as any);
    const cuenta = await cuentaDe(orden.id);
    expect(Number(cuenta.saldo)).toBe(250);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(0);
  });

  it('si falla la auditoría de la compra, no queda factura, CxP ni pago (atomicidad)', async () => {
    const dto = compra({ pagoContado: { metodo: 'EFECTIVO' } });
    await sql(`CREATE OR REPLACE FUNCTION fallo_auditoria_compra() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'auditoria no disponible'; END; $$ LANGUAGE plpgsql;`);
    await sql(`CREATE TRIGGER fallo_auditoria_compra BEFORE INSERT ON auditoria_operaciones FOR EACH ROW WHEN (NEW.operacion = 'COMPRA_CREAR') EXECUTE FUNCTION fallo_auditoria_compra();`);
    try {
      await expect(ops.compra(tenantId, userIds.ADMIN, dto as any)).rejects.toThrow('no disponible');
    } finally {
      await sql('DROP TRIGGER IF EXISTS fallo_auditoria_compra ON auditoria_operaciones');
      await sql('DROP FUNCTION IF EXISTS fallo_auditoria_compra()');
    }
    expect(await prisma.ordenCompra.count({ where: { tenantId, numeroFactura: dto.numeroFactura } })).toBe(0);
    expect(await prisma.pagoCuenta.count({ where: { tenantId, solicitudId: dto.solicitudId } })).toBe(0);
  });
});
