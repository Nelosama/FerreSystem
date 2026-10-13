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
import { ProductosController } from '../src/productos/productos.controller';
import { ProductosService } from '../src/productos/productos.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';

// FS-07: edición de productos contra PostgreSQL real, por HTTP, con JWT y aislamiento de tenants.
// Crea un clúster temporal exclusivo; nunca lee DATABASE_URL.
describe('FS-07 / edición de productos con PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;
  let tenantId: string, otherTenantId: string;
  const users: Record<string, { id: string; token: string }> = {};
  const call = (method: 'get' | 'post' | 'put' | 'delete', path: string, body = {}, role = 'ADMIN') =>
    request(app.getHttpServer())[method](`/api${path}`).auth(users[role].token, { type: 'bearer' }).send(body);
  const alta = (body: any = {}, role = 'ADMIN') => {
    const { margen, precioVenta, precioCosto, ...sinPrecio } = body;
    // Precios y margen: solo ADMIN en el alta (el margen se calcula, no se captura).
    const precios = role === 'ADMIN' ? { precioCosto: 8, precioVenta: 12, ...(precioCosto !== undefined ? { precioCosto } : {}), ...(precioVenta !== undefined ? { precioVenta } : {}) } : {};
    return call('post', '/productos', {
      codigo: `P-${randomUUID().slice(0, 8)}`, nombre: 'Producto de prueba', stockActual: 40, stockMinimo: 5, unidadMedida: 'METRO', ...sinPrecio, ...precios,
    }, role);
  };
  const editar = (id: string, body: any, role = 'ADMIN') => call('put', `/productos/${id}`, body, role);
  // Precio y aprobación: única ruta de cambio de precio (solo ADMIN).
  const precios = (id: string, body: any, role = 'ADMIN') => call('patch', `/productos/${id}/precios`, body, role);
  const fila = (id: string) => prisma.producto.findUniqueOrThrow({ where: { id } });
  const auditoria = (entidadId: string, operacion = 'PRODUCTO_EDITAR') => prisma.$queryRawUnsafe<{ usuario_id: string; datos: any }[]>(
    "SELECT usuario_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion=$3 AND entidad_id=$2 ORDER BY created_at", tenantId, entidadId, operacion);

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-fs07-'));
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
    const module = await Test.createTestingModule({
      controllers: [ProductosController],
      providers: [ProductosService, JwtStrategy,
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-fs07-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); otherTenantId = randomUUID();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, nombreComercial: 'Edición de productos' } });
    for (const rol of ['ADMIN', 'BODEGUERO', 'CAJERO'] as const) {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol, permisosConfigurados: true, permisos: ['inventario.editar', 'inventario.ver'] } });
      users[rol] = { id, token: jwt.sign({ sub: id, tenantId, type: 'tenant' }) };
    }
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: otherTenantId, nombre: 'Ajeno', email: `${id}@test.invalid`, passwordHash: 'not-a-password', rol: 'ADMIN' } });
    users.OTHER = { id, token: jwt.sign({ sub: id, tenantId: otherTenantId, type: 'tenant' }) };
  });

  it('una edición parcial conserva todos los campos que no se enviaron (FS-07)', async () => {
    const creado = (await alta({ codigo: 'CAB-1', nombre: 'Cable', codigoBarras: '7701', codigoFabricante: 'FAB-9', descripcion: 'Rollo 100 m', marca: 'Truper', categoria: 'Electricidad', precioVenta: 12, precioCosto: 8, stockActual: 40, stockMinimo: 5 }).expect(201)).body;
    const antes = await fila(creado.id);
    await editar(creado.id, { version: creado.version, nombre: 'Cable reforzado' }).expect(200);
    const despues = await fila(creado.id);
    expect(despues.nombre).toBe('Cable reforzado');
    for (const campo of ['codigo', 'codigoBarras', 'codigoFabricante', 'descripcion', 'marca', 'categoriaId', 'unidadMedida', 'usaMedida', 'margen', 'precioVenta', 'precioCosto', 'stockActual', 'stockMinimo', 'activo', 'imagenUrl'] as const) {
      expect(String(despues[campo])).toBe(String(antes[campo]));
    }
    expect(despues.version).toBe(2);
  });

  it('una versión obsoleta se rechaza y no revierte existencias ajenas (FS-07)', async () => {
    const p = (await alta({ stockActual: 40 }).expect(201)).body;
    await editar(p.id, { version: p.version, nombre: 'Nuevo nombre' }).expect(200);
    const rechazo = await editar(p.id, { version: p.version, stockActual: 99, motivo: 'Formulario antiguo' }).expect(409);
    expect(rechazo.body.code).toBe('PRODUCTO_VERSION');
    expect(Number((await fila(p.id)).stockActual)).toBe(40);
  });

  it('dos ediciones simultáneas: una gana y la otra se rechaza sin sobrescribir en silencio (FS-07)', async () => {
    const p = (await alta().expect(201)).body;
    const [a, b] = await Promise.all([editar(p.id, { version: 1, nombre: 'Edición A' }), editar(p.id, { version: 1, nombre: 'Edición B' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const ganador = a.status === 200 ? 'Edición A' : 'Edición B';
    expect((await fila(p.id)).nombre).toBe(ganador);
  });

  it('reintentar una edición ya aplicada no la repite: responde conflicto y la versión no avanza (FS-07)', async () => {
    const p = (await alta().expect(201)).body;
    const cuerpo = { version: 1, precioVenta: 15 };
    await precios(p.id, cuerpo).expect(200);
    await precios(p.id, cuerpo).expect(409);
    const f = await fila(p.id);
    expect(Number(f.precioVenta)).toBe(15);
    expect(f.version).toBe(2);
  });

  it('cambia código interno y código de barras, y la auditoría registra antes y después (FS-07)', async () => {
    const p = (await alta({ codigo: 'A-1', codigoBarras: '111' }).expect(201)).body;
    await editar(p.id, { version: 1, codigo: 'a-2', codigoBarras: '333' }).expect(200);
    expect(await fila(p.id)).toMatchObject({ codigo: 'A-2', codigoBarras: '333' });
    const [registro] = await auditoria(p.id);
    expect(registro.datos.cambios).toMatchObject({ codigo: { anterior: 'A-1', nuevo: 'A-2' }, codigoBarras: { anterior: '111', nuevo: '333' } });
    expect(registro.usuario_id).toBe(users.ADMIN.id);
  });

  it('no permite códigos internos ni de barras repetidos en la misma empresa, activos o inactivos (FS-07)', async () => {
    const a = (await alta({ codigo: 'DUP-A', codigoBarras: '111' }).expect(201)).body;
    const b = (await alta({ codigo: 'DUP-B', codigoBarras: '222' }).expect(201)).body;
    await editar(b.id, { version: 1, codigo: 'dup-a' }).expect(409);
    await editar(b.id, { version: 1, codigoBarras: '111' }).expect(409);
    await editar(a.id, { version: 1, activo: false }).expect(200);
    await alta({ codigo: 'DUP-C', codigoBarras: '111' }).expect(409);
    await editar(b.id, { version: 1, codigoBarras: '111' }).expect(409);
  });

  it('otra empresa puede usar los mismos códigos y no puede editar productos ajenos (FS-07)', async () => {
    const p = (await alta({ codigo: 'COMUN-1', codigoBarras: '999' }).expect(201)).body;
    await call('post', '/productos', { codigo: 'COMUN-1', codigoBarras: '999', nombre: 'Ajeno', precioCosto: 1, precioVenta: 2, stockActual: 0, stockMinimo: 0 }, 'OTHER').expect(201);
    await editar(p.id, { version: 1, nombre: 'Intento ajeno' }, 'OTHER').expect(404);
    expect((await fila(p.id)).nombre).toBe('Producto de prueba');
  });

  it('CAJERO no edita y BODEGUERO no puede desactivar; ADMIN sí (FS-07)', async () => {
    const p = (await alta().expect(201)).body;
    await editar(p.id, { version: 1, nombre: 'Cajero' }, 'CAJERO').expect(403);
    await editar(p.id, { version: 1, activo: false }, 'BODEGUERO').expect(403);
    expect((await fila(p.id)).activo).toBe(true);
    await editar(p.id, { version: 1, nombre: 'Bodega' }, 'BODEGUERO').expect(200);
    await editar(p.id, { version: 2, activo: false }, 'ADMIN').expect(200);
    expect((await fila(p.id)).activo).toBe(false);
  });

  it('solo el administrador puede listar productos inactivos (BODEGUERO y CAJERO reciben 403)', async () => {
    const p = (await alta().expect(201)).body;
    await editar(p.id, { version: 1, activo: false }).expect(200);
    await call('get', '/productos?incluirInactivos=true', {}, 'BODEGUERO').expect(403);
    await call('get', '/productos?incluirInactivos=true', {}, 'CAJERO').expect(403);
    const admin = (await call('get', '/productos?incluirInactivos=true', {}, 'ADMIN').expect(200)).body;
    expect(admin.some((x: any) => x.id === p.id)).toBe(true);
    const normalBodeguero = (await call('get', '/productos', {}, 'BODEGUERO').expect(200)).body;
    expect(normalBodeguero.some((x: any) => x.id === p.id)).toBe(false);
  });

  it('un producto inactivo sale del listado normal, aparece con incluirInactivos y se reactiva (FS-07)', async () => {
    const p = (await alta().expect(201)).body;
    await editar(p.id, { version: 1, activo: false }).expect(200);
    const normal = (await call('get', '/productos').expect(200)).body;
    expect(normal.some((x: any) => x.id === p.id)).toBe(false);
    const todos = (await call('get', '/productos?incluirInactivos=true').expect(200)).body;
    const inactivo = todos.find((x: any) => x.id === p.id);
    expect(inactivo.activo).toBe(false);
    await editar(p.id, { version: inactivo.version, activo: true }).expect(200);
    expect((await fila(p.id)).activo).toBe(true);
  });

  it('cambiar nombre, marca o categoría no altera existencias ni registra movimientos (FS-07)', async () => {
    const p = (await alta({ stockActual: 40, marca: 'Truper', categoria: 'Electricidad' }).expect(201)).body;
    const movimientosAntes = await prisma.movimientoInventario.count({ where: { productoId: p.id } });
    await editar(p.id, { version: 1, nombre: 'Otro', marca: 'Stanley', categoria: 'Herramientas' }).expect(200);
    expect(Number((await fila(p.id)).stockActual)).toBe(40);
    expect(await prisma.movimientoInventario.count({ where: { productoId: p.id } })).toBe(movimientosAntes);
  });

  it('cambiar existencias con motivo genera AJUSTE y queda auditado con el valor anterior (FS-07)', async () => {
    const p = (await alta({ stockActual: 40 }).expect(201)).body;
    await editar(p.id, { version: 1, stockAnterior: 40, stockActual: 35, motivo: 'Merma verificada' }).expect(200);
    expect(Number((await fila(p.id)).stockActual)).toBe(35);
    const ajustes = await prisma.movimientoInventario.findMany({ where: { productoId: p.id, tipo: 'AJUSTE' } });
    expect(ajustes).toHaveLength(1);
    const [registro] = await auditoria(p.id);
    expect(registro.datos.cambios.stockActual).toEqual({ anterior: 40, nuevo: 35 });
    expect(registro.datos.motivo).toBe('Merma verificada');
  });

  it('un cambio de precio y costo no modifica ventas anteriores y queda trazado en auditoría (FS-07)', async () => {
    const p = (await alta({ precioVenta: 12, precioCosto: 8 }).expect(201)).body;
    const venta = await prisma.venta.create({ data: { tenantId, numeroVenta: 1, usuarioId: users.ADMIN.id, subtotal: 12, isv: 0, total: 12, detalles: { create: [{ productoId: p.id, cantidad: 1, precioUnitario: 12, subtotal: 12 }] } } });
    await precios(p.id, { version: 1, precioVenta: 20, precioCosto: 9 }).expect(200);
    const historica = await prisma.venta.findUniqueOrThrow({ where: { id: venta.id }, include: { detalles: true } });
    expect(Number(historica.total)).toBe(12);
    expect(Number(historica.detalles[0].precioUnitario)).toBe(12);
    const [registro] = await auditoria(p.id, 'PRECIO_MODIFICAR');
    expect(registro.datos.cambios).toMatchObject({ precioVenta: { anterior: 12, nuevo: 20 }, precioCosto: { anterior: 8, nuevo: 9 } });
  });

  it('la unidad de medida solo cambia sin existencias ni movimientos distintos del alta (FS-07)', async () => {
    const p = (await alta({ stockActual: 0, unidadMedida: 'METRO' }).expect(201)).body;
    const cambio = (await editar(p.id, { version: 1, unidadMedida: 'PIE' }).expect(200)).body;
    expect(await fila(p.id)).toMatchObject({ unidadMedida: 'PIE' });
    await editar(p.id, { version: cambio.version, stockAnterior: 0, stockActual: 5, motivo: 'Entrada' }).expect(200);
    await editar(p.id, { version: cambio.version + 1, unidadMedida: 'LITRO' }).expect(409);
    expect((await fila(p.id)).unidadMedida).toBe('PIE');
  });

  it('marca y categoría persisten; un valor vacío en una actualización parcial no las borra (FS-07)', async () => {
    const p = (await alta({ marca: 'Truper', categoria: 'Electricidad' }).expect(201)).body;
    const categoriaId = (await fila(p.id)).categoriaId;
    expect(categoriaId).not.toBeNull();
    await editar(p.id, { version: 1, marca: '', categoria: '' }).expect(200);
    expect(await fila(p.id)).toMatchObject({ marca: 'Truper', categoriaId });
    await editar(p.id, { version: 2, marca: 'Stanley' }).expect(200);
    expect((await fila(p.id)).marca).toBe('Stanley');
  });

  it('la edición sin versión se rechaza por validación: no hay escritura a ciegas (FS-07)', async () => {
    const p = (await alta().expect(201)).body;
    await editar(p.id, { nombre: 'Sin versión' }).expect(400);
    expect((await fila(p.id)).nombre).toBe('Producto de prueba');
  });
  it('alta sin código con reintento concurrente persiste un solo producto y movimiento inicial', async () => {
    const solicitudId = randomUUID();
    // BODEGUERO registra sin precio: el producto queda pendiente de configuración (decisión 3).
    const body = { codigo: '', nombre: 'Canaleta blanca 4 pulgadas', stockActual: 12.75, solicitudId, precioCosto: undefined, precioVenta: undefined };
    const [a, b] = await Promise.all([alta(body, 'BODEGUERO'), alta(body, 'BODEGUERO')]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.producto.count({ where: { tenantId } })).toBe(1);
    expect(Number((await fila(a.body.id)).stockActual)).toBe(12.75);
    const movimientos = await prisma.movimientoInventario.findMany({ where: { tenantId } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ usuarioId: users.BODEGUERO.id, tipo: 'INICIAL', motivo: 'Alta inicial de producto' });
    expect(movimientos[0].createdAt).toBeInstanceOf(Date);
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId, operacion: 'PRODUCTO_CREAR' } })).toBe(1);
    await alta({ ...body, stockActual: 20 }, 'BODEGUERO').expect(409);
    expect(Number((await fila(a.body.id)).stockActual)).toBe(12.75);
    await alta(body, 'OTHER').expect(201);
    expect(await prisma.producto.count({ where: { tenantId: otherTenantId } })).toBe(1);
  });

  it('busca por descripción, código y categoría real sin mezclar empresas', async () => {
    const p = (await alta({ codigo: 'LAM-14', nombre: 'Lámina roja calibre 26', descripcion: 'Espesor 0.45 mm', categoria: 'Techos metálicos' }).expect(201)).body;
    for (const search of ['LAM-14', '0.45', ' techos metálicos ']) {
      const encontrados = (await call('get', '/productos?search=' + encodeURIComponent(search)).expect(200)).body;
      expect(encontrados.map((x: any) => x.id)).toEqual([p.id]);
      expect((await call('get', '/productos?search=' + encodeURIComponent(search), {}, 'OTHER').expect(200)).body).toEqual([]);
    }
  });

  it('null en una edición no borra cantidades o precios ni provoca error interno', async () => {
    const p = (await alta().expect(201)).body;
    for (const field of ['stockActual', 'precioCosto', 'precioVenta', 'codigoBarras', 'nombre', 'unidadMedida']) {
      await editar(p.id, { version: 1, [field]: null, motivo: 'Entrada inválida' }).expect(400);
    }
    expect((await fila(p.id)).version).toBe(1);
    expect(Number((await fila(p.id)).stockActual)).toBe(40);
  });

  it('la baja lógica invalida formularios abiertos y no puede reactivarse con una versión vieja', async () => {
    const p = (await alta().expect(201)).body;
    await call('delete', '/productos/' + p.id).expect(200);
    await editar(p.id, { version: 1, activo: true }).expect(409);
    expect((await fila(p.id)).activo).toBe(false);
  });

  it('cantidades decimales en entradas y salidas auditadas, y reintento sin movimiento duplicado', async () => {
    const p = (await alta({ stockActual: 12.75 }).expect(201)).body;
    await editar(p.id, { version: 1, stockAnterior: 12.75, stockActual: 14.25, motivo: 'Conteo adicional' }, 'BODEGUERO').expect(200);
    await editar(p.id, { version: 2, stockAnterior: 14.25, stockActual: 13.5, motivo: 'Merma verificada' }, 'BODEGUERO').expect(200);
    await editar(p.id, { version: 2, stockAnterior: 14.25, stockActual: 13.5, motivo: 'Merma verificada' }, 'BODEGUERO').expect(409);
    const movimientos = await prisma.movimientoInventario.findMany({ where: { productoId: p.id, tipo: 'AJUSTE' }, orderBy: { createdAt: 'asc' } });
    expect(movimientos.map(m => Number(m.cantidad))).toEqual([1.5, -0.75]);
    expect(Number((await fila(p.id)).stockActual)).toBe(13.5);
    expect(movimientos.every(m => m.usuarioId === users.BODEGUERO.id && !!m.motivo)).toBe(true);
  });

  it('si falla la auditoría al final del alta revierte producto, categoría y movimiento', async () => {
    // Fallo PostgreSQL posterior a las escrituras: comprueba rollback real, no un mock.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION entrega_fallo_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id = '${tenantId}' THEN RAISE EXCEPTION 'fallo sintético de auditoría'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER entrega_fallo BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION entrega_fallo_audit()');
    const body = { codigo: '', categoria: 'Categoría transaccional', solicitudId: randomUUID() };
    try {
      await alta(body).expect(500);
      expect(await prisma.producto.count({ where: { tenantId } })).toBe(0);
      expect(await prisma.categoria.count({ where: { tenantId } })).toBe(0);
      expect(await prisma.movimientoInventario.count({ where: { tenantId } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER entrega_fallo ON auditoria_operaciones');
      await prisma.$executeRawUnsafe('DROP FUNCTION entrega_fallo_audit()');
    }
    await alta(body).expect(201);
    expect(await prisma.producto.count({ where: { tenantId } })).toBe(1);
  });

  it('una recepción ocurrida después de leer el formulario no se pierde en un ajuste', async () => {
    const p = (await alta({ stockActual: 40 }).expect(201)).body;
    // La recepción vigente usa SQL y no incrementa productos.version. Reproduce ese contrato
    // sin modificar el servicio compartido con crédito/cancelaciones.
    await prisma.$executeRawUnsafe('UPDATE productos SET stock_actual=stock_actual+5 WHERE id=$1', p.id);
    await editar(p.id, { version: p.version, stockAnterior: 40, stockActual: 39, motivo: 'Formulario anterior a recepción' }).expect(409);
    expect(Number((await fila(p.id)).stockActual)).toBe(45);
    expect(await prisma.movimientoInventario.count({ where: { productoId: p.id, tipo: 'AJUSTE' } })).toBe(0);
  });

  it('ajustar sin cantidad anterior o con más de dos decimales no deja cambios parciales', async () => {
    const p = (await alta().expect(201)).body;
    await editar(p.id, { version: 1, stockActual: 39, motivo: 'Sin lectura anterior' }).expect(400);
    await editar(p.id, { version: 1, stockAnterior: 40, stockActual: 39.123, motivo: 'Precisión no admitida' }).expect(400);
    expect(Number((await fila(p.id)).stockActual)).toBe(40);
    expect((await fila(p.id)).version).toBe(1);
  });

  it.each([
    ['Canaleta blanca 4 pulgadas', 'PVC 2 mm', 'UNIDAD', 12],
    ['Lámina roja calibre 26 de 14 pies', 'Espesor 0.45 mm', 'PIE', 126.5],
    ['Varilla corrugada 3/8', 'Acero 6 m', 'UNIDAD', 20],
    ['Tornillo galvanizado 2 pulgadas', 'Venta por peso', 'LIBRA', 8.75],
    ['Aerosol rojo 400 ml', 'Pintura brillante', 'UNIDAD', 6],
  ])('empleado registra %s con código interno generado y persistencia real', async (nombre, descripcion, unidadMedida, stockActual) => {
    // Alta de BODEGUERO: sin ninguna clave de precio; el producto queda pendiente de aprobación del dueño.
    const response = await alta({ codigo: '', nombre, descripcion, unidadMedida, stockActual, precioCosto: undefined, precioVenta: undefined, solicitudId: randomUUID() }, 'BODEGUERO').expect(201);
    const stored = await fila(response.body.id);
    expect(stored).toMatchObject({ nombre, descripcion, unidadMedida });
    // Alta de BODEGUERO: pendiente de aprobación de precio y sin margen; no vendible.
    expect([stored.precioAprobado, Number(stored.precioVenta), stored.margen]).toEqual([false, 0, null]);
    expect(stored.codigo).toBeTruthy();
    expect(Number(stored.stockActual)).toBe(stockActual);
  });

  it('dos empleados registrando el mismo código simultáneamente no duplican existencias', async () => {
    const body = { codigo: 'TOR-2', codigoBarras: '770000000001', stockActual: 2.75 };
    const responses = await Promise.all([alta({ ...body, solicitudId: randomUUID() }), alta({ ...body, precioCosto: undefined, precioVenta: undefined, solicitudId: randomUUID() }, 'BODEGUERO')]);
    expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await prisma.producto.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.movimientoInventario.count({ where: { tenantId } })).toBe(1);
  });

  it('variantes de color y espesor mantienen productos y cantidades independientes', async () => {
    const roja = (await alta({ codigo: '', nombre: 'Lámina roja calibre 26', stockActual: 12.5 }).expect(201)).body;
    const verde = (await alta({ codigo: '', nombre: 'Lámina verde calibre 28', stockActual: 7.25 }).expect(201)).body;
    expect(roja.codigo).not.toBe(verde.codigo);
    expect(Number((await fila(roja.id)).stockActual)).toBe(12.5);
    expect(Number((await fila(verde.id)).stockActual)).toBe(7.25);
  });

  it('recepción efectiva y ajuste simultáneos conservan las existencias y el costo de compra', async () => {
    const p = (await alta({ stockActual: 40, precioCosto: 8 }).expect(201)).body;
    const proveedor = await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor sintético' } });
    const ops = new OperacionesService(prisma); // Reutiliza el flujo de compras vigente sin modificarlo.
    const orden = await ops.compra(tenantId, users.ADMIN.id, { solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: 'INV-1', isv: 0, fecha: '2026-10-09', vencimiento: '2026-11-09', items: [{ productoId: p.id, cantidad: 5, costo: 6 }] } as any);
    const [linea] = await prisma.$queryRawUnsafe<{ id: string }[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', orden.id);
    const [recepcion, ajuste] = await Promise.all([
      ops.recibir(tenantId, users.BODEGUERO.id, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 5 }] } as any),
      editar(p.id, { version: 1, stockAnterior: 40, stockActual: 39, motivo: 'Merma revisada' }),
    ]);
    expect(recepcion.id).toBeTruthy();
    expect([200, 409]).toContain(ajuste.status);
    const stored = await fila(p.id);
    expect(Number(stored.stockActual)).toBe(ajuste.status === 200 ? 44 : 45);
    expect(Number(stored.precioCosto)).toBe(6);
    expect(Number(stored.costoVigente)).toBe(6);
    expect(Number(stored.precioVenta)).toBe(12);
    expect(await prisma.movimientoInventario.count({ where: { productoId: p.id, tipo: 'COMPRA' } })).toBe(1);
    expect(await prisma.movimientoInventario.count({ where: { productoId: p.id, tipo: 'AJUSTE' } })).toBe(ajuste.status === 200 ? 1 : 0);
  });

  it('el margen no se captura: la ficha lo rechaza y no altera precios ni existencias', async () => {
    const p = (await alta().expect(201)).body;
    await editar(p.id, { version: 1, margen: 20 }).expect(400);
    await editar(p.id, { version: 1, margen: null }).expect(400);
    const stored = await fila(p.id);
    expect(stored.margen).toBeNull();
    expect(stored.version).toBe(1);
    expect(Number(stored.precioCosto)).toBe(8);
    expect(Number(stored.precioVenta)).toBe(12);
    expect(Number(stored.stockActual)).toBe(40);
  });

});
