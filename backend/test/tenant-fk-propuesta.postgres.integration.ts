import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

// Propuesta NEXUS de FK compuestas (tenant_id, id): se valida en un clúster temporal con datos de prueba.
// Los scripts viven en prisma/propuestas (no son migraciones). Nunca lee DATABASE_URL de producción.
describe('Propuesta FK compuestas con tenant / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const backend = resolve(__dirname, '..');
  const propuesta = (archivo: string) => join(backend, 'prisma', 'propuestas', 'tenant-fk-compuestas', archivo);
  const auditoria = join(backend, 'scripts', 'auditoria-tenant-cruzado-lectura.sql');
  let directory = '';
  let started = false;
  let port = 0;

  const psql = (args: string[]) => spawnSync(exe('psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'prueba', '-v', 'ON_ERROR_STOP=1', '-tA', ...args], { encoding: 'utf8', timeout: 60000 });
  const sql = (q: string) => psql(['-c', q]);
  const archivo = (f: string) => psql(['-f', f]);
  const cuenta = (q: string) => Number(sql(q).stdout.trim());
  const ok = (r: ReturnType<typeof psql>) => { expect(r.status, r.stderr).toBe(0); return r; };

  const pp = (id: string, tenant: string, producto: string, proveedor: string) =>
    sql(`INSERT INTO productos_proveedores(id,tenant_id,producto_id,proveedor_id,updated_at) VALUES ('${id}','${tenant}','${producto}','${proveedor}',now())`);

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-tenantfk-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8'], { timeout: 60000, stdio: 'pipe' });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-o', `-p ${port} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', join(directory, 'server.log'), '-w', 'start'], { timeout: 60000, stdio: 'pipe' });
    started = true;
    execFileSync(exe('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'prueba'], { timeout: 30000, stdio: 'pipe' });
    const url = `postgresql://postgres@127.0.0.1:${port}/prueba`;
    execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], { cwd: backend, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' }, timeout: 180000, stdio: 'pipe' });
    // Datos de prueba: dos empresas, y una referencia HEREDADA incorrecta (producto de B en vínculo de A).
    ok(psql(['-c', `
      INSERT INTO tenants(id,nombre_comercial,updated_at) VALUES ('tA','A',now()),('tB','B',now());
      INSERT INTO usuarios(id,tenant_id,nombre,email,password_hash,updated_at) VALUES ('uA','tA','U','u@a','x',now());
      INSERT INTO productos(id,tenant_id,codigo,nombre,precio_venta,precio_costo,updated_at) VALUES ('pA','tA','X1','PA',10,5,now()),('pB','tB','X1','PB',10,5,now());
      INSERT INTO proveedores(id,tenant_id,nombre,updated_at) VALUES ('vA','tA','VA',now()),('vA2','tA','VA2',now()),('vB','tB','VB',now());
      INSERT INTO clientes(id,tenant_id,nombre,updated_at) VALUES ('cA','tA','CA',now()),('cB','tB','CB',now());
      INSERT INTO productos_proveedores(id,tenant_id,producto_id,proveedor_id,updated_at) VALUES ('ok1','tA','pA','vA',now()),('HEREDADO','tA','pB','vA',now());`]));
  }, 240000);

  afterAll(() => {
    if (started) { try { execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 60000, stdio: 'pipe' }); } catch { /* ya detenido */ } }
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('antes de la propuesta la base acepta una referencia entre empresas (riesgo actual)', () => {
    expect(pp('antes', 'tA', 'pB', 'vA2').status).toBe(0);
    sql(`DELETE FROM productos_proveedores WHERE id='antes'`);
  });

  it('la auditoría de solo lectura detecta el dato heredado', () => {
    const salida = ok(archivo(auditoria)).stdout;
    expect(salida).toMatch(/productos_proveedores_producto_fkey\|.*\|1/);
  });

  it('UP no falla con datos heredados y no modifica ninguna fila', () => {
    const antes = [cuenta('SELECT count(*) FROM productos_proveedores'), cuenta('SELECT count(*) FROM productos'), cuenta('SELECT count(*) FROM clientes')];
    ok(archivo(propuesta('01_up_piloto.sql')));
    const despues = [cuenta('SELECT count(*) FROM productos_proveedores'), cuenta('SELECT count(*) FROM productos'), cuenta('SELECT count(*) FROM clientes')];
    expect(despues).toEqual(antes);
    expect(sql(`SELECT count(*) FROM pg_constraint WHERE conname IN ('productos_proveedores_tenant_producto_fkey','ventas_tenant_cliente_fkey') AND NOT convalidated`).stdout.trim()).toBe('2');
  });

  it('las FK originales de una columna siguen existiendo (cambio aditivo)', () => {
    expect(cuenta(`SELECT count(*) FROM pg_constraint WHERE conname IN ('productos_proveedores_producto_fkey','productos_proveedores_proveedor_fkey')`)).toBe(2);
  });

  it('rechaza una inserción nueva con producto de otra empresa', () => {
    const r = pp('nuevo-cruzado', 'tA', 'pB', 'vA2');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('productos_proveedores_tenant_producto_fkey');
  });

  it('rechaza una inserción nueva con proveedor de otra empresa', () => {
    const r = pp('nuevo-cruzado-2', 'tA', 'pA', 'vB');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('productos_proveedores_tenant_proveedor_fkey');
  });

  it('acepta inserciones válidas de cada empresa', () => {
    expect(pp('ok2', 'tB', 'pB', 'vB').status).toBe(0);
    expect(pp('ok3', 'tA', 'pA', 'vA2').status).toBe(0);
  });

  it('ventas: rechaza cliente de otra empresa, acepta cliente propio y venta sin cliente', () => {
    const venta = (id: string, n: number, cliente: string) => sql(`INSERT INTO ventas(id,tenant_id,numero_venta,usuario_id,cliente_id,subtotal,isv,total) VALUES ('${id}','tA',${n},'uA',${cliente},1,0,1)`);
    const cruzada = venta('v1', 1, `'cB'`);
    expect(cruzada.status).not.toBe(0);
    expect(cruzada.stderr).toContain('ventas_tenant_cliente_fkey');
    expect(venta('v2', 2, `'cA'`).status).toBe(0);
    expect(venta('v3', 3, 'NULL').status).toBe(0);
  });

  it('VALIDATE falla mientras exista el dato heredado y no cambia el estado', () => {
    const r = archivo(propuesta('02_validate_piloto.sql'));
    expect(r.status).not.toBe(0);
    expect(sql(`SELECT convalidated FROM pg_constraint WHERE conname='productos_proveedores_tenant_producto_fkey'`).stdout.trim()).toBe('f');
  });

  it('VALIDATE pasa cuando el dato heredado se corrige con decisión explícita', () => {
    ok(sql(`DELETE FROM productos_proveedores WHERE id='HEREDADO'`));
    ok(archivo(propuesta('02_validate_piloto.sql')));
    expect(cuenta(`SELECT count(*) FROM pg_constraint WHERE conname LIKE '%_tenant_%fkey' AND conname IN ('productos_proveedores_tenant_producto_fkey','productos_proveedores_tenant_proveedor_fkey','ventas_tenant_cliente_fkey') AND convalidated`)).toBe(3);
  });

  it('ROLLBACK elimina solo las restricciones nuevas y conserva filas y FK originales', () => {
    const filas = cuenta('SELECT count(*) FROM productos_proveedores');
    ok(archivo(propuesta('03_rollback_piloto.sql')));
    expect(cuenta(`SELECT count(*) FROM pg_constraint WHERE conname IN ('productos_proveedores_tenant_producto_fkey','productos_proveedores_tenant_proveedor_fkey','ventas_tenant_cliente_fkey','productos_tenant_id_id_key','proveedores_tenant_id_id_key','clientes_tenant_id_id_key')`)).toBe(0);
    expect(cuenta('SELECT count(*) FROM productos_proveedores')).toBe(filas);
    expect(cuenta(`SELECT count(*) FROM pg_constraint WHERE conname IN ('productos_proveedores_producto_fkey','productos_proveedores_proveedor_fkey')`)).toBe(2);
  });

  it('es repetible: UP, ROLLBACK y UP otra vez', () => {
    ok(archivo(propuesta('01_up_piloto.sql')));
    ok(archivo(propuesta('03_rollback_piloto.sql')));
    ok(archivo(propuesta('01_up_piloto.sql')));
    expect(cuenta(`SELECT count(*) FROM pg_constraint WHERE conname='ventas_tenant_cliente_fkey'`)).toBe(1);
  });
});
