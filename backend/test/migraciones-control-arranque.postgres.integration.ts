import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';

// Preproducción: arranque seguro (verify/startup) y comportamiento de las migraciones 20261011150000 y 20261017000000 sobre datos.
// Cada escenario usa su propio clúster PostgreSQL temporal. Nunca lee DATABASE_URL ni toca producción.
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
const M_PRECIO = '20261011150000_precio_aprobacion_producto';
const M_F5 = '20261017000000_contingencia_rechazos_importe_incoherente';
const todas = readdirSync(resolve('prisma/migrations')).filter((n) => /^\d{14}_/.test(n)).sort();

type Cl = { dir: string; port: number; url: string };
async function iniciar(): Promise<Cl> {
  const dir = mkdtempSync(join(tmpdir(), 'ferresystem-preprod-'));
  const l = createServer();
  await new Promise<void>((ok, ko) => { l.once('error', ko); l.listen(0, '127.0.0.1', ok); });
  const port = (l.address() as { port: number }).port;
  await new Promise<void>((ok) => l.close(() => ok()));
  const opts = { timeout: 60000, stdio: 'pipe' as const };
  execFileSync(exe('initdb'), ['-D', join(dir, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], opts);
  execFileSync(exe('pg_ctl'), ['-D', join(dir, 'data'), '-l', join(dir, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + dir}`, '-w', 'start'], { ...opts, stdio: 'ignore' });
  return { dir, port, url: `postgresql://postgres@127.0.0.1:${port}/postgres` };
}
const detener = (c: Cl) => {
  try { execFileSync(exe('pg_ctl'), ['-D', join(c.dir, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 15000, stdio: 'ignore' }); } catch { /* ya detenido */ }
  if (resolve(c.dir).startsWith(resolve(tmpdir()) + sep)) rmSync(c.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
};
const sql = (c: Cl, texto: string) => execFileSync(exe('psql'), ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(c.port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', texto], { encoding: 'utf8' }).trim();
const sqlFalla = (c: Cl, texto: string) => spawnSync(exe('psql'), ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(c.port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', texto], { encoding: 'utf8' });

/** Proyecto temporal con las migraciones elegidas (opcionalmente sustituyendo el contenido de una) para usar `prisma migrate deploy` real. */
function proyecto(c: Cl, incluir: (n: string) => boolean, sustituir: Record<string, string> = {}) {
  const raiz = join(c.dir, `proyecto-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(raiz, 'prisma/migrations'), { recursive: true });
  cpSync(resolve('prisma/schema.prisma'), join(raiz, 'prisma/schema.prisma'));
  cpSync(resolve('prisma/migrations/migration_lock.toml'), join(raiz, 'prisma/migrations/migration_lock.toml'));
  for (const n of todas.filter(incluir)) {
    cpSync(resolve('prisma/migrations', n), join(raiz, 'prisma/migrations', n), { recursive: true });
    if (sustituir[n]) writeFileSync(join(raiz, 'prisma/migrations', n, 'migration.sql'), sustituir[n]);
  }
  return join(raiz, 'prisma/schema.prisma');
}
const prisma = (c: Cl, args: string[], esquema: string) => spawnSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), ...args, '--schema', esquema], {
  encoding: 'utf8', timeout: 300000, env: { ...process.env, DATABASE_URL: c.url, DIRECT_URL: c.url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
});
const seguro = (c: Cl, comando: string, extra: Record<string, string> = {}) => spawnSync(process.execPath, [resolve('scripts/migration-safe.mjs'), comando], {
  encoding: 'utf8', timeout: 300000, env: { PATH: process.env.PATH ?? '', DATABASE_URL: c.url, DIRECT_URL: c.url, ...extra },
});
const antesDe = (nombre: string) => (n: string) => n < nombre;

describe('Arranque seguro: migration-safe verify/startup no migra salvo orden explícita', () => {
  let c: Cl;
  beforeEach(async () => { c = await iniciar(); }, 90000);
  afterEach(() => detener(c));

  it('NEXUS: actualiza una base existente a Modo Guía sin alterar cuentas ni datos históricos', () => {
    const guia = '20261022000000_guia_progreso';
    const previo = prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(guia)));
    expect(previo.status, previo.stderr).toBe(0);
    sql(c, `
      INSERT INTO tenants (id, nombre_comercial, updated_at) VALUES ('guia-a', 'Histórico A', now()), ('guia-b', 'Histórico B', now());
      INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, updated_at)
        VALUES ('guia-usuario-a', 'guia-a', 'Admin A', 'a@guia.invalid', 'hash-sintetico', now()),
               ('guia-usuario-b', 'guia-b', 'Admin B', 'b@guia.invalid', 'hash-sintetico', now());
      INSERT INTO super_admins (id, nombre, email, password_hash, updated_at)
        VALUES ('guia-plataforma', 'Plataforma', 'sa@guia.invalid', 'hash-sintetico', now());
      INSERT INTO productos (id, tenant_id, codigo, nombre, precio_costo, precio_venta, stock_actual, updated_at)
        VALUES ('guia-producto', 'guia-a', 'HIST-01', 'Existencias anteriores', 8.25, 12.50, 7, now());
    `);
    // Project every historical column; additive auth columns must not hide hash/data changes.
    const columnas = (tabla: string) => sql(c, `SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='${tabla}'`);
    const usuariosPrevios = columnas('usuarios'), plataformaPrevia = columnas('super_admins');
    const cuentas = () => sql(c, `SELECT jsonb_build_object(
      'usuarios', (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM (SELECT ${usuariosPrevios} FROM usuarios) u),
      'plataforma', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM (SELECT ${plataformaPrevia} FROM super_admins) s),
      'negocios', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM tenants t),
      'productos', (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM productos p)
    )`);
    const antes = cuentas();
    const pendiente = seguro(c, 'verify');
    expect(pendiente.status).toBe(1);
    expect(pendiente.stderr).toContain(guia);
    const migrado = prisma(c, ['migrate', 'deploy'], proyecto(c, () => true));
    expect(migrado.status, migrado.stderr).toBe(0);
    expect(cuentas()).toBe(antes);
    expect(sql(c, "SELECT count(*) FROM usuarios WHERE guia_progreso = '{}'::jsonb")).toBe('2');
    expect(sql(c, "SELECT count(*) FROM super_admins WHERE guia_progreso = '{}'::jsonb")).toBe('1');
    sql(c, `UPDATE usuarios SET guia_progreso = '{"status":"completed","step":"inventario"}' WHERE id = 'guia-usuario-a'`);
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, () => true)).status).toBe(0);
    expect(sql(c, "SELECT guia_progreso->>'status' FROM usuarios WHERE id='guia-usuario-a'")).toBe('completed');
    expect(sql(c, "SELECT guia_progreso FROM usuarios WHERE id='guia-usuario-b'")).toBe('{}');
    expect(sql(c, "SELECT guia_progreso FROM super_admins WHERE id='guia-plataforma'")).toBe('{}');
    expect(cuentas()).toBe(antes);
    expect(seguro(c, 'verify').status).toBe(0);
  }, 180000);

  it('base vacía: el arranque por defecto NO arranca, no crea ninguna tabla y explica qué hacer', () => {
    const r = seguro(c, 'startup');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/El servicio NO arranca/);
    expect(r.stderr).toMatch(/no modifica la base/);
    expect(r.stderr).toMatch(/migrate:deploy/);
    expect(sql(c, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).toBe('0');
  }, 120000);

  it('FERRE_MIGRAR_AL_ARRANCAR=SI conserva el comportamiento local: migra y deja la base LISTA; luego el arranque por defecto solo verifica', () => {
    const r = seguro(c, 'startup', { FERRE_MIGRAR_AL_ARRANCAR: 'SI' });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).state).toBe('LISTA');
    const filas = sql(c, 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL');
    expect(Number(filas)).toBe(todas.length);
    const v = seguro(c, 'startup');
    expect(v.status, v.stderr).toBe(0);
    expect(sql(c, 'SELECT count(*) FROM _prisma_migrations')).toBe(String(todas.length));
    expect(seguro(c, 'verify').status).toBe(0);
  }, 240000);

  it('migraciones pendientes: verify/startup se niegan, nombran la pendiente y NO tocan la base; deploy explícito sí migra', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_F5))).status).toBe(0);
    const antes = sql(c, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='operaciones_contingencia_montos_check'");
    for (const cmd of ['verify', 'startup']) {
      const r = seguro(c, cmd);
      expect(r.status, cmd).toBe(1);
      expect(r.stderr).toContain(M_F5);
    }
    expect(sql(c, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='operaciones_contingencia_montos_check'")).toBe(antes);
    expect(sql(c, `SELECT count(*) FROM _prisma_migrations WHERE migration_name='${M_F5}'`)).toBe('0');
    const d = seguro(c, 'deploy');
    expect(d.status, d.stderr).toBe(0);
    expect(sql(c, `SELECT count(*) FROM _prisma_migrations WHERE migration_name='${M_F5}' AND finished_at IS NOT NULL`)).toBe('1');
    expect(seguro(c, 'verify').status).toBe(0);
  }, 300000);

  it('base con las migraciones de main (hasta guia_progreso): las de Contabilidad y autenticación quedan pendientes, no como hueco de historial, y migran', () => {
    const ultimaMain = '20261022000000_guia_progreso';
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, (n) => n <= ultimaMain)).status).toBe(0);
    const r = seguro(c, 'startup');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('faltan');
    expect(r.stderr).toContain('rol_contador');
    expect(r.stderr).not.toContain('HISTORIAL_CON_HUECOS');
    const d = seguro(c, 'deploy');
    expect(d.status, d.stderr).toBe(0);
    expect(d.stdout).not.toContain('HISTORIAL_CON_HUECOS');
    expect(seguro(c, 'startup').status).toBe(0);
    expect(sql(c, "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")).toBe(String(todas.length));
  }, 300000);

  it('conflicto de 20261011150000: un entorno que aplicó la otra variante queda BLOQUEADO (CHECKSUM_DISTINTO) y no arranca ni migra', () => {
    const variante = readFileSync(resolve('test/fixtures/20261011150000_variante_keen.sql.txt'), 'utf8');
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, () => true, { [M_PRECIO]: variante })).status).toBe(0);
    for (const [cmd, extra] of [['verify', {}], ['startup', {}], ['startup', { FERRE_MIGRAR_AL_ARRANCAR: 'SI' }], ['deploy', {}]] as const) {
      const r = seguro(c, cmd, extra);
      expect(r.status, `${cmd} ${JSON.stringify(extra)}`).toBe(1);
    }
    const inspeccion = seguro(c, 'inspect');
    expect(inspeccion.status).toBe(1);
    expect(JSON.parse(inspeccion.stdout).errors).toContain('CHECKSUM_DISTINTO');
    // Nada cambió: la migración sigue registrada con el checksum de la variante.
    expect(sql(c, `SELECT count(*) FROM _prisma_migrations WHERE migration_name='${M_PRECIO}' AND finished_at IS NOT NULL`)).toBe('1');
  }, 300000);
});

const SEMBRAR_PRODUCTOS = `
INSERT INTO tenants (id, nombre_comercial, updated_at) VALUES ('T1', 'Ferretería histórica', NOW());
INSERT INTO productos (id, tenant_id, codigo, nombre, precio_venta, precio_costo, stock_actual, stock_reservado, stock_minimo, activo, updated_at) VALUES
 ('P-ACT', 'T1', 'A-1', 'Activo con precio', 100, 40, 12, 0, 1, true, NOW()),
 ('P-CERO', 'T1', 'A-2', 'Activo sin precio', 0, 0, 5, 0, 1, true, NOW()),
 ('P-INAC', 'T1', 'A-3', 'Inactivo con precio', 50, 20, 7, 0, 1, false, NOW());`;
const FOTO = "SELECT id||'|'||nombre||'|'||precio_venta::text||'|'||precio_costo::text||'|'||stock_actual::text||'|'||stock_reservado::text||'|'||activo::text FROM productos ORDER BY id";

describe('20261011150000_precio_aprobacion_producto sobre datos históricos', () => {
  let c: Cl;
  beforeEach(async () => { c = await iniciar(); }, 90000);
  afterEach(() => detener(c));

  it('aprueba solo productos ACTIVOS con precio > 0; no cambia precios, costos ni existencias; no reaplica al volver a ejecutar', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_PRECIO))).status).toBe(0);
    sql(c, SEMBRAR_PRODUCTOS);
    const antes = sql(c, FOTO);
    const r = prisma(c, ['migrate', 'deploy'], proyecto(c, (n) => n <= M_PRECIO));
    expect(r.status, r.stderr).toBe(0);
    expect(sql(c, FOTO)).toBe(antes);
    expect(sql(c, "SELECT id||'='||precio_aprobado::text||'/'||coalesce(precio_aprobado_por,'-') FROM productos ORDER BY id"))
      .toBe('P-ACT=true/LEGADO_MIGRACION\nP-CERO=false/-\nP-INAC=false/-');
    const marca = sql(c, "SELECT precio_aprobado_at::text FROM productos WHERE id='P-ACT'");
    // Segunda ejecución con Prisma: no hay nada pendiente; la marca de tiempo no cambia.
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, (n) => n <= M_PRECIO)).status).toBe(0);
    expect(sql(c, "SELECT precio_aprobado_at::text FROM productos WHERE id='P-ACT'")).toBe(marca);
    // Ejecución manual duplicada del SQL: falla en la primera sentencia y no reescribe la aprobación.
    const dup = sqlFalla(c, readFileSync(resolve('prisma/migrations', M_PRECIO, 'migration.sql'), 'utf8'));
    expect(dup.status).not.toBe(0);
    expect(sql(c, "SELECT precio_aprobado_at::text FROM productos WHERE id='P-ACT'")).toBe(marca);
  }, 300000);

  it('la variante alterna aprobaría también los inactivos (por eso la candidata es la conservadora)', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_PRECIO))).status).toBe(0);
    sql(c, SEMBRAR_PRODUCTOS);
    const variante = readFileSync(resolve('test/fixtures/20261011150000_variante_keen.sql.txt'), 'utf8');
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, (n) => n <= M_PRECIO, { [M_PRECIO]: variante })).status).toBe(0);
    expect(sql(c, "SELECT count(*) FROM productos WHERE activo=false AND precio_aprobado=true AND precio_aprobado_por='LEGADO_MIGRACION'")).toBe('1');
  }, 300000);

  it('ejecución parcial previa (columna ya creada a mano): la migración falla, no cambia datos, queda MIGRACION_INCOMPLETA y se recupera sin perder nada', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_PRECIO))).status).toBe(0);
    sql(c, SEMBRAR_PRODUCTOS);
    sql(c, 'ALTER TABLE productos ADD COLUMN precio_aprobado BOOLEAN NOT NULL DEFAULT false');
    const antes = sql(c, FOTO);
    const falla = prisma(c, ['migrate', 'deploy'], proyecto(c, (n) => n <= M_PRECIO));
    expect(falla.status).not.toBe(0);
    expect(sql(c, FOTO)).toBe(antes);
    expect(sql(c, "SELECT count(*) FROM productos WHERE precio_aprobado=true")).toBe('0');
    expect(sql(c, `SELECT (finished_at IS NULL)::text||'/'||(rolled_back_at IS NULL)::text FROM _prisma_migrations WHERE migration_name='${M_PRECIO}'`)).toBe('true/true');
    const plan = seguro(c, 'inspect');
    expect(plan.status).toBe(1);
    expect(JSON.parse(plan.stdout).errors).toContain('MIGRACION_INCOMPLETA');
    expect(seguro(c, 'startup').status).toBe(1);
    // Recuperación documentada: quitar la columna suelta, marcar la migración como revertida y volver a desplegar.
    sql(c, 'ALTER TABLE productos DROP COLUMN precio_aprobado');
    const esquema = proyecto(c, (n) => n <= M_PRECIO);
    expect(prisma(c, ['migrate', 'resolve', '--rolled-back', M_PRECIO], esquema).status).toBe(0);
    expect(prisma(c, ['migrate', 'deploy'], esquema).status).toBe(0);
    expect(sql(c, FOTO)).toBe(antes);
    expect(sql(c, "SELECT count(*) FROM productos WHERE precio_aprobado=true")).toBe('1');
  }, 300000);
});

describe('20261017000000_contingencia_rechazos_importe_incoherente sobre datos existentes', () => {
  let c: Cl;
  beforeEach(async () => { c = await iniciar(); }, 90000);
  afterEach(() => detener(c));
  const DEF = "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='operaciones_contingencia_montos_check'";
  const FILA = (id: string, estado: string, total: number, efectivo: number, n: number) =>
    `INSERT INTO operaciones_contingencia (id,tenant_id,dispositivo_id,ventana_id,usuario_id,caja_id,secuencia_local,correlativo_local,ocurrido_at_local,ocurrido_at_estimado,payload,payload_hash,total_centavos,efectivo_recibido_centavos,estado) VALUES ('${id}','T1','D1','V1','U1','C1',${n},'CT-01-000${n}',NOW(),NOW(),'{}'::jsonb,'h${n}',${total},${efectivo},'${estado}');`;

  it('no puede fallar por datos existentes, conserva todas las filas, relaja solo RECHAZADA/RESUELTA_MANUAL y es idempotente', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_F5))).status).toBe(0);
    // Las claves foráneas se omiten solo para sembrar (sesión de superusuario); las restricciones CHECK siguen activas.
    sql(c, `SET session_replication_role = replica; ${FILA('O1', 'REVISION', 1000, 1000, 1)} ${FILA('O2', 'RESUELTA_MANUAL', 500, 600, 2)} ${FILA('O3', 'RECIBIDA', 250, 300, 3)}`);
    const filas = "SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM operaciones_contingencia t";
    const antes = sql(c, filas);
    const defAntes = sql(c, DEF);
    expect(defAntes).toContain('total_centavos > 0');
    const r = prisma(c, ['migrate', 'deploy'], proyecto(c, () => true));
    expect(r.status, r.stderr).toBe(0);
    expect(sql(c, filas)).toBe(antes);
    const defDespues = sql(c, DEF);
    expect(defDespues).toContain('RECHAZADA');
    // Sigue exigiendo la regla exacta para filas activas y admite importes incoherentes solo en estados terminales sin venta.
    const ins = (id: string, e: string, t: number, ef: number, n: number) => sqlFalla(c, `SET session_replication_role = replica; ${FILA(id, e, t, ef, n)}`);
    expect(ins('O4', 'RECHAZADA', 0, 0, 4).status).toBe(0);
    expect(ins('O5', 'RECHAZADA', 2000, 500, 5).status).toBe(0);
    expect(ins('O6', 'REVISION', 0, 0, 6).status).not.toBe(0);
    expect(ins('O7', 'RECIBIDA', 2000, 500, 7).status).not.toBe(0);
    expect(ins('O8', 'RECHAZADA', -1, 0, 8).status).not.toBe(0);
    // Una RECHAZADA nunca tiene venta (restricción vigente desde 20261016).
    expect(sqlFalla(c, "UPDATE operaciones_contingencia SET venta_id='X' WHERE id='O4'").status).not.toBe(0);
    // Segunda ejecución del SQL (manual): deja exactamente una restricción con la misma definición.
    const sqlMigracion = readFileSync(resolve('prisma/migrations', M_F5, 'migration.sql'), 'utf8');
    expect(sqlFalla(c, sqlMigracion).status).toBe(0);
    expect(sql(c, DEF)).toBe(defDespues);
    expect(sql(c, "SELECT count(*) FROM pg_constraint WHERE conname='operaciones_contingencia_montos_check'")).toBe('1');
  }, 300000);

  it('ejecución interrumpida entre el DROP y el ADD: al ir en un solo envío, se revierte y la restricción anterior queda intacta', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_F5))).status).toBe(0);
    const defAntes = sql(c, DEF);
    // Mismo mensaje multi-sentencia que envía Prisma, con un error forzado tras el DROP.
    const r = sqlFalla(c, 'ALTER TABLE operaciones_contingencia DROP CONSTRAINT IF EXISTS operaciones_contingencia_montos_check; SELECT 1/0;');
    expect(r.status).not.toBe(0);
    expect(sql(c, DEF)).toBe(defAntes);
  }, 300000);
});

describe('estado-base-solo-lectura.sql: informa el estado real de la base sin modificarla', () => {
  let c: Cl;
  beforeEach(async () => { c = await iniciar(); }, 90000);
  afterEach(() => detener(c));
  const informe = (cl: Cl) => {
    const r = spawnSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(cl.port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('scripts/estado-base-solo-lectura.sql')], { encoding: 'utf8' });
    return { status: r.status, salida: `${r.stdout}\n${r.stderr}` };
  };
  const fotoBase = (cl: Cl) => sql(cl, "SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)||'|'||coalesce((SELECT count(*)::text FROM _prisma_migrations),'-')");

  it('base vacía (sin historial de Prisma): no falla y advierte que no se debe migrar sin revisar', () => {
    const r = informe(c);
    expect(r.status, r.salida).toBe(0);
    expect(r.salida).toMatch(/No existe _prisma_migrations/);
  }, 120000);

  it('base completa: todas APLICADA_OK; no escribe nada', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, () => true)).status).toBe(0);
    const antes = fotoBase(c);
    const r = informe(c);
    expect(r.status, r.salida).toBe(0);
    const filas = r.salida.split('\n').filter((l) => /^\s*\d{14}_\S+\s*\|/.test(l));
    expect(filas.length).toBe(todas.length);
    expect(filas.every((l) => /\|\s*APLICADA_OK\s*$/.test(l)), filas.join('\n')).toBe(true);
    expect(r.salida).toMatch(/lineas_huerfanas/);
    expect(fotoBase(c)).toBe(antes);
  }, 240000);

  it('base atrasada: marca PENDIENTE exactamente la que falta y muestra la restricción vigente del diario', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_F5))).status).toBe(0);
    const r = informe(c);
    expect(r.status, r.salida).toBe(0);
    expect(r.salida).toMatch(new RegExp(`${M_F5}\\s*\\|\\s*PENDIENTE`));
    expect((r.salida.match(/PENDIENTE/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(r.salida).toMatch(/total_centavos > 0/);
  }, 240000);

  it('variante alterna de 20261011150000: marca APLICADA_CHECKSUM_DISTINTO y cuenta los inactivos aprobados', () => {
    const variante = readFileSync(resolve('test/fixtures/20261011150000_variante_keen.sql.txt'), 'utf8');
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe(M_PRECIO))).status).toBe(0);
    sql(c, SEMBRAR_PRODUCTOS);
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, () => true, { [M_PRECIO]: variante })).status).toBe(0);
    const r = informe(c);
    expect(r.status, r.salida).toBe(0);
    expect(r.salida).toMatch(new RegExp(`${M_PRECIO}\\s*\\|\\s*APLICADA_CHECKSUM_DISTINTO`));
    expect(r.salida).toMatch(/inactivos_legado_aprobado_variante_alterna/);
    expect(r.salida).toMatch(/\|\s*1\s*\|/);
  }, 300000);

  it('precondiciones de entregas: el informe cuenta ANTES de migrar la línea de otra empresa y la devolución sobre reserva sin entrega, y la migración efectivamente se niega', () => {
    expect(prisma(c, ['migrate', 'deploy'], proyecto(c, antesDe('20261012000000'))).status).toBe(0);
    sql(c, `
INSERT INTO tenants (id, nombre_comercial, updated_at) VALUES ('T1','Uno',NOW()),('T2','Dos',NOW());
INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, permisos, permisos_configurados, updated_at) VALUES ('U1','T1','Admin','a@h.test','x','ADMIN','{}',false,NOW());
INSERT INTO productos (id, tenant_id, codigo, nombre, precio_venta, precio_costo, stock_actual, stock_reservado, stock_minimo, precio_aprobado, updated_at) VALUES
 ('P1','T1','H-1','Uno',100,40,100,0,0,true,NOW()), ('P2','T2','H-2','Otra empresa',100,40,100,0,0,true,NOW());
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
 VALUES ('V1','T1',1,'U1',200,30,230,true,NULL,'ONLINE','COMPLETADA',NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario) VALUES
 ('D1','V1','P1',2,100,200,40,false), ('D2','V1','P2',1,100,100,40,false);
INSERT INTO devoluciones (id, tenant_id, venta_id, usuario_id, solicitud_hash, motivo, monto, credito_cancelado, reembolso, metodo) VALUES ('DEV1','T1','V1','U1','h1','Desistió',115,0,115,'EFECTIVO');
INSERT INTO detalles_devolucion (id, devolucion_id, detalle_venta_id, cantidad, destino) VALUES ('DD1','DEV1','D1',2,'INVENTARIO');`);
    const r = informe(c);
    expect(r.status, r.salida).toBe(0);
    expect(r.salida).toMatch(/lineas_producto_de_otra_empresa\s*\n-+\n\s*1\b/);
    expect(r.salida).toMatch(/d01_devoluciones_sobre_reserva_no_entregada\s*\n-+\n\s*1\b/);
    const antes = sql(c, 'SELECT (SELECT count(*) FROM detalles_venta)||\'|\'||(SELECT sum(stock_actual) FROM productos)');
    const falla = prisma(c, ['migrate', 'deploy'], proyecto(c, () => true));
    expect(falla.status).not.toBe(0);
    expect(sql(c, 'SELECT (SELECT count(*) FROM detalles_venta)||\'|\'||(SELECT sum(stock_actual) FROM productos)')).toBe(antes);
    expect(seguro(c, 'startup').status).toBe(1);
  }, 300000);
});
