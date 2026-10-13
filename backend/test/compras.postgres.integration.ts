import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { diaCalendario } from '../src/common/zona-horaria';

// Ciclo de compras contra PostgreSQL real: proveedor → orden/CxP → recepción → inventario y costos → pagos.
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL. Llama al servicio real (sin mocks).
describe('Compras, recepciones, costos y CxP / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-compras-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-compras-')) {
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

  // ─── Compra y CxP ────────────────────────────────────────────────────────

  it('una compra a crédito crea la orden y una cuenta por pagar por el total (sin caja)', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-100', 45, 200));
    expect(orden.estado).toBe('SOLICITADA');
    expect(Number(orden.total)).toBe(9000);
    const cuenta = await cuentaDe(orden.id);
    expect([Number(cuenta.monto), Number(cuenta.saldo), cuenta.proveedorId]).toEqual([9000, 9000, proveedorId]);
    expect(Number((await producto()).stockActual)).toBe(100);
  });

  it('una factura repetida del mismo proveedor se rechaza, aunque cambie mayúsculas o espacios (FS-COMP)', async () => {
    await ops.compra(tenantId, users.ADMIN, compraDe('FAC-200', 45, 10));
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('FAC-200', 45, 10))).rejects.toThrow('ya está registrada');
    await expect(ops.compra(tenantId, users.ADMIN, compraDe('  fac-200 ', 45, 10))).rejects.toThrow('ya está registrada');
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP' } })).toBe(1);
  });

  it('la misma factura puede existir con otro proveedor y en otra empresa', async () => {
    await ops.compra(tenantId, users.ADMIN, compraDe('FAC-300', 45, 10));
    const otroProveedor = (await prisma.proveedor.create({ data: { tenantId, nombre: 'Otro proveedor' } })).id;
    await ops.compra(tenantId, users.ADMIN, { ...compraDe('FAC-300', 45, 10), proveedorId: otroProveedor });
    const otroTenantProveedor = (await prisma.proveedor.create({ data: { tenantId: otherTenantId, nombre: 'Ajeno' } })).id;
    const otroProducto = (await prisma.producto.create({ data: {precioAprobado:true, tenantId: otherTenantId, codigo: 'TOR-1', nombre: 'Ajeno', precioCosto: 1, precioVenta: 2, stockActual: 0, stockMinimo: 0, unidadMedida: 'UNIDAD' } })).id;
    await ops.compra(otherTenantId, users.OTHER, { ...compraDe('FAC-300', 1, 1), proveedorId: otroTenantProveedor, items: [{ productoId: otroProducto, cantidad: 1, costo: 1 }] });
  });

  // ─── Recepción, inventario y costos ─────────────────────────────────────

  it('una recepción completa aumenta existencias una vez, actualiza el costo vigente y deja historial de costo', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-400', 45, 200));
    const linea = await detalleDe(orden.id);
    await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 200 }] } as any);
    const p = await producto();
    expect(Number(p.stockActual)).toBe(300);
    expect(Number(p.precioCosto)).toBe(45);
    expect(Number(p.costoVigente)).toBe(45);
    expect((await prisma.costoCompra.findMany({ where: { productoId, proveedorId } })).map(c => Number(c.costo))).toEqual([45]);
    expect((await prisma.ordenCompra.findUniqueOrThrow({ where: { id: orden.id } })).estado).toBe('RECIBIDA');
  });

  it('el costo vigente sigue la recepción más reciente: baja (50→45) y sube (45→60); el historial no cambia', async () => {
    const primera = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-500', 45, 200));
    await ops.recibir(tenantId, users.BODEGUERO, primera.id, { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(primera.id)).id, cantidad: 200 }] } as any);
    expect(Number((await producto()).costoVigente)).toBe(45);
    const segunda = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-501', 60, 50));
    await ops.recibir(tenantId, users.BODEGUERO, segunda.id, { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(segunda.id)).id, cantidad: 50 }] } as any);
    const p = await producto();
    expect(Number(p.costoVigente)).toBe(60);
    expect(Number(p.precioCosto)).toBe(60);
    expect(Number(p.stockActual)).toBe(350);
    expect((await prisma.costoCompra.findMany({ where: { productoId }, orderBy: { fecha: 'asc' } })).map(c => Number(c.costo))).toEqual([45, 60]);
  });

  it('no usa promedio ponderado: el costo vigente es el de la última recepción aunque la existencia sea mixta', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-600', 45, 200));
    await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(orden.id)).id, cantidad: 200 }] } as any);
    expect(Number((await producto()).precioCosto)).toBe(45);
    expect(Number((await producto()).precioVenta)).toBe(70);
  });

  it('recepción parcial: suma solo lo recibido, la orden queda pendiente y no permite exceder el saldo', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-700', 45, 10));
    const linea = await detalleDe(orden.id);
    await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 4 }] } as any);
    expect(Number((await producto()).stockActual)).toBe(104);
    expect((await prisma.ordenCompra.findUniqueOrThrow({ where: { id: orden.id } })).estado).toBe('SOLICITADA');
    await expect(ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 7 }] } as any)).rejects.toThrow('supera el pendiente');
    await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 6 }] } as any);
    expect((await prisma.ordenCompra.findUniqueOrThrow({ where: { id: orden.id } })).estado).toBe('RECIBIDA');
    expect(Number((await producto()).stockActual)).toBe(110);
  });

  it('dos recepciones concurrentes que juntas exceden el pendiente: solo una aplica', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-800', 45, 10));
    const linea = await detalleDe(orden.id);
    const intentos = await Promise.allSettled([
      ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 7 }] } as any),
      ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 7 }] } as any),
    ]);
    expect(intentos.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(Number((await producto()).stockActual)).toBe(107);
    expect(Number((await detalleDe(orden.id)).cantidad_recibida)).toBe(7);
  });

  it('reintentar una recepción con la misma solicitud (respuesta perdida) no vuelve a sumar existencias', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-900', 45, 10));
    const body = { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(orden.id)).id, cantidad: 10 }] } as any;
    const primera = await ops.recibir(tenantId, users.BODEGUERO, orden.id, body);
    const reintento = await ops.recibir(tenantId, users.BODEGUERO, orden.id, body);
    expect(reintento.id).toBe(primera.id);
    expect(Number((await producto()).stockActual)).toBe(110);
    expect(await prisma.costoCompra.count({ where: { productoId } })).toBe(1);
  });

  it('dos recepciones simultáneas con la misma solicitud producen una sola recepción y un solo incremento', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-950', 45, 10));
    const body = { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(orden.id)).id, cantidad: 10 }] } as any;
    const [a, b] = await Promise.all([ops.recibir(tenantId, users.BODEGUERO, orden.id, body), ops.recibir(tenantId, users.BODEGUERO, orden.id, body)]);
    expect(a.id).toBe(b.id);
    expect(Number((await producto()).stockActual)).toBe(110);
  });

  it('un error al recibir revierte todo: sin recepción, sin existencias ni costos (atomicidad)', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1000', 45, 10));
    const linea = await detalleDe(orden.id);
    await prisma.producto.update({ where: { id: productoId }, data: { activo: false } });
    await expect(ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 10 }] } as any)).rejects.toThrow('no disponible');
    expect(await prisma.recepcionCompra.count({ where: { ordenId: orden.id } })).toBe(0);
    expect(Number((await detalleDe(orden.id)).cantidad_recibida)).toBe(0);
    expect(Number((await producto()).stockActual)).toBe(100);
    expect(await prisma.costoCompra.count({ where: { ordenId: orden.id } })).toBe(0);
  });

  it('una recepción queda auditada con usuario, orden y líneas', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1100', 45, 10));
    const recepcion = await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(orden.id)).id, cantidad: 10 }] } as any);
    const [registro] = await sql("SELECT usuario_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='COMPRA_RECIBIR' AND entidad_id=$2", tenantId, recepcion.id);
    expect(registro.usuario_id).toBe(users.BODEGUERO);
    expect(registro.datos.orderId).toBe(orden.id);
  });

  // ─── Pagos a proveedor y caja ───────────────────────────────────────────

  it('pagos parciales reducen el saldo; no se acepta un pago mayor al saldo', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1200', 45, 200));
    const cuenta = await cuentaDe(orden.id);
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 4000, metodo: 'TRANSFERENCIA', referencia: 'TRF-PAR-1' } as any);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(5000);
    await expect(ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 5001, metodo: 'EFECTIVO' } as any)).rejects.toThrow('mayor al saldo');
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 5000, metodo: 'TARJETA', referencia: 'TAR-PAR-2' } as any);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(0);
  });

  it('dos pagos concurrentes que juntos superan el saldo: solo uno se aplica y el saldo nunca es negativo', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1300', 45, 200));
    const cuenta = await cuentaDe(orden.id);
    const intentos = await Promise.allSettled([
      ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 6000, metodo: 'EFECTIVO' } as any),
      ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 6000, metodo: 'EFECTIVO' } as any),
    ]);
    expect(intentos.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(3000);
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(1);
  });

  it('reintentar un pago con la misma solicitud no descuenta dos veces', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1400', 45, 200));
    const cuenta = await cuentaDe(orden.id);
    const body = { solicitudId: randomUUID(), monto: 2000, metodo: 'TRANSFERENCIA', referencia: 'TRF-REINT-3' } as any;
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, body);
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, body);
    expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(7000);
  });

  it('un pago a proveedor en cualquier método no abre ni toca la caja POS: caja_id NULL y sin movimientos', async () => {
    const cajero = await ops.abrir(tenantId, users.CAJERO, { solicitudId: randomUUID(), monto: 1000 } as any);
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1500', 45, 200));
    const cuenta = await cuentaDe(orden.id);
    const cajaAntes = await prisma.caja.findFirstOrThrow({ where: { tenantId } });
    const movimientosAntes = (await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1', tenantId))[0].n;
    for (const metodo of ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']) {
      await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 1000, metodo, ...(metodo==='EFECTIVO'?{}:{referencia:`${metodo}-CAJA-${randomUUID().slice(0,8)}`}) } as any);
    }
    const pagos = await prisma.pagoCuenta.findMany({ where: { cuentaId: cuenta.id } });
    expect(pagos.map(p => p.cajaId)).toEqual([null, null, null]);
    expect((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1', tenantId))[0].n).toBe(movimientosAntes);
    expect(Number((await prisma.caja.findUniqueOrThrow({ where: { id: cajaAntes.id } })).montoApertura)).toBe(1000);
    expect(cajero.id).toBeDefined();
  });

  it('no exige caja abierta para pagar a proveedores aunque el pago sea en efectivo', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1600', 45, 200));
    const cuenta = await cuentaDe(orden.id);
    await expect(ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 500, metodo: 'EFECTIVO' } as any)).resolves.toBeDefined();
  });

  it('los pagos a proveedor quedan auditados con proveedor, factura, método, monto y responsable', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1700', 45, 200));
    const cuenta = await cuentaDe(orden.id);
    const pago = await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 1234.5, metodo: 'TRANSFERENCIA', referencia: 'TRF-AUD-4' } as any);
    const [registro] = await sql("SELECT usuario_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CUENTA_PAGAR' AND entidad_id=$2", tenantId, pago.id);
    expect(registro.usuario_id).toBe(users.ADMIN);
    expect(registro.datos).toMatchObject({ tipo: 'CXP', monto: 1234.5, metodo: 'TRANSFERENCIA', afectaCaja: false, proveedorId });
  });

  it('una cuenta por pagar vence por calendario de Tegucigalpa: vence el día siguiente al de vencimiento, no antes', async () => {
    const hoy = diaCalendario(new Date(), 'America/Tegucigalpa');
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1800', 45, 200, { vencimiento: hoy }));
    const cuenta = await cuentaDe(orden.id);
    const [fila] = await ops.cuentas(tenantId, users.ADMIN, 'CXP') as any[];
    expect(cuenta.id).toBe(fila.id);
    expect(fila.vencida).toBe(false);
  });

  it('una cuenta por pagar con vencimiento de ayer en Tegucigalpa aparece vencida', async () => {
    const ayer = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const diaAyer = diaCalendario(ayer, 'America/Tegucigalpa');
    await ops.compra(tenantId, users.ADMIN, compraDe('FAC-1900', 45, 200, { vencimiento: diaAyer }));
    const [fila] = (await ops.cuentas(tenantId, users.ADMIN, 'CXP') as any[]).filter(c => c.documento === 'FAC-1900');
    expect(fila.vencida).toBe(true);
  });

  // ─── Permisos y aislamiento ─────────────────────────────────────────────

  it('CAJERO no registra compras ni recepciones, y solo el ADMIN paga y consulta cuentas por pagar', async () => {
    await expect(ops.compra(tenantId, users.CAJERO, compraDe('FAC-2000', 45, 10))).rejects.toThrow();
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-2001', 45, 10));
    await expect(ops.recibir(tenantId, users.CAJERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(orden.id)).id, cantidad: 1 }] } as any)).rejects.toThrow();
    const cuenta = await cuentaDe(orden.id);
    await expect(ops.pagar(tenantId, users.CAJERO, cuenta.id, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any)).rejects.toThrow('administrador');
    await expect(ops.cuentas(tenantId, users.CAJERO, 'CXP')).rejects.toThrow('administrador');
    expect(await prisma.pagoCuenta.count({ where: { cuentaId: cuenta.id } })).toBe(0);
  });

  it('BODEGUERO puede recibir pero no pagar a proveedores', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-2100', 45, 10));
    await ops.recibir(tenantId, users.BODEGUERO, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(orden.id)).id, cantidad: 10 }] } as any);
    await expect(ops.pagar(tenantId, users.BODEGUERO, (await cuentaDe(orden.id)).id, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any)).rejects.toThrow();
  });

  it('otra empresa no puede comprar con productos o proveedores ajenos, recibir ni pagar cuentas ajenas', async () => {
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-2200', 45, 10));
    await expect(ops.compra(otherTenantId, users.OTHER, compraDe('FAC-2200', 45, 10))).rejects.toThrow('Proveedor no encontrado');
    await expect(ops.recibir(otherTenantId, users.OTHER, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: (await detalleDe(orden.id)).id, cantidad: 10 }] } as any)).rejects.toThrow('Compra no encontrada');
    await expect(ops.pagar(otherTenantId, users.OTHER, (await cuentaDe(orden.id)).id, { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any)).rejects.toThrow('Cuenta no encontrada');
    expect(Number((await producto()).stockActual)).toBe(100);
  });

  it('una compra con un producto de otra empresa se rechaza sin crear orden ni cuenta (rollback)', async () => {
    const ajeno = (await prisma.producto.create({ data: {precioAprobado:true, tenantId: otherTenantId, codigo: 'AJ-1', nombre: 'Ajeno', precioCosto: 1, precioVenta: 2, stockActual: 0, stockMinimo: 0, unidadMedida: 'UNIDAD' } })).id;
    await expect(ops.compra(tenantId, users.ADMIN, { ...compraDe('FAC-2300', 45, 10), items: [{ productoId, cantidad: 10, costo: 45 }, { productoId: ajeno, cantidad: 1, costo: 1 }] })).rejects.toThrow('no encontrado');
    expect(await prisma.ordenCompra.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId } })).toBe(0);
  });

  // ─── Alerta de 7 días y vencida por calendario de Tegucigalpa (instantes fijos) ───

  // Hoy es 9 oct en Tegucigalpa (UTC-6, sin horario de verano). Cuentas: 8 (vencida), 9 (hoy), 16 (día +7), 17 (día +8).
  const prepararVencimientos = async () => {
    for (const [factura, vencimiento] of [['FAC-3001', '2026-10-08'], ['FAC-3002', '2026-10-09'], ['FAC-3003', '2026-10-16'], ['FAC-3004', '2026-10-17']]) {
      await ops.compra(tenantId, users.ADMIN, compraDe(factura, 10, 1, { vencimiento }));
    }
  };
  const alertaCxp = async (ahora: Date) => {
    const resumen = await ops.resumen(tenantId, '2026-10-01', '2026-10-31', 'America/Tegucigalpa', ahora) as any;
    const fila = resumen.alertas.find((a: any) => a.tipo === 'CXP');
    return { cantidad: fila?.cantidad ?? 0, saldo: Number(fila?.saldo ?? 0) };
  };
  const vencidaPorFactura = async (ahora: Date) => Object.fromEntries(
    ((await ops.cuentas(tenantId, users.ADMIN, 'CXP', ahora)) as any[]).map(c => [c.documento, c.vencida]),
  );

  it('alerta de 7 días a las 00:00 (Tegucigalpa): incluye vencidas, hoy y día +7; excluye día +8', async () => {
    await prepararVencimientos();
    expect(await alertaCxp(new Date('2026-10-09T06:00:00Z'))).toEqual({ cantidad: 3, saldo: 30 });
  });

  it('alerta de 7 días a las 18:00 (Tegucigalpa) no incluye el día +8 aunque el instante UTC lo alcance', async () => {
    await prepararVencimientos();
    expect(await alertaCxp(new Date('2026-10-10T00:00:00Z'))).toEqual({ cantidad: 3, saldo: 30 });
  });

  it('alerta de 7 días a las 23:59 (Tegucigalpa) no incluye el día +8', async () => {
    await prepararVencimientos();
    expect(await alertaCxp(new Date('2026-10-10T05:59:00Z'))).toEqual({ cantidad: 3, saldo: 30 });
  });

  it('al cambiar de día a las 00:00 (Tegucigalpa) el límite avanza: el día +8 anterior entra y el día 8 sigue como vencida', async () => {
    await prepararVencimientos();
    expect(await alertaCxp(new Date('2026-10-10T06:00:00Z'))).toEqual({ cantidad: 4, saldo: 40 });
  });

  it('una cuenta pagada por completo sale de la alerta de 7 días', async () => {
    await prepararVencimientos();
    const [orden] = await sql('SELECT id FROM ordenes_compra WHERE tenant_id=$1 AND numero_factura=$2', tenantId, 'FAC-3003');
    const cuenta = await cuentaDe(orden.id);
    await ops.pagar(tenantId, users.ADMIN, cuenta.id, { solicitudId: randomUUID(), monto: 10, metodo: 'EFECTIVO' } as any);
    expect(await alertaCxp(new Date('2026-10-09T06:00:00Z'))).toEqual({ cantidad: 2, saldo: 20 });
  });

  it('vencida a las 23:59 (Tegucigalpa) solo marca el día anterior; a las 00:00 del día siguiente marca también el día de hoy', async () => {
    await prepararVencimientos();
    const aun = await vencidaPorFactura(new Date('2026-10-10T05:59:00Z'));
    expect(aun['FAC-3001']).toBe(true);
    expect(aun['FAC-3002']).toBe(false);
    const despues = await vencidaPorFactura(new Date('2026-10-10T06:00:00Z'));
    expect(despues['FAC-3002']).toBe(true);
    expect(despues['FAC-3004']).toBe(false);
  });

  it('secuencia de costos 45, 60 y 40: el costo vigente sigue a la última recepción, cada compra conserva su costo y el precio de venta no cambia', async () => {
    const recibirCompra = async (factura: string, costo: number) => {
      const orden = await ops.compra(tenantId, users.ADMIN, compraDe(factura, costo, 10));
      const detalle = await detalleDe(orden.id);
      await ops.recibir(tenantId, users.ADMIN, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 10 }] } as any);
      return orden.id;
    };
    const ordenes = [await recibirCompra('FAC-5001', 45), await recibirCompra('FAC-5002', 60), await recibirCompra('FAC-5003', 40)];
    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect(Number(producto.costoVigente)).toBe(40);
    expect(Number(producto.precioCosto)).toBe(40);
    expect(Number(producto.precioVenta)).toBe(70);
    const costosPorCompra = await Promise.all(ordenes.map(async id => Number((await sql('SELECT precio_costo FROM detalles_orden_compra WHERE orden_id=$1', id))[0].precio_costo)));
    expect(costosPorCompra).toEqual([45, 60, 40]);
  });

  it('una recepción rechazada no cambia el costo vigente ni el costo de la compra', async () => {
    const antes = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    const orden = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-5100', 99, 5));
    const detalle = await detalleDe(orden.id);
    await expect(ops.recibir(tenantId, users.ADMIN, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 6 }] } as any)).rejects.toThrow();
    const despues = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect(Number(despues.costoVigente)).toBe(Number(antes.costoVigente));
    expect(Number(despues.stockActual)).toBe(Number(antes.stockActual));
    expect(Number((await detalleDe(orden.id)).cantidad_recibida)).toBe(0);
  });

  it('registrar la misma factura con la misma solicitud devuelve la misma orden y una sola cuenta por pagar', async () => {
    const datos = compraDe('FAC-5200', 45, 10);
    const primera = await ops.compra(tenantId, users.ADMIN, datos);
    const reenvio = await ops.compra(tenantId, users.ADMIN, datos);
    expect(reenvio.id).toBe(primera.id);
    expect(await prisma.ordenCompra.count({ where: { tenantId, numeroFactura: 'FAC-5200' } })).toBe(1);
    expect(await prisma.cuentaOperativa.count({ where: { tenantId, tipo: 'CXP', documentoId: primera.id } })).toBe(1);
  });

  // ─── Auditoría histórica de solo lectura ───────────────────────────────

  it('las consultas de auditoría son de solo lectura y detectan anomalías sembradas sin modificar datos', async () => {
    const a = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-9001', 45, 10));
    const b = await ops.compra(tenantId, users.ADMIN, compraDe('FAC-9002', 45, 10));
    // Anomalías sembradas directamente en SQL (los servicios no permiten producirlas):
    await sql("UPDATE ordenes_compra SET numero_factura=' fac-9001 ' WHERE id=$1", b.id);
    await sql("UPDATE ordenes_compra SET estado='RECIBIDA' WHERE id=$1", a.id);
    await sql('UPDATE cuentas_operativas SET saldo=999 WHERE documento_id=$1', a.id);

    const consultas = readFileSync(resolve('scripts/auditoria-compras-lectura.sql'), 'utf8')
      .split(/^-- @consulta /m).slice(1)
      .map(bloque => {
        const [nombre, ...lineas] = bloque.split('\n');
        return { nombre: nombre.trim(), sql: lineas.filter(l => !l.startsWith('--')).join('\n').trim() };
      });
    expect(consultas.length).toBeGreaterThanOrEqual(10);

    const hallazgos: Record<string, number> = {};
    for (const { nombre, sql: texto } of consultas) {
      const filas = await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.$queryRawUnsafe<any[]>(texto, tenantId);
      });
      hallazgos[nombre] = filas.length;
    }
    expect(hallazgos.factura_duplicada_ordenes).toBe(1);
    expect(hallazgos.orden_recibida_con_lineas_pendientes).toBe(1);
    expect(hallazgos.cuenta_saldo_no_concilia).toBe(1);
    for (const nombre of ['factura_duplicada_legacy', 'recepcion_no_coincide_con_costos', 'cxp_monto_distinto_de_orden', 'cxp_sin_orden_de_origen', 'pago_cxp_con_caja', 'movimiento_caja_con_concepto_cxp', 'pagos_legacy_superan_compra']) {
      expect(hallazgos[nombre], nombre).toBe(0);
    }

    // Las consultas no modifican nada: las anomalías sembradas siguen tal cual.
    expect(Number((await sql('SELECT saldo FROM cuentas_operativas WHERE documento_id=$1', a.id))[0].saldo)).toBe(999);
    expect((await sql('SELECT numero_factura FROM ordenes_compra WHERE id=$1', b.id))[0].numero_factura).toBe(' fac-9001 ');

    // Un intento de escritura dentro de la misma modalidad de lectura se rechaza.
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("UPDATE ordenes_compra SET notas='x' WHERE tenant_id=$1", tenantId);
    })).rejects.toThrow(/read-only/);
  });
});
