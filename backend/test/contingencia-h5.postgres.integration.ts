import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { idSolicitud } from '../src/operaciones/ledger';

// H5 (CENTINELA): errores HTTP 4xx antes de registrar la operación no deben dejar operaciones sin rastro en el servidor.


describe('Contingencia H5: errores 4xx en recepción offline / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-rechazada-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-rechazada-')) {
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
    const { ventana } = await svc.emitirVentana(tenantId, cajero, { dispositivoId: equipoId });
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
      operacionId: randomUUID(), dispositivoId: e.equipoId, ventanaId: e.ventanaId, secuenciaLocal: 500 + n,
      correlativoLocal: `CT-01-H5-${String(n).padStart(4, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero,
      lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }],
      subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
      esquemaVersion: 1, ...extra,
    };
  };
  const recibir = (e: any, ops: any[], usuario = e.cajero, rol = 'CAJERO') =>
    svc.recibirLote(e.tenantId, usuario, rol, { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);
  const ventasDe = async (tenantId: string) => (await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id='${tenantId}'`))[0].n;
  const filaDe = (tenantId: string, operacionId: string) => prisma.operacionContingencia.findFirst({ where: { tenantId, id: { in: [idSolicitud(tenantId, operacionId), operacionId] } } });
  const auditorias = (tenantId: string, operacion: string, entidadId: string) => prisma.auditoriaOperacion.count({ where: { tenantId, operacion, entidadId } });

  it('H5-1: importe insuficiente (cobro menor al total): respuesta de rechazo, evidencia completa en auditoría, sin venta, reenvío sin duplicar', async () => {
    const e = await empresa();
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    const primera = (await recibir(e, [op])).resultados[0];
    expect(primera).toMatchObject({ operacionId: op.operacionId, estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    // El diario no admite importes incoherentes (montos_check): la evidencia queda en auditoría con el payload completo.
    expect(await filaDe(e.tenantId, op.operacionId)).toBeNull();
    const evidencia = await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idSolicitud(e.tenantId, op.operacionId) } });
    expect((evidencia.datos as any).payload.operacionId).toBe(op.operacionId);
    expect((evidencia.datos as any).codigo).toBe('IMPORTE_INVALIDO');
    expect(await ventasDe(e.tenantId)).toBe(0);
    const reenvio = (await recibir(e, [op])).resultados[0];
    expect(reenvio).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    expect(await auditorias(e.tenantId, 'CONTINGENCIA_OPERACION_NO_REGISTRADA', idSolicitud(e.tenantId, op.operacionId))).toBe(1);
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('H5-2: operación de otro cajero enviada por un cajero (403) queda registrada como rechazo, sin venta ni caja ajena', async () => {
    const e = await empresa();
    const op = operacion(e, { cajeroId: e.admin });
    const r = (await recibir(e, [op])).resultados[0];
    expect(r).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'CAJERO_NO_AUTORIZADO' });
    const fila = await filaDe(e.tenantId, op.operacionId);
    expect(fila?.estado).toBe('RECHAZADA');
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('H5-3: ventana desconocida no puede guardarse en el diario (ventana_id obligatoria); queda evidencia en auditoría, sin duplicarla en reenvíos', async () => {
    const e = await empresa();
    const op = operacion(e, { ventanaId: randomUUID() });
    const r = (await recibir(e, [op])).resultados[0];
    expect(r).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_DESCONOCIDA' });
    expect(await auditorias(e.tenantId, 'CONTINGENCIA_OPERACION_NO_REGISTRADA', idSolicitud(e.tenantId, op.operacionId))).toBe(1);
    await recibir(e, [op]);
    expect(await auditorias(e.tenantId, 'CONTINGENCIA_OPERACION_NO_REGISTRADA', idSolicitud(e.tenantId, op.operacionId))).toBe(1);
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  // Hallazgos de la auditoría CENTINELA sobre 7dced6d9.
  async function otroCajeroConCaja(tenantId: string) {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId, nombre: 'Cajero B', email: `${id}@test.invalid`, passwordHash: 'x', rol: 'CAJERO', permisosConfigurados: false, permisos: [] } as any });
    return (await prisma.caja.create({ data: { tenantId, codigo: `CAJA-B-${id.slice(0, 4)}`, usuarioId: id, montoApertura: 0, estado: 'ABIERTA' } as any })).id;
  }

  it('N1: el administrador no puede llevar la venta de un cajero a la caja abierta de otro cajero', async () => {
    const e = await empresa();
    const op = operacion(e);
    // La caja se cierra antes del envío: la operación no debe aplicarse al recibirla.
    await prisma.caja.update({ where: { id: e.cajaId }, data: { estado: 'CERRADA', montoCierreFisico: 100, fechaCierre: new Date() } });
    await recibir(e, [op]);
    // Caja original cerrada: la venta exige una caja de destino elegida por administración.
    const cajaB = await otroCajeroConCaja(e.tenantId);
    const antes = { caja: await prisma.movimientoCaja.count({ where: { cajaId: cajaB } }), ventas: await ventasDe(e.tenantId) };
    await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'intento cruzado', cajaId: cajaB } as any)).rejects.toBeInstanceOf(ConflictException);
    expect({ caja: await prisma.movimientoCaja.count({ where: { cajaId: cajaB } }), ventas: await ventasDe(e.tenantId) }).toEqual(antes);
  });

  it('N2: aceptar con la caja original cerrada y sin caja alterna responde REVISION (no un error interno) y no crea venta', async () => {
    const e = await empresa();
    const op = operacion(e);
    // La caja se cierra antes del envío: la operación no debe aplicarse al recibirla.
    await prisma.caja.update({ where: { id: e.cajaId }, data: { estado: 'CERRADA', montoCierreFisico: 100, fechaCierre: new Date() } });
    await recibir(e, [op]);
    const r: any = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'sin caja abierta' } as any);
    expect(r.estado).toBe('REVISION');
    expect(r.conflictos.map((c: any) => c.codigo)).toContain('CAJA_CERRADA');
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('8c: un payload distinto con el mismo UUID sobre una operación ya rechazada se registra como alteración', async () => {
    const e = await empresa();
    // Rechazo definitivo por DEF-04: la operación pertenece a otro cajero (el administrador la envía en su nombre).
    const op = operacion(e, { cajeroId: e.admin });
    const primera = (await recibir(e, [op], e.admin, 'ADMIN')).resultados[0];
    expect(primera).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_DE_OTRO_CAJERO' });
    const alterada = { ...op, efectivoRecibidoCentavos: 2600, cambioCentavos: 300 };
    const segunda = (await recibir(e, [alterada], e.admin, 'ADMIN')).resultados[0];
    expect(segunda.conflictos.map((c: any) => c.codigo)).toContain('OPERACION_ALTERADA');
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('8b: la respuesta de rechazo no revela el identificador del cajero de la ventana', async () => {
    const e = await empresa();
    const op = operacion(e, { cajeroId: e.admin });
    const r = (await recibir(e, [op], e.admin, 'ADMIN')).resultados[0];
    expect(r.codigo).toBe('VENTANA_DE_OTRO_CAJERO');
    expect(JSON.stringify(r)).not.toContain(e.cajero);
  });

  // Hallazgos de la auditoría CENTINELA sobre ac315715.
  it('A: un importe rechazado sin fila no puede aplicarse después reenviándolo con el mismo UUID y un importe corregido', async () => {
    const e = await empresa();
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    expect((await recibir(e, [op])).resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    const corregida = { ...op, efectivoRecibidoCentavos: 2500, cambioCentavos: 200 };
    const r = (await recibir(e, [corregida])).resultados[0];
    expect(r).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('F: la consulta posterior de un rechazo sin fila repite estado, código e instrucción', async () => {
    const e = await empresa();
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    const primera = (await recibir(e, [op])).resultados[0];
    const consulta: any = (await svc.estados(e.tenantId, e.cajero, 'CAJERO', [op.operacionId]))[0];
    expect(consulta).toMatchObject({ estado: primera.estado, codigo: primera.codigo, mensaje: primera.mensaje, instruccion: primera.instruccion });
  });

  it('B (H6 en rechazo por cajero): un payload distinto con el mismo UUID se registra como alteración', async () => {
    const e = await empresa();
    const op = operacion(e, { cajeroId: e.admin });
    await recibir(e, [op]);
    const alterada = { ...op, efectivoRecibidoCentavos: 2600, cambioCentavos: 300 };
    const r = (await recibir(e, [alterada])).resultados[0];
    expect(r.conflictos.map((c: any) => c.codigo)).toContain('OPERACION_ALTERADA');
    expect(await auditorias(e.tenantId, 'CONTINGENCIA_OPERACION_ALTERADA', idSolicitud(e.tenantId, op.operacionId))).toBe(1);
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('D: un importe 0 no hace que el DTO rechace el lote entero (la clasificación pasa al servicio)', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { LoteOperacionesDto } = await import('../src/contingencia/dto/contingencia.dto');
    const e = await empresa();
    const cero = operacion(e, { correlativoLocal: 'CT-01-0001', totalCentavos: 0, efectivoRecibidoCentavos: 0, cambioCentavos: 0, subtotalCentavos: 0, isvCentavos: 0 });
    const lote = plainToInstance(LoteOperacionesDto, { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: [cero] });
    expect(await validate(lote)).toEqual([]);
  });
});
