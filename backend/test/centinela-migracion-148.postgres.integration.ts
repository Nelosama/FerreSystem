import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';

// CENTINELA — migración 20261012000000_entrega_eventos_y_cantidades sobre datos históricos (PR #148).
// Cada escenario usa su propio clúster PostgreSQL temporal. Nunca lee DATABASE_URL ni toca producción.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);
const MIGRACION = '20261012000000_entrega_eventos_y_cantidades';

type Clúster = { directory: string; port: number; env: NodeJS.ProcessEnv; options: any };

async function iniciar(): Promise<Clúster> {
  const directory = mkdtempSync(join(tmpdir(), 'ferresystem-migracion148-'));
  const listener = createServer();
  await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>(done => listener.close(() => done()));
  const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
  const options = { windowsHide: true, timeout: 60000, env, stdio: 'pipe' as const };
  execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
  execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
  return { directory, port, env, options };
}
const detener = (c: Clúster) => {
  try { execFileSync(exe('pg_ctl'), ['-D', join(c.directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' }); } catch { /* ya detenido */ }
  if (c.directory && resolve(c.directory).startsWith(resolve(tmpdir()) + sep)) rmSync(c.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
};
const psql = (c: Clúster, sqlTexto: string) => {
  const archivo = join(c.directory, `${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(archivo, sqlTexto);
  return execFileSync(exe('psql'), ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(c.port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], { ...c.options, encoding: 'utf8' }).trim();
};
const consulta = (c: Clúster, sqlTexto: string) => psql(c, sqlTexto);
const migrarHasta = (c: Clúster, incluirEntregas: boolean) => {
  for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
    if (!incluirEntregas && migracion >= MIGRACION) continue;
    const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
    if (!existsSync(archivo)) continue;
    execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(c.port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], c.options);
  }
};
/** Proyecto temporal: copia del esquema y de las migraciones seleccionadas. Así se usa `prisma migrate deploy` real. */
function proyectoTemporal(c: Clúster, modo: 'antes' | 'hasta' | 'todas') {
  const raiz = join(c.directory, 'proyecto');
  const carpeta = join(raiz, 'prisma');
  const { mkdirSync, cpSync } = require('node:fs');
  mkdirSync(join(carpeta, 'migrations'), { recursive: true });
  cpSync(resolve('prisma/schema.prisma'), join(carpeta, 'schema.prisma'));
  for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
    if (modo === 'antes' && migracion >= MIGRACION) continue;
    if (modo === 'hasta' && migracion > MIGRACION) continue;
    if (!existsSync(resolve('prisma/migrations', migracion, 'migration.sql'))) continue;
    cpSync(resolve('prisma/migrations', migracion), join(carpeta, 'migrations', migracion), { recursive: true });
  }
  return join(carpeta, 'schema.prisma');
}
/** `prisma migrate deploy` contra el clúster temporal. Devuelve la salida o lanza con stderr. */
function desplegar(c: Clúster, esquema: string) {
  const url = `postgresql://postgres@127.0.0.1:${c.port}/postgres`;
  return execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', esquema], {
    ...c.options, cwd: resolve('.'), encoding: 'utf8', timeout: 300000,
    env: { ...c.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
const migrarEntregas = (c: Clúster) => desplegar(c, proyectoTemporal(c, 'todas'));

/** Datos históricos con el estado anterior a la migración. Devoluciones según la lógica anterior: sobre reserva, reducen reserva. */
function sembrar(incluirCasoRiesgoso: boolean) {
  return `
INSERT INTO tenants (id, nombre_comercial, updated_at) VALUES ('T1', 'Histórico', NOW());
INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, permisos, permisos_configurados, updated_at) VALUES ('U1', 'T1', 'Admin', 'a@h.test', 'x', 'ADMIN', '{}', false, NOW());
INSERT INTO productos (id, tenant_id, codigo, nombre, precio_venta, precio_costo, stock_actual, stock_reservado, stock_minimo, precio_aprobado, updated_at)
  VALUES ('P1', 'T1', 'H-1', 'Producto histórico', 100, 40, 100, 0, 0, true, NOW());
-- Pendiente de entrega (reserva sin entregar), 5 unidades. Reserva legada: 5.
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_PEND', 'T1', 1, 'U1', 500, 75, 575, true, NULL, 'ONLINE', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario)
  VALUES ('D_PEND', 'V_PEND', 'P1', 5, 100, 500, 40, false);
-- Entregada en el flujo anterior (ONLINE): entrega total, reserva apagada.
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_ENT', 'T1', 2, 'U1', 300, 45, 345, false, NOW(), 'ONLINE', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario)
  VALUES ('D_ENT', 'V_ENT', 'P1', 3, 100, 300, 40, false);
-- Contingencia (efectivo en mostrador): entregada al cobrar.
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_CONT', 'T1', 3, 'U1', 200, 30, 230, false, NOW(), 'CONTINGENCIA', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario)
  VALUES ('D_CONT', 'V_CONT', 'P1', 2, 100, 200, 40, false);
-- Sin inventario (pedido especial): fuera de contadores.
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_SIN', 'T1', 4, 'U1', 100, 15, 115, false, NULL, 'ONLINE', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario)
  VALUES ('D_SIN', 'V_SIN', 'P1', 1, 100, 100, 40, true);
-- Entregada y luego devuelta 1 unidad al inventario (legado: stock_actual += 1).
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_DEV', 'T1', 5, 'U1', 400, 60, 460, false, NOW(), 'ONLINE', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario)
  VALUES ('D_DEV', 'V_DEV', 'P1', 4, 100, 400, 40, false);
INSERT INTO devoluciones (id, tenant_id, venta_id, usuario_id, solicitud_hash, motivo, monto, credito_cancelado, reembolso, metodo)
  VALUES ('DEV1', 'T1', 'V_DEV', 'U1', 'h1', 'Defecto', 115, 0, 115, 'EFECTIVO');
INSERT INTO detalles_devolucion (id, devolucion_id, detalle_venta_id, cantidad, destino) VALUES ('DD1', 'DEV1', 'D_DEV', 1, 'INVENTARIO');
${incluirCasoRiesgoso ? `
-- Caso riesgoso: sobre reserva NO entregada, devolución con destino INVENTARIO (legado: solo reduce la reserva).
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_RIESGO', 'T1', 6, 'U1', 200, 30, 230, true, NULL, 'ONLINE', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario)
  VALUES ('D_RIESGO', 'V_RIESGO', 'P1', 2, 100, 200, 40, false);
INSERT INTO devoluciones (id, tenant_id, venta_id, usuario_id, solicitud_hash, motivo, monto, credito_cancelado, reembolso, metodo)
  VALUES ('DEV2', 'T1', 'V_RIESGO', 'U1', 'h2', 'Cliente desistió', 230, 0, 230, 'EFECTIVO');
INSERT INTO detalles_devolucion (id, devolucion_id, detalle_venta_id, cantidad, destino) VALUES ('DD2', 'DEV2', 'D_RIESGO', 2, 'INVENTARIO');
` : ''}
-- Reserva legada: 5 (venta pendiente) + 2 (caso riesgoso) cuando existe; la devolución de V_DEV no toca la reserva.
UPDATE productos SET stock_reservado = ${incluirCasoRiesgoso ? 5 : 5}, stock_actual = 100 WHERE id = 'P1';
`;
}

describe('CENTINELA: migración de entregas sobre datos históricos (PR #148)', () => {
  it('datos históricos sanos: la migración se aplica, los contadores son correctos y la reserva cuadra', async () => {
    const c = await iniciar();
    try {
      desplegar(c, proyectoTemporal(c, 'antes'));
      psql(c, sembrar(false));
      migrarEntregas(c);
      const modos = consulta(c, "SELECT id || '=' || modo_entrega FROM detalles_venta ORDER BY id;");
      expect(modos.split('\n')).toEqual(['D_CONT=MOSTRADOR', 'D_DEV=BODEGA', 'D_ENT=BODEGA', 'D_PEND=BODEGA', 'D_SIN=SIN_INVENTARIO']);
      // Pendiente real por línea: C − E − N (solo BODEGA).
      const pendientes = consulta(c, "SELECT COALESCE(SUM(cantidad - cantidad_entregada - cantidad_cancelada), 0) FROM detalles_venta WHERE modo_entrega='BODEGA';");
      expect(Number(pendientes)).toBe(5);
      // Invariante: reserva del producto = pendiente de las líneas BODEGA.
      const reservado = consulta(c, "SELECT stock_reservado FROM productos WHERE id='P1';");
      expect(Number(reservado)).toBe(Number(pendientes));
      // La devolución de V_DEV se refleja como reingreso y no como entrega pendiente.
      const dev = consulta(c, "SELECT cantidad_entregada || '/' || cantidad_devuelta_reingresada FROM detalles_venta WHERE id='D_DEV';");
      expect(dev).toBe('4.00/1.00');
    } finally { detener(c); }
  }, 240000);

  it('devolución INVENTARIO sobre reserva no entregada (dato legado): la migración aborta sin dejar datos a medias', async () => {
    const c = await iniciar();
    try {
      desplegar(c, proyectoTemporal(c, 'antes'));
      psql(c, sembrar(true));
      let error = '';
      try { migrarEntregas(c); } catch (e: any) { error = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message}`; }
      expect(error).toContain('Backfill de entregas inconsistente');
      // Transaccional: la base queda como antes de la migración (sin tablas nuevas ni columnas).
      const tablas = consulta(c, "SELECT count(*) FROM information_schema.tables WHERE table_name='entregas_eventos';");
      expect(tablas).toBe('0');
      const columnas = consulta(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='detalles_venta' AND column_name='modo_entrega';");
      expect(columnas).toBe('0');
    } finally { detener(c); }
  }, 240000);

  it('propuesta de corrección del paso 6: el caso riesgoso migra, la línea no queda pendiente y la reserva cuadra', async () => {
    const c = await iniciar();
    try {
      desplegar(c, proyectoTemporal(c, 'antes'));
      psql(c, sembrar(true));
      // Mismo proyecto temporal, pero con la migración de entregas reemplazada por la propuesta corregida.
      const esquema = proyectoTemporal(c, 'todas');
      writeFileSync(join(resolve(esquema, '..'), 'migrations', MIGRACION, 'migration.sql'), readFileSync(resolve('prisma/propuestas/entregas-148/01_entrega_eventos_backfill_corregido.sql'), 'utf8'));
      desplegar(c, esquema);
      const pendientes = consulta(c, "SELECT COALESCE(SUM(cantidad - cantidad_entregada - cantidad_cancelada), 0) FROM detalles_venta WHERE modo_entrega='BODEGA';");
      expect(Number(pendientes)).toBe(5);
      const riesgo = consulta(c, "SELECT (cantidad - cantidad_entregada - cantidad_cancelada)::text FROM detalles_venta WHERE id='D_RIESGO';");
      expect(riesgo).toBe('0.00');
      expect(consulta(c, "SELECT stock_reservado FROM productos WHERE id='P1';")).toBe(consulta(c, "SELECT SUM(cantidad - cantidad_entregada - cantidad_cancelada) FROM detalles_venta WHERE modo_entrega='BODEGA';"));
      expect(consulta(c, "SELECT cantidad_cancelada FROM detalles_venta WHERE id='D_RIESGO';")).toBe('2.00');
    } finally { detener(c); }
  }, 240000);

  it('rollback propuesto: tras migrar y revertir, el esquema es idéntico al anterior a la migración', async () => {
    const antes = await iniciar();
    const despues = await iniciar();
    try {
      desplegar(antes, proyectoTemporal(antes, 'antes'));
      desplegar(despues, proyectoTemporal(despues, 'antes'));
      desplegar(despues, proyectoTemporal(despues, 'hasta'));
      psql(despues, readFileSync(resolve('prisma/propuestas/entregas-148/02_rollback_entregas_eventos.sql'), 'utf8'));
      const dump = (c: Clúster) => execFileSync(exe('pg_dump'), ['--schema-only', '--no-owner', '--no-privileges', '-h', '127.0.0.1', '-p', String(c.port), '-U', 'postgres', '-d', 'postgres'], { ...c.options, encoding: 'utf8' })
        .split('\n').filter(l => !l.startsWith('--') && !l.startsWith('\\restrict') && !l.startsWith('\\unrestrict') && l.trim() !== '').join('\n');
      expect(dump(despues)).toBe(dump(antes));
    } finally { detener(antes); detener(despues); }
  }, 360000);
});
