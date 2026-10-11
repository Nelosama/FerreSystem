import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService, claveAnteriorDeOperaciones, claveDeOperaciones } from '../src/contingencia/contingencia.service';
import { operacionEmitida } from '../src/contingencia/operaciones-emitidas';
import { idSolicitud } from '../src/operaciones/ledger';
import { emitirRegistrada, siguienteOperacion } from './helpers/operaciones-emitidas';

// H5 (CENTINELA): errores HTTP 4xx antes de registrar la operación no deben dejar operaciones sin rastro en el servidor.


describe('Contingencia F5: rechazos por importes incoherentes en el diario / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let svc: ContingenciaService;
  let port = 0;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-f5-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>((done) => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const options = { windowsHide: true, timeout: 60000, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // Base completa: todas las migraciones en orden.
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    svc = new ContingenciaService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-f5-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  async function empresa() {
    const equipoId = randomUUID();
    const tenantId = randomUUID();
    const admin = randomUUID();
    const cajero = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería migración', estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: true } } as any } });
    for (const [id, rol] of [[admin, 'ADMIN'], [cajero, 'CAJERO']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: false, permisos: [] } as any });
    }
    const caja = await prisma.caja.create({ data: { tenantId, codigo: 'CAJA-1', usuarioId: cajero, montoApertura: 100, estado: 'ABIERTA' } as any });
    const p1 = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    await svc.registrarDispositivo(tenantId, cajero, { dispositivoId: equipoId, nombre: 'Caja principal' });
    const { ventana } = await emitirRegistrada(svc, tenantId, cajero, { dispositivoId: equipoId });
    // La FK de la operación apunta al id interno del dispositivo, no al identificador que envía el equipo.
    const interno = await prisma.dispositivoPos.findFirstOrThrow({ where: { tenantId } });
    return { tenantId, admin, cajero, cajaId: caja.id, p1: p1.id, equipoId, dispositivoId: interno.id, ventanaId: ventana.id as string };
  }

  let secuencia = 0;
  /** Fila legada tal como la dejó la forma anterior: estado y conflictos explícitos, sin venta. */
  async function filaLegada(e: Awaited<ReturnType<typeof empresa>>, estado: string, conflictos: unknown[], resolucion: unknown = null, usuarioId: string = e.cajero) {
    const id = randomUUID();
    secuencia += 1;
    await prisma.$executeRawUnsafe(
      `INSERT INTO operaciones_contingencia (id,tenant_id,dispositivo_id,ventana_id,usuario_id,caja_id,secuencia_local,correlativo_local,
        ocurrido_at_local,ocurrido_at_estimado,payload,payload_hash,total_centavos,efectivo_recibido_centavos,estado,requiere_revision,conflictos,resolucion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),$9::jsonb,$10,2300,2500,$11,true,$12::jsonb,$13::jsonb)`,
      id, e.tenantId, e.dispositivoId, e.ventanaId, usuarioId, e.cajaId, 1000 + secuencia, `CT-01-L${secuencia}`,
      JSON.stringify({ totalCentavos: 2300, efectivoRecibidoCentavos: 2500, lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }] }),
      `hash-${id}`, estado, JSON.stringify(conflictos), resolucion === null ? null : JSON.stringify(resolucion),
    );
    return id;
  }

  const obsoleta = [{ codigo: 'VENTANA_OBSOLETA', severidad: 'DURO', detalle: { mensaje: 'Ventana anterior' } }];
  const otroCajero = [{ codigo: 'VENTANA_DE_OTRO_CAJERO', severidad: 'DURO', detalle: { mensaje: 'Ventana de otro cajero' } }];
  const stock = [{ codigo: 'STOCK_INSUFICIENTE', severidad: 'DURO', detalle: {} }];

  let contador = 0;
  const operacion = (e: any, extra: Record<string, any> = {}) => {
    const n = ++contador;
    return {
      ...siguienteOperacion(e.ventanaId), dispositivoId: e.equipoId, ventanaId: e.ventanaId, secuenciaLocal: 900 + n,
      correlativoLocal: `CT-01-${String(n).padStart(4, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero,
      lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }],
      subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
      esquemaVersion: 1, ...extra,
    };
  };
  const recibir = (e: any, ops: any[], usuario = e.cajero, rol = 'CAJERO') =>
    svc.recibirLote(e.tenantId, usuario, rol, { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);
  const ventasDe = async (tenantId: string) => (await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id='${tenantId}'`))[0].n;
  const filaDe = (tenantId: string, operacionId: string) => prisma.operacionContingencia.findFirst({ where: { tenantId, id: { in: [idSolicitud(tenantId, operacionId), operacionId] } } });

  /** Segundo cajero del mismo equipo, con caja abierta y ventana propia. */
  async function segundoCajero(e: Awaited<ReturnType<typeof empresa>>) {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: e.tenantId, nombre: 'Cajero B', email: `${id}@test.invalid`, passwordHash: 'x', rol: 'CAJERO', permisosConfigurados: false, permisos: [] } as any });
    const caja = await prisma.caja.create({ data: { tenantId: e.tenantId, codigo: `CAJA-B-${id.slice(0, 4)}`, usuarioId: id, montoApertura: 0, estado: 'ABIERTA' } as any });
    const { ventana } = await emitirRegistrada(svc, e.tenantId, id, { dispositivoId: e.equipoId });
    return { id, cajaId: caja.id, ventanaId: ventana.id as string };
  }

  let seq = 7000;
  /** Inserta una fila directamente para comprobar la restricción de la base (la aplicación no es la única barrera). */
  async function insertar(e: Awaited<ReturnType<typeof empresa>>, estado: string, total: number, efectivo: number) {
    seq += 1;
    await prisma.$executeRawUnsafe(
      `INSERT INTO operaciones_contingencia (id,tenant_id,dispositivo_id,ventana_id,usuario_id,caja_id,secuencia_local,correlativo_local,
        ocurrido_at_local,ocurrido_at_estimado,payload,payload_hash,total_centavos,efectivo_recibido_centavos,estado,requiere_revision,conflictos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),'{}'::jsonb,$9,$10,$11,$12,true,'[]'::jsonb)`,
      randomUUID(), e.tenantId, e.dispositivoId, e.ventanaId, e.cajero, e.cajaId, seq, `CT-01-F5${seq}`, `hash-${seq}`, total, efectivo, estado);
  }
  const lote = (e: any, ops: any[], usuario = e.cajero) => svc.recibirLote(e.tenantId, usuario, 'CAJERO', { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);
  const movimientos = (cajaId: string) => prisma.movimientoCaja.count({ where: { cajaId } });

  it('la base admite importes incoherentes solo en los estados terminales sin venta y los exige válidos al resto', async () => {
    const e = await empresa();
    for (const estado of ['RECHAZADA', 'RESUELTA_MANUAL']) {
      await insertar(e, estado, 0, 0);
      await insertar(e, estado, 2300, 2000);
      await expect(insertar(e, estado, -1, 0), estado).rejects.toThrow(/montos_check/);
      await expect(insertar(e, estado, 100, -5), estado).rejects.toThrow(/montos_check/);
    }
    // Toda fila pendiente de aplicar o en revisión sigue exigiendo total > 0 y efectivo >= total.
    for (const estado of ['RECIBIDA', 'REVISION']) {
      await expect(insertar(e, estado, 0, 0), estado).rejects.toThrow(/montos_check/);
      await expect(insertar(e, estado, 2300, 2000), estado).rejects.toThrow(/montos_check/);
    }
    await insertar(e, 'REVISION', 2300, 2500); // una fila coherente sigue entrando
  });

  it('cobro menor al total: queda RECHAZADA en el diario, sin venta, sin movimiento de caja y sin tocar el stock', async () => {
    const e = await empresa();
    const antesStock = Number((await prisma.producto.findUniqueOrThrow({ where: { id: e.p1 } })).stockActual);
    const antesMov = await movimientos(e.cajaId);
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    expect((await lote(e, [op])).resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    expect(await filaDe(e.tenantId, op.operacionId)).toMatchObject({ estado: 'RECHAZADA', ventaId: null, requiereRevision: true, totalCentavos: 2300, efectivoRecibidoCentavos: 2000 });
    expect(await ventasDe(e.tenantId)).toBe(0);
    expect(await movimientos(e.cajaId)).toBe(antesMov);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: e.p1 } })).stockActual)).toBe(antesStock);
  });

  it('importe cero: queda RECHAZADA en el diario con total cero', async () => {
    const e = await empresa();
    const op = operacion(e, { totalCentavos: 0, subtotalCentavos: 0, isvCentavos: 0, efectivoRecibidoCentavos: 0, cambioCentavos: 0 });
    expect((await lote(e, [op])).resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    expect(await filaDe(e.tenantId, op.operacionId)).toMatchObject({ estado: 'RECHAZADA', ventaId: null, totalCentavos: 0, efectivoRecibidoCentavos: 0 });
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('un intruso no puede registrar un rechazo por importe a nombre del dueño: la fila solo se crea con la ventana y el UUID del remitente', async () => {
    const e = await empresa();
    const b = await segundoCajero(e);
    const opDueno = operacion(e);
    const malo = { ...opDueno, cajeroId: b.id, ventanaId: b.ventanaId, efectivoRecibidoCentavos: 100, cambioCentavos: 0 };
    const r = (await lote(e, [malo], b.id)).resultados[0];
    expect(r).toMatchObject({ estado: 'RECHAZADA_TECNICA' });
    expect(await filaDe(e.tenantId, opDueno.operacionId)).toBeNull();
    // El dueño cobra su venta con normalidad.
    expect((await lote(e, [opDueno])).resultados[0]).toMatchObject({ estado: 'APLICADA' });
    expect(await filaDe(e.tenantId, opDueno.operacionId)).toMatchObject({ usuarioId: e.cajero, estado: 'APLICADA' });
  });

  it('cerrar sin venta un cobro menor al total ingresa a caja solo el efectivo recibido; con efectivo cero no hay movimiento', async () => {
    const e = await empresa();
    const insuficiente = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    const cero = operacion(e, { totalCentavos: 0, subtotalCentavos: 0, isvCentavos: 0, efectivoRecibidoCentavos: 0, cambioCentavos: 0 });
    await lote(e, [insuficiente, cero]);
    const antes = await movimientos(e.cajaId);
    const c1: any = await svc.resolver(e.tenantId, e.admin, insuficiente.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Cobro insuficiente verificado con el cliente' } as any);
    expect(c1.conciliacionCaja).toMatchObject({ cajaId: e.cajaId, monto: 20, reutilizado: false });
    expect(await movimientos(e.cajaId)).toBe(antes + 1);
    const c2: any = await svc.resolver(e.tenantId, e.admin, cero.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Importe cero verificado con el cliente' } as any);
    expect(c2.conciliacionCaja).toMatchObject({ monto: 0, sinEfectivo: true, movimientoId: null });
    expect(await movimientos(e.cajaId)).toBe(antes + 1);
    expect((await filaDe(e.tenantId, cero.operacionId))?.estado).toBe('RESUELTA_MANUAL');
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('un rechazo por importe no se puede aceptar ni reintentar como venta', async () => {
    const e = await empresa();
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    await lote(e, [op]);
    await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Intento de forzar el cobro insuficiente' } as any)).rejects.toThrow(/rechazada nunca se aplica/);
    await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'REINTENTAR', nota: 'Intento de reintentar el cobro insuficiente' } as any)).rejects.toThrow(/rechazada nunca se aplica/);
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('informes: el listado informa el faltante sin cambio negativo y el resumen separa el efectivo recibido del total declarado', async () => {
    const e = await empresa();
    await lote(e, [operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 })]);
    const listado = await svc.listar(e.tenantId, {});
    expect(listado).toHaveLength(1);
    expect(listado[0]).toMatchObject({ estado: 'RECHAZADA', totalCentavos: 2300, efectivoRecibidoCentavos: 2000, cambioCentavos: 0, faltanteCentavos: 300 });
    const resumen: any = await svc.resumen(e.tenantId);
    expect(resumen.contingencia.conflictos).toMatchObject({ cantidad: 1, totalCentavos: 2300, efectivoCentavos: 2000 });
    expect(resumen.contingencia.sincronizadas.cantidad).toBe(0);
    expect(resumen.ventasDelDia).toEqual([]);
  });
});
