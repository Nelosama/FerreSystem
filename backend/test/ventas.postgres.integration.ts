import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { LevantamientosService } from '../src/levantamientos/levantamientos.service';
import { ProductosService } from '../src/productos/productos.service';
import { ClientesService } from '../src/clientes/clientes.service';
import * as bcrypt from 'bcrypt';

// Nunca lee DATABASE_URL: crea un clúster exclusivo, sin migraciones ni datos existentes.
const bin = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin';
const executable = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));

describe('Ventas / PostgreSQL aislado', () => {
  let directory: string;
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let cotizaciones: CotizacionesService;
  let tenantId: string;
  let usuarioId: string;
  let productoId: string;
  let databaseUrl: string;

  beforeAll(async () => {
    if (!existsSync(executable('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-postgres-'));
    console.log('PostgreSQL temporal: initdb');
    execFileSync(executable('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8'], { windowsHide: true, timeout: 30000 });
    const server = createServer();
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('PostgreSQL temporal: start');
    started = true;
    execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
    started = true;
    // Reproduce una base existente anterior a la numeración, exclusivamente local.
    console.log('PostgreSQL temporal: schema offline');
    const oldSchema = readFileSync(resolve('prisma/schema.prisma'), 'utf8')
      .replace(/^.*secuenciaCliente SecuenciaCliente\?.*\r?\n/m, '')
      .replace(/^.*numeroCliente Int.*\r?\n/m, '')
      .replace(/^.*@@unique\(\[tenantId, numeroCliente\]\).*\r?\n/m, '')
      .replace(/\r?\nmodel SecuenciaCliente \{[\s\S]*?\r?\n\}/, '');
    writeFileSync(join(directory, 'old-schema.prisma'), oldSchema);
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', join(directory, 'old-schema.prisma'), '--script'], { windowsHide: true, timeout: 30000 });
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], { windowsHide: true, timeout: 30000 });
    const legacyData = `INSERT INTO tenants (id, nombre_comercial, updated_at) VALUES ('legacy-A', 'Empresa A', NOW()), ('legacy-B', 'Empresa B', NOW());
      INSERT INTO clientes (id, tenant_id, nombre, rtn, telefono, created_at, updated_at) VALUES
      ('legacy-client-1', 'legacy-A', 'Cliente anterior 1', '08011999000001', '+504 9999-0000', '2026-01-01', '2026-01-01'),
      ('legacy-client-2', 'legacy-A', 'Cliente anterior 2', NULL, NULL, '2026-01-02', '2026-01-02'),
      ('legacy-client-3', 'legacy-B', 'Cliente otra empresa', NULL, NULL, '2026-01-01', '2026-01-01');`;
    writeFileSync(join(directory, 'legacy-data.sql'), legacyData);
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'legacy-data.sql')], { windowsHide: true, timeout: 30000 });
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations/20261002000000_add_customer_numbers/migration.sql')], { windowsHide: true, timeout: 30000 });
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations/20261004000000_operacion_ferreteria/migration.sql')], {timeout:30000});
    databaseUrl = `postgresql://postgres@127.0.0.1:${port}/postgres?connection_limit=8`;
    prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    console.log('PostgreSQL temporal: Prisma connect');
    await prisma.$connect();
    ventas = new VentasService(prisma);
    cotizaciones = new CotizacionesService(prisma);
  });

  beforeEach(async () => {
    tenantId = randomUUID(); usuarioId = randomUUID(); productoId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Tenant prueba' } });
    await prisma.usuario.create({ data: { id: usuarioId, tenantId, nombre: 'Cajero prueba', email: 'test@example.test', passwordHash: 'test-only' } });
    await new OperacionesService(prisma).abrir(tenantId,usuarioId,{solicitudId:randomUUID(),monto:1000});
    await prisma.producto.create({ data: { id: productoId, tenantId, codigo: 'P1', nombre: 'Cable', precioVenta: 10, precioCosto: 5, stockActual: 2.75, stockMinimo: 0 } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (started) execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
    // Solo se elimina la carpeta aleatoria que este test acaba de crear.
    if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-postgres-')) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const request = (cantidad = 2.75) => ({ detalles: [{ productoId, cantidad, precioUnitario: 10 }] });

  it('la migración numera clientes existentes sin modificar sus datos y soporta inserts de la API anterior', async () => {
    const clients = await prisma.cliente.findMany({ where: { tenantId: 'legacy-A' }, orderBy: { numeroCliente: 'asc' } });
    expect(clients.map((client) => [client.id, client.numeroCliente])).toEqual([['legacy-client-1', 1], ['legacy-client-2', 2]]);
    expect(clients[0]).toMatchObject({ nombre: 'Cliente anterior 1', rtn: '08011999000001', telefono: '+504 9999-0000' });
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: 'legacy-client-3' } })).numeroCliente).toBe(1);
    await prisma.$executeRaw`INSERT INTO clientes (id, tenant_id, nombre, updated_at) VALUES ('old-api-insert', 'legacy-A', 'API anterior', NOW())`;
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: 'old-api-insert' } })).numeroCliente).toBe(3);
  });

  it('altas concurrentes asignan números únicos, no reutilizan eliminados y no permiten modificarlos', async () => {
    const service = new ClientesService(prisma);
    const clients = await Promise.all(Array.from({ length: 8 }, (_, index) => service.create(tenantId, { nombre: `Cliente ${index}` })));
    expect(clients.map((client) => client.numeroCliente).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const last = clients.find((client) => client.numeroCliente === 8)!;
    await service.delete(tenantId, last.id);
    const next = await service.create(tenantId, { nombre: 'Nuevo' });
    expect(next.numeroCliente).toBe(9);
    expect((await service.update(tenantId, next.id, { nombre: 'Renombrado' })).numeroCliente).toBe(9);
    await expect(prisma.cliente.update({ where: { id: next.id }, data: { numeroCliente: 8 } })).rejects.toThrow('no se pueden cambiar');
    await expect(prisma.cliente.create({ data: { tenantId, nombre: 'Número manual', numeroCliente: 99 } })).rejects.toThrow('automáticamente');
    expect((await service.findAll(tenantId, 'CLI-000009', 12)).map((client) => client.id)).toEqual([next.id]);
    expect((await service.findAll(tenantId, '000009', 12)).map((client) => client.id)).toEqual([next.id]);
    const other = await service.create('legacy-B', { nombre: 'Otro tenant' });
    expect(other.numeroCliente).toBe(2);
  });

  it('la API compilada arranca en producción con PostgreSQL y aplica autenticación real', async () => {
    const output = join(directory, 'compiled-api');
    execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--incremental', 'false', '--declaration', 'false', '--sourceMap', 'false', '--outDir', output], { windowsHide: true, timeout: 30000 });
    const listener = createServer();
    await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const child = spawn(process.execPath, [join(output, 'main.js')], {
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'production', NODE_PATH: resolve('node_modules'),
        DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, PORT: String(port),
        JWT_SECRET: 'isolated-production-smoke-secret-not-for-real-use',
        FRONTEND_URL: 'https://frontend.example.test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (data) => { log += data.toString(); });
    child.stderr.on('data', (data) => { log += data.toString(); });
    try {
      let ready = false;
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline && child.exitCode === null) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/productos`, { signal: AbortSignal.timeout(1000) });
          if (response.status === 401) { ready = true; break; }
        } catch { /* El proceso aún está iniciando. */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!ready) throw new Error(`La API no inició correctamente: ${log}`);
      const invalidLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      expect(invalidLogin.status).toBe(400);
      const password = 'isolated-test-password';
      const admin = await prisma.superAdmin.create({ data: { nombre: 'Superadmin prueba', email: `${randomUUID()}@test.local`, passwordHash: await bcrypt.hash(password, 4) } });
      const base = `http://127.0.0.1:${port}/api`;
      const login = await fetch(`${base}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password }) });
      expect(login.status).toBe(200);
      expect(login.headers.get('set-cookie')).toContain('Path=/api/admin/auth');
      expect(login.headers.get('set-cookie')).toContain('SameSite=None');
      const { accessToken: adminToken } = await login.json() as { accessToken: string };
      const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
      const tenantList = await fetch(`${base}/admin/tenants`, { headers: adminHeaders });
      expect(tenantList.status).toBe(200);
      const records = await tenantList.json() as any[];
      expect(records.find((item) => item.id === tenantId).usuarios).toEqual([expect.objectContaining({ id: usuarioId, activo: true })]);
      expect(JSON.stringify(records)).not.toContain('passwordHash');
      const support = await fetch(`${base}/admin/support/token`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tenantId, usuarioId, readOnly: true }) });
      expect(support.status).toBe(201);
      const { accessToken: supportToken } = await support.json() as { accessToken: string };
      const supportHeaders = { Authorization: `Bearer ${supportToken}`, 'Content-Type': 'application/json' };
      const products = await fetch(`${base}/productos`, { headers: supportHeaders });
      expect(products.status).toBe(200);
      expect((await products.json() as any[]).map((item) => item.id)).toEqual([productoId]);
      expect((await fetch(`${base}/usuarios`, { headers: supportHeaders })).status).toBe(200);
      expect((await fetch(`${base}/clientes`, { headers: supportHeaders })).status).toBe(200);
      expect((await fetch(`${base}/productos/${productoId}`, { method: 'DELETE', headers: supportHeaders })).status).toBe(403);
      expect((await fetch(`${base}/admin/tenants`, { headers: supportHeaders })).status).toBe(403);
      expect((await fetch(`${base}/admin/tenants`, { headers: adminHeaders })).status).toBe(200);
      expect((await fetch(`${base}/admin/support/token`, { method: 'POST', headers: supportHeaders, body: JSON.stringify({ tenantId, usuarioId, readOnly: false }) })).status).toBe(403);
      expect(log).toContain('Conexión exitosa');
      expect(child.exitCode).toBeNull();
    } finally {
      if (child.exitCode === null) {
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
        child.kill();
        await exited;
      }
    }
  }, 60000);

  it('reproduce db push sin trigger: el primer cliente recibe cero y el segundo falla por numeración', async () => {
    // El DDL y los INSERT solo afectan este PostgreSQL temporal y se revierten juntos.
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TRIGGER clientes_assign_number ON clientes');
      await tx.$executeRawUnsafe('ALTER TABLE clientes DROP CONSTRAINT clientes_numero_cliente_positive');
      const service = new ClientesService(tx as any);
      const first = await service.create(tenantId, { nombre: 'Primero sin trigger' });
      expect(first.numeroCliente).toBe(0);
      await service.create(tenantId, { nombre: 'Segundo sin trigger' });
    })).rejects.toMatchObject({ status: 503, message: expect.stringContaining('migración de numeración') });
    expect(await prisma.cliente.count({ where: { tenantId } })).toBe(0);
    expect((await new ClientesService(prisma).create(tenantId, { nombre: 'Con trigger restaurado' })).numeroCliente).toBe(1);
  });

  it('dos POS concurrentes no sobregiran stock decimal ni dejan huecos de secuencia', async () => {
    const results = await Promise.allSettled([ventas.create(tenantId, usuarioId, request()), ventas.create(tenantId, usuarioId, request())]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(0);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect((await prisma.secuenciaTenant.findFirstOrThrow({ where: { tenantId, tipo: 'VENTA' } })).ultimoNumero).toBe(1);
  });

  it('busca clientes por ID, RTN y teléfono formateados, aislados por tenant, y vincula la cotización', async () => {
    const clientes = new ClientesService(prisma);
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Ana', rtn: '0801-1999-000001', telefono: '+504 9999-0000', direccion: 'Centro' } });
    const otro = await prisma.tenant.create({ data: { nombreComercial: 'Ajeno' } });
    await prisma.cliente.create({ data: { tenantId: otro.id, nombre: 'Cliente ajeno', rtn: cliente.rtn, telefono: cliente.telefono } });
    for (const search of [cliente.id, '08011999000001', '99990000', '(9999) 0000']) {
      expect((await clientes.findAll(tenantId, search, 12)).map((item) => item.id)).toEqual([cliente.id]);
    }
    const cot = await cotizaciones.create(tenantId, usuarioId, { ...request(1), clienteId: cliente.id });
    expect(cot.clienteId).toBe(cliente.id);
    expect(cot.clienteNombre).toBe('Ana');
    expect((await cotizaciones.update(tenantId, cot.id, request(1))).clienteId).toBe(cliente.id);
    const manual = await cotizaciones.update(tenantId, cot.id, { ...request(1), clienteId: null, clienteNombre: 'Manual' });
    expect(manual.clienteId).toBeNull();
    expect(manual.clienteNombre).toBe('Manual');
  });

  it('POS y conversión de cotización compiten por el mismo stock sin negativo', async () => {
    const cot = await cotizaciones.create(tenantId, usuarioId, request());
    const results = await Promise.allSettled([ventas.create(tenantId, usuarioId, request()), cotizaciones.convertirAVenta(tenantId, usuarioId, cot.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(0);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
  });

  it('dos conversiones de la misma cotización crean solo una venta', async () => {
    const cot = await cotizaciones.create(tenantId, usuarioId, request());
    const results = await Promise.allSettled([cotizaciones.convertirAVenta(tenantId, usuarioId, cot.id), cotizaciones.convertirAVenta(tenantId, usuarioId, cot.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect((await prisma.cotizacion.findUniqueOrThrow({ where: { id: cot.id } })).estado).toBe('CONVERTIDA');
  });

  it('una falla en la segunda línea revierte stock y correlativo completos', async () => {
    await expect(ventas.create(tenantId, usuarioId, { detalles: [...request(0.5).detalles, ...request(3).detalles] })).rejects.toThrow('Stock insuficiente');
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(2.75);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.secuenciaTenant.count({ where: { tenantId, tipo: 'VENTA' } })).toBe(0);
  });

  it('requests con la misma identidad y respuesta perdida devuelven una sola venta', async () => {
    const dto = { ...request(0.5), solicitudId: randomUUID() };
    const [first, concurrent] = await Promise.all([ventas.create(tenantId, usuarioId, dto), ventas.create(tenantId, usuarioId, dto)]);
    const retry = await ventas.create(tenantId, usuarioId, dto);
    expect([concurrent.id, retry.id]).toEqual([first.id, first.id]);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(2.25);
    expect((await prisma.secuenciaTenant.findFirstOrThrow({ where: { tenantId, tipo: 'VENTA' } })).ultimoNumero).toBe(1);
    await expect(ventas.create(tenantId, usuarioId, { ...dto, descuento: 1 })).rejects.toThrow('otra venta');
    await expect(ventas.create(randomUUID(), usuarioId, dto)).rejects.toThrow('otra venta');
  });

  it('un tenant ajeno no puede descontar ni crear ventas sobre otro inventario', async () => {
    const foreign = await prisma.tenant.create({ data: { nombreComercial: 'Otro tenant' } });
    await expect(ventas.create(foreign.id, usuarioId, request())).rejects.toThrow('no encontrado');
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(2.75);
    expect(await prisma.venta.count({ where: { tenantId: foreign.id } })).toBe(0);
  });

  it('conversión descuenta la medida total y no permite reabrir la cotización', async () => {
    await prisma.producto.update({ where: { id: productoId }, data: { stockActual: 10, usaMedida: true, unidadMedida: 'PIE' } });
    const cot = await cotizaciones.create(tenantId, usuarioId, { detalles: [{ productoId, cantidad: 2, medida: 3, precioUnitario: 10 }] });
    const converted = await cotizaciones.convertirAVenta(tenantId, usuarioId, cot.id);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(4);
    expect(Number((await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: converted.ventaId } })).cantidad)).toBe(6);
    await expect(cotizaciones.updateEstado(tenantId, cot.id, 'BORRADOR')).rejects.toThrow('convertida');
    await expect(cotizaciones.updateEstado(tenantId, cot.id, 'CONVERTIDA')).rejects.toThrow('use convertir');
  });

  it('guardar una edición sin cambiar descuento porcentual conserva el monto', async () => {
    const dto = { ...request(2), descuentoGeneral: 50, tipoDescuentoGeneral: 'PORCENTAJE' as const };
    const cot = await cotizaciones.create(tenantId, usuarioId, dto);
    const updated = await cotizaciones.update(tenantId, cot.id, request(2));
    expect(updated.descuentoGeneral).toBe(cot.descuentoGeneral);
    expect(updated.total).toBe(cot.total);
    await expect(cotizaciones.update(tenantId, cot.id, {
      ...dto, descuentoGeneral: 101,
    })).rejects.toThrow('100%');
    expect((await cotizaciones.findById(tenantId, cot.id)).total).toBe(cot.total);
  });

  it('rechaza clientes y categorías ajenos y conserva categorías por nombre/unidades Prisma', async () => {
    const foreign = await prisma.tenant.create({ data: { nombreComercial: 'Otro' } });
    const cliente = await prisma.cliente.create({ data: { tenantId: foreign.id, nombre: 'Ajeno' } });
    const categoria = await prisma.categoria.create({ data: { tenantId: foreign.id, nombre: 'Ajena' } });
    await expect(ventas.create(tenantId, usuarioId, { ...request(), clienteId: cliente.id })).rejects.toThrow('Cliente');
    const cot = await cotizaciones.create(tenantId, usuarioId, request());
    await expect(cotizaciones.update(tenantId, cot.id, { ...request(), clienteId: cliente.id })).rejects.toThrow('Cliente');
    const productos = new ProductosService(prisma);
    const dto = { codigo: 'PIE-2', nombre: 'Por pie', precioVenta: 10, precioCosto: 1, stockActual: 2.75, stockMinimo: 0, unidadMedida: 'PIE' };
    await expect(productos.create(tenantId, { ...dto, categoriaId: categoria.id },usuarioId)).rejects.toThrow('Categoría');
    const producto = await productos.create(tenantId, { ...dto, categoria: 'Cables', usaMedida: true },usuarioId);
    expect(producto.categoria?.nombre).toBe('Cables');
    expect(producto.unidadMedida).toBe('PIE');
    expect(producto.usaMedida).toBe(true);
    await prisma.producto.update({ where: { id: producto.id }, data: { stockActual: 10, stockMinimo: 2 } });
    expect((await productos.findById(tenantId, producto.id)).stockBajo).toBe(false);
    expect((await productos.getLowStock(tenantId)).some((p) => p.id === producto.id)).toBe(false);
  });
});

