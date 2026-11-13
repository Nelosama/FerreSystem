import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { CotizacionesController } from '../src/cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { AutorizacionesController } from '../src/autorizaciones/autorizaciones.controller';
import { AutorizacionesService } from '../src/autorizaciones/autorizaciones.service';

// Decisión del dueño del 2026-11-12: todo descuento de una cotización lo autoriza un ADMIN. Mientras esté pendiente no se
// envía ni se convierte; el cajero puede cancelar y seguir al precio original; ADMIN puede rechazar; todo queda registrado.
// Clúster PostgreSQL temporal y exclusivo; nunca usa un DATABASE_URL externo.
describe('Autorización de descuentos en cotizaciones / HTTP y PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;

  let tenantId: string, otroTenantId: string;
  let admin: string, admin2: string, cajero: string, cajero2: string, adminOtro: string;
  let productoA: string, productoB: string;
  const token = (sub: string, tenant = tenantId) => jwt.sign({ sub, tenantId: tenant, type: 'tenant' });
  const como = (sub: string, tenant = tenantId) => {
    const t = token(sub, tenant);
    const http = () => request(app.getHttpServer());
    return {
      get: (url: string) => http().get(`/api${url}`).auth(t, { type: 'bearer' }),
      post: (url: string, body: object = {}) => http().post(`/api${url}`).auth(t, { type: 'bearer' }).send(body),
      put: (url: string, body: object) => http().put(`/api${url}`).auth(t, { type: 'bearer' }).send(body),
      patch: (url: string, body: object) => http().patch(`/api${url}`).auth(t, { type: 'bearer' }).send(body),
    };
  };
  const conDescuento = () => ({
    clienteNombre: 'Cliente obra',
    detalles: [{ productoId: productoA, cantidad: 2, descuento: 10, tipoDescuento: 'PORCENTAJE' }, { productoId: productoB, cantidad: 1 }],
  });
  const sinDescuento = () => ({ clienteNombre: 'Cliente obra', detalles: [{ productoId: productoA, cantidad: 2 }, { productoId: productoB, cantidad: 1 }] });
  const solicitudes = (cotizacionId: string) => prisma.solicitudAutorizacion.findMany({ where: { tenantId, entidadId: cotizacionId }, orderBy: { solicitadaAt: 'asc' } });
  const auditoria = (operacion: string) => prisma.auditoriaOperacion.findMany({ where: { tenantId, operacion }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-autdesc-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { timeout: 60000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // Ruta real de despliegue: migraciones versionadas (incluye el índice único parcial de solicitudes pendientes).
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { ...options, timeout: 180000 });
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [CotizacionesController, AutorizacionesController],
      providers: [CotizacionesService, AutorizacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 240000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-autdesc-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otroTenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería sintética' } });
    await prisma.tenant.create({ data: { id: otroTenantId, nombreComercial: 'Otra empresa sintética' } });
    const usuario = async (rol: 'ADMIN' | 'CAJERO', tenant = tenantId, extra: object = {}) => (await prisma.usuario.create({
      data: { tenantId: tenant, nombre: `${rol}-${randomUUID().slice(0, 4)}`, email: `${randomUUID()}@test.invalid`, passwordHash: 'not-a-password', rol, ...extra },
    })).id;
    admin = await usuario('ADMIN'); admin2 = await usuario('ADMIN');
    // Con tope de descuento: la regla de cotizaciones no depende de él.
    cajero = await usuario('CAJERO', tenantId, { descuentoMaximo: 50 }); cajero2 = await usuario('CAJERO');
    adminOtro = await usuario('ADMIN', otroTenantId);
    for (const u of [admin, cajero]) await prisma.caja.create({ data: { tenantId, usuarioId: u, codigo: `CAJA-${u.slice(0, 4)}`, montoApertura: 100 } });
    productoA = (await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'A', nombre: 'Martillo', precioVenta: 100, precioCosto: 40, stockActual: 50 } })).id;
    productoB = (await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'B', nombre: 'Clavos', precioVenta: 50, precioCosto: 20, stockActual: 50 } })).id;
  });

  it('el cajero guarda con descuento: nace una solicitud pendiente y no puede enviar ni convertir', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    // Bruto 250, descuento 20 en la línea A, base 230, ISV 34.50, total 264.50.
    expect(cot).toMatchObject({ descuento: 20, total: 264.5, estado: 'BORRADOR', autorizacionDescuento: { requerida: true, estado: 'PENDIENTE', solicitanteId: cajero } });
    const [s] = await solicitudes(cot.id);
    expect(s).toMatchObject({ tipo: 'DESCUENTO_COTIZACION', estado: 'PENDIENTE', solicitanteId: cajero, decisorId: null, decididaAt: null });
    expect(s.resumen).toMatchObject({ descuento: 20, total: 264.5, lineasConDescuento: [{ producto: 'Martillo', descuento: 20 }] });

    for (const estado of ['ENVIADA', 'APROBADA']) {
      const r = await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado }).expect(409);
      expect(r.body).toMatchObject({ codigo: 'DESCUENTO_SIN_AUTORIZACION', estadoAutorizacion: 'PENDIENTE' });
      expect(r.body.message).toMatch(/pendiente de autorización/);
    }
    // Ni siquiera un ADMIN convierte una cotización con descuento pendiente: primero debe aprobarla.
    await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(409);
    await como(admin).post(`/cotizaciones/${cot.id}/convertir`).expect(409);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).estado).toBe('BORRADOR');
    for (const p of await prisma.producto.findMany({ where: { tenantId } })) expect(Number(p.stockReservado)).toBe(0);
    expect(await auditoria('AUTORIZACION_SOLICITADA')).toHaveLength(1);
  });

  it('ADMIN aprueba (abrir la solicitud no la aprueba): el cajero envía y convierte con el descuento', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const [s] = await solicitudes(cot.id);
    const lista = (await como(admin).get('/autorizaciones?estado=PENDIENTE').expect(200)).body;
    expect(lista.pendientes).toBe(1);
    expect(lista.solicitudes[0]).toMatchObject({ id: s.id, estado: 'PENDIENTE', entidadId: cot.id, solicitanteId: cajero });
    await como(admin).get(`/autorizaciones/${s.id}`).expect(200);
    expect((await prisma.solicitudAutorizacion.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('PENDIENTE');

    const aprobada = (await como(admin).post(`/autorizaciones/${s.id}/aprobar`, {}).expect(201)).body;
    expect(aprobada).toMatchObject({ estado: 'APROBADA', decisorId: admin, motivoDecision: null });
    expect(aprobada.decididaAt).toBeTruthy();
    expect((await como(cajero).get(`/cotizaciones/${cot.id}`).expect(200)).body.autorizacionDescuento).toMatchObject({ estado: 'APROBADA' });
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(200);
    const venta = (await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(201)).body;
    const fila = await prisma.venta.findUniqueOrThrow({ where: { id: venta.ventaId } });
    expect([Number(fila.descuento), Number(fila.total)]).toEqual([20, 264.5]);
    expect(await auditoria('AUTORIZACION_APROBADA')).toHaveLength(1);
  });

  it('ADMIN rechaza con motivo opcional: sigue bloqueada; el cajero quita el descuento y envía al precio original', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const [s] = await solicitudes(cot.id);
    const rechazada = (await como(admin).post(`/autorizaciones/${s.id}/rechazar`, { motivo: 'Margen insuficiente' }).expect(201)).body;
    expect(rechazada).toMatchObject({ estado: 'RECHAZADA', decisorId: admin, motivoDecision: 'Margen insuficiente' });
    const r = await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(409);
    expect(r.body.estadoAutorizacion).toBe('RECHAZADA');
    await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(409);
    // Guardar otra vez el mismo contenido no vuelve a pedirlo solo: se pide de forma expresa.
    await como(cajero).put(`/cotizaciones/${cot.id}`, conDescuento()).expect(200);
    expect((await solicitudes(cot.id)).map((x) => x.estado)).toEqual(['RECHAZADA']);

    const sinDesc = (await como(cajero).post(`/cotizaciones/${cot.id}/quitar-descuento`).expect(201)).body;
    expect(sinDesc).toMatchObject({ descuento: 0, descuentoGeneral: 0, subtotal: 250, isv: 37.5, total: 287.5, autorizacionDescuento: { requerida: false, estado: 'NO_REQUERIDA' } });
    expect(sinDesc.detalles.map((d: any) => [d.precioUnitario, d.descuento])).toEqual(expect.arrayContaining([[100, 0], [50, 0]]));
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(200);
    const venta = (await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(201)).body;
    expect(venta.total).toBe(287.5);
  });

  it('el solicitante cancela: solicitud CANCELADA a su nombre, cotización al precio original y lista para enviarse', async () => {
    const cot = (await como(cajero).post('/cotizaciones', { ...conDescuento(), descuentoGeneral: 5, tipoDescuentoGeneral: 'MONTO' }).expect(201)).body;
    const [s] = await solicitudes(cot.id);
    // Otro cajero no la ve ni la cancela (misma respuesta que «no existe»).
    await como(cajero2).get(`/autorizaciones/${s.id}`).expect(404);
    await como(cajero2).post(`/autorizaciones/${s.id}/cancelar`).expect(404);
    expect((await como(cajero2).get('/autorizaciones').expect(200)).body.solicitudes).toEqual([]);

    const cancelada = (await como(cajero).post(`/autorizaciones/${s.id}/cancelar`).expect(201)).body;
    expect(cancelada).toMatchObject({ estado: 'CANCELADA', decisorId: cajero });
    expect(cancelada.decididaAt).toBeTruthy();
    const actual = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } });
    expect([Number(actual.descuento), Number(actual.descuentoGeneral), Number(actual.total)]).toEqual([0, 0, 287.5]);
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(200);
    // Ya resuelta: ni aprobarla ni cancelarla otra vez.
    const tarde = await como(admin).post(`/autorizaciones/${s.id}/aprobar`).expect(409);
    expect(tarde.body.message).toMatch(/ya fue cancelada/);
    await como(cajero).post(`/autorizaciones/${s.id}/cancelar`).expect(409);
    expect(await auditoria('AUTORIZACION_CANCELADA')).toHaveLength(1);
    expect(await auditoria('COTIZACION_QUITAR_DESCUENTO')).toHaveLength(1);
  });

  it('cambiar la cotización después de aprobar invalida la aprobación; una pendiente anterior queda INVALIDADA', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const [s] = await solicitudes(cot.id);
    await como(admin).post(`/autorizaciones/${s.id}/aprobar`).expect(201);
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(200);

    // Sube el descuento: la aprobación era para 10 %, no para 30 %. La enviada vuelve a borrador.
    const mayor = conDescuento(); mayor.detalles[0].descuento = 30;
    const editada = (await como(cajero).put(`/cotizaciones/${cot.id}`, mayor).expect(200)).body;
    expect(editada).toMatchObject({ estado: 'BORRADOR', autorizacionDescuento: { estado: 'PENDIENTE' } });
    await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(409);

    // Cambia la cantidad con la solicitud pendiente: la anterior se invalida y nace otra para el contenido nuevo.
    const otraCantidad = conDescuento(); otraCantidad.detalles[0].descuento = 30; otraCantidad.detalles[1].cantidad = 3;
    await como(cajero).put(`/cotizaciones/${cot.id}`, otraCantidad).expect(200);
    // La aprobación original queda INVALIDADA para siempre; conserva quién la aprobó (decisor) y el motivo dice por qué cayó.
    expect((await solicitudes(cot.id)).map((x) => [x.estado, x.decisorId])).toEqual([['INVALIDADA', admin], ['INVALIDADA', cajero], ['PENDIENTE', null]]);
    expect((await solicitudes(cot.id))[0].motivoDecision).toMatch(/cambió después de aprobarse/);
    // La solicitud invalidada ya no se puede aprobar.
    const invalidada = (await solicitudes(cot.id))[1];
    await como(admin).post(`/autorizaciones/${invalidada.id}/aprobar`).expect(409);

    // Volver al contenido que el ADMIN aprobó al principio NO recupera esa aprobación: hace falta una nueva.
    const deVuelta = (await como(cajero).put(`/cotizaciones/${cot.id}`, conDescuento()).expect(200)).body;
    expect(deVuelta.autorizacionDescuento).toMatchObject({ estado: 'PENDIENTE', solicitanteId: cajero });
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(409);
    await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(409);

    // Quitar el descuento en la edición: no requiere autorización.
    const limpia = (await como(cajero).put(`/cotizaciones/${cot.id}`, sinDescuento()).expect(200)).body;
    expect(limpia.autorizacionDescuento).toMatchObject({ requerida: false });
    expect(await prisma.solicitudAutorizacion.count({ where: { tenantId, entidadId: cot.id, estado: 'PENDIENTE' } })).toBe(0);
  });

  it('aprobar → editar → restaurar el contenido aprobado: sigue bloqueada hasta una aprobación nueva explícita', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const [primera] = await solicitudes(cot.id);
    await como(admin).post(`/autorizaciones/${primera.id}/aprobar`).expect(201);
    const cambiada = conDescuento(); cambiada.detalles[1].cantidad = 2;
    await como(cajero).put(`/cotizaciones/${cot.id}`, cambiada).expect(200);
    const restaurada = (await como(cajero).put(`/cotizaciones/${cot.id}`, conDescuento()).expect(200)).body;
    expect(restaurada.autorizacionDescuento.estado).toBe('PENDIENTE');
    expect((await prisma.solicitudAutorizacion.findUniqueOrThrow({ where: { id: primera.id } }))).toMatchObject({ estado: 'INVALIDADA', decisorId: admin });
    // La aprobación invalidada no puede volver a decidirse.
    await como(admin).post(`/autorizaciones/${primera.id}/aprobar`).expect(409);
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(409);
    await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(409);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    // Solo una aprobación nueva y explícita la desbloquea.
    const nueva = await prisma.solicitudAutorizacion.findFirstOrThrow({ where: { tenantId, entidadId: cot.id, estado: 'PENDIENTE' } });
    expect(nueva.id).not.toBe(primera.id);
    await como(admin2).post(`/autorizaciones/${nueva.id}/aprobar`).expect(201);
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(200);
    expect((await auditoria('AUTORIZACION_INVALIDADA')).some((a) => a.entidadId === primera.id)).toBe(true);
  });

  it('aprobar → quitar el descuento (editando o con «quitar descuento») → volver a ponerlo: exige aprobación nueva', async () => {
    for (const quitar of ['editar', 'quitar-descuento'] as const) {
      const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
      const [primera] = await solicitudes(cot.id);
      await como(admin).post(`/autorizaciones/${primera.id}/aprobar`).expect(201);
      if (quitar === 'editar') await como(cajero).put(`/cotizaciones/${cot.id}`, sinDescuento()).expect(200);
      else await como(cajero).post(`/cotizaciones/${cot.id}/quitar-descuento`).expect(201);
      expect((await prisma.solicitudAutorizacion.findUniqueOrThrow({ where: { id: primera.id } })).estado).toBe('INVALIDADA');
      const otraVez = (await como(cajero).put(`/cotizaciones/${cot.id}`, conDescuento()).expect(200)).body;
      expect(otraVez.autorizacionDescuento.estado, quitar).toBe('PENDIENTE');
      await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(409);
    }
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });

  it('una aprobación no sirve si la cotización cambió por otra vía después de la solicitud (409, sin aprobar)', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const [s] = await solicitudes(cot.id);
    // Cambio directo en base (p. ej. un dato antiguo): la huella ya no coincide.
    await prisma.cotizacion.update({ where: { id: cot.id }, data: { total: 1 } });
    const r = await como(admin).post(`/autorizaciones/${s.id}/aprobar`).expect(409);
    expect(r.body.message).toMatch(/cambió después de la solicitud/);
    expect((await prisma.solicitudAutorizacion.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('PENDIENTE');
  });

  it('dos ADMIN deciden a la vez: gana la primera decisión y la otra recibe 409', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const [s] = await solicitudes(cot.id);
    const respuestas = await Promise.all([
      como(admin).post(`/autorizaciones/${s.id}/aprobar`),
      como(admin2).post(`/autorizaciones/${s.id}/rechazar`, { motivo: 'No' }),
    ]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const final = await prisma.solicitudAutorizacion.findUniqueOrThrow({ where: { id: s.id } });
    const ganadora = respuestas.find((r) => r.status === 201)!.body;
    expect(final).toMatchObject({ estado: ganadora.estado, decisorId: ganadora.decisorId });
    expect((await auditoria('AUTORIZACION_APROBADA')).length + (await auditoria('AUTORIZACION_RECHAZADA')).length).toBe(1);
  });

  it('solo ADMIN de la misma empresa decide; un ADMIN degradado con token antiguo no aprueba', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const [s] = await solicitudes(cot.id);
    await como(cajero).post(`/autorizaciones/${s.id}/aprobar`).expect(403);
    await como(cajero).post(`/autorizaciones/${s.id}/rechazar`).expect(403);
    await como(adminOtro, otroTenantId).post(`/autorizaciones/${s.id}/aprobar`).expect(404);
    await como(adminOtro, otroTenantId).get(`/autorizaciones/${s.id}`).expect(404);
    expect((await como(adminOtro, otroTenantId).get('/autorizaciones').expect(200)).body).toMatchObject({ solicitudes: [], pendientes: 0 });
    await prisma.usuario.update({ where: { id: admin2 }, data: { rol: 'CAJERO' } });
    await como(admin2).post(`/autorizaciones/${s.id}/aprobar`).expect(403);
    expect((await prisma.solicitudAutorizacion.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('PENDIENTE');
  });

  it('guardar nunca aprueba, aunque guarde un ADMIN: hace falta aprobar de forma explícita; duplicar exige autorización nueva', async () => {
    const cot = (await como(admin).post('/cotizaciones', conDescuento()).expect(201)).body;
    expect(cot.autorizacionDescuento).toMatchObject({ estado: 'PENDIENTE', solicitanteId: admin });
    const [s] = await solicitudes(cot.id);
    expect(s).toMatchObject({ estado: 'PENDIENTE', solicitanteId: admin, decisorId: null, decididaAt: null });
    await como(admin).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(409);
    await como(admin).post(`/cotizaciones/${cot.id}/convertir`).expect(409);
    // Volver a guardar el mismo contenido tampoco aprueba.
    await como(admin).put(`/cotizaciones/${cot.id}`, conDescuento()).expect(200);
    expect((await solicitudes(cot.id)).map((x) => x.estado)).toEqual(['PENDIENTE']);
    expect(await auditoria('AUTORIZACION_APROBADA')).toHaveLength(0);
    // Pedirla expresamente tampoco la aprueba.
    await como(admin).post(`/cotizaciones/${cot.id}/autorizacion-descuento`).expect(201);
    expect((await solicitudes(cot.id)).map((x) => x.estado)).toEqual(['PENDIENTE']);
    // Aprobación explícita: el decisor queda registrado aparte de quien guardó.
    const aprobada = (await como(admin2).post(`/autorizaciones/${s.id}/aprobar`).expect(201)).body;
    expect(aprobada).toMatchObject({ estado: 'APROBADA', solicitanteId: admin, decisorId: admin2 });
    await como(admin).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(200);

    const copia = (await como(cajero).post(`/cotizaciones/${cot.id}/duplicar`).expect(201)).body;
    expect(copia.autorizacionDescuento).toMatchObject({ estado: 'PENDIENTE', solicitanteId: cajero });
    await como(cajero).patch(`/cotizaciones/${copia.id}/estado`, { estado: 'ENVIADA' }).expect(409);
  });

  it('cotización con descuento anterior a la regla: bloqueada hasta que se solicita y aprueba', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    // Simula un dato anterior a esta etapa: sin solicitudes registradas.
    await prisma.solicitudAutorizacion.deleteMany({ where: { entidadId: cot.id } });
    const vista = (await como(cajero).get(`/cotizaciones/${cot.id}`).expect(200)).body;
    expect(vista.autorizacionDescuento).toMatchObject({ requerida: true, estado: 'SIN_SOLICITUD' });
    expect((await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(409)).body.estadoAutorizacion).toBe('SIN_SOLICITUD');
    const pedida = (await como(cajero).post(`/cotizaciones/${cot.id}/autorizacion-descuento`).expect(201)).body;
    expect(pedida.autorizacionDescuento).toMatchObject({ estado: 'PENDIENTE', solicitanteId: cajero });
    // Pedirla de nuevo no duplica la pendiente.
    await como(cajero).post(`/cotizaciones/${cot.id}/autorizacion-descuento`).expect(201);
    expect(await prisma.solicitudAutorizacion.count({ where: { entidadId: cot.id, estado: 'PENDIENTE' } })).toBe(1);
    // Sin descuento no hay nada que pedir.
    const limpia = (await como(cajero).post('/cotizaciones', sinDescuento()).expect(201)).body;
    await como(cajero).post(`/cotizaciones/${limpia.id}/autorizacion-descuento`).expect(400);
  });

  it('sin descuento todo sigue igual: sin solicitudes, se envía y se convierte', async () => {
    const cot = (await como(cajero).post('/cotizaciones', sinDescuento()).expect(201)).body;
    expect(cot.autorizacionDescuento).toMatchObject({ requerida: false, estado: 'NO_REQUERIDA' });
    await como(cajero).patch(`/cotizaciones/${cot.id}/estado`, { estado: 'ENVIADA' }).expect(200);
    await como(cajero).post(`/cotizaciones/${cot.id}/convertir`).expect(201);
    expect(await prisma.solicitudAutorizacion.count({ where: { tenantId } })).toBe(0);
  });

  it('la base impide dos solicitudes pendientes para la misma cotización y una decisión sin autor', async () => {
    const cot = (await como(cajero).post('/cotizaciones', conDescuento()).expect(201)).body;
    const insertar = (estado: string, decisor: string | null) => prisma.$executeRawUnsafe(
      `INSERT INTO solicitudes_autorizacion (id, tenant_id, tipo, estado, entidad_id, operacion_hash, solicitante_id, decisor_id, decidida_at)
       VALUES ($1, $2, 'DESCUENTO_COTIZACION', $3::"EstadoSolicitudAutorizacion", $4, 'x', $5, $6, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END)`,
      randomUUID(), tenantId, estado, cot.id, cajero, decisor);
    await expect(insertar('PENDIENTE', null)).rejects.toThrow(/23505.*\(tenant_id, tipo, entidad_id\)/);
    await expect(insertar('APROBADA', null)).rejects.toThrow(/23514|solicitudes_autorizacion_decision_chk/);
    // El solicitante debe existir (la empresa la exige el servicio; ver la prueba de aislamiento).
    await expect(prisma.$executeRawUnsafe(
      `INSERT INTO solicitudes_autorizacion (id, tenant_id, tipo, entidad_id, operacion_hash, solicitante_id) VALUES ($1, $2, 'DESCUENTO_COTIZACION', $3, 'x', $4)`,
      randomUUID(), tenantId, randomUUID(), randomUUID())).rejects.toThrow(/23503|solicitudes_autorizacion_solicitante_fkey/);
  });
});
