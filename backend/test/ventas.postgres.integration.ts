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
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { ProductosService } from '../src/productos/productos.service';
import { ClientesService } from '../src/clientes/clientes.service';
import { lockTenant } from '../src/operaciones/ledger';
import * as bcrypt from 'bcrypt';
import { checkSettingsHttp } from './settings-http-checks';

// Nunca lee DATABASE_URL: crea un clúster exclusivo, sin migraciones ni datos existentes.
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
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
    try {execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k '+directory}`, '-w', 'start'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });} catch(error) {if(existsSync(join(directory,'postgres.log')))console.error(readFileSync(join(directory,'postgres.log'),'utf8'));throw error;}
    started = true;
    // Reproduce una base existente anterior a la numeración, exclusivamente local.
    console.log('PostgreSQL temporal: schema offline');
    const oldSchema = readFileSync(resolve('test/fixtures/schema-main.prisma'), 'utf8')
      .replace(/^.*secuenciaCliente SecuenciaCliente\?.*\r?\n/m, '')
      .replace(/^.*numeroCliente Int.*\r?\n/m, '')
      .replace(/^.*@@unique\(\[tenantId, numeroCliente\]\).*\r?\n/m, '')
      .replace(/\r?\nmodel SecuenciaCliente \{[\s\S]*?\r?\n\}/, '');
    writeFileSync(join(directory, 'old-schema.prisma'), oldSchema);
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', join(directory, 'old-schema.prisma'), '--script'], { windowsHide: true, timeout: 30000 });
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], { windowsHide: true, timeout: 30000 });
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations/20260930000000_alter_stock_decimal_and_operational_models/migration.sql')], {timeout:30000});
    const legacyData = `INSERT INTO tenants (id, nombre_comercial, updated_at) VALUES ('legacy-A', 'Empresa A', NOW()), ('legacy-B', 'Empresa B', NOW());
      INSERT INTO clientes (id, tenant_id, nombre, rtn, telefono, created_at, updated_at) VALUES
      ('legacy-client-1', 'legacy-A', 'Cliente anterior 1', '08011999000001', '+504 9999-0000', '2026-01-01', '2026-01-01'),
      ('legacy-client-2', 'legacy-A', 'Cliente anterior 2', NULL, NULL, '2026-01-02', '2026-01-02'),
      ('legacy-client-3', 'legacy-B', 'Cliente otra empresa', NULL, NULL, '2026-01-01', '2026-01-01');`;
    writeFileSync(join(directory, 'legacy-data.sql'), legacyData);
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'legacy-data.sql')], { windowsHide: true, timeout: 30000 });
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations/20261002000000_add_customer_numbers/migration.sql')], { windowsHide: true, timeout: 30000 });
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations/20261004000000_operacion_ferreteria/migration.sql')], {timeout:30000});
    execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/migrations/20261005000000_autorizaciones_devolucion/migration.sql')], {timeout:30000});
    for (const migration of ['20261005000000_compras_proveedor_y_costo_vigente', '20261006000000_clientes_credito', '20261006000100_tenant_configuration', '20261009000000_levantamiento_multiusuario', '20261009120000_fs06_marca_idempotencia_levantamiento']) {
      execFileSync(executable('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve(`prisma/migrations/${migration}/migration.sql`)], { timeout: 30000 });
    }
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

  const available = async()=>{const p=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});return Number(p.stockActual)-Number(p.stockReservado);};
  const request = (cantidad = 2.75) => ({ detalles: [{ productoId, cantidad, precioUnitario: 10 }] });

  // Hold the same lock used by user edits until the mutation is actually queued
  // in PostgreSQL, then revoke and commit before the mutation acquires it.
  const revokeWhileQueued = async <T>(change: any, mutate: () => Promise<T>): Promise<T> => {
    let locked!: () => void, release!: () => void;
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const revocation = prisma.$transaction(async tx => {
      await lockTenant(tx,tenantId);
      locked();
      await gate;
      await tx.usuario.update({where:{id:usuarioId},data:change});
    },{timeout:10000});
    await acquired;
    const pending = mutate().then(value => ({value}), error => ({error}));
    try {
      const deadline = Date.now()+5000;
      while (true) {
        const [state] = await prisma.$queryRawUnsafe<{waiting:boolean}[]>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%') AS waiting");
        if(state.waiting)break;
        if(Date.now()>deadline)throw new Error('La operación no llegó al bloqueo de tenant');
        await new Promise(resolve => setTimeout(resolve,5));
      }
    } finally {
      release();
      await revocation;
    }
    const outcome = await pending;
    if('error' in outcome)throw outcome.error;
    return outcome.value;
  };

  it.each([
    {label:'cambio a bodeguero',change:{rol:'BODEGUERO'},message:'rol de usuario'},
    {label:'retiro de pos.vender',change:{permisos:[]},message:'permiso requerido'},
    {label:'desactivación',change:{activo:false},message:'no disponible'},
  ])('revocación concurrente: $label impide una venta que esperaba el bloqueo',async({change,message})=>{
    await prisma.usuario.update({where:{id:usuarioId},data:{rol:'CAJERO',permisosConfigurados:true,permisos:['pos.vender']}});
    await expect(revokeWhileQueued(change,()=>ventas.create(tenantId,usuarioId,{...request(1),solicitudId:randomUUID()}))).rejects.toThrow(message);
    expect(await prisma.venta.count({where:{tenantId}})).toBe(0);
    expect(await prisma.secuenciaTenant.count({where:{tenantId,tipo:'VENTA'}})).toBe(0);
    expect(await available()).toBe(2.75);
    const [cashMovements] = await prisma.$queryRawUnsafe<{count:number}[]>('SELECT COUNT(*)::int AS count FROM movimientos_caja WHERE caja_id IN (SELECT id FROM cajas WHERE tenant_id=$1)',tenantId);
    expect(cashMovements.count).toBe(0);
  });

  it('un administrador demovido durante la espera no puede restaurarse el rol',async()=>{
    await prisma.usuario.create({data:{tenantId,nombre:'Segundo administrador',email:'second@example.test',passwordHash:'test-only',rol:'ADMIN'}});
    const users=new UsuariosService(prisma);
    await expect(revokeWhileQueued({rol:'CAJERO'},()=>users.update(tenantId,usuarioId,{rol:'ADMIN'},usuarioId))).rejects.toThrow('rol de usuario');
    expect((await prisma.usuario.findUniqueOrThrow({where:{id:usuarioId}})).rol).toBe('CAJERO');
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,operacion:'USUARIO_EDITAR'}})).toBe(0);
  });


  it('consultar solicitud recupera la venta propia sin nuevas escrituras y no expone otra cuenta', async () => {
    const solicitudId = randomUUID();
    expect(await ventas.findSolicitud(tenantId, usuarioId, solicitudId)).toEqual({ estado: 'NO_REGISTRADA' });
    const venta = await ventas.create(tenantId, usuarioId, { ...request(1), solicitudId });
    const snapshots = async () => ({
      ventas: await prisma.venta.count({ where: { tenantId } }),
      stock: await available(),
      dinero: await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM movimientos_caja WHERE caja_id IN (SELECT id FROM cajas WHERE tenant_id=$1)', tenantId),
    });
    const before = await snapshots();
    for (let i = 0; i < 2; i++) {
      const recovered = await ventas.findSolicitud(tenantId, usuarioId, solicitudId);
      expect(recovered.estado).toBe('REGISTRADA');
      if (recovered.estado === 'REGISTRADA') expect(recovered.venta).toMatchObject({ id: venta.id, total: venta.total });
    }
    expect(await ventas.findSolicitud('legacy-B', usuarioId, solicitudId)).toEqual({ estado: 'NO_REGISTRADA' });
    expect(await ventas.findSolicitud(tenantId, randomUUID(), solicitudId)).toEqual({ estado: 'NO_REGISTRADA' });
    expect(await snapshots()).toEqual(before);
  });

  it('consulta espera una escritura de venta en curso antes de informar su estado', async () => {
    const solicitudId = randomUUID();
    let notifyLocked!: () => void;
    const locked = new Promise<void>(resolve => { notifyLocked = resolve; });
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const writer = prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', 'OPERACION:' + tenantId);
      // Mismo bloqueo de solicitud que usa el endpoint, además del bloqueo por empresa.
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', 'VENTA:' + solicitudId);
      notifyLocked();
      await waiting;
      await tx.venta.create({ data: { id: solicitudId, tenantId, usuarioId, numeroVenta: 99, subtotal: 0, isv: 0, descuento: 0, total: 0, metodoPago: 'EFECTIVO' } });
    });
    await locked;
    let completed = false;
    const reader = ventas.findSolicitud(tenantId, usuarioId, solicitudId).then(value => { completed = true; return value; });
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(completed).toBe(false);
    } finally { release(); }
    await writer;
    expect((await reader).estado).toBe('REGISTRADA');
  });

  it('reinicio abrupto conserva la venta confirmada, revierte la incompleta y no duplica caja ni reservas', async () => {
    const solicitudId = randomUUID();
    const dto = { ...request(1), solicitudId };
    const original = await ventas.create(tenantId, usuarioId, dto);

    const incompleteId = randomUUID();
    let notifyWritten!: () => void;
    const written = new Promise<void>(resolve => { notifyWritten = resolve; });
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const interrupted = prisma.$transaction(async tx => {
      await tx.producto.update({ where: { id: productoId }, data: { stockReservado: { increment: 0.5 } } });
      await tx.venta.create({ data: { id: incompleteId, tenantId, usuarioId, numeroVenta: 99, subtotal: 0, isv: 0, descuento: 0, total: 0, metodoPago: 'EFECTIVO' } });
      notifyWritten();
      await waiting;
    }).catch(error => error);
    await written;
    execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 30000, stdio: 'ignore' });
    release();
    expect(await interrupted).toBeInstanceOf(Error);
    await prisma.$disconnect();
    execFileSync(executable('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${new URL(databaseUrl).port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
    await prisma.$connect();
    const recovered = await ventas.findSolicitud(tenantId, usuarioId, solicitudId);
    expect(recovered.estado).toBe('REGISTRADA');
    expect(await ventas.findSolicitud(tenantId, usuarioId, incompleteId)).toEqual({ estado: 'NO_REGISTRADA' });
    expect((await ventas.create(tenantId, usuarioId, dto)).id).toBe(original.id);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect(await available()).toBe(1.75);
    const rows = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*)::int AS count FROM movimientos_caja WHERE referencia=$1', original.id);
    expect(rows[0].count).toBe(1);
  });

  it('herramienta de respaldo genera diagnóstico y dump restaurable sin modificar el origen', async () => {
    const sale = await ventas.create(tenantId, usuarioId, { ...request(1), solicitudId: randomUUID() });
    const source = new URL(databaseUrl);
    const backups = join(directory, 'backups');
    // Ejecutar el diagnóstico directamente sobre datos de prueba para localizar errores de SQL.
    execFileSync(executable('psql'), ['-X', '-h', source.hostname, '-p', source.port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('scripts/preflight.sql')], { timeout: 30000, stdio: 'pipe' });
    execFileSync(process.execPath, [resolve('scripts/backup-preflight.mjs'), backups], {
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), PG_BIN: bin, PGHOST: source.hostname, PGPORT: source.port, PGUSER: 'postgres', PGDATABASE: 'postgres', PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' },
      timeout: 30000, stdio: 'pipe',
    });
    const { readdirSync } = await import('node:fs');
    const saved = join(backups, readdirSync(backups)[0]);
    const manifest = JSON.parse(readFileSync(join(saved, 'manifest.json'), 'utf8'));
    expect(manifest.archiveReadable).toBe(true);
    expect(manifest.restoreTested).toBe(false);
    expect(readFileSync(join(saved, 'preflight.txt'), 'utf8')).toContain('stock_negativo');
    execFileSync(executable('createdb'), ['-h', source.hostname, '-p', source.port, '-U', 'postgres', 'restore_check'], { timeout: 30000, stdio: 'pipe' });
    execFileSync(executable('pg_restore'), ['-h', source.hostname, '-p', source.port, '-U', 'postgres', '--exit-on-error', '--no-owner', '--no-acl', '-d', 'restore_check', join(saved, 'database.dump')], { timeout: 30000, stdio: 'pipe' });
    const restored = new PrismaService({ datasources: { db: { url: databaseUrl.replace('/postgres?', '/restore_check?') } } });
    try {
      await restored.$connect();
      expect(await restored.venta.findUniqueOrThrow({ where: { id: sale.id } })).toMatchObject({ id: sale.id, tenantId, usuarioId });
      expect(await restored.venta.count()).toBe(await prisma.venta.count());
      expect(await restored.producto.count()).toBe(await prisma.producto.count());
      expect(await restored.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM movimientos_caja')).toEqual(await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM movimientos_caja'));
    } finally { await restored.$disconnect(); }
  });

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
      await checkSettingsHttp(prisma, base);
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
      const motivo = 'Revisión de soporte en prueba de integración';
      // Contrato SEC-012: sin motivo (o demasiado corto) no hay token de soporte.
      expect((await fetch(`${base}/admin/support/token`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tenantId, usuarioId, readOnly: true }) })).status).toBe(400);
      expect((await fetch(`${base}/admin/support/token`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tenantId, usuarioId, readOnly: true, motivo: 'corto' }) })).status).toBe(400);
      // La escritura exige autorización explícita aunque haya motivo.
      expect((await fetch(`${base}/admin/support/token`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tenantId, usuarioId, readOnly: false, motivo }) })).status).toBe(403);
      const support = await fetch(`${base}/admin/support/token`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tenantId, usuarioId, readOnly: true, motivo }) });
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
      expect((await fetch(`${base}/admin/support/token`, { method: 'POST', headers: supportHeaders, body: JSON.stringify({ tenantId, usuarioId, readOnly: false, motivo, confirmarEscritura: true }) })).status).toBe(403);
      await prisma.usuario.update({where:{id:usuarioId},data:{rol:'CAJERO',passwordHash:await bcrypt.hash(password,4)}});
      const cashierLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.test',password,tenantId})});
      expect(cashierLogin.status).toBe(200);
      const {accessToken:cashierToken}=await cashierLogin.json() as {accessToken:string};
      const cashierHeaders={Authorization:`Bearer ${cashierToken}`,'Content-Type':'application/json'};
      expect((await fetch(`${base}/productos/${productoId}`,{method:'PUT',headers:cashierHeaders,body:JSON.stringify({precioCosto:1})})).status).toBe(403);
      expect((await fetch(`${base}/operaciones/productos/${productoId}/ajuste`,{method:'POST',headers:cashierHeaders,body:JSON.stringify({solicitudId:randomUUID(),stock:100,motivo:'Manipulado'})})).status).toBe(403);
      expect((await fetch(`${base}/usuarios`,{headers:cashierHeaders})).status).toBe(403);
      expect((await fetch(`${base}/operaciones/cuentas?tipo=CXP`,{headers:cashierHeaders})).status).toBe(403);
      const commercial=await fetch(`${base}/productos/comercial`,{headers:cashierHeaders});expect(commercial.status).toBe(200);
      const catalog=await commercial.json() as any[];expect(catalog[0].precioVenta).toBe(10);expect(catalog[0].precioCosto).toBeUndefined();
      expect((await fetch(`${base}/ventas`,{method:'POST',headers:cashierHeaders,body:JSON.stringify({detalles:[{productoId,cantidad:1,precioUnitario:1}]})})).status).toBe(409);

      const recoveryId = randomUUID();
      expect((await fetch(`${base}/ventas/solicitudes/${recoveryId}`, { headers: cashierHeaders })).status).toBe(200);
      expect((await fetch(`${base}/ventas/solicitudes/not-a-uuid`, { headers: cashierHeaders })).status).toBe(400);
      expect((await fetch(`${base}/ventas/solicitudes/${recoveryId}`)).status).toBe(401);
      const savedSale = await ventas.create(tenantId, usuarioId, { ...request(1), solicitudId: recoveryId });
      const recoveredHTTP = await fetch(`${base}/ventas/solicitudes/${recoveryId}`, { headers: cashierHeaders });
      expect(await recoveredHTTP.json()).toMatchObject({ estado: 'REGISTRADA', venta: { id: savedSale.id } });
      await prisma.usuario.update({where:{id:usuarioId},data:{permisosConfigurados:true,permisos:[]}});
      expect((await fetch(`${base}/ventas`,{method:'POST',headers:cashierHeaders,body:JSON.stringify(request(1))})).status).toBe(403);
      await prisma.usuario.update({where:{id:usuarioId},data:{activo:false}});
      expect((await fetch(`${base}/productos/comercial`,{headers:cashierHeaders})).status).toBe(401);
      expect(log).toContain('Conexión exitosa');
      expect(child.exitCode).toBeNull();
    } finally {
      if (child.exitCode === null) {
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
        child.kill();
        await exited;
      }
    }
  }, 120000);

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
    expect(await available()).toBe(0);
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
    expect(await available()).toBe(0);
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
    const second=await prisma.producto.create({data:{tenantId,codigo:'SIN-STOCK',nombre:'Agotado',precioVenta:10,precioCosto:1,stockActual:0,stockMinimo:0}});
    await expect(ventas.create(tenantId, usuarioId, { detalles: [...request(0.5).detalles,{productoId:second.id,cantidad:1,precioUnitario:10}] })).rejects.toThrow('Stock insuficiente');
    expect(await available()).toBe(2.75);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.secuenciaTenant.count({ where: { tenantId, tipo: 'VENTA' } })).toBe(0);
  });

  it('requests con la misma identidad y respuesta perdida devuelven una sola venta', async () => {
    const dto = { ...request(0.5), solicitudId: randomUUID() };
    const [first, concurrent] = await Promise.all([ventas.create(tenantId, usuarioId, dto), ventas.create(tenantId, usuarioId, dto)]);
    const retry = await ventas.create(tenantId, usuarioId, dto);
    expect([concurrent.id, retry.id]).toEqual([first.id, first.id]);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(1);
    expect(await available()).toBe(2.25);
    expect((await prisma.secuenciaTenant.findFirstOrThrow({ where: { tenantId, tipo: 'VENTA' } })).ultimoNumero).toBe(1);
    await expect(ventas.create(tenantId, usuarioId, { ...dto, descuento: 1 })).rejects.toThrow('otra venta');
    await expect(ventas.create(randomUUID(), usuarioId, dto)).rejects.toThrow('no disponible');
  });

  it('un tenant ajeno no puede descontar ni crear ventas sobre otro inventario', async () => {
    const foreign = await prisma.tenant.create({ data: { nombreComercial: 'Otro tenant' } });
    const foreignUser=await prisma.usuario.create({data:{tenantId:foreign.id,nombre:'Otro cajero',email:'foreign@example.test',passwordHash:'test'}});
    await new OperacionesService(prisma).abrir(foreign.id,foreignUser.id,{solicitudId:randomUUID(),monto:0});
    await expect(ventas.create(foreign.id, foreignUser.id, request())).rejects.toThrow('no encontrado');
    expect(await available()).toBe(2.75);
    expect(await prisma.venta.count({ where: { tenantId: foreign.id } })).toBe(0);
  });

  it('conversión descuenta la medida total y no permite reabrir la cotización', async () => {
    await prisma.producto.update({ where: { id: productoId }, data: { stockActual: 10, usaMedida: true, unidadMedida: 'PIE' } });
    const cot = await cotizaciones.create(tenantId, usuarioId, { detalles: [{ productoId, cantidad: 2, medida: 3, precioUnitario: 10 }] });
    const converted = await cotizaciones.convertirAVenta(tenantId, usuarioId, cot.id);
    expect(await available()).toBe(4);
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
  it('reposiciones conservan proveedor/costo y una compra más barata cambia el costo vigente',async()=>{
    const ops=new OperacionesService(prisma);
    const first=await ops.proveedor(tenantId,usuarioId,{solicitudId:randomUUID(),nombre:'Proveedor caro'});
    const second=await ops.proveedor(tenantId,usuarioId,{solicitudId:randomUUID(),nombre:'Proveedor económico'});
    for(const [provider,cost,invoice] of [[first,12,'F1'],[second,3,'F2']] as const){
      const order=await ops.compra(tenantId,usuarioId,{solicitudId:randomUUID(),proveedorId:provider.id,numeroFactura:invoice,isv:0,items:[{productoId,cantidad:2,costo:cost}]});
      const rows=await ops.compras(tenantId);const line=rows.find(o=>o.id===order.id).items[0];
      const command={solicitudId:randomUUID(),items:[{detalleId:line.id,cantidad:2}]};
      await Promise.all([ops.recibir(tenantId,usuarioId,order.id,command),ops.recibir(tenantId,usuarioId,order.id,command)]);
      expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).precioCosto)).toBe(cost);
    }
    const product=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});
    expect(Number(product.stockActual)).toBe(6.75);
    const history=await ops.historial(tenantId,productoId);
    expect(history.costos).toHaveLength(2);
    expect(history.costos.map(c=>Number(c.costo)).sort((a,b)=>a-b)).toEqual([3,12]);
    expect((await ops.cuentas(tenantId,usuarioId,'CXP')).map(c=>Number(c.saldo)).sort((a,b)=>a-b)).toEqual([6,24]);
  });

  it('una recepción excesiva revierte costo, stock e historial',async()=>{
    const ops=new OperacionesService(prisma),provider=await ops.proveedor(tenantId,usuarioId,{solicitudId:randomUUID(),nombre:'Proveedor'});
    const order=await ops.compra(tenantId,usuarioId,{solicitudId:randomUUID(),proveedorId:provider.id,numeroFactura:'F1',isv:0,items:[{productoId,cantidad:1,costo:2}]});
    const line=(await ops.compras(tenantId))[0].items[0];
    await expect(ops.recibir(tenantId,usuarioId,order.id,{solicitudId:randomUUID(),items:[{detalleId:line.id,cantidad:2}]})).rejects.toThrow('pendiente');
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual)).toBe(2.75);
    expect(await prisma.recepcionCompra.count({where:{tenantId}})).toBe(0);
    expect(await prisma.costoCompra.count({where:{tenantId}})).toBe(0);
  });

  it('el crédito exige cliente real, persiste saldo y abonos idempotentes sin duplicar efectivo',async()=>{
    const ops=new OperacionesService(prisma);
    await expect(ventas.create(tenantId,usuarioId,{...request(1),metodoPago:'CREDITO'})).rejects.toThrow('cliente registrado');
    const client=await new ClientesService(prisma).create(tenantId,{nombre:'Cliente crédito'});
    await prisma.cliente.update({ where: { id: client.id }, data: { creditoHabilitado: true } });
    const sale=await ventas.create(tenantId,usuarioId,{...request(1),metodoPago:'CREDITO',clienteId:client.id});
    const debt=(await ops.cuentas(tenantId,usuarioId,'CXC'))[0];
    expect(Number(debt.saldo)).toBe(sale.total);
    const payment={solicitudId:randomUUID(),monto:5,metodo:'EFECTIVO'};
    await Promise.all([ops.pagar(tenantId,usuarioId,debt.id,payment),ops.pagar(tenantId,usuarioId,debt.id,payment)]);
    expect(Number((await ops.cuentas(tenantId,usuarioId,'CXC'))[0].saldo)).toBe(6.5);
    expect((await ops.caja(tenantId,usuarioId))[0].efectivoEsperado).toBe(1005);
    await expect(ops.pagar(tenantId,usuarioId,debt.id,{...payment,solicitudId:randomUUID(),monto:7})).rejects.toThrow('mayor al saldo');
  });

  it('transferencia no incrementa efectivo y el cierre impide nuevas ventas',async()=>{
    const ops=new OperacionesService(prisma);
    await ventas.create(tenantId,usuarioId,{...request(1),metodoPago:'TRANSFERENCIA'});
    const cash=(await ops.caja(tenantId,usuarioId))[0];
    expect(cash.efectivoEsperado).toBe(1000);expect(cash.totales.TRANSFERENCIA).toBe(11.5);
    const closed=await ops.cerrar(tenantId,usuarioId,cash.id,{monto:995});
    expect(Number(closed.diferencia)).toBe(-5);
    await expect(ventas.create(tenantId,usuarioId,request(1))).rejects.toThrow('Abra su caja');
  });

  it('el cajero usa el precio vigente y el backend rechaza precios o descuentos manipulados',async()=>{
    await prisma.usuario.update({where:{id:usuarioId},data:{rol:'CAJERO',descuentoMaximo:5}});
    await expect(ventas.create(tenantId,usuarioId,{detalles:[{productoId,cantidad:1,precioUnitario:1}]})).rejects.toThrow('precio cambió');
    await expect(ventas.create(tenantId,usuarioId,{...request(1),descuento:1})).rejects.toThrow('autorización');
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual)).toBe(2.75);
    await expect(new OperacionesService(prisma).cuentas(tenantId,usuarioId,'CXP')).rejects.toThrow('administrador');
  });

  it('la venta sin inventario conserva proveedor sin descontar existencias físicas',async()=>{
    const ops=new OperacionesService(prisma),provider=await ops.proveedor(tenantId,usuarioId,{solicitudId:randomUUID(),nombre:'Proveedor directo'});
    const sale=await ventas.create(tenantId,usuarioId,{detalles:[{productoId,cantidad:5,precioUnitario:10,sinInventario:true,proveedorId:provider.id}]});
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual)).toBe(2.75);
    const detail=await prisma.detalleVenta.findFirstOrThrow({where:{ventaId:sale.id}});
    expect(detail.sinInventario).toBe(true);expect(detail.proveedorId).toBe(provider.id);
    expect(await prisma.movimientoInventario.count({where:{tenantId,productoId}})).toBe(0);
  });

  it('el levantamiento conserva captura completa y aplica una sola vez tras revisión',async()=>{
    const service=new LevantamientosService(prisma);
    const session=await service.create(tenantId,usuarioId,{nombre:'Conteo inicial'});
    const command={solicitudId:randomUUID(),descripcion:'Cable',codigo:'P1',codigoBarras:'123456',ubicacion:'Bodega',cantidad:8.5,precioCosto:4,precioVenta:10,unidad:'UNIDAD'};
    const count=await service.createItem(tenantId,session.id,command,usuarioId);
    const retried=await service.createItem(tenantId,session.id,command,usuarioId);
    expect(count.id).toBe(retried.id);
    await service.update(tenantId,session.id,{estado:'FINALIZADO'},usuarioId);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual)).toBe(2.75);
    const preview=await service.previsualizar(tenantId,session.id);
    await Promise.all([service.aplicar(tenantId,usuarioId,session.id,preview.token),service.aplicar(tenantId,usuarioId,session.id,preview.token)]);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual)).toBe(8.5);
    expect(await prisma.movimientoInventario.count({where:{tenantId,tipo:'LEVANTAMIENTO'}})).toBe(1);
    expect((await service.findOne(tenantId,session.id)).items[0]).toMatchObject({codigoBarras:'123456',ubicacion:'Bodega',cantidad:8.5});
    await expect(service.updateItem(tenantId,session.id,count.id,{version:1,cantidad:9},usuarioId)).rejects.toThrow('cerrado');
  });

  it('otro tenant no puede recibir una compra ajena ni consultar sus movimientos',async()=>{
    const ops=new OperacionesService(prisma),provider=await ops.proveedor(tenantId,usuarioId,{solicitudId:randomUUID(),nombre:'Proveedor'});
    const order=await ops.compra(tenantId,usuarioId,{solicitudId:randomUUID(),proveedorId:provider.id,numeroFactura:'F1',isv:0,items:[{productoId,cantidad:1,costo:2}]});
    const foreignUser=await prisma.usuario.create({data:{tenantId:'legacy-B',nombre:'Administrador ajeno',email:`${randomUUID()}@example.test`,passwordHash:'test-only',rol:'ADMIN'}});
    await expect(ops.recibir('legacy-B',foreignUser.id,order.id,{solicitudId:randomUUID(),items:[{detalleId:'x',cantidad:1}]})).rejects.toThrow('no encontrada');
    expect(await ops.historial('legacy-B',productoId)).toEqual({movimientos:[],costos:[]});
  });

  it('reservar evita sobreventa; solo la entrega reduce inventario físico y repetirla no descuenta otra vez',async()=>{
    const ops=new OperacionesService(prisma);
    const sale=await ventas.create(tenantId,usuarioId,request(2));
    let p=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});
    expect(Number(p.stockActual)).toBe(2.75);expect(Number(p.stockReservado)).toBe(2);
    expect(await available()).toBe(.75);
    await expect(ventas.create(tenantId,usuarioId,request(1))).rejects.toThrow('Stock insuficiente');
    await Promise.all([ops.entregar(tenantId,usuarioId,sale.id),ops.entregar(tenantId,usuarioId,sale.id)]);
    p=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});
    expect(Number(p.stockActual)).toBe(.75);expect(Number(p.stockReservado)).toBe(0);
    expect(await prisma.movimientoInventario.count({where:{tenantId,tipo:'ENTREGA'}})).toBe(1);
  });

  it('una devolución entregada restaura inventario, reembolsa una sola vez y no permite devolver de más',async()=>{
    await prisma.usuario.update({where:{id:usuarioId},data:{rol:'ADMIN'}});
    const ops=new OperacionesService(prisma),sale=await ventas.create(tenantId,usuarioId,request(2));
    await ops.entregar(tenantId,usuarioId,sale.id);
    const original=await ops.buscarVenta(tenantId,String(sale.numeroVenta));
    const command={solicitudId:randomUUID(),motivo:'Producto equivocado',metodo:'EFECTIVO',items:[{detalleId:original.items[0].id,cantidad:1,destino:'INVENTARIO'}]};
    await Promise.all([ops.devolver(tenantId,usuarioId,sale.id,command),ops.devolver(tenantId,usuarioId,sale.id,command)]);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual)).toBe(1.75);
    expect((await ops.caja(tenantId,usuarioId))[0].efectivoEsperado).toBe(1011.5);
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(1);
    await expect(ops.devolver(tenantId,usuarioId,sale.id,{...command,solicitudId:randomUUID(),items:[{...command.items[0],cantidad:2}]})).rejects.toThrow('supera');
  });
  it('cancelar mercancía no entregada libera reserva y cancela crédito sin ingreso físico ficticio',async()=>{
    await prisma.usuario.update({where:{id:usuarioId},data:{rol:'ADMIN'}});
    const ops=new OperacionesService(prisma),client=await new ClientesService(prisma).create(tenantId,{nombre:'Cliente'});
    await prisma.cliente.update({ where: { id: client.id }, data: { creditoHabilitado: true } });
    const sale=await ventas.create(tenantId,usuarioId,{...request(2),metodoPago:'CREDITO',clienteId:client.id});
    const original=await ops.buscarVenta(tenantId,String(sale.numeroVenta));
    await ops.devolver(tenantId,usuarioId,sale.id,{solicitudId:randomUUID(),motivo:'Cancelación parcial',metodo:'EFECTIVO',items:[{detalleId:original.items[0].id,cantidad:1,destino:'NO_ENTREGADO'}]});
    expect(Number((await ops.cuentas(tenantId,usuarioId,'CXC'))[0].saldo)).toBe(11.5);
    expect((await ops.caja(tenantId,usuarioId))[0].efectivoEsperado).toBe(1000);
    await ops.entregar(tenantId,usuarioId,sale.id);
    const p=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});
    expect(Number(p.stockActual)).toBe(1.75);expect(Number(p.stockReservado)).toBe(0);
  });
  it('devolver crédito con abonos cancela saldo y reembolsa el excedente pagado',async()=>{
    await prisma.usuario.update({where:{id:usuarioId},data:{rol:'ADMIN'}});
    const ops=new OperacionesService(prisma),client=await new ClientesService(prisma).create(tenantId,{nombre:'Cliente'});
    await prisma.cliente.update({ where: { id: client.id }, data: { creditoHabilitado: true } });
    const sale=await ventas.create(tenantId,usuarioId,{...request(1),metodoPago:'CREDITO',clienteId:client.id});
    const debt=(await ops.cuentas(tenantId,usuarioId,'CXC'))[0];
    await ops.pagar(tenantId,usuarioId,debt.id,{solicitudId:randomUUID(),monto:5,metodo:'EFECTIVO'});
    const original=await ops.buscarVenta(tenantId,String(sale.numeroVenta));
    const result=await ops.devolver(tenantId,usuarioId,sale.id,{solicitudId:randomUUID(),motivo:'Cancelación',metodo:'EFECTIVO',items:[{detalleId:original.items[0].id,cantidad:1,destino:'NO_ENTREGADO'}]});
    expect(Number(result.credito_cancelado)).toBe(6.5);expect(Number(result.reembolso)).toBe(5);
    expect(Number((await ops.cuentas(tenantId,usuarioId,'CXC'))[0].saldo)).toBe(0);
    expect((await ops.caja(tenantId,usuarioId))[0].efectivoEsperado).toBe(1000);
  });

  it('los códigos internos concurrentes son distintos y fabricante/barcode/margen/foto se guardan realmente',async()=>{
    const service=new ProductosService(prisma);
    const dto={nombre:'Canaleta galvanizada',precioVenta:20,precioCosto:10,stockActual:0,stockMinimo:1};
    const [a,b]=await Promise.all([service.create(tenantId,{...dto,codigoBarras:'123456789',codigoFabricante:'FAB-12',margen:35,imagenUrl:'https://images.example.test/canaleta.webp'},usuarioId),service.create(tenantId,dto,usuarioId)]);
    expect(a.codigo).not.toBe(b.codigo);expect(a.codigo).toMatch(/^CANALETA-GALVANIZA-\d{3}$/);
    const saved=await prisma.producto.findUniqueOrThrow({where:{id:a.id}});
    expect(saved.codigoBarras).toBe('123456789');expect(saved.codigoFabricante).toBe('FAB-12');expect(Number(saved.margen)).toBe(35);expect(saved.imagenUrl).toBe('https://images.example.test/canaleta.webp');
    expect((await service.findAll(tenantId,'FAB-12')).map(p=>p.id)).toEqual([a.id]);
    await expect(service.create(tenantId,{...dto,codigoBarras:'123456789'},usuarioId)).rejects.toThrow('barras ya registrado');
  });
  it('los permisos se persisten y desactivar conserva historial y al último administrador',async()=>{
    const service=new UsuariosService(prisma);
    await expect(service.remove(tenantId,usuarioId,usuarioId)).rejects.toThrow('administrador activo');
    const cashier=await service.create(tenantId,{nombre:'Cajero',email:'cashier@example.test',password:'test-only-password',permisos:['pos.vender'],descuentoMaximo:5},usuarioId);
    expect(cashier.rol).toBe('CAJERO');
    const saved=await prisma.usuario.findUniqueOrThrow({where:{id:cashier.id}});
    expect(saved.permisos).toEqual(['pos.vender']);expect(saved.permisosConfigurados).toBe(true);expect(Number(saved.descuentoMaximo)).toBe(5);
    await service.remove(tenantId,cashier.id,usuarioId);
    expect((await prisma.usuario.findUniqueOrThrow({where:{id:cashier.id}})).activo).toBe(false);
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,entidadId:cashier.id}})).toBe(2);
  });

  const authorizedReturn = async (credit=false) => {
    const ops=new OperacionesService(prisma);
    await prisma.usuario.update({where:{id:usuarioId},data:{rol:'CAJERO'}});
    const adminId=randomUUID();
    await prisma.usuario.create({data:{id:adminId,tenantId,nombre:'Administrador',email:'admin@example.test',passwordHash:'test-only',rol:'ADMIN'}});
    const dto:any={...request(1),solicitudId:randomUUID(),metodoPago:credit?'CREDITO':'EFECTIVO'};
    if(credit){const c=await prisma.cliente.create({data:{tenantId,nombre:'Cliente crédito'}});await prisma.cliente.update({where:{id:c.id},data:{creditoHabilitado:true}});dto.clienteId=c.id;}
    const sale=await ventas.create(tenantId,usuarioId,dto);
    const original=await ops.buscarVenta(tenantId,String(sale.numeroVenta));
    const command={solicitudId:randomUUID(),motivo:'Devolución solicitada por cliente',metodo:'EFECTIVO',items:[{detalleId:original.items[0].id,cantidad:1,destino:'NO_ENTREGADO'}]};
    return {ops,adminId,sale,command};
  };

  it('solicitar y autorizar no mueve dinero ni inventario; ejecutar usa la caja del solicitante una sola vez',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    const stockBefore=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});
    const movementBefore=await prisma.movimientoCaja.count({where:{usuarioId}});
    const created=await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    expect(created.estado).toBe('PENDIENTE');
    await expect(ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)).rejects.toThrow('autorizada');
    await expect(ops.decidirDevolucion(tenantId,usuarioId,command.solicitudId,{decision:'AUTORIZADA',motivo:'OK'})).rejects.toThrow('administrador');
    await expect(ops.devolver(tenantId,usuarioId,sale.id,command)).rejects.toThrow('administrador');
    const decision={decision:'AUTORIZADA',motivo:'Productos revisados'};
    await Promise.all([ops.decidirDevolucion(tenantId,adminId,command.solicitudId,decision),ops.decidirDevolucion(tenantId,adminId,command.solicitudId,decision)]);
    expect(await prisma.movimientoCaja.count({where:{usuarioId}})).toBe(movementBefore);
    const stockAuthorized=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});
    expect(stockAuthorized.stockActual.toString()).toBe(stockBefore.stockActual.toString());
    expect(stockAuthorized.stockReservado.toString()).toBe(stockBefore.stockReservado.toString());
    await expect(ops.ejecutarAutorizada(tenantId,adminId,command.solicitudId)).rejects.toThrow('no encontrada');
    const results=await Promise.all([ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId),ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)]);
    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(1);
    expect(await prisma.movimientoCaja.count({where:{usuarioId}})).toBe(movementBefore+1);
    expect((await ops.consultarDevolucion(tenantId,usuarioId,command.solicitudId)).estado).toBe('EJECUTADA');
    const audit=await ops.auditoria(tenantId,0);
    expect(audit.some(a=>a.operacion==='DEVOLUCION_DECIDIR'&&a.usuario_id===adminId)).toBe(true);
    expect(audit.some(a=>a.operacion==='DEVOLUCION_EJECUTAR_AUTORIZADA'&&a.usuario_id===usuarioId&&a.datos.administradorId===adminId)).toBe(true);
  });

  it('solicitudes son inmutables, recuperables y aisladas por usuario y empresa',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    const results=await Promise.all([ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command),ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command)]);
    expect(results[0].id).toBe(results[1].id);
    await expect(ops.solicitarDevolucion(tenantId,usuarioId,sale.id,{...command,motivo:'Cambio'})).rejects.toThrow('otra devolución');
    const otherId=randomUUID();await prisma.usuario.create({data:{id:otherId,tenantId,nombre:'Otro cajero',email:'other@example.test',passwordHash:'test-only',rol:'CAJERO'}});
    expect(await ops.solicitudesDevolucion(tenantId,otherId)).toHaveLength(0);
    await expect(ops.consultarDevolucion(tenantId,otherId,command.solicitudId)).rejects.toThrow('no encontrada');
    expect(await ops.solicitudesDevolucion(tenantId,adminId)).toHaveLength(1);
    const anotherTenant=randomUUID(),anotherAdmin=randomUUID();
    await prisma.tenant.create({data:{id:anotherTenant,nombreComercial:'Otra empresa'}});
    await prisma.usuario.create({data:{id:anotherAdmin,tenantId:anotherTenant,nombre:'Otro admin',email:'another@example.test',passwordHash:'test-only',rol:'ADMIN'}});
    await expect(ops.consultarDevolucion(anotherTenant,anotherAdmin,command.solicitudId)).rejects.toThrow('no encontrada');
    await expect(ops.decidirDevolucion(anotherTenant,anotherAdmin,command.solicitudId,{decision:'AUTORIZADA',motivo:'OK'})).rejects.toThrow('no encontrada');
  });

  it('rechazo no ejecuta ajustes ni puede sustituirse por autorización',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    await ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'RECHAZADA',motivo:'No corresponde'});
    await expect(ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)).rejects.toThrow('autorizada');
    await expect(ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'AUTORIZADA',motivo:'Cambio'})).rejects.toThrow('decisión');
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(0);
  });

  it('caja cerrada causa rollback completo y permite ejecutar tras abrir sin otra autorización',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    await ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'AUTORIZADA',motivo:'OK'});
    const [cash]=await ops.caja(tenantId,usuarioId);await ops.cerrar(tenantId,usuarioId,cash.id,{monto:cash.efectivoEsperado});
    const stock=await prisma.producto.findUniqueOrThrow({where:{id:productoId}});
    await expect(ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)).rejects.toThrow('Abra su caja');
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(0);
    expect((await ops.consultarDevolucion(tenantId,usuarioId,command.solicitudId)).estado).toBe('AUTORIZADA');
    expect((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockReservado.toString()).toBe(stock.stockReservado.toString());
    await ops.abrir(tenantId,usuarioId,{solicitudId:randomUUID(),monto:100});
    await ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId);
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(1);
  });

  it('cantidades o destino cambiados después de aprobar se vuelven a validar al ejecutar',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    await ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'AUTORIZADA',motivo:'OK'});
    await ops.entregar(tenantId,usuarioId,sale.id);
    await expect(ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)).rejects.toThrow('destino físico');
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(0);
  });

  it('autorización de administrador desactivado no ejecuta y crédito se cancela sin reembolso',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn(true);
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    await ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'AUTORIZADA',motivo:'OK'});
    await prisma.usuario.update({where:{id:adminId},data:{activo:false}});
    await expect(ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)).rejects.toThrow('no disponible');
    await prisma.usuario.update({where:{id:adminId},data:{activo:true}});
    const result=await ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId);
    expect(Number(result.credito_cancelado)).toBeGreaterThan(0);expect(Number(result.reembolso)).toBe(0);
    await prisma.usuario.update({where:{id:adminId},data:{activo:false}});
    expect((await ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)).id).toBe(result.id);
  });

  it('devolución autorizada parcial de mercancía entregada restaura solo lo devuelto y conserva la venta',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    await ops.entregar(tenantId,usuarioId,sale.id);
    command.items[0].cantidad=.5;command.items[0].destino='INVENTARIO';
    const before=Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual);
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    await ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'AUTORIZADA',motivo:'Medio producto recibido'});
    const result=await ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productoId}})).stockActual)).toBe(before+.5);
    expect(Number(result.monto)).toBe(5.75);
    expect((await prisma.venta.findUniqueOrThrow({where:{id:sale.id}})).estado).toBe('COMPLETADA');
    const updated=await ops.buscarVenta(tenantId,String(sale.numeroVenta));
    expect(Number(updated.items[0].devuelto)).toBe(.5);
  });

  it('otra devolución posterior a la autorización impide devolver cantidades ya consumidas',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    await ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'AUTORIZADA',motivo:'OK'});
    await expect(ops.devolver(tenantId,adminId,sale.id,command)).rejects.toThrow('solicitud');
    await ops.abrir(tenantId,adminId,{solicitudId:randomUUID(),monto:100});
    await ops.devolver(tenantId,adminId,sale.id,{...command,solicitudId:randomUUID()});
    await expect(ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId)).rejects.toThrow('supera');
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(1);
    expect((await ops.consultarDevolucion(tenantId,usuarioId,command.solicitudId)).estado).toBe('AUTORIZADA');
  });

  it('dos administradores consultan las mismas solicitudes y cualquiera puede autorizar',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    const secondAdmin=randomUUID();
    await prisma.usuario.create({data:{id:secondAdmin,tenantId,nombre:'Segundo administrador',email:'admin2@example.test',passwordHash:'test-only',rol:'ADMIN'}});
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    expect((await ops.solicitudesDevolucion(tenantId,adminId))[0].id).toBe(command.solicitudId);
    expect((await ops.solicitudesDevolucion(tenantId,secondAdmin))[0].id).toBe(command.solicitudId);
    await ops.decidirDevolucion(tenantId,secondAdmin,command.solicitudId,{decision:'AUTORIZADA',motivo:'Revisado por segundo administrador'});
    const request=await ops.consultarDevolucion(tenantId,adminId,command.solicitudId);
    expect(request.administrador_id).toBe(secondAdmin);
    await ops.ejecutarAutorizada(tenantId,usuarioId,command.solicitudId);
    const audit=await ops.auditoria(tenantId,0);
    expect(audit.some(a=>a.operacion==='DEVOLUCION_EJECUTAR_AUTORIZADA'&&a.datos.administradorId===secondAdmin)).toBe(true);
  });

  it('dos administradores decidiendo simultáneamente conservan una sola decisión y su autor',async()=>{
    const {ops,adminId,sale,command}=await authorizedReturn();
    const secondAdmin=randomUUID();
    await prisma.usuario.create({data:{id:secondAdmin,tenantId,nombre:'Segundo administrador',email:'admin2@example.test',passwordHash:'test-only',rol:'ADMIN'}});
    await ops.solicitarDevolucion(tenantId,usuarioId,sale.id,command);
    const outcomes=await Promise.allSettled([
      ops.decidirDevolucion(tenantId,adminId,command.solicitudId,{decision:'AUTORIZADA',motivo:'Autorizar'}),
      ops.decidirDevolucion(tenantId,secondAdmin,command.solicitudId,{decision:'RECHAZADA',motivo:'Rechazar'}),
    ]);
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
    const winner=outcomes.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>;
    const request=await ops.consultarDevolucion(tenantId,adminId,command.solicitudId);
    expect(request.estado).toBe(winner.value.estado);
    expect(request.administrador_id).toBe(winner.value.administrador_id);
    const audit=await ops.auditoria(tenantId,0);
    const decisions=audit.filter(a=>a.operacion==='DEVOLUCION_DECIDIR'&&a.entidad_id===command.solicitudId);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].usuario_id).toBe(request.administrador_id);
    expect(await prisma.devolucion.count({where:{tenantId}})).toBe(0);
  });

});
