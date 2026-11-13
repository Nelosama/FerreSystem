import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { ReembolsosService } from '../src/operaciones/reembolsos';
import { DecisionDevolucionDto, DevolucionDto } from '../src/operaciones/operaciones.dto';

// Etapa 2 de las decisiones del dueño del 2026-11-12: devoluciones y reembolsos.
// - Motivo, condición del producto y motivo de la decisión son opcionales; el destino por línea es obligatorio.
// - Con tarjeta se intenta el reverso en el POS bancario (pendiente hasta registrar la referencia); si no se puede, el ADMIN
//   decide esperar o reembolsar en efectivo o por transferencia. Registrar no significa que el banco ya movió el dinero.
// - La venta original no se borra ni se altera.
// Cadena completa de migraciones sobre un clúster temporal; servicios reales, sin mocks. No cubre el POS bancario físico.
describe('Devoluciones y reembolsos con estado / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let ops: OperacionesService;
  let reembolsos: ReembolsosService;
  let tenantA: string, tenantB: string;
  let admin: string, admin2: string, cajero: string, cajero2: string, adminB: string;
  let productoId: string;

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const venta = (usuario: string, metodoPago: 'EFECTIVO' | 'TARJETA', cantidad = 2) => ventas.create(tenantA, usuario, {
    solicitudId: randomUUID(), metodoPago, detalles: [{ productoId, cantidad }],
    ...(metodoPago === 'TARJETA' ? { pagoElectronico: { referencia: `AUT-${randomUUID().slice(0, 10)}`, terminal: 'POS-01' } } : {}),
  } as any);
  const linea = async (ventaId: string) => (await sql('SELECT id FROM detalles_venta WHERE venta_id=$1', ventaId))[0].id as string;
  const destino = async (ventaId: string) => (await sql('SELECT reserva_pendiente FROM ventas WHERE id=$1', ventaId))[0].reserva_pendiente ? 'NO_ENTREGADO' : 'INVENTARIO';
  /** Devolución directa de ADMIN (parcial: 1 de 2 unidades). */
  const devolverDirecto = async (ventaId: string, metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA', extra: any = {}) =>
    ops.devolver(tenantA, admin, ventaId, { solicitudId: randomUUID(), metodo, items: [{ detalleId: await linea(ventaId), cantidad: 1, destino: await destino(ventaId) }], ...extra } as any);
  const reembolsoDe = async (devolucionId: string) => (await sql("SELECT *, monto::float AS monto_n FROM reembolsos WHERE devolucion_id=$1 AND estado <> 'SUSTITUIDO'", devolucionId))[0];
  const movimientosDe = (devolucionId: string) => sql("SELECT metodo, monto::float AS monto, caja_id FROM movimientos_caja WHERE tipo='DEVOLUCION' AND referencia=$1 ORDER BY created_at", devolucionId);
  const cajaDe = async (usuario: string) => (await sql("SELECT id FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA'", tenantA, usuario))[0]?.id;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-reembolsos-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url };
    const options = { timeout: 60000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    ventas = new VentasService(prisma);
    ops = new OperacionesService(prisma);
    reembolsos = new ReembolsosService(prisma);
  }, 240000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-reembolsos-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantA = randomUUID(); tenantB = randomUUID();
    for (const id of [tenantA, tenantB]) await prisma.tenant.create({ data: { id, nombreComercial: 'Reembolsos', estado: 'ACTIVO' } as any });
    const crear = async (tenant: string, rol: string, nombre: string) => {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId: tenant, nombre, email: `${id}@test.invalid`, passwordHash: 'x', rol: rol as any } as any });
      return id;
    };
    admin = await crear(tenantA, 'ADMIN', 'Admin A'); admin2 = await crear(tenantA, 'ADMIN', 'Admin A2');
    cajero = await crear(tenantA, 'CAJERO', 'Cajero A'); cajero2 = await crear(tenantA, 'CAJERO', 'Cajero A2');
    adminB = await crear(tenantB, 'ADMIN', 'Admin B');
    productoId = (await prisma.producto.create({ data: { tenantId: tenantA, codigo: `P-${randomUUID().slice(0, 6)}`, nombre: 'Taladro', precioCosto: 60, precioVenta: 100, stockActual: 100, precioAprobado: true } as any })).id;
    for (const u of [admin, cajero]) await ops.abrir(tenantA, u, { solicitudId: randomUUID(), monto: 500 } as any);
  });

  it('el DTO acepta devolución y decisión sin motivo y sin condición; exige destino por línea', async () => {
    const base = { solicitudId: randomUUID(), metodo: 'EFECTIVO', items: [{ detalleId: 'x', cantidad: 1, destino: 'INVENTARIO' }] };
    expect(await validate(plainToInstance(DevolucionDto, base))).toEqual([]);
    expect(await validate(plainToInstance(DevolucionDto, { ...base, items: [{ ...base.items[0], condicion: 'Caja abierta, sin uso' }] }))).toEqual([]);
    const sinDestino = await validate(plainToInstance(DevolucionDto, { ...base, items: [{ detalleId: 'x', cantidad: 1 }] }));
    expect(JSON.stringify(sinDestino)).toMatch(/destino/);
    expect(await validate(plainToInstance(DecisionDevolucionDto, { decision: 'AUTORIZADA' }))).toEqual([]);
  });

  it('destinos explícitos (decisión del dueño en #247): el DTO acepta GARANTIA y MERMA, conserva los históricos y rechaza desconocidos', async () => {
    const item = (destino: string) => plainToInstance(DevolucionDto, { solicitudId: randomUUID(), metodo: 'EFECTIVO', items: [{ detalleId: 'x', cantidad: 1, destino }] });
    for (const destino of ['INVENTARIO', 'GARANTIA', 'MERMA', 'NO_ENTREGADO', 'DAÑADO', 'PROVEEDOR']) expect(await validate(item(destino)), destino).toEqual([]);
    expect(JSON.stringify(await validate(item('BAJA')))).toMatch(/destino/);
  });

  it('cada destino se guarda tal cual: INVENTARIO reingresa existencias; GARANTIA, MERMA y el histórico DAÑADO no', async () => {
    const v = await ventas.create(tenantA, admin, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId, cantidad: 6, modoEntrega: 'MOSTRADOR' }] } as any);
    const stock = async () => Number((await sql('SELECT stock_actual FROM productos WHERE id=$1', productoId))[0].stock_actual);
    const contadores = async () => (await sql('SELECT cantidad_devuelta_reingresada::float AS r, cantidad_devuelta_sin_reingreso::float AS s FROM detalles_venta WHERE venta_id=$1', v.id))[0];
    expect(await stock()).toBe(94);
    const devolver = async (destino: string) => {
      const dev = await ops.devolver(tenantA, admin, v.id, { solicitudId: randomUUID(), metodo: 'EFECTIVO', items: [{ detalleId: await linea(v.id), cantidad: 1, destino }] } as any);
      return (await sql('SELECT destino FROM detalles_devolucion WHERE devolucion_id=$1', dev.id))[0].destino;
    };
    expect(await devolver('INVENTARIO')).toBe('INVENTARIO');
    expect([await stock(), await contadores()]).toEqual([95, { r: 1, s: 0 }]);
    expect(await devolver('GARANTIA')).toBe('GARANTIA');
    expect([await stock(), await contadores()]).toEqual([95, { r: 1, s: 1 }]);
    expect(await devolver('MERMA')).toBe('MERMA');
    expect([await stock(), await contadores()]).toEqual([95, { r: 1, s: 2 }]);
    expect(await devolver('DAÑADO')).toBe('DAÑADO');
    expect([await stock(), await contadores()]).toEqual([95, { r: 1, s: 3 }]);
    // Un destino desconocido que llegue por una vía interna (sin DTO) no se trata como «sin reingreso»: se rechaza sin cambios.
    await expect(ops.devolver(tenantA, admin, v.id, { solicitudId: randomUUID(), metodo: 'EFECTIVO', items: [{ detalleId: await linea(v.id), cantidad: 1, destino: 'BAJA' }] } as any)).rejects.toThrow(BadRequestException);
    expect([await stock(), await contadores()]).toEqual([95, { r: 1, s: 3 }]);
    expect(Number((await sql('SELECT COUNT(*) AS n FROM devoluciones WHERE venta_id=$1', v.id))[0].n)).toBe(4);
  });

  it('cajero solicita sin motivo y con condición; ADMIN autoriza sin motivo; la venta original no se borra ni cambia', async () => {
    const v = await venta(cajero, 'EFECTIVO');
    const antes = (await sql('SELECT estado, total::float AS total, subtotal::float AS subtotal FROM ventas WHERE id=$1', v.id))[0];
    const solicitudId = randomUUID();
    await ops.solicitarDevolucion(tenantA, cajero, v.id, { solicitudId, metodo: 'EFECTIVO', items: [{ detalleId: await linea(v.id), cantidad: 1, destino: await destino(v.id), condicion: '  Empaque dañado  ' }] } as any);
    const decidida = await ops.decidirDevolucion(tenantA, admin, solicitudId, { decision: 'AUTORIZADA' } as any);
    expect(decidida.motivo_decision).toBeNull();
    const dev = await ops.ejecutarAutorizada(tenantA, cajero, solicitudId);
    expect(dev.motivo).toBe('');
    const [detalle] = await sql('SELECT destino, condicion FROM detalles_devolucion WHERE devolucion_id=$1', dev.id);
    expect(detalle).toEqual({ destino: await destino(v.id), condicion: 'Empaque dañado' });
    expect((await sql('SELECT estado, total::float AS total, subtotal::float AS subtotal FROM ventas WHERE id=$1', v.id))[0]).toEqual(antes);
    expect((await sql('SELECT venta_id FROM devoluciones WHERE id=$1', dev.id))[0].venta_id).toBe(v.id);
  });

  it('efectivo: sale de la caja al registrar y el reembolso queda COMPLETADO con quién y cuándo', async () => {
    const v = await venta(admin, 'EFECTIVO');
    const dev = await devolverDirecto(v.id, 'EFECTIVO');
    const r = await reembolsoDe(dev.id);
    expect(r).toMatchObject({ metodo: 'EFECTIVO', estado: 'COMPLETADO', registrado_por: admin, completado_por: admin, caja_id: await cajaDe(admin) });
    expect(r.completado_at).toBeTruthy();
    expect(r.monto_n).toBe(Number(dev.reembolso));
    expect(dev).toMatchObject({ reembolso_id: r.id, reembolso_estado: 'COMPLETADO' });
    expect(await movimientosDe(dev.id)).toEqual([{ metodo: 'EFECTIVO', monto: -Number(dev.reembolso), caja_id: await cajaDe(admin) }]);
  });

  it('tarjeta: reverso PENDIENTE sin movimiento de caja; completar exige referencia y queda registrado', async () => {
    const v = await venta(admin, 'TARJETA');
    const dev = await devolverDirecto(v.id, 'TARJETA');
    const r = await reembolsoDe(dev.id);
    expect(r).toMatchObject({ metodo: 'TARJETA', estado: 'PENDIENTE', completado_por: null, completado_at: null });
    expect(await movimientosDe(dev.id)).toEqual([]);
    await expect(reembolsos.completar(tenantA, admin, r.id, { referencia: '   ' } as any)).rejects.toThrow(BadRequestException);
    // Un cajero ajeno a la devolución no la ve ni la completa.
    await expect(reembolsos.completar(tenantA, cajero2, r.id, { referencia: 'REV-1' } as any)).rejects.toThrow(NotFoundException);
    const hecho = await reembolsos.completar(tenantA, admin, r.id, { referencia: ' REV-778 ', evidencia: 'Voucher de anulación firmado' } as any);
    expect(hecho).toMatchObject({ estado: 'COMPLETADO', referencia: 'REV-778', evidencia: 'Voucher de anulación firmado', completado_por: admin, completado_por_nombre: 'Admin A' });
    expect(await movimientosDe(dev.id)).toEqual([{ metodo: 'TARJETA', monto: -Number(dev.reembolso), caja_id: await cajaDe(admin) }]);
    await expect(reembolsos.completar(tenantA, admin, r.id, { referencia: 'REV-779' } as any)).rejects.toThrow(ConflictException);
    const auditoria = await sql("SELECT operacion FROM auditoria_operaciones WHERE tenant_id=$1 AND entidad_id=$2 ORDER BY created_at", tenantA, r.id);
    expect(auditoria.map((a) => a.operacion)).toEqual(['REEMBOLSO_REGISTRAR', 'REEMBOLSO_COMPLETAR']);
  });

  it('quien ejecutó la devolución (cajero) puede registrar el reverso; solo ADMIN decide si no se pudo revertir', async () => {
    const v = await venta(cajero, 'TARJETA');
    const solicitudId = randomUUID();
    await ops.solicitarDevolucion(tenantA, cajero, v.id, { solicitudId, metodo: 'TARJETA', items: [{ detalleId: await linea(v.id), cantidad: 1, destino: await destino(v.id) }] } as any);
    await ops.decidirDevolucion(tenantA, admin, solicitudId, { decision: 'AUTORIZADA' } as any);
    const dev = await ops.ejecutarAutorizada(tenantA, cajero, solicitudId);
    const r = await reembolsoDe(dev.id);
    await expect(reembolsos.sinReverso(tenantA, cajero, r.id, { decision: 'ESPERAR' } as any)).rejects.toThrow(ForbiddenException);
    expect((await reembolsos.listar(tenantA, cajero)).reembolsos.map((x: any) => x.id)).toEqual([r.id]);
    expect((await reembolsos.listar(tenantA, cajero2)).reembolsos).toEqual([]);
    const hecho = await reembolsos.completar(tenantA, cajero, r.id, { referencia: 'REV-CAJ-1' } as any);
    expect(hecho).toMatchObject({ estado: 'COMPLETADO', completado_por: cajero });
  });

  it('tarjeta no revertida: ESPERAR anota el intento y sigue PENDIENTE; EFECTIVO sustituye y sale de la caja del ADMIN', async () => {
    const v = await venta(admin, 'TARJETA');
    const dev = await devolverDirecto(v.id, 'TARJETA');
    const original = await reembolsoDe(dev.id);
    const espera = await reembolsos.sinReverso(tenantA, admin, original.id, { decision: 'ESPERAR', motivo: 'Terminal sin conexión' } as any);
    expect(espera).toMatchObject({ id: original.id, estado: 'PENDIENTE', intentos_fallidos: 1 });
    expect(espera.nota).toMatch(/Terminal sin conexión/);
    const nuevo = await reembolsos.sinReverso(tenantA, admin, original.id, { decision: 'EFECTIVO' } as any);
    expect(nuevo).toMatchObject({ metodo: 'EFECTIVO', estado: 'COMPLETADO', reemplaza_a_id: original.id, completado_por: admin });
    expect((await sql('SELECT estado::text AS estado FROM reembolsos WHERE id=$1', original.id))[0].estado).toBe('SUSTITUIDO');
    expect(await movimientosDe(dev.id)).toEqual([{ metodo: 'EFECTIVO', monto: -Number(dev.reembolso), caja_id: await cajaDe(admin) }]);
    // Nada se borra: quedan el original sustituido y el nuevo.
    expect(Number((await sql('SELECT COUNT(*) AS n FROM reembolsos WHERE devolucion_id=$1', dev.id))[0].n)).toBe(2);
    await expect(reembolsos.sinReverso(tenantA, admin, original.id, { decision: 'TRANSFERENCIA' } as any)).rejects.toThrow(ConflictException);
  });

  it('tarjeta no revertida → TRANSFERENCIA: queda PENDIENTE hasta registrar la referencia bancaria', async () => {
    const v = await venta(admin, 'TARJETA');
    const dev = await devolverDirecto(v.id, 'TARJETA');
    const original = await reembolsoDe(dev.id);
    const nuevo = await reembolsos.sinReverso(tenantA, admin2, original.id, { decision: 'TRANSFERENCIA', motivo: 'Tarjeta cancelada por el banco' } as any);
    expect(nuevo).toMatchObject({ metodo: 'TRANSFERENCIA', estado: 'PENDIENTE', reemplaza_a_id: original.id, registrado_por: admin2 });
    expect(await movimientosDe(dev.id)).toEqual([]);
    const hecho = await reembolsos.completar(tenantA, admin2, nuevo.id, { referencia: 'TRF-2026-0001', evidencia: 'Comprobante de banca en línea' } as any);
    expect(hecho).toMatchObject({ estado: 'COMPLETADO', referencia: 'TRF-2026-0001' });
    // La segunda ADMIN no tiene caja abierta: el reembolso se completa sin movimiento informativo de caja.
    expect(await movimientosDe(dev.id)).toEqual([]);
  });

  it('EFECTIVO sin caja abierta o sin efectivo suficiente: 409 y el reverso sigue PENDIENTE', async () => {
    const v = await venta(admin, 'TARJETA');
    const dev = await devolverDirecto(v.id, 'TARJETA');
    const original = await reembolsoDe(dev.id);
    await expect(reembolsos.sinReverso(tenantA, admin2, original.id, { decision: 'EFECTIVO' } as any)).rejects.toThrow(/Abra su caja/);
    await ops.abrir(tenantA, admin2, { solicitudId: randomUUID(), monto: 1 } as any);
    await expect(reembolsos.sinReverso(tenantA, admin2, original.id, { decision: 'EFECTIVO' } as any)).rejects.toThrow(/Efectivo insuficiente/);
    expect((await reembolsoDe(dev.id))).toMatchObject({ id: original.id, estado: 'PENDIENTE' });
  });

  it('dos ADMIN deciden a la vez sobre el mismo reverso: gana una sola decisión', async () => {
    const v = await venta(admin, 'TARJETA');
    const dev = await devolverDirecto(v.id, 'TARJETA');
    const original = await reembolsoDe(dev.id);
    const r = await Promise.allSettled([
      reembolsos.sinReverso(tenantA, admin, original.id, { decision: 'EFECTIVO' } as any),
      reembolsos.sinReverso(tenantA, admin2, original.id, { decision: 'TRANSFERENCIA' } as any),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(Number((await sql("SELECT COUNT(*) AS n FROM reembolsos WHERE devolucion_id=$1 AND estado <> 'SUSTITUIDO'", dev.id))[0].n)).toBe(1);
  });

  it('otra empresa no ve ni toca reembolsos ajenos', async () => {
    const v = await venta(admin, 'TARJETA');
    const dev = await devolverDirecto(v.id, 'TARJETA');
    const r = await reembolsoDe(dev.id);
    expect((await reembolsos.listar(tenantB, adminB)).reembolsos).toEqual([]);
    await expect(reembolsos.completar(tenantB, adminB, r.id, { referencia: 'X-1' } as any)).rejects.toThrow(NotFoundException);
    await expect(reembolsos.sinReverso(tenantB, adminB, r.id, { decision: 'ESPERAR' } as any)).rejects.toThrow(NotFoundException);
    // Un usuario de otra empresa con el tenant ajeno en la petición no existe para esa empresa.
    await expect(reembolsos.completar(tenantA, adminB, r.id, { referencia: 'X-1' } as any)).rejects.toThrow(ForbiddenException);
    expect((await reembolsoDe(dev.id)).estado).toBe('PENDIENTE');
  });

  it('la base rechaza un reverso completado sin referencia y dos reembolsos vigentes para la misma devolución', async () => {
    const v = await venta(admin, 'TARJETA');
    const dev = await devolverDirecto(v.id, 'TARJETA');
    const r = await reembolsoDe(dev.id);
    await expect(sql("UPDATE reembolsos SET estado='COMPLETADO', completado_por=$2, completado_at=now() WHERE id=$1", r.id, admin)).rejects.toThrow(/23514|reembolsos_completado_chk/);
    await expect(sql(`INSERT INTO reembolsos (id, tenant_id, devolucion_id, metodo, monto, registrado_por) VALUES ($1, $2, $3, 'TRANSFERENCIA', 1, $4)`, randomUUID(), tenantA, dev.id, admin))
      .rejects.toThrow(/23505|reembolsos_vigente_key/);
  });
});
