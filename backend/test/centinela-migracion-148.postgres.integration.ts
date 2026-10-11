import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntregasService } from '../src/entregas/entregas.service';

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

  it('D-01 corregido: devolución INVENTARIO sobre reserva no entregada (dato legado) migra, no deja pendiente fantasma y la reserva cuadra', async () => {
    const c = await iniciar();
    try {
      desplegar(c, proyectoTemporal(c, 'antes'));
      psql(c, sembrar(true));
      migrarEntregas(c); // la migración publicada (ya corregida), por la ruta de producción: prisma migrate deploy
      const pendientes = consulta(c, "SELECT COALESCE(SUM(cantidad - cantidad_entregada - cantidad_cancelada), 0) FROM detalles_venta WHERE modo_entrega='BODEGA';");
      expect(Number(pendientes)).toBe(5);
      expect(consulta(c, "SELECT (cantidad - cantidad_entregada - cantidad_cancelada)::text FROM detalles_venta WHERE id='D_RIESGO';")).toBe('0.00');
      expect(consulta(c, "SELECT cantidad_cancelada || '/' || cantidad_devuelta_reingresada || '/' || cantidad_devuelta_sin_reingreso FROM detalles_venta WHERE id='D_RIESGO';")).toBe('2.00/0.00/0.00');
      // Sin duplicar existencias: la migración no toca stock_actual ni stock_reservado.
      expect(consulta(c, "SELECT stock_actual || '/' || stock_reservado FROM productos WHERE id='P1';")).toBe('100.00/5.00');
      expect(consulta(c, "SELECT stock_reservado FROM productos WHERE id='P1';")).toBe(consulta(c, "SELECT SUM(cantidad - cantidad_entregada - cantidad_cancelada) FROM detalles_venta WHERE modo_entrega='BODEGA';"));
      // El historial de devoluciones queda intacto.
      expect(consulta(c, "SELECT count(*) FROM detalles_devolucion;")).toBe('2');
    } finally { detener(c); }
  }, 240000);

  it('D-01: ventas históricas sin reserva ni entrega (stock descontado al vender) con devolución INVENTARIO, y DAÑADO/PROVEEDOR sobre reserva, también migran', async () => {
    const c = await iniciar();
    try {
      desplegar(c, proyectoTemporal(c, 'antes'));
      psql(c, sembrar(true) + `
-- Venta antigua sin reserva y sin fecha de entrega: la mercancía salió al vender. Devolución INVENTARIO de 1.
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_ANT', 'T1', 7, 'U1', 300, 45, 345, false, NULL, 'ONLINE', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario) VALUES ('D_ANT', 'V_ANT', 'P1', 3, 100, 300, 40, false);
INSERT INTO devoluciones (id, tenant_id, venta_id, usuario_id, solicitud_hash, motivo, monto, credito_cancelado, reembolso, metodo) VALUES ('DEV3', 'T1', 'V_ANT', 'U1', 'h3', 'Defecto', 115, 0, 115, 'EFECTIVO');
INSERT INTO detalles_devolucion (id, devolucion_id, detalle_venta_id, cantidad, destino) VALUES ('DD3', 'DEV3', 'D_ANT', 1, 'INVENTARIO');
-- Reserva pendiente con una devolución DAÑADO (1) y una PROVEEDOR (1) sobre 4 unidades no entregadas: quedan 2 pendientes.
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, origen, estado, created_at)
  VALUES ('V_MIX', 'T1', 8, 'U1', 400, 60, 460, true, NULL, 'ONLINE', 'COMPLETADA', NOW());
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario) VALUES ('D_MIX', 'V_MIX', 'P1', 4, 100, 400, 40, false);
INSERT INTO devoluciones (id, tenant_id, venta_id, usuario_id, solicitud_hash, motivo, monto, credito_cancelado, reembolso, metodo) VALUES ('DEV4', 'T1', 'V_MIX', 'U1', 'h4', 'Mixta', 230, 0, 230, 'EFECTIVO');
INSERT INTO detalles_devolucion (id, devolucion_id, detalle_venta_id, cantidad, destino) VALUES ('DD4', 'DEV4', 'D_MIX', 1, 'DAÑADO'), ('DD5', 'DEV4', 'D_MIX', 1, 'PROVEEDOR');
UPDATE productos SET stock_reservado = 7 WHERE id = 'P1'; -- 5 + 2 pendientes de V_MIX`);
      migrarEntregas(c);
      expect(consulta(c, "SELECT cantidad_entregada || '/' || cantidad_devuelta_reingresada FROM detalles_venta WHERE id='D_ANT';")).toBe('3.00/1.00');
      expect(consulta(c, "SELECT (cantidad - cantidad_entregada - cantidad_cancelada)::text || '/' || cantidad_cancelada FROM detalles_venta WHERE id='D_MIX';")).toBe('2.00/2.00');
      expect(consulta(c, "SELECT stock_reservado FROM productos WHERE id='P1';")).toBe(consulta(c, "SELECT SUM(cantidad - cantidad_entregada - cantidad_cancelada) FROM detalles_venta WHERE modo_entrega='BODEGA';"));
    } finally { detener(c); }
  }, 240000);

  it('transacción: datos realmente inconsistentes (devuelto más de lo entregado) abortan toda la migración y no dejan nada a medias', async () => {
    const c = await iniciar();
    try {
      desplegar(c, proyectoTemporal(c, 'antes'));
      psql(c, sembrar(false) + `
INSERT INTO detalles_devolucion (id, devolucion_id, detalle_venta_id, cantidad, destino) VALUES ('DDX', 'DEV1', 'D_DEV', 4, 'INVENTARIO'); -- 1 + 4 = 5 > 4 entregadas
`);
      let error = '';
      try { migrarEntregas(c); } catch (e: any) { error = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message}`; }
      expect(error).toContain('Backfill de entregas inconsistente');
      expect(consulta(c, "SELECT count(*) FROM information_schema.tables WHERE table_name='entregas_eventos';")).toBe('0');
      expect(consulta(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='detalles_venta' AND column_name IN ('modo_entrega','tenant_id');")).toBe('0');
      expect(consulta(c, "SELECT count(*) FROM pg_constraint WHERE conname LIKE 'detalles_venta_%_chk' OR conname LIKE 'ventas_tenant_id_id_key';")).toBe('0');
      // Los datos históricos siguen intactos y la migración queda registrada como fallida (no aplicada).
      expect(consulta(c, "SELECT stock_actual || '/' || stock_reservado FROM productos WHERE id='P1';")).toBe('100.00/5.00');
      expect(consulta(c, "SELECT count(*) FROM _prisma_migrations WHERE migration_name='20261012000000_entrega_eventos_y_cantidades' AND finished_at IS NOT NULL;")).toBe('0');
    } finally { detener(c); }
  }, 240000);

  it('compatibilidad con datos actuales: tras migrar, el flujo vigente (entregar el pendiente, devolver) funciona y el cuadre de reservas se conserva', async () => {
    const c = await iniciar();
    try {
      desplegar(c, proyectoTemporal(c, 'antes'));
      psql(c, sembrar(true));
      migrarEntregas(c);
      const url = `postgresql://postgres@127.0.0.1:${c.port}/postgres`;
      const prisma = new PrismaService({ datasources: { db: { url } } });
      await prisma.$connect();
      try {
        const entregas = new EntregasService(prisma);
        const lineas = [{ detalleId: 'D_PEND', cantidad: 3 }];
        const r1 = await entregas.entregar('T1', 'U1', 'V_PEND', { solicitudId: randomUUID(), receptorNombre: 'Cliente histórico', lineas } as any);
        expect(r1).toBeTruthy();
        expect(consulta(c, "SELECT stock_actual || '/' || stock_reservado FROM productos WHERE id='P1';")).toBe('97.00/2.00');
        const solicitud = randomUUID();
        await entregas.entregar('T1', 'U1', 'V_PEND', { solicitudId: solicitud, receptorNombre: 'Cliente histórico', lineas: [{ detalleId: 'D_PEND', cantidad: 2 }] } as any);
        await entregas.entregar('T1', 'U1', 'V_PEND', { solicitudId: solicitud, receptorNombre: 'Cliente histórico', lineas: [{ detalleId: 'D_PEND', cantidad: 2 }] } as any);
        expect(consulta(c, "SELECT stock_actual || '/' || stock_reservado FROM productos WHERE id='P1';")).toBe('95.00/0.00');
        await expect(entregas.entregar('T1', 'U1', 'V_PEND', { solicitudId: randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: 'D_PEND', cantidad: 1 }] } as any)).rejects.toThrow();
        // La línea cancelada por la migración no se puede entregar.
        await expect(entregas.entregar('T1', 'U1', 'V_RIESGO', { solicitudId: randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: 'D_RIESGO', cantidad: 1 }] } as any)).rejects.toThrow();
        expect(consulta(c, "SELECT stock_actual || '/' || stock_reservado FROM productos WHERE id='P1';")).toBe('95.00/0.00');
      } finally { await prisma.$disconnect(); }
    } finally { detener(c); }
  }, 300000);

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

  describe('D-02: reversión con respaldo (nunca elimina eventos en silencio)', () => {
    const ejecutarRollback = (c: Clúster, autoriza: boolean) => execFileSync(exe('psql'), ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(c.port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve('prisma/propuestas/entregas-148/03_rollback_con_respaldo.sql')],
      { ...c.options, encoding: 'utf8', env: { ...c.env, ...(autoriza ? { PGOPTIONS: '-c ferre.autoriza_perdida=SI' } : {}) } });
    const volcado = (c: Clúster) => execFileSync(exe('pg_dump'), ['--schema-only', '--schema=public', '--no-owner', '--no-privileges', '-h', '127.0.0.1', '-p', String(c.port), '-U', 'postgres', '-d', 'postgres'], { ...c.options, encoding: 'utf8' })
      .split('\n').filter(l => !l.startsWith('--') && !l.startsWith('\\restrict') && !l.startsWith('\\unrestrict') && l.trim() !== '').join('\n');

    it('con entregas parciales ya registradas: se niega sin autorización y no cambia nada; con autorización respalda y revierte', async () => {
      const antes = await iniciar();
      const c = await iniciar();
      try {
        desplegar(antes, proyectoTemporal(antes, 'antes'));
        desplegar(c, proyectoTemporal(c, 'antes'));
        psql(c, sembrar(true));
        desplegar(c, proyectoTemporal(c, 'hasta')); // hasta la migración de entregas, para comparar el esquema con el anterior
        const url = `postgresql://postgres@127.0.0.1:${c.port}/postgres`;
        const prisma = new PrismaService({ datasources: { db: { url } } });
        await prisma.$connect();
        try {
          await new EntregasService(prisma).entregar('T1', 'U1', 'V_PEND', { solicitudId: randomUUID(), receptorNombre: 'Cliente', lineas: [{ detalleId: 'D_PEND', cantidad: 2 }] } as any);
        } finally { await prisma.$disconnect(); }
        const eventos = Number(consulta(c, "SELECT count(*) FROM entregas_eventos;"));
        const estadoAntes = consulta(c, "SELECT stock_actual || '/' || stock_reservado FROM productos WHERE id='P1';");
        expect(eventos).toBeGreaterThan(0);
        // 1) Sin autorización: error explícito, nada cambia (ni siquiera se crea el respaldo).
        let error = '';
        try { ejecutarRollback(c, false); } catch (e: any) { error = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message}`; }
        expect(error).toContain('pierde el detalle de entregas parciales');
        expect(consulta(c, "SELECT count(*) FROM entregas_eventos;")).toBe(String(eventos));
        expect(consulta(c, "SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'respaldo_entregas_148_%';")).toBe('0');
        // 2) Con autorización: respalda y revierte.
        ejecutarRollback(c, true);
        const esquema = consulta(c, "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'respaldo_entregas_148_%';");
        expect(esquema).toMatch(/^respaldo_entregas_148_\d{8}_\d{6}$/);
        expect(consulta(c, `SELECT count(*) FROM ${esquema}.entregas_eventos;`)).toBe(String(eventos));
        expect(Number(consulta(c, `SELECT count(*) FROM ${esquema}.entregas_eventos_lineas;`))).toBeGreaterThan(0);
        expect(consulta(c, `SELECT cantidad_entregada FROM ${esquema}.detalles_venta_contadores WHERE id='D_PEND';`)).toBe('2.00');
        expect(Number(consulta(c, `SELECT count(*) FROM ${esquema}.movimientos_evento;`))).toBeGreaterThan(0);
        // El esquema público vuelve exactamente al anterior y las existencias y la venta no cambian.
        const dc = volcado(c).split('\n'), da = volcado(antes).split('\n');
        expect([...dc.filter(l => !da.includes(l)).map(l => `+ ${l}`), ...da.filter(l => !dc.includes(l)).map(l => `- ${l}`)]).toEqual([]);
        expect(consulta(c, "SELECT stock_actual || '/' || stock_reservado FROM productos WHERE id='P1';")).toBe(estadoAntes);
        expect(consulta(c, "SELECT count(*) FROM ventas;")).toBe('6');
      } finally { detener(antes); detener(c); }
    }, 360000);

    it('solo con eventos de cobro (sin entregas ni devoluciones registradas) la reversión procede sin autorización, pero también deja respaldo', async () => {
      const c = await iniciar();
      try {
        desplegar(c, proyectoTemporal(c, 'antes'));
        psql(c, sembrar(false));
        migrarEntregas(c);
        expect(consulta(c, "SELECT count(*) FROM entregas_eventos WHERE tipo <> 'COBRO';")).toBe('0');
        ejecutarRollback(c, false);
        const esquema = consulta(c, "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'respaldo_entregas_148_%';");
        expect(esquema).toMatch(/^respaldo_entregas_148_\d{8}_\d{6}$/);
        expect(consulta(c, `SELECT count(*) FROM ${esquema}.detalles_venta_contadores;`)).toBe('5');
        expect(consulta(c, "SELECT to_regclass('public.entregas_eventos') IS NULL;")).toBe('t');
      } finally { detener(c); }
    }, 300000);
  });
});
