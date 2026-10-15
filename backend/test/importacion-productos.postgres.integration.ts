import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import * as express from 'express';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CashierResponseInterceptor } from '../src/common/interceptors/cashier-response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductosController } from '../src/productos/productos.controller';
import { ProductosService } from '../src/productos/productos.service';

// Importación masiva de productos (P0/P1 de la auditoría 12/10). Clúster PostgreSQL desechable; nunca toca datos reales.
describe('Importación masiva de productos / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;
  let tenantId: string, otherTenantId: string, categoriaId: string;
  const users: Record<string, { id: string; token: string }> = {};
  const importar = (role: string, body: unknown) => request(app.getHttpServer())
    .post('/productos/importacion').auth(users[role].token, { type: 'bearer' }).send(body as object);
  const lista = (role: string, path = '/productos') => request(app.getHttpServer())
    .get(path).auth(users[role].token, { type: 'bearer' });
  const fila = (extra: Record<string, unknown> = {}) => ({ codigo: `P-${randomUUID().slice(0, 8)}`, nombre: 'Producto importado', stockActual: '5', stockMinimo: '2', unidadMedida: 'UNIDAD', ...extra });
  const lote = (filas: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({ solicitudId: randomUUID(), filas, ...extra });
  const countProductos = () => prisma.producto.count({ where: { tenantId } });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-importacion-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [ProductosController],
      providers: [ProductosService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    // Mismo analizador que main.ts: JSON de hasta 2 MB; sin él, una importación de cientos de filas se rechazaría.
    app = module.createNestApplication({ bodyParser: false });
    app.use(express.json({ limit: '2mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 120000);
  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-importacion-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });
  beforeEach(async () => {
    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Importación synthetic' } });
    for (const rol of ['ADMIN', 'BODEGUERO', 'CAJERO'] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'not-a-login-password', rol, permisosConfigurados: true, permisos: ['inventario.ver', 'inventario.editar'] } });
      users[rol] = { id, token: jwt.sign({ sub: id, tenantId, type: 'tenant' }) };
    }
    categoriaId = (await prisma.categoria.create({ data: { tenantId, nombre: 'TORNILLERÍA' } })).id;
  });

  it('ADMIN: los precios del archivo se guardan; con aprobarPrecios quedan aprobados y sin precio queda SIN_PRECIO', async () => {
    const res = await importar('ADMIN', lote([
      fila({ codigo: 'CLV-1', nombre: 'Clavo de acero', codigoBarras: '7501000000011', precioVenta: '85.00', precioCosto: '50.00' }),
      fila({ codigo: 'CLV-2', nombre: 'Clavo 3', precioVenta: '' }),
      fila({ codigo: 'CLV-3', nombre: 'Clavo 4', precioCosto: '0' }),
    ], { aprobarPrecios: true })).expect(201);
    expect(res.body).toMatchObject({ resultado: 'APLICADA', creados: 3, actualizados: 0, omitidos: 0, reintento: false });
    expect(res.body.filas.map((f: any) => f.estadoPrecio)).toEqual(['APROBADO', 'SIN_PRECIO', 'SIN_PRECIO']);
    const clavo = await prisma.producto.findFirstOrThrow({ where: { tenantId, codigo: 'CLV-1' } });
    expect(clavo).toMatchObject({ precioAprobado: true, codigoBarras: '7501000000011' });
    expect(Number(clavo.precioVenta)).toBe(85);
    expect(Number(clavo.precioCosto)).toBe(50);
    expect(Number(clavo.costoVigente)).toBe(50);
    expect(clavo.precioAprobadoPor).toBe(users.ADMIN.id);
    const sinPrecio = await prisma.producto.findFirstOrThrow({ where: { tenantId, codigo: 'CLV-2' } });
    expect(sinPrecio).toMatchObject({ precioAprobado: false });
    expect(Number(sinPrecio.precioVenta)).toBe(0);
    const costoCero = await prisma.producto.findFirstOrThrow({ where: { tenantId, codigo: 'CLV-3' } });
    expect(Number(costoCero.precioCosto)).toBe(0);
    // El estado queda disponible para la interfaz en el listado.
    const listado = await lista('ADMIN').expect(200);
    expect(listado.body.find((p: any) => p.codigo === 'CLV-1')).toMatchObject({ estadoPrecio: 'APROBADO', precioVenta: 85, precioCosto: 50 });
    expect(listado.body.find((p: any) => p.codigo === 'CLV-2')).toMatchObject({ estadoPrecio: 'SIN_PRECIO', pendienteConfiguracion: true });
  });

  it('ADMIN sin aprobarPrecios: el precio del archivo queda PENDIENTE_APROBACION y no se puede vender', async () => {
    const res = await importar('ADMIN', lote([fila({ codigo: 'PEND-1', precioVenta: '12.50', precioCosto: '7' })])).expect(201);
    expect(res.body.filas[0]).toMatchObject({ accion: 'CREADO', estadoPrecio: 'PENDIENTE_APROBACION' });
    const p = await prisma.producto.findFirstOrThrow({ where: { tenantId, codigo: 'PEND-1' } });
    expect(p).toMatchObject({ precioAprobado: false });
    expect(Number(p.precioVenta)).toBe(12.5);
    const listado = await lista('ADMIN', '/productos/comercial').expect(200);
    expect(listado.body.find((x: any) => x.codigo === 'PEND-1')).toBeUndefined();
  });

  it('BODEGUERO: importa sin precios, recibe el resumen sin filtro de costos y no puede enviar ni aprobar precios', async () => {
    const ok = await importar('BODEGUERO', lote([fila({ codigo: 'BOD-1' })])).expect(201);
    expect(ok.body).toMatchObject({ resultado: 'APLICADA', creados: 1 });
    expect(ok.body.filas[0]).toMatchObject({ accion: 'CREADO', estadoPrecio: 'SIN_PRECIO' });
    await importar('BODEGUERO', lote([fila({ codigo: 'BOD-2', precioVenta: '5' })])).expect(403);
    await importar('BODEGUERO', lote([fila({ codigo: 'BOD-3' })], { aprobarPrecios: true })).expect(403);
    await importar('CAJERO', lote([fila({ codigo: 'CAJ-1' })])).expect(403);
    expect(await prisma.producto.count({ where: { tenantId, codigo: { in: ['BOD-2', 'BOD-3', 'CAJ-1'] } } })).toBe(0);
  });

  it('todo o nada: un error en una fila no crea ninguna otra fila del archivo', async () => {
    const antes = await countProductos();
    const res = await importar('ADMIN', lote([
      fila({ codigo: 'OK-1', nombre: 'Válido uno' }),
      fila({ codigo: 'MAL-1', nombre: 'Precio negativo', precioVenta: '-15.00' }),
      fila({ codigo: 'OK-2', nombre: 'Válido dos' }),
    ])).expect(400);
    expect(res.body.code).toBe('IMPORTACION_INVALIDA');
    expect(res.body.errores).toEqual([expect.objectContaining({ fila: 2, codigo: 'MAL-1', campo: 'precioVenta' })]);
    expect(res.body.message).toMatch(/no se guardó ninguna fila/);
    expect(await countProductos()).toBe(antes);
  });

  it('rechaza duplicados dentro del archivo y contra la base de datos (código de barras y código)', async () => {
    await prisma.producto.create({ data: { tenantId, codigo: 'EXIST-1', codigoBarras: '7509999999999', nombre: 'Existente', precioVenta: 10, precioCosto: 5, precioAprobado: true, stockActual: 1, stockMinimo: 0 } });
    const antes = await countProductos();
    const res = await importar('ADMIN', lote([
      fila({ codigo: 'DUP-A', nombre: 'Uno', codigoBarras: '7501112223334' }),
      fila({ codigo: 'dup-a', nombre: 'Dos', codigoBarras: '7501112223335' }),
      fila({ codigo: 'DUP-C', nombre: 'Tres', codigoBarras: '7501112223334' }),
      fila({ codigo: 'DUP-D', nombre: 'Cuatro', codigoBarras: '7509999999999' }),
    ])).expect(400);
    const campos = res.body.errores.map((e: any) => `${e.fila}:${e.campo}`);
    expect(campos).toEqual(expect.arrayContaining(['1:codigo', '2:codigo', '1:codigoBarras', '3:codigoBarras', '4:codigoBarras']));
    expect(await countProductos()).toBe(antes);
  });

  it('reintento con la misma solicitud no duplica; la misma solicitud con otros datos responde 409', async () => {
    const body = lote([fila({ codigo: 'RET-1' }), fila({ codigo: 'RET-2' })]);
    const primera = await importar('ADMIN', body).expect(201);
    const antes = await countProductos();
    const reintento = await importar('ADMIN', body).expect(201);
    expect(reintento.body).toMatchObject({ reintento: true, creados: 2, resultado: 'APLICADA' });
    expect(reintento.body.filas.map((f: any) => f.productoId)).toEqual(primera.body.filas.map((f: any) => f.productoId));
    expect(await countProductos()).toBe(antes);
    await importar('ADMIN', { solicitudId: body.solicitudId, filas: [fila({ codigo: 'OTRO' })] }).expect(409);
  });

  it('dos envíos simultáneos con la misma solicitud aplican una sola vez', async () => {
    const body = lote([fila({ codigo: 'SIM-1' }), fila({ codigo: 'SIM-2' })]);
    const [a, b] = await Promise.all([importar('ADMIN', body), importar('ADMIN', body)]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect([a.body.reintento, b.body.reintento].sort()).toEqual([false, true]);
    expect(await prisma.producto.count({ where: { tenantId, codigo: { in: ['SIM-1', 'SIM-2'] } } })).toBe(2);
  });

  it('sin sobrescribir, un código existente se omite y su precio no cambia', async () => {
    const p = await prisma.producto.create({ data: { tenantId, codigo: 'OMI-1', nombre: 'Omitido', precioVenta: 20, precioCosto: 10, precioAprobado: true, stockActual: 3, stockMinimo: 0 } });
    const res = await importar('ADMIN', lote([fila({ codigo: 'omi-1', nombre: 'Cambio', precioVenta: '99' })], { aprobarPrecios: true })).expect(201);
    expect(res.body).toMatchObject({ omitidos: 1, creados: 0 });
    expect(res.body.filas[0]).toMatchObject({ accion: 'OMITIDO', estadoPrecio: 'APROBADO' });
    const after = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(after.precioVenta)).toBe(20);
    expect(after.nombre).toBe('Omitido');
  });

  it('sobrescribir no borra precios, costos ni existencias cuando la celda viene vacía', async () => {
    const p = await prisma.producto.create({ data: { tenantId, codigo: 'SOB-1', nombre: 'Conservado', precioVenta: 20, precioCosto: 10, costoVigente: 10, precioAprobado: true, stockActual: 3, stockMinimo: 1 } });
    const res = await importar('ADMIN', lote([fila({ codigo: 'SOB-1', nombre: 'Conservado', precioVenta: '', precioCosto: '', stockActual: '', stockMinimo: '', unidadMedida: '' })], { sobrescribir: true })).expect(201);
    expect(res.body.filas[0]).toMatchObject({ accion: 'SIN_CAMBIOS', estadoPrecio: 'APROBADO' });
    const after = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(after.precioVenta)).toBe(20);
    expect(Number(after.precioCosto)).toBe(10);
    expect(Number(after.stockActual)).toBe(3);
    expect(after.version).toBe(p.version);
  });

  it('sobrescribir con precio nuevo sin aprobarPrecios revoca la aprobación; con aprobarPrecios la confirma', async () => {
    const p = await prisma.producto.create({ data: { tenantId, codigo: 'REV-1', nombre: 'Revocar', precioVenta: 20, precioCosto: 10, costoVigente: 10, precioAprobado: true, stockActual: 0, stockMinimo: 0 } });
    const revoca = await importar('ADMIN', lote([fila({ codigo: 'REV-1', nombre: 'Revocar', precioVenta: '25' })], { sobrescribir: true })).expect(201);
    expect(revoca.body.filas[0]).toMatchObject({ accion: 'ACTUALIZADO', estadoPrecio: 'PENDIENTE_APROBACION' });
    expect(await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ precioAprobado: false });
    const aprueba = await importar('ADMIN', lote([fila({ codigo: 'REV-1', nombre: 'Revocar', precioVenta: '25' })], { sobrescribir: true, aprobarPrecios: true })).expect(201);
    expect(aprueba.body.filas[0]).toMatchObject({ accion: 'ACTUALIZADO', estadoPrecio: 'APROBADO' });
    const final = await prisma.producto.findUniqueOrThrow({ where: { id: p.id } });
    expect(final).toMatchObject({ precioAprobado: true, precioAprobadoPor: users.ADMIN.id });
    expect(Number(final.precioVenta)).toBe(25);
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId, entidadId: p.id, operacion: 'PRECIO_APROBAR' } })).toBe(1);
  });

  it('sobrescribir: el cambio de existencias crea un movimiento AJUSTE y el costo lo fija la última compra (rechazo sin escritura)', async () => {
    const p = await prisma.producto.create({ data: { tenantId, codigo: 'AJU-1', nombre: 'Ajuste', precioVenta: 20, precioCosto: 10, costoVigente: 10, precioAprobado: true, stockActual: 4, stockMinimo: 0 } });
    const ok = await importar('ADMIN', lote([fila({ codigo: 'AJU-1', nombre: 'Ajuste', stockActual: '7.5' })], { sobrescribir: true, motivo: 'Conteo físico' })).expect(201);
    expect(ok.body.filas[0].accion).toBe('ACTUALIZADO');
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).stockActual)).toBe(7.5);
    const mov = await prisma.movimientoInventario.findFirstOrThrow({ where: { tenantId, productoId: p.id, tipo: 'AJUSTE' } });
    expect(mov).toMatchObject({ motivo: 'Conteo físico' });
    expect(Number(mov.anterior)).toBe(4);
    expect(Number(mov.nuevo)).toBe(7.5);
    // Producto con compra recibida: un costo distinto no se importa; el lote entero se rechaza.
    const comprado = await prisma.producto.create({ data: { tenantId, codigo: 'COM-1', nombre: 'Comprado', precioVenta: 20, precioCosto: 10, costoVigente: 10, ultimaCompraAt: new Date(), precioAprobado: true, stockActual: 0, stockMinimo: 0 } });
    const antes = await countProductos();
    const rechazo = await importar('ADMIN', lote([fila({ codigo: 'NUEVO-X' }), fila({ codigo: 'COM-1', nombre: 'Comprado', precioCosto: '12' })], { sobrescribir: true })).expect(400);
    expect(rechazo.body.errores).toEqual([expect.objectContaining({ fila: 2, campo: 'precioCosto' })]);
    expect(await countProductos()).toBe(antes);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: comprado.id } })).precioCosto)).toBe(10);
  });

  it('sobrescribir no baja existencias por debajo de lo reservado para entregas pendientes', async () => {
    await prisma.producto.create({ data: { tenantId, codigo: 'RES-1', nombre: 'Reservado', precioVenta: 20, precioCosto: 10, precioAprobado: true, stockActual: 5, stockReservado: 3, stockMinimo: 0 } });
    const res = await importar('ADMIN', lote([fila({ codigo: 'RES-1', nombre: 'Reservado', stockActual: '2' })], { sobrescribir: true })).expect(400);
    expect(res.body.errores).toEqual([expect.objectContaining({ campo: 'stockActual' })]);
  });

  it('normaliza categorías: reutiliza la existente sin tilde, extra espacios o mayúsculas y crea las nuevas limpias', async () => {
    const res = await importar('ADMIN', lote([
      fila({ codigo: 'CAT-1', categoria: 'tornilleria' }),
      fila({ codigo: 'CAT-2', categoria: '  Herramientas   de  mano ' }),
      fila({ codigo: 'CAT-3', categoria: 'HERRAMIENTAS DE MANO' }),
    ])).expect(201);
    expect(res.body.creados).toBe(3);
    const cats = await prisma.categoria.findMany({ where: { tenantId }, orderBy: { nombre: 'asc' } });
    expect(cats.map(c => c.nombre).sort()).toEqual(['Herramientas de mano', 'TORNILLERÍA']);
    expect((await prisma.producto.findFirstOrThrow({ where: { tenantId, codigo: 'CAT-1' } })).categoriaId).toBe(categoriaId);
    const manos = await prisma.producto.findMany({ where: { tenantId, codigo: { in: ['CAT-2', 'CAT-3'] } } });
    expect(new Set(manos.map(m => m.categoriaId)).size).toBe(1);
  });

  it('advierte (sin bloquear) cuando un nombre ya existe en la base con otro código', async () => {
    await prisma.producto.create({ data: { tenantId, codigo: 'MARTILLO-A', nombre: 'Martillo de prueba', precioVenta: 100, precioCosto: 50, precioAprobado: true, stockActual: 1, stockMinimo: 0 } });
    const res = await importar('ADMIN', lote([fila({ codigo: 'MARTILLO-B', nombre: 'martillo  de prueba', precioVenta: '50' })], { aprobarPrecios: true })).expect(201);
    expect(res.body.creados).toBe(1);
    expect(res.body.advertencias).toEqual([expect.objectContaining({
      fila: 1, tipo: 'NOMBRE_REPETIDO_EN_BASE',
      coincidencias: [expect.objectContaining({ codigo: 'MARTILLO-A', nombre: 'Martillo de prueba', activo: true })],
    })]);
  });

  it('aislamiento entre empresas: el mismo código en otra empresa es un producto distinto', async () => {
    const otro = await prisma.producto.create({ data: { tenantId: otherTenantId, codigo: 'SHARED-1', nombre: 'Ajeno', precioVenta: 1, precioCosto: 1, precioAprobado: true, stockActual: 9, stockMinimo: 0 } });
    const res = await importar('ADMIN', lote([fila({ codigo: 'SHARED-1', nombre: 'Propio' })])).expect(201);
    expect(res.body.creados).toBe(1);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: otro.id } })).stockActual)).toBe(9);
    expect(await prisma.producto.count({ where: { tenantId, codigo: 'SHARED-1' } })).toBe(1);
  });

  it('auditoría por usuario: cada alta, edición y el resumen quedan registrados con el responsable', async () => {
    const res = await importar('ADMIN', lote([fila({ codigo: 'AUD-1' })])).expect(201);
    const productoId = res.body.filas[0].productoId;
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId, usuarioId: users.ADMIN.id, operacion: 'PRODUCTO_CREAR', entidadId: productoId } })).toBe(1);
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId, usuarioId: users.ADMIN.id, operacion: 'IMPORTAR_PRODUCTOS' } })).toBe(1);
  });

  it('acepta un archivo mayor que el límite por defecto de Express (100 kB) y rechaza más de 5000 filas', async () => {
    const filas = Array.from({ length: 1500 }, (_, i) => fila({ codigo: `GRANDE-${i}`, nombre: `Producto grande número ${i} con descripción larga para ocupar espacio` }));
    const grande = await importar('ADMIN', lote(filas)).expect(201);
    expect(grande.body.creados).toBe(1500);
    const demasiadas = Array.from({ length: 5001 }, (_, i) => ({ codigo: `X-${i}`, nombre: 'x' }));
    await importar('ADMIN', lote(demasiadas)).expect(400);
  }, 120000);

  it('rechaza un identificador de solicitud que no es UUID v4 y un archivo vacío', async () => {
    await importar('ADMIN', { solicitudId: 'no-es-uuid', filas: [fila()] }).expect(400);
    await importar('ADMIN', lote([])).expect(400);
  });
});
