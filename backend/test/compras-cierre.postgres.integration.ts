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
describe('Compras: cierre funcional de recepción, costos y CxP / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-compras-cierre-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-compras-cierre-')) {
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
    productoId = (await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioCosto: 50, precioVenta: 70, stockActual: 100, stockMinimo: 0, unidadMedida: 'UNIDAD' } })).id;
  });

  const recibir = (orden: string, cantidad: number, solicitudId = randomUUID(), usuario = users.BODEGUERO) =>
    detalleDe(orden).then(linea => ops.recibir(tenantId, usuario, orden, { solicitudId, items: [{ detalleId: linea.id, cantidad }] } as any));
  const auditoriaRecepcion = (recepcionId: string) => prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId, operacion: 'COMPRA_RECIBIR', entidadId: recepcionId } });

  it('la auditoría de cada recepción registra costo anterior, costo nuevo, compra, factura y responsable', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-AUD-1', 45, 10));
    const recepcion = await recibir(orden.id, 10);
    const audit = await auditoriaRecepcion(recepcion.id);
    expect(audit.usuarioId).toBe(users.BODEGUERO);
    expect(audit.datos).toMatchObject({ orderId: orden.id, numeroFactura: 'FAC-AUD-1', proveedorId, costos: [{ productoId, costoAnterior: 50, costoNuevo: 45, cantidad: 10, proveedorId, numeroFactura: 'FAC-AUD-1' }] });
  });

  it('el costo sube y baja con cada compra válida, y el precio de venta y su aprobación no cambian', async () => {
    const baja = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-BAJ-1', 40, 5));
    await recibir(baja.id, 5);
    expect(Number((await producto()).costoVigente)).toBe(40);
    const sube = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-SUB-1', 60, 5));
    await recibir(sube.id, 5);
    const p = await producto();
    expect([Number(p.costoVigente), Number(p.precioCosto)]).toEqual([60, 60]);
    expect([Number(p.precioVenta), p.precioAprobado]).toEqual([70, true]);
  });

  it('proveedores con costos distintos: el costo vigente es el de la última recepción, y cada proveedor conserva su historial', async () => {
    const otro = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor económico' } })).id;
    const a = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-PA-1', 45, 4));
    await recibir(a.id, 4);
    const b = await ops.compra(tenantId, users.ADMIN, { ...compraDe('FAC-PB-1', 38, 6), proveedorId: otro });
    await recibir(b.id, 6);
    expect(Number((await producto()).costoVigente)).toBe(38);
    const historial = await prisma.costoCompra.findMany({ where: { tenantId, productoId }, orderBy: { fecha: 'asc' } });
    expect(historial.map(c => [c.proveedorId, Number(c.costo)])).toEqual([[proveedorId, 45], [otro, 38]]);
  });

  it('recepción duplicada: la misma solicitud con otro contenido se rechaza; la misma solicitud no suma dos veces', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-DUP-1', 45, 10));
    const linea = await detalleDe(orden.id);
    const solicitudId = randomUUID();
    await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId, items: [{ detalleId: linea.id, cantidad: 4 }] } as any);
    await expect(ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId, items: [{ detalleId: linea.id, cantidad: 5 }] } as any)).rejects.toThrow('otra recepción');
    await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId, items: [{ detalleId: linea.id, cantidad: 4 }] } as any);
    expect(Number((await producto()).stockActual)).toBe(104);
    expect(Number((await detalleDe(orden.id)).cantidad_recibida)).toBe(4);
  });

  it('no se recibe más de lo autorizado: el exceso se rechaza sin cambiar existencias, costo ni estado; tampoco el ADMIN', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-EXC-1', 45, 10));
    await expect(recibir(orden.id, 11)).rejects.toThrow('supera el pendiente');
    await expect(recibir(orden.id, 11, randomUUID(), users.ADMIN)).rejects.toThrow('supera el pendiente');
    const p = await producto();
    expect([Number(p.stockActual), Number(p.precioCosto)]).toEqual([100, 50]);
    expect((await prisma.ordenCompra.findUniqueOrThrow({ where: { id: orden.id } })).estado).toBe('SOLICITADA');
  });

  it('compra a crédito con recepciones parciales: una sola cuenta por pagar por el total, que no cambia al recibir', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-CRE-1', 45, 10, { isv: 0 }));
    const total = Number((await prisma.ordenCompra.findUniqueOrThrow({ where: { id: orden.id } })).total);
    await recibir(orden.id, 3);
    await recibir(orden.id, 4);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP', documentoId: orden.id } })).toBe(1);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(total);
    await recibir(orden.id, 3);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(total);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP', documentoId: orden.id } })).toBe(1);
  });

  it('una factura repetida, con o sin cambios de mayúsculas o espacios, no genera otra deuda ni otra compra', async () => {
    await ops.compra(tenantId, users.ADMIN, compraDe('FAC-REP-1', 45, 2));
    await expect(ops.compra(tenantId, users.ADMIN, compraDe(' fac-rep-1 ', 45, 2))).rejects.toThrow('ya está registrada');
    expect(await prisma.ordenCompra.count({ where: { tenantId, proveedorId, numeroFactura: 'FAC-REP-1' } })).toBe(1);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP' } })).toBe(1);
  });

  it('pagar a proveedor no cambia existencias, costo vigente ni precio de venta', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-PAG-1', 45, 10));
    await recibir(orden.id, 10);
    const antes = await producto();
    const cuenta = await cuentaDe(orden.id);
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 100, metodo: 'EFECTIVO' } as any);
    const despues = await producto();
    expect([Number(despues.stockActual), Number(despues.costoVigente), Number(despues.precioVenta)]).toEqual([Number(antes.stockActual), Number(antes.costoVigente), Number(antes.precioVenta)]);
    expect(Number((await cuentaDe(orden.id)).saldo)).toBe(Number(cuenta.saldo) - 100);
  });

  it('un ADMIN no edita a mano el costo que viene de una compra recibida; antes de cualquier compra sí puede fijarlo', async () => {
    const servicio = new ProductosService(prisma);
    const nuevo = await prisma.producto.create({ data: { precioAprobado: false, tenantId, codigo: 'NUEVO-COSTO', nombre: 'Clavo', precioCosto: 0, precioVenta: 0, stockActual: 0, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any });
    await servicio.cambiarPrecios(tenantId, nuevo.id, { version: 1, precioCosto: 3 } as any, users.ADMIN);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: nuevo.id } })).precioCosto)).toBe(3);
    const orden = await ops.compra(tenantId, users.ADMIN, { ...compraDe('FAC-MAN-1', 4, 2), items: [{ productoId: nuevo.id, cantidad: 2, costo: 4 }] } as any);
    await recibir(orden.id, 2);
    const actual = await prisma.producto.findUniqueOrThrow({ where: { id: nuevo.id } });
    await expect(servicio.cambiarPrecios(tenantId, nuevo.id, { version: actual.version, precioCosto: 9 } as any, users.ADMIN)).rejects.toThrow('última compra recibida');
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: nuevo.id } })).costoVigente)).toBe(4);
  });

  it('acceso: CAJERO no compra ni recibe, y otra empresa no recibe ni ve la orden', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-ACC-1', 45, 5));
    await expect(ops.compra(tenantId, users.CAJERO, compraDe('FAC-ACC-2', 45, 1))).rejects.toThrow();
    await expect(recibir(orden.id, 1, randomUUID(), users.CAJERO)).rejects.toThrow();
    await expect(recibir(orden.id, 1, randomUUID(), users.OTHER)).rejects.toThrow();
    expect(Number((await producto()).stockActual)).toBe(100);
  });
});
