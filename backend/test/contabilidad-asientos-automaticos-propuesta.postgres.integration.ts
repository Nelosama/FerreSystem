import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

// Propuesta NEXUS de asientos automáticos (prisma/propuestas/contabilidad-asientos-automaticos): se valida en un
// clúster temporal con la cadena completa de migraciones. Los scripts NO son migraciones. Nunca lee DATABASE_URL.
describe('Propuesta de asientos automáticos / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const backend = resolve(__dirname, '..');
  const propuesta = (archivo: string) => join(backend, 'prisma', 'propuestas', 'contabilidad-asientos-automaticos', archivo);
  let directory = '';
  let started = false;
  let port = 0;

  const psql = (args: string[], db = 'prueba') => spawnSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-tA', ...args], { encoding: 'utf8', timeout: 60000 });
  const sql = (q: string, db?: string) => psql(['-c', q], db);
  const archivo = (f: string, db?: string) => psql(['-f', f], db);
  const cuenta = (q: string, db?: string) => Number(sql(q, db).stdout.trim());
  const ok = (r: ReturnType<typeof psql>) => { expect(r.status, r.stderr).toBe(0); return r; };
  const falla = (r: ReturnType<typeof psql>, patron?: RegExp) => { expect(r.status, 'debía fallar').not.toBe(0); if (patron) expect(r.stderr).toMatch(patron); };
  const huella = 'a'.repeat(64);

  const lote = (id: string, tenant = 'tA', solicitud = `s-${id}`, usuario = 'uA') =>
    sql(`INSERT INTO contable_lotes(id,tenant_id,solicitud_id,anio,mes,cantidad_asientos,total_centavos,creado_por) VALUES ('${id}','${tenant}','${solicitud}',2026,9,1,11500,'${usuario}')`);
  // Un asiento cuadrado (2 líneas) con columnas de origen opcionales, en una sola transacción.
  const asiento = (id: string, numero: number, extra: { tenant?: string; origen?: string; tipo?: string | null; origenId?: string | null; evento?: string | null; lote?: string | null; version?: number | null; huella?: string | null; cuentas?: [string, string] } = {}) => {
    const t = extra.tenant ?? 'tA';
    const q = (v: string | number | null | undefined) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${v}'`);
    const [c1, c2] = extra.cuentas ?? (t === 'tA' ? ['c1', 'c2'] : ['cB1', 'cB2']);
    const usuario = t === 'tA' ? 'uA' : 'uB';
    const conOrigen = ['tipo', 'origenId', 'evento', 'lote', 'version', 'huella'].some(k => (extra as Record<string, unknown>)[k] !== undefined);
    const columnas = conOrigen ? ',origen_tipo,origen_id,evento,lote_id,regla_version,huella_origen' : '';
    const valores = conOrigen ? `,${q(extra.tipo)},${q(extra.origenId)},${q(extra.evento)},${q(extra.lote)},${q(extra.version)},${q(extra.huella)}` : '';
    return sql(`BEGIN;
      INSERT INTO contable_asientos(id,tenant_id,numero,fecha,concepto,origen,creado_por${columnas})
        VALUES ('${id}','${t}',${numero},'2026-09-10','Asiento de prueba','${extra.origen ?? 'MANUAL'}','${usuario}'${valores});
      INSERT INTO contable_asiento_lineas(id,tenant_id,asiento_id,cuenta_id,debe,haber) VALUES ('${id}-1','${t}','${id}','${c1}',115,0),('${id}-2','${t}','${id}','${c2}',0,115);
      COMMIT;`);
  };
  const auto = (id: string, numero: number, over: Parameters<typeof asiento>[2] = {}) =>
    asiento(id, numero, { origen: 'AUTOMATICO', tipo: 'VENTA', origenId: 'venta-1', evento: 'RECONOCIMIENTO', lote: 'L1', version: 1, huella, ...over });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-asientos-auto-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { timeout: 60000, stdio: 'pipe' });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-o', `-p ${port} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', join(directory, 'server.log'), '-w', 'start'], { timeout: 60000, stdio: 'ignore' });
    started = true;
    execFileSync(exe('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'prueba'], { timeout: 30000, stdio: 'pipe' });
    for (const migracion of readdirSync(resolve(backend, 'prisma/migrations')).sort()) {
      const f = resolve(backend, 'prisma/migrations', migracion, 'migration.sql');
      if (existsSync(f)) ok(archivo(f));
    }
    ok(psql(['-c', `
      INSERT INTO tenants(id,nombre_comercial,updated_at) VALUES ('tA','A',now()),('tB','B',now());
      INSERT INTO usuarios(id,tenant_id,nombre,email,password_hash,rol,updated_at) VALUES ('uA','tA','UA','a@x','x','CONTADOR',now()),('uB','tB','UB','b@x','x','CONTADOR',now());
      INSERT INTO contable_cuentas(id,tenant_id,codigo,nombre,tipo,naturaleza,creado_por) VALUES
        ('c1','tA','1','Cuenta uno','ACTIVO','DEUDORA','uA'),('c2','tA','2','Cuenta dos','INGRESO','ACREEDORA','uA'),
        ('cB1','tB','1','Cuenta uno B','ACTIVO','DEUDORA','uB'),('cB2','tB','2','Cuenta dos B','INGRESO','ACREEDORA','uB');`]));
    ok(asiento('manual-previo', 1));
    // Copia con el estado previo a la propuesta, para probar la reversión exitosa sin tocar la base principal.
    execFileSync(exe('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-T', 'prueba', 'prueba_rb'], { timeout: 60000, stdio: 'pipe' });
  }, 240000);

  afterAll(() => {
    if (started) { try { execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 60000, stdio: 'pipe' }); } catch { /* ya detenido */ } }
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('antes de la propuesta no existe un origen automático', () => {
    falla(asiento('x', 99, { origen: 'AUTOMATICO' }), /origen_chk/);
    expect(cuenta(`SELECT count(*) FROM information_schema.columns WHERE table_name='contable_asientos' AND column_name='origen_tipo'`)).toBe(0);
  });

  it('UP no modifica ninguna fila y el asiento manual previo sigue válido', () => {
    const antes = [cuenta('SELECT count(*) FROM contable_asientos'), cuenta('SELECT count(*) FROM contable_asiento_lineas'), cuenta('SELECT count(*) FROM contable_cuentas')];
    ok(archivo(propuesta('01_up.sql')));
    expect([cuenta('SELECT count(*) FROM contable_asientos'), cuenta('SELECT count(*) FROM contable_asiento_lineas'), cuenta('SELECT count(*) FROM contable_cuentas')]).toEqual(antes);
    expect(cuenta(`SELECT count(*) FROM contable_asientos WHERE origen_tipo IS NOT NULL`)).toBe(0);
    ok(asiento('manual-nuevo', 2));
  });

  it('UP es transaccional: repetirlo falla sin dejar cambios parciales', () => {
    falla(archivo(propuesta('01_up.sql')));
    expect(cuenta(`SELECT count(*) FROM pg_tables WHERE tablename IN ('contable_lotes','contable_mapeos')`)).toBe(2);
  });

  it('un asiento automático completo se acepta y una operación no se contabiliza dos veces por evento', () => {
    ok(lote('L1'));
    ok(auto('a1', 3));
    falla(auto('a1-dup', 4), /contable_asientos_origen_key/);
    ok(auto('a1-costo', 4, { evento: 'COSTO_VENTA' }));
    ok(auto('a2', 5, { origenId: 'venta-2' }));
    expect(cuenta(`SELECT count(*) FROM contable_asientos WHERE origen='AUTOMATICO'`)).toBe(3);
  });

  it('la misma operación en otra empresa no choca (la clave incluye el tenant)', () => {
    ok(lote('LB', 'tB', 's-LB', 'uB'));
    ok(auto('b1', 1, { tenant: 'tB', lote: 'LB' }));
  });

  it('rechaza datos de origen incompletos, ajenos al tipo manual o con formato inválido', () => {
    const casos: [string, ReturnType<typeof psql>][] = [
      ['sin lote', auto('i1', 20, { origenId: 'v-i1', lote: null })],
      ['sin huella', auto('i2', 21, { origenId: 'v-i2', huella: null })],
      ['huella inválida', auto('i3', 22, { origenId: 'v-i3', huella: 'XYZ' })],
      ['tipo inválido', auto('i4', 23, { origenId: 'v-i4', tipo: 'OTRO' })],
      ['evento inválido', auto('i5', 24, { origenId: 'v-i5', evento: 'minusculas' })],
      ['versión 0', auto('i6', 25, { origenId: 'v-i6', version: 0 })],
      ['manual con tipo', asiento('i7', 26, { tipo: 'VENTA' })],
      ['manual con huella', asiento('i8', 27, { origen: 'MANUAL', huella })],
    ];
    for (const [nombre, r] of casos) { expect(r.status, `${nombre} debía fallar`).not.toBe(0); expect(r.stderr, nombre).toMatch(/automatico_chk/); }
  });

  it('un asiento no puede referenciar el lote de otra empresa', () => {
    falla(auto('x1', 30, { origenId: 'v-x1', lote: 'LB' }), /lote_fkey/);
  });

  it('el lote es idempotente por solicitud, de solo inserción y de la misma empresa que su usuario', () => {
    falla(lote('L1-otro', 'tA', 's-L1'), /tenant_solicitud_key/);
    ok(lote('L10', 'tA', 's-nueva'));
    falla(sql(`UPDATE contable_lotes SET mes=10 WHERE id='L1'`), /solo inserción/);
    falla(sql(`DELETE FROM contable_lotes WHERE id='L1'`), /solo inserción/);
    falla(lote('L11', 'tA', 's-L11', 'uB'), /otra empresa/);
  });

  it('revertir un asiento automático lo marca REVERTIDO pero conserva la clave de origen', () => {
    ok(sql(`UPDATE contable_asientos SET estado='REVERTIDO' WHERE id='a2'`));
    falla(auto('a2-bis', 40, { origenId: 'venta-2' }), /contable_asientos_origen_key/);
    falla(sql(`UPDATE contable_asientos SET huella_origen='${'b'.repeat(64)}' WHERE id='a1'`), /solo puede marcarse como revertido/);
    falla(sql(`DELETE FROM contable_asientos WHERE id='a1'`), /no se eliminan/);
  });

  it('el cuadre diferido sigue vigente para los asientos automáticos', () => {
    falla(sql(`BEGIN;
      INSERT INTO contable_asientos(id,tenant_id,numero,fecha,concepto,origen,creado_por,origen_tipo,origen_id,evento,lote_id,regla_version,huella_origen)
        VALUES ('desc','tA',50,'2026-09-10','Descuadrado','AUTOMATICO','uA','VENTA','v-desc','RECONOCIMIENTO','L1',1,'${huella}');
      INSERT INTO contable_asiento_lineas(id,tenant_id,asiento_id,cuenta_id,debe,haber) VALUES ('desc-1','tA','desc','c1',115,0),('desc-2','tA','desc','c2',0,114);
      COMMIT;`), /cuadr|balance|descuadr/i);
  });

  it('mapeos: vigencias sin solape, cierre único y cuentas/usuarios de la misma empresa', () => {
    const mapeo = (id: string, concepto: string, cuentaId: string, desde: string, hasta: string | null, tenant = 'tA', usuario = 'uA') =>
      sql(`INSERT INTO contable_mapeos(id,tenant_id,concepto,cuenta_id,vigente_desde,vigente_hasta,creado_por) VALUES ('${id}','${tenant}','${concepto}','${cuentaId}','${desde}',${hasta ? `'${hasta}'` : 'NULL'},'${usuario}')`);
    ok(mapeo('m1', 'VENTAS', 'c2', '2026-01-01', null));
    falla(mapeo('m2', 'VENTAS', 'c2', '2026-06-01', null), /se solapa/);
    ok(mapeo('m3', 'CAJA_EFECTIVO', 'c1', '2026-01-01', null));            // otro concepto: sin conflicto
    ok(mapeo('mB', 'VENTAS', 'cB2', '2026-01-01', null, 'tB', 'uB'));      // otra empresa: sin conflicto
    falla(mapeo('m4', 'VENTAS', 'cB2', '2025-01-01', '2025-12-31'), /mapeos_cuenta_fkey/);
    falla(mapeo('m5', 'VENTAS', 'c2', '2025-01-01', '2025-12-31', 'tA', 'uB'), /otra empresa/);
    falla(mapeo('m6', 'NO_EXISTE', 'c2', '2025-01-01', '2025-12-31'), /concepto_chk/);
    falla(mapeo('m7', 'VENTAS', 'c2', '2025-12-31', '2025-01-01'), /vigencia_chk/);
    ok(sql(`UPDATE contable_mapeos SET vigente_hasta='2026-06-30' WHERE id='m1'`));
    ok(mapeo('m8', 'VENTAS', 'c1', '2026-07-01', null));                    // nuevo mapeo posterior al cierre
    falla(sql(`UPDATE contable_mapeos SET vigente_hasta='2026-07-31' WHERE id='m1'`), /solo admite el cierre/);
    falla(sql(`UPDATE contable_mapeos SET cuenta_id='c1' WHERE id='m3'`), /solo admite el cierre/);
    falla(sql(`DELETE FROM contable_mapeos WHERE id='m3'`), /no se eliminan/);
  });

  it('02_validate: estructura esperada', () => {
    const r = ok(archivo(propuesta('02_validate.sql'))).stdout;
    expect(r).not.toMatch(/FALTA/);
  });

  it('el rollback rechaza ejecutarse si ya hay asientos automáticos', () => {
    falla(archivo(propuesta('03_rollback.sql')), /Existen asientos automáticos/);
    expect(cuenta(`SELECT count(*) FROM contable_asientos WHERE origen='AUTOMATICO'`)).toBeGreaterThan(0);
  });

  it('el rollback en una copia sin asientos automáticos deja el esquema original y conserva los datos', () => {
    ok(archivo(propuesta('01_up.sql'), 'prueba_rb'));
    ok(archivo(propuesta('03_rollback.sql'), 'prueba_rb'));
    expect(cuenta(`SELECT count(*) FROM pg_tables WHERE tablename IN ('contable_lotes','contable_mapeos')`, 'prueba_rb')).toBe(0);
    expect(cuenta(`SELECT count(*) FROM information_schema.columns WHERE table_name='contable_asientos' AND column_name IN ('origen_tipo','origen_id','evento','lote_id','regla_version','huella_origen')`, 'prueba_rb')).toBe(0);
    expect(cuenta('SELECT count(*) FROM contable_asientos', 'prueba_rb')).toBe(1);
    // El CHECK original volvió: AUTOMATICO ya no es un origen válido.
    falla(sql(`INSERT INTO contable_asientos(id,tenant_id,numero,fecha,concepto,origen,creado_por) VALUES ('z','tA',77,'2026-09-10','Prueba','AUTOMATICO','uA')`, 'prueba_rb'), /origen_chk/);
  });
});
