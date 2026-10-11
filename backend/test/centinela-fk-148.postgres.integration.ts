import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';

// CENTINELA — claves compuestas (tenant_id, …), triggers, restricciones y create anidados de Prisma (PR #148).
// PostgreSQL temporal con todas las migraciones reales. Nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('CENTINELA: integridad referencial entre empresas y restricciones (PR #148)', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let url = '';
  let port = 0;
  let options: any;

  const sql = (texto: string) => {
    const archivo = join(directory, `${randomUUID()}.sql`);
    writeFileSync(archivo, texto);
    return execFileSync(exe('psql'), ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], { ...options, encoding: 'utf8' }).trim();
  };
  /** true solo si la operación falla y el error nombra la restricción esperada (no un error de sintaxis). */
  const rechaza = async (fn: () => Promise<unknown>, restriccion?: string) => {
    try { await fn(); return false; } catch (e: any) {
      const texto = `${e?.message ?? ''}${e?.meta?.message ?? ''}${e?.stderr ?? ''}${e?.stdout ?? ''}`;
      return restriccion ? texto.includes(restriccion) : true;
    }
  };

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-fk148-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    options = { windowsHide: true, timeout: 60000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    sql(`
      INSERT INTO tenants (id, nombre_comercial, updated_at) VALUES ('TA', 'A', NOW()), ('TB', 'B', NOW());
      INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, permisos, permisos_configurados, updated_at)
        VALUES ('UA', 'TA', 'Admin A', 'a@fk.test', 'x', 'ADMIN', '{}', false, NOW()), ('UB', 'TB', 'Admin B', 'b@fk.test', 'x', 'ADMIN', '{}', false, NOW());
      INSERT INTO productos (id, tenant_id, codigo, nombre, precio_venta, precio_costo, stock_actual, stock_reservado, stock_minimo, precio_aprobado, updated_at)
        VALUES ('PA', 'TA', 'FK-A', 'Producto A', 100, 40, 50, 0, 0, true, NOW()), ('PB', 'TB', 'FK-B', 'Producto B', 100, 40, 50, 0, 0, true, NOW());
      INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, origen, estado, created_at)
        VALUES ('VA', 'TA', 1, 'UA', 100, 15, 115, false, 'ONLINE', 'COMPLETADA', NOW());
    `);
  }, 300000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-fk148-')) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  it('una línea de venta de la empresa B no puede colgar de una venta de la empresa A (FK compuesta)', async () => {
    const rechazada = await rechaza(async () => sql(`INSERT INTO detalles_venta (id, tenant_id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario) VALUES ('X1','TB','VA','PB',1,100,100,40,false);`), 'detalles_venta_tenant_venta_fkey');
    expect(rechazada).toBe(true);
  });

  it('una línea de venta con producto de otra empresa se rechaza (FK compuesta a productos)', async () => {
    const rechazada = await rechaza(async () => sql(`INSERT INTO detalles_venta (id, tenant_id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario) VALUES ('X2','TA','VA','PB',1,100,100,40,false);`), 'detalles_venta_tenant_producto_fkey');
    expect(rechazada).toBe(true);
  });

  it('una línea sin tenant_id toma el de su venta (disparador) y queda válida', async () => {
    sql(`INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario) VALUES ('X3','VA','PA',1,100,100,40,false);`);
    expect(sql(`SELECT tenant_id FROM detalles_venta WHERE id='X3';`)).toBe('TA');
  });

  it('un evento de entrega de la empresa B no puede apuntar a una venta de la empresa A', async () => {
    const rechazada = await rechaza(async () => sql(`INSERT INTO entregas_eventos (id, tenant_id, solicitud_id, huella, tipo, venta_id, usuario_id, origen) VALUES ('E1','TB','${randomUUID()}', repeat('a',64), 'ENTREGA', 'VA', 'UB', 'ONLINE');`), 'entregas_eventos_tenant_venta_fkey');
    expect(rechazada).toBe(true);
  });

  it('un evento de entrega no puede actualizarse ni borrarse (solo inserción)', async () => {
    sql(`INSERT INTO entregas_eventos (id, tenant_id, solicitud_id, huella, tipo, venta_id, usuario_id, origen) VALUES ('E2','TA','${randomUUID()}', repeat('b',64), 'ENTREGA', 'VA', 'UA', 'ONLINE');`);
    expect(await rechaza(async () => sql(`UPDATE entregas_eventos SET receptor_nombre='x' WHERE id='E2';`), 'Los eventos de entrega son de solo inserción')).toBe(true);
    expect(await rechaza(async () => sql(`DELETE FROM entregas_eventos WHERE id='E2';`), 'Los eventos de entrega son de solo inserción')).toBe(true);
  });

  it('el modo de entrega no cambia después del cobro', async () => {
    expect(await rechaza(async () => sql(`UPDATE detalles_venta SET modo_entrega='MOSTRADOR' WHERE id='X3';`), 'El modo de entrega no puede cambiar')).toBe(true);
  });

  it('las cantidades no pueden entregar más de lo vendido ni quedar negativas', async () => {
    expect(await rechaza(async () => sql(`UPDATE detalles_venta SET cantidad_entregada=2 WHERE id='X3';`), 'detalles_venta_i2_chk')).toBe(true);
    expect(await rechaza(async () => sql(`UPDATE detalles_venta SET cantidad_entregada=-1 WHERE id='X3';`), 'detalles_venta_no_negativos_chk') || await rechaza(async () => sql(`UPDATE detalles_venta SET cantidad_entregada=-1 WHERE id='X3';`), 'detalles_venta_i3_chk')).toBe(true);
  });

  it('la reserva de un producto no puede ser negativa', async () => {
    expect(await rechaza(async () => sql(`UPDATE productos SET stock_reservado=-1 WHERE id='PA';`), 'productos_stock_reservado_no_negativo_chk')).toBe(true);
  });

  it('create anidado de Prisma: la línea recibe el tenant de la venta y la empresa cruzada se rechaza', async () => {
    const ventaId = randomUUID();
    await prisma.venta.create({ data: {
      id: ventaId, tenantId: 'TA', numeroVenta: 9001, usuarioId: 'UA', subtotal: 100, isv: 15, total: 115, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', origen: 'ONLINE', reservaPendiente: true,
      detalles: { create: [{ id: randomUUID(), productoId: 'PA', cantidad: 2.5, precioUnitario: 40, subtotal: 100, costoUnitario: 40, sinInventario: false }] },
    } as any });
    expect(sql(`SELECT tenant_id || '|' || modo_entrega FROM detalles_venta WHERE venta_id='${ventaId}';`)).toBe('TA|BODEGA');
    const cruzado = await rechaza(async () => prisma.venta.create({ data: {
      id: randomUUID(), tenantId: 'TA', numeroVenta: 9002, usuarioId: 'UA', subtotal: 100, isv: 15, total: 115, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', origen: 'ONLINE',
      detalles: { create: [{ id: randomUUID(), productoId: 'PB', cantidad: 1, precioUnitario: 40, subtotal: 40, costoUnitario: 40, sinInventario: false }] },
    } as any }));
    expect(cruzado).toBe(true);
  });

  it('no hay deriva entre las migraciones y schema.prisma (prisma migrate diff vacío)', async () => {
    let salida = '';
    let codigo = 0;
    try {
      salida = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script', '--exit-code'],
        { ...options, cwd: resolve('.'), encoding: 'utf8', timeout: 300000, env: { ...options.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' } });
    } catch (error: any) { codigo = error.status ?? 1; salida = String(error.stdout ?? ''); }
    expect(codigo, `Deriva:\n${salida.slice(0, 2000)}`).toBe(0);
  }, 300000);
});
