import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClientesService } from '../src/clientes/clientes.service';
import { VentasService } from '../src/ventas/ventas.service';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';

// Etapa 4 de las decisiones del dueño del 2026-11-12 (#245): RTN del cliente.
// Sin RTN la operación sigue; con RTN, exactamente 14 dígitos (espacios y guiones como separadores, se guardan solo los
// dígitos); si no cumple, 400 y nada cambia. Se valida al crear o editar clientes, ventas y cotizaciones. Los RTN ya
// guardados antes de la regla no se modifican: solo se exigen cuando se vuelven a enviar o se copian a un documento nuevo.
// Cadena completa de migraciones sobre PostgreSQL temporal; servicios reales y datos sintéticos.
describe('RTN — etapa 4 (clientes, ventas y cotizaciones) / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let clientes: ClientesService;
  let ventas: VentasService;
  let cotizaciones: CotizacionesService;
  let tenantId: string, otroTenant: string, cajero: string, productoId: string;

  const RTN = '08011999000001';
  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const vender = (clienteRtn?: string, solicitudId = randomUUID()) =>
    ventas.create(tenantId, cajero, { solicitudId, metodoPago: 'EFECTIVO', clienteNombre: 'Obra', clienteRtn, detalles: [{ productoId, cantidad: 1 }] } as any) as Promise<any>;
  const cotizar = (extra: object = {}) =>
    cotizaciones.create(tenantId, cajero, { clienteNombre: 'Obra', detalles: [{ productoId, cantidad: 1 }], ...extra } as any, undefined, 'CAJERO') as Promise<any>;
  /** Estado que una operación rechazada no debe tocar. */
  const foto = async () => ({
    ventas: await prisma.venta.count({ where: { tenantId } }),
    cotizaciones: await prisma.cotizacion.count({ where: { tenantId } }),
    stock: Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual),
    movimientosCaja: Number((await sql('SELECT COUNT(*)::int AS n FROM movimientos_caja m JOIN cajas c ON c.id = m.caja_id WHERE c.tenant_id = $1', tenantId))[0].n),
    clientes: await prisma.cliente.count({ where: { tenantId } }),
  });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-rtn-etapa4-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url };
    const options = { timeout: 60000, env, stdio: 'pipe' as const };
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
    clientes = new ClientesService(prisma);
    ventas = new VentasService(prisma);
    cotizaciones = new CotizacionesService(prisma);
  }, 240000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-rtn-etapa4-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otroTenant = randomUUID();
    for (const id of [tenantId, otroTenant]) await prisma.tenant.create({ data: { id, nombreComercial: 'Ferretería sintética', estado: 'ACTIVO' } as any });
    cajero = (await prisma.usuario.create({ data: { tenantId, nombre: 'Cajera', email: `${randomUUID()}@test.invalid`, passwordHash: 'x', rol: 'CAJERO' } as any })).id;
    await prisma.caja.create({ data: { tenantId, usuarioId: cajero, codigo: `CAJA-${randomUUID().slice(0, 6)}`, montoApertura: 500 } as any });
    productoId = (await prisma.producto.create({ data: { tenantId, codigo: 'M1', nombre: 'Martillo', precioVenta: 100, precioCosto: 60, stockActual: 20, precioAprobado: true } as any })).id;
  });

  it('clientes: con separadores se guardan solo los 14 dígitos; vacío queda sin RTN; un RTN mal escrito no crea nada', async () => {
    expect((await clientes.create(tenantId, { nombre: 'Con guiones', rtn: '0801-1999-000001' } as any)).rtn).toBe(RTN);
    expect((await clientes.create(tenantId, { nombre: 'Con espacios', rtn: ' 0801 1999 000002 ' } as any)).rtn).toBe('08011999000002');
    expect((await clientes.create(tenantId, { nombre: 'Sin RTN', rtn: '' } as any)).rtn).toBeNull();
    expect((await clientes.create(tenantId, { nombre: 'Sin campo' } as any)).rtn).toBeNull();
    const antes = await foto();
    for (const rtn of ['0801199900000', '080119990000011', 'RTN-PENDIENTE', '0801.1999.000001']) {
      await expect(clientes.create(tenantId, { nombre: `Malo ${rtn}`, rtn } as any)).rejects.toThrow(/RTN del cliente: debe tener exactamente 14 dígitos/);
    }
    expect(await foto()).toEqual(antes);
  });

  it('clientes: al editar, un RTN mal escrito no cambia nada; uno válido se normaliza; si no se envía, el anterior se conserva', async () => {
    const c = await clientes.create(tenantId, { nombre: 'Ferretería del barrio', rtn: RTN } as any);
    await expect(clientes.update(tenantId, c.id, { rtn: '123' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).rtn).toBe(RTN);
    await clientes.update(tenantId, c.id, { rtn: '0801-1999-000099' } as any);
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).rtn).toBe('08011999000099');
    await clientes.update(tenantId, c.id, { rtn: '' } as any);
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).rtn).toBeNull();
    // Cliente guardado antes de la regla con un RTN que no cumple: se puede editar lo demás sin tocarlo.
    const [heredado] = await sql(`INSERT INTO clientes (id, tenant_id, nombre, rtn, updated_at) VALUES ($1, $2, 'Heredado', 'RTN viejo', now()) RETURNING id`, randomUUID(), tenantId);
    await clientes.update(tenantId, heredado.id, { telefono: '9999-0000' } as any);
    expect(await prisma.cliente.findUniqueOrThrow({ where: { id: heredado.id } })).toMatchObject({ rtn: 'RTN viejo', telefono: '9999-0000' });
    // Si se envía el mismo RTN inválido (p. ej. desde el formulario), hay que corregirlo.
    await expect(clientes.update(tenantId, heredado.id, { rtn: 'RTN viejo' } as any)).rejects.toThrow(/14 dígitos/);
  });

  it('ventas: el RTN se guarda en dígitos; sin RTN la venta sigue; mal escrito no vende, no descuenta existencias ni mueve caja', async () => {
    const conRtn = await vender('0801-1999-000001');
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: conRtn.id } })).clienteRtn).toBe(RTN);
    const sinRtn = await vender('   ');
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: sinRtn.id } })).clienteRtn).toBeNull();
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: (await vender()).id } })).clienteRtn).toBeNull();

    const antes = await foto();
    for (const rtn of ['12345', '0801199900000A', '080119990000011']) {
      await expect(vender(rtn)).rejects.toThrow(/RTN del cliente: debe tener exactamente 14 dígitos/);
    }
    expect(await foto()).toEqual(antes);
  });

  it('ventas: el reintento con la misma solicitud devuelve la misma venta y no duplica nada', async () => {
    const solicitudId = randomUUID();
    const primera = await vender('0801 1999 000001', solicitudId);
    const antes = await foto();
    const repetida = await vender('0801 1999 000001', solicitudId);
    expect(repetida.id).toBe(primera.id);
    expect(await foto()).toEqual(antes);
    // Un reintento con un RTN distinto es otra venta con la misma solicitud: se rechaza como siempre (409), sin cambios.
    await expect(vender('08011999000002', solicitudId)).rejects.toThrow(/ya fue utilizada/);
    expect(await foto()).toEqual(antes);
  });

  it('cotizaciones: escrito o copiado del cliente, el RTN que entra es válido; editar sin tocarlo conserva el anterior', async () => {
    const cot = await cotizar({ clienteRtn: '0801-1999-000001' });
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).clienteRtn).toBe(RTN);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: (await cotizar({ clienteRtn: '' })).id } })).clienteRtn).toBeNull();

    // Cliente registrado antes de la regla con un RTN que no cumple: no se copia a una cotización nueva hasta corregirlo.
    const [heredado] = await sql(`INSERT INTO clientes (id, tenant_id, nombre, rtn, updated_at) VALUES ($1, $2, 'Heredado', '0801-99', now()) RETURNING id`, randomUUID(), tenantId);
    const antes = await foto();
    await expect(cotizar({ clienteRtn: '0801' })).rejects.toThrow(/RTN del cliente: debe tener exactamente 14 dígitos/);
    await expect(cotizar({ clienteId: heredado.id })).rejects.toThrow(/RTN del cliente registrado \(corríjalo en Clientes\)/);
    expect(await foto()).toEqual(antes);
    await clientes.update(tenantId, heredado.id, { rtn: '0801 1999 000077' } as any);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: (await cotizar({ clienteId: heredado.id })).id } })).clienteRtn).toBe('08011999000077');

    // Cotización guardada antes de la regla con un RTN que no cumple: editarla sin enviar el RTN lo conserva.
    await sql('UPDATE cotizaciones SET cliente_rtn = $2 WHERE id = $1', cot.id, 'pendiente');
    await cotizaciones.update(tenantId, cot.id, { clienteNombre: 'Obra nueva', detalles: [{ productoId, cantidad: 2 }] } as any, cajero, 'CAJERO');
    expect(await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).toMatchObject({ clienteRtn: 'pendiente', clienteNombre: 'Obra nueva' });
    // Enviarlo mal escrito se rechaza sin cambiar la cotización; bien escrito se normaliza.
    await expect(cotizaciones.update(tenantId, cot.id, { clienteRtn: 'pendiente', detalles: [{ productoId, cantidad: 3 }] } as any, cajero, 'CAJERO')).rejects.toThrow(/14 dígitos/);
    const sinCambios = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id }, include: { detalles: true } });
    expect({ rtn: sinCambios.clienteRtn, cantidad: Number(sinCambios.detalles[0].cantidad) }).toEqual({ rtn: 'pendiente', cantidad: 2 });
    await cotizaciones.update(tenantId, cot.id, { clienteRtn: '0801-1999-000005', detalles: [{ productoId, cantidad: 3 }] } as any, cajero, 'CAJERO');
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).clienteRtn).toBe('08011999000005');
  });

  it('aislamiento: la regla no cruza empresas; un cliente de otra empresa no se encuentra al cotizar', async () => {
    const ajeno = await clientes.create(otroTenant, { nombre: 'Ajeno', rtn: RTN } as any);
    await expect(cotizar({ clienteId: ajeno.id })).rejects.toThrow(/no existe/);
    expect(await prisma.cotizacion.count({ where: { tenantId } })).toBe(0);
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: ajeno.id } })).rtn).toBe(RTN);
  });
});
