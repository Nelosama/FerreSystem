import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { diaCalendario } from '../src/common/zona-horaria';
import { ProductosService } from '../src/productos/productos.service';

// Ciclo de compras contra PostgreSQL real: proveedor → orden/CxP → recepción → inventario y costos → pagos.
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL. Llama al servicio real (sin mocks).
describe('Integración compras ↔ cuentas por pagar (BALANCE) / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  let directory: string, prisma: PrismaService, ops: OperacionesService;
  let started = false;
  let tenantId: string, otherTenantId: string, proveedorId: string, productoId: string;
  const users: Record<string, string> = {};

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const producto = () => prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
  const compraDe = (numeroFactura: string, costo: number, cantidad: number, extra: any = {}) => ({
    solicitudId: randomUUID(), proveedorId, numeroFactura, isv: 0,
    items: [{ productoId, cantidad, costo }], ...extra,
  });
  const detalleDe = async (orderId: string) => (await sql('SELECT id, cantidad, cantidad_recibida FROM detalles_orden_compra WHERE orden_id=$1', orderId))[0];
  const cuentaDe = (orderId: string) => prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId, tipo: 'CXP', documentoId: orderId } });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-integracion-balance-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    ops = new OperacionesService(prisma);
  }, 120000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-integracion-balance-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Compras de prueba' } });
    const roles: [string, string, string[], boolean][] = [['ADMIN', 'ADMIN', [], false], ['BODEGUERO', 'BODEGUERO', ['inventario.editar', 'inventario.ver'], true], ['CAJERO', 'CAJERO', [], false]];
    for (const [clave, rol, permisos, configurados] of roles) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: clave, email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol: rol as any, permisosConfigurados: configurados, permisos } });
      users[clave] = id;
    }
    const otro = randomUUID();
    await prisma.usuario.create({ data: { id: otro, tenantId: otherTenantId, nombre: 'Ajeno', email: `${otro}@test.invalid`, passwordHash: 'not-a-password', rol: 'ADMIN' } });
    users.OTHER = otro;
    proveedorId = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Distribuidora Central' } })).id;
    productoId = (await prisma.producto.create({ data: { tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioCosto: 50, precioVenta: 70, stockActual: 100, stockMinimo: 0, unidadMedida: 'UNIDAD' } })).id;
  });

  const recibir = (orden: string, cantidad: number) => detalleDe(orden).then(linea =>
    ops.recibir(tenantId, users.BODEGUERO, orden, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad }] } as any));
  const pagosDe = (cuentaId: string) => prisma.pagoCuenta.count({ where: { cuentaId } });
  const cxpDe = (orden: string) => prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP', documentoId: orden } });

  it('factura a crédito crea una sola cuenta por pagar por el total', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAL-1', 45, 10));
    expect(await cxpDe(orden.id)).toBe(1);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(Number(orden.total));
  });

  it('recepción parcial no duplica la deuda: sigue habiendo una cuenta y el saldo no cambia al recibir', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAL-2', 45, 10));
    const total = Number(orden.total);
    await recibir(orden.id, 3);
    await recibir(orden.id, 4);
    expect(await cxpDe(orden.id)).toBe(1);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(total);
  });

  it('pago parcial reduce el saldo; la lista de cuentas por pagar lo muestra', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAL-3', 45, 10));
    const total = Number(orden.total);
    await ops.pagar(tenantId, users.ADMIN, (await cuentaDe(orden.id)).id, { solicitudId: randomUUID(), monto: 100, metodo: 'EFECTIVO' } as any);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(total - 100);
    const lista = await ops.cuentas(tenantId, users.ADMIN, 'CXP');
    expect(Number(lista.find((c: any) => c.documento_id === orden.id).saldo)).toBe(total - 100);
  });

  it('pago total liquida la cuenta: saldo cero y la cuenta sale como pendiente en la lista', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAL-4', 45, 10));
    const cuenta = await cuentaDe(orden.id);
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: Number(cuenta.saldo), metodo: 'EFECTIVO' } as any);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(0);
    const lista = await ops.cuentas(tenantId, users.ADMIN, 'CXP');
    expect(Number(lista.find((c: any) => c.documento_id === orden.id).saldo)).toBe(0);
  });

  it('pago duplicado (misma solicitud) no genera un segundo movimiento ni descuenta dos veces', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAL-5', 45, 10));
    const cuenta = await cuentaDe(orden.id);
    const solicitudId = randomUUID();
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId, monto: 50, metodo: 'EFECTIVO' } as any);
    await Promise.all([
      ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId, monto: 50, metodo: 'EFECTIVO' } as any),
      ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId, monto: 50, metodo: 'EFECTIVO' } as any),
    ]);
    expect(await pagosDe(cuenta.id)).toBe(1);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(Number(cuenta.saldo) - 50);
  });

  it('un pago no modifica existencias, costo vigente ni precio de venta', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAL-6', 45, 10));
    await recibir(orden.id, 10);
    const antes = await producto();
    await ops.pagar(tenantId, users.ADMIN, (await cuentaDe(orden.id)).id, { solicitudId: randomUUID(), monto: 200, metodo: 'EFECTIVO' } as any);
    const despues = await producto();
    expect([Number(despues.stockActual), Number(despues.costoVigente), Number(despues.precioCosto), Number(despues.precioVenta)])
      .toEqual([Number(antes.stockActual), Number(antes.costoVigente), Number(antes.precioCosto), Number(antes.precioVenta)]);
  });

  it('no hay acceso financiero entre empresas ni para roles sin permiso: pagar y listar cuentas ajenas se rechaza', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAL-7', 45, 10));
    const cuenta = await cuentaDe(orden.id);
    await expect(ops.pagar(otherTenantId, users.OTHER, cuenta.id, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' } as any)).rejects.toThrow();
    expect(await ops.cuentas(otherTenantId, users.OTHER, 'CXP')).toEqual([]);
    await expect(ops.pagar(tenantId, users.BODEGUERO, cuenta.id, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' } as any)).rejects.toThrow();
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(Number(orden.total));
  });
});
