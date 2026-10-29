import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CashierResponseInterceptor } from '../src/common/interceptors/cashier-response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';

// Dedicated disposable cluster. Never use an external DATABASE_URL or apply migrations.
describe('FUNC-001 / HTTP and isolated PostgreSQL', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;
  let tenantId: string, usuarioId: string, token: string, cotizacionId: string;
  const post = (id = cotizacionId, body = {}) => request(app.getHttpServer())
    .post(`/api/cotizaciones/${id}/convertir`).auth(token, { type: 'bearer' }).send(body);
  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-func001-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    // Override all connection variables for child processes as well as Prisma.
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    // Disposable fixture: no crash-durability assertion, so skip initial fsync.
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // Offline DDL generation from the current model, not the migration history.
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [CotizacionesController],
      providers: [CotizacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 120000);
  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-func001-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); usuarioId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'FUNC-001 synthetic' } });
    await prisma.usuario.create({ data: { id: usuarioId, tenantId, nombre: 'ADMIN', email: `${usuarioId}@test.invalid`, passwordHash: 'not-a-password', rol: 'ADMIN' } });
    token = jwt.sign({ sub: usuarioId, tenantId, type: 'tenant' });
    await prisma.caja.create({ data: { tenantId, usuarioId, codigo: 'CAJA-TEST', montoApertura: 100 } });
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente sintético', rtn: '08019999999999' } });
    const details = [];
    for (const [codigo, cantidad, medida, precioUnitario] of [['A', 2, 3, 10.25], ['B', 1.5, 1, 7.5]] as const) {
      const product = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo, nombre: codigo, precioVenta: precioUnitario, precioCosto: 2, stockActual: 100, usaMedida: codigo === 'A' } });
      details.push({ productoId: product.id, cantidad, medida, precioUnitario });
    }
    cotizacionId = (await new CotizacionesService(prisma).create(tenantId, usuarioId, { clienteId: cliente.id, detalles: details })).id;
  });

  it('HTTP canónico conserva cliente, productos, medida, precios, ISV y total; rechaza ruta antigua', async () => {
    await request(app.getHttpServer()).post(`/api/cotizaciones/${cotizacionId}/convertir-venta`).auth(token, { type: 'bearer' }).expect(404);
    const cot = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId }, include: { detalles: true } });
    const response = await post().expect(201);
    const sale = await prisma.venta.findUniqueOrThrow({ where: { id: response.body.ventaId }, include: { detalles: true } });
    expect(sale).toMatchObject({ tenantId, usuarioId, clienteId: cot.clienteId, clienteNombre: cot.clienteNombre, clienteRtn: cot.clienteRtn, metodoPago: 'EFECTIVO' });
    expect(Number(sale.total)).toBe(Number(cot.total));
    expect(response.body.total).toBe(Number(cot.total));
    expect(Number(sale.isv)).toBe(Number(cot.isv));
    expect(Number(sale.subtotal)).toBe(72.75);
    expect(sale.detalles).toHaveLength(2);
    for (const line of cot.detalles) {
      const actual = sale.detalles.find(d => d.productoId === line.productoId)!;
      expect(Number(actual.cantidad)).toBe(Number(line.totalMedida));
      expect(Number(actual.precioUnitario)).toBe(Number(line.precioUnitario));
      expect(Number(actual.subtotal)).toBe(Number(line.totalMedida) * Number(line.precioUnitario));
    }
    expect(await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } })).toMatchObject({ estado: 'CONVERTIDA', ventaId: sale.id });
  });

  it('dos POST concurrentes y un reintento tras respuesta perdida generan solo una venta/cobro', async () => {
    const responses = await Promise.all([post(), post()]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 400]);
    await post().expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    const movements = await prisma.$queryRawUnsafe<any[]>('SELECT m.id FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1', tenantId);
    expect(movements).toHaveLength(1);
  });

  it('fallo al actualizar cotización revierte venta y reservas; reintento crea una sola venta', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_conversion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo sintético antes de commit'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_conversion BEFORE UPDATE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION fail_conversion()');
    try { await post().expect(500); } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_conversion ON cotizaciones');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_conversion()');
    }
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } })).estado).toBe('BORRADOR');
    for (const p of await prisma.producto.findMany({ where: { tenantId } })) expect(Number(p.stockReservado)).toBe(0);
    await post().expect(201);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
  });

  it('JW-02 producto con precio revocado o inactivo después de cotizar: la conversión se rechaza sin venta ni reservas', async () => {
    const [primero] = await prisma.producto.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } });
    await prisma.producto.update({ where: { id: primero.id }, data: { precioAprobado: false } });
    const rechazo = await post().expect(400);
    expect(rechazo.body.message).toMatch(/precio aprobado/);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    for (const p of await prisma.producto.findMany({ where: { tenantId } })) expect(Number(p.stockReservado)).toBe(0);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } })).estado).toBe('BORRADOR');
    await prisma.producto.update({ where: { id: primero.id }, data: { precioAprobado: true, activo: false } });
    await post().expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });

  it('JW-06 la venta convertida conserva los subtotales en centavos de la cotización (2.5 × 25.99 = 64.98)', async () => {
    const product = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'C2599', nombre: 'Cable', precioVenta: 25.99, precioCosto: 10, stockActual: 100 } });
    const cot = await new CotizacionesService(prisma).create(tenantId, usuarioId, { detalles: [{ productoId: product.id, cantidad: 2.5 }] } as any);
    expect(cot).toMatchObject({ subtotal: 64.98, isv: 9.75, total: 74.73 });
    const response = await post(cot.id).expect(201);
    const sale = await prisma.venta.findUniqueOrThrow({ where: { id: response.body.ventaId }, include: { detalles: true } });
    expect(Number(sale.detalles[0].subtotal)).toBe(64.98);
    expect([Number(sale.subtotal), Number(sale.isv), Number(sale.total)]).toEqual([64.98, 9.75, 74.73]);
  });

  it('P2-H1 la API rechaza tasas de ISV no autorizadas (500 %, 0 %, 18 %) al crear, editar, duplicar y convertir', async () => {
    const api = (method: 'post' | 'put', url: string, body: object = {}) => request(app.getHttpServer())[method](`/api${url}`).auth(token, { type: 'bearer' }).send(body);
    const producto = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'ISV-500', nombre: 'Tornillo', precioVenta: 100, precioCosto: 10, stockActual: 100 } });
    const detalles = [{ productoId: producto.id, cantidad: 1 }];
    const antes = await prisma.cotizacion.count({ where: { tenantId } });
    for (const porcentajeIsv of [500, 0, 18, 15.5, -1, '15', null]) {
      const r = await api('post', '/cotizaciones', { porcentajeIsv, detalles }).expect(400);
      expect(JSON.stringify(r.body.message)).toMatch(/no autorizada|number/);
    }
    expect(await prisma.cotizacion.count({ where: { tenantId } })).toBe(antes);
    const original = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } });
    await api('put', `/cotizaciones/${cotizacionId}`, { porcentajeIsv: 500, detalles }).expect(400);
    expect(Number((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } })).isv)).toBe(Number(original.isv));
    // Dato anterior a la validación: una cotización con 500 % ya guardada no se duplica, no se recalcula con su tasa ni se vende.
    await prisma.cotizacion.update({ where: { id: cotizacionId }, data: { porcentajeIsv: 500, estado: 'APROBADA' } });
    await api('post', `/cotizaciones/${cotizacionId}/duplicar`).expect(400);
    await post().expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.cotizacion.count({ where: { tenantId } })).toBe(antes);
    await prisma.cotizacion.update({ where: { id: cotizacionId }, data: { estado: 'BORRADOR' } });
    await api('put', `/cotizaciones/${cotizacionId}`, { detalles }).expect(400);
    const corregida = await api('put', `/cotizaciones/${cotizacionId}`, { porcentajeIsv: 15, detalles }).expect(200);
    expect(corregida.body).toMatchObject({ porcentajeIsv: 15, isv: 15, total: 115 });
  });

  it('P3 cotización antigua al 0 %: ni ADMIN la convierte; la regularización crea otra y deja la original intacta', async () => {
    const api = (url: string, body: object = {}) => request(app.getHttpServer()).post(`/api${url}`).auth(token, { type: 'bearer' }).send(body);
    await prisma.cotizacion.update({ where: { id: cotizacionId }, data: { porcentajeIsv: 0, isv: 0, estado: 'APROBADA' } });
    await prisma.$executeRawUnsafe('UPDATE detalles_cotizacion SET isv = 0, total_linea = subtotal WHERE cotizacion_id = $1', cotizacionId);
    const fotografia = async () => prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId }, include: { detalles: { orderBy: { productoId: 'asc' } } } });
    const antes = await fotografia();
    const r = await post().expect(400);
    expect(r.body.message).toMatch(/no autorizada \(0 %\).*no se puede convertir/);
    await api(`/cotizaciones/${cotizacionId}/regularizar-isv`, {}).expect(400);
    await api(`/cotizaciones/${cotizacionId}/regularizar-isv`, { motivo: 'Cotización anterior a la política', porcentajeIsv: 0 }).expect(400);
    const nueva = await api(`/cotizaciones/${cotizacionId}/regularizar-isv`, { motivo: 'Cotización anterior a la política de ISV' }).expect(201);
    expect(nueva.body.id).not.toBe(cotizacionId);
    expect(nueva.body).toMatchObject({ porcentajeIsv: 15, estado: 'BORRADOR', subtotal: Number(antes.subtotal) });
    expect(nueva.body.isv).toBeGreaterThan(0);
    expect(nueva.body.notas).toMatch(/Regularización de ISV de COT-\d{4} \(tasa original 0 %\)/);
    expect(await fotografia()).toEqual(antes);
    const [auditoria] = await prisma.$queryRawUnsafe<any[]>("SELECT entidad_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='COTIZACION_REGULARIZAR_ISV'", tenantId);
    expect(auditoria).toMatchObject({ entidad_id: nueva.body.id, datos: { cotizacionOriginalId: cotizacionId, antes: { porcentajeIsv: 0, isv: 0 } } });
    await api(`/cotizaciones/${nueva.body.id}/regularizar-isv`, { motivo: 'Cotización anterior a la política de ISV' }).expect(409);
    await post().expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });

  it('P2-H2 líneas gravadas y exentas: la cotización guarda la marca por línea y la venta convertida conserva los importes históricos', async () => {
    const api = (body: object) => request(app.getHttpServer()).post('/api/cotizaciones').auth(token, { type: 'bearer' }).send(body);
    const grav = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'GRAV', nombre: 'Gravado', precioVenta: 100, precioCosto: 10, stockActual: 100 } });
    const exen = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'EXEN', nombre: 'Exento', precioVenta: 50, precioCosto: 10, stockActual: 100 } });
    const soloExenta = await api({ detalles: [{ productoId: exen.id, cantidad: 2, exento: true }] }).expect(201);
    expect(soloExenta.body).toMatchObject({ subtotal: 100, isv: 0, total: 100 });
    const combinada = await api({ descuentoGeneral: 15, tipoDescuentoGeneral: 'MONTO', detalles: [{ productoId: grav.id, cantidad: 1 }, { productoId: exen.id, cantidad: 1, exento: true }] }).expect(201);
    expect(combinada.body).toMatchObject({ subtotal: 150, porcentajeIsv: 15, isv: 13.5, total: 148.5 });
    const lineas = await prisma.detalleCotizacion.findMany({ where: { cotizacionId: combinada.body.id }, orderBy: { subtotal: 'desc' } });
    expect(lineas.map(l => [l.exento, Number(l.subtotal), Number(l.isv), Number(l.totalLinea)])).toEqual([[false, 100, 15, 115], [true, 50, 0, 50]]);
    const venta = await post(combinada.body.id).expect(201);
    const sale = await prisma.venta.findUniqueOrThrow({ where: { id: venta.body.ventaId }, include: { detalles: true } });
    expect([Number(sale.subtotal), Number(sale.descuento), Number(sale.isv), Number(sale.total)]).toEqual([150, 15, 13.5, 148.5]);
    // H2: detalles_venta no tiene columna de exención; la condición solo sobrevive en detalles_cotizacion (enlazada por venta_id).
    expect(Object.keys(sale.detalles[0])).not.toContain('exento');
    expect(await prisma.cotizacion.findUniqueOrThrow({ where: { id: combinada.body.id } })).toMatchObject({ ventaId: sale.id });
  });

  it('JW-11 una cotización RECHAZADA no se convierte en venta; reabierta (ENVIADA) sí', async () => {
    const patch = (estado: string) => request(app.getHttpServer()).patch(`/api/cotizaciones/${cotizacionId}/estado`).auth(token, { type: 'bearer' }).send({ estado });
    await patch('RECHAZADA').expect(200);
    const rechazo = await post().expect(400);
    expect(rechazo.body.message).toMatch(/rechazada/i);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    for (const p of await prisma.producto.findMany({ where: { tenantId } })) expect(Number(p.stockReservado)).toBe(0);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } })).estado).toBe('RECHAZADA');
    await patch('ENVIADA').expect(200);
    await post().expect(201);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
  });

  it('ID inexistente o de otro tenant y método inválido no crean ventas', async () => {
    await post(randomUUID()).expect(404);
    const otherTenantId = randomUUID();
    await prisma.tenant.create({ data: { id: otherTenantId, nombreComercial: 'Otro tenant sintético' } });
    await prisma.cotizacion.update({ where: { id: cotizacionId }, data: { tenantId: otherTenantId } });
    await post().expect(404);
    await post(cotizacionId, { metodoPago: 'INVALIDO' }).expect(400);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });
  it('política de precio en la conversión: sin excepción 409; ADMIN sin permiso 403; con permiso y motivo convierte y audita', async () => {
    const producto = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'EXC-PRECIO', nombre: 'Clavo excepción', precioVenta: 10, precioCosto: 2, stockActual: 100 } });
    const cot = await prisma.cotizacion.create({ data: {
      tenantId, numeroCotizacion: 9001, usuarioId, subtotal: 9, isv: 0, total: 9, estado: 'APROBADA', fechaValidez: new Date(Date.now() + 86400000 * 5), diasValidez: 5,
      detalles: { create: [{ productoId: producto.id, codigoProducto: 'EXC-PRECIO', descripcionProducto: 'Clavo excepción', cantidad: 1, totalMedida: 1, precioLista: 10, precioUnitario: 9, subtotal: 9, isv: 0, totalLinea: 9 }] },
    } });
    const motivo = 'Precio negociado con el cliente';
    await post(cot.id, {}).expect(409);
    await post(cot.id, { excepcionPrecio: { motivo } }).expect(403); // ADMIN sin permiso asignado: el rol no concede la excepción
    await prisma.usuario.update({ where: { id: usuarioId }, data: { permisos: ['pos.excepcion_precio'], permisosConfigurados: true } });
    await post(cot.id, { excepcionPrecio: { motivo: 'corto' } }).expect(400);
    const ok = await post(cot.id, { excepcionPrecio: { motivo } }).expect(201);
    const [audit] = await prisma.$queryRawUnsafe<any[]>("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='VENTA_EXCEPCION_PRECIO' AND entidad_id=$2", tenantId, ok.body.ventaId);
    expect(audit.datos).toMatchObject({ motivo, lineas: [{ productoId: producto.id, precioVigente: 10, precioCobrado: 9 }] });
    await prisma.usuario.update({ where: { id: usuarioId }, data: { permisos: [], permisosConfigurados: false } });
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).estado).toBe('CONVERTIDA');
  });
});
