import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService, claveAnteriorDeOperaciones, claveDeOperaciones } from '../src/contingencia/contingencia.service';
import { operacionEmitida } from '../src/contingencia/operaciones-emitidas';
import { idSolicitud } from '../src/operaciones/ledger';
import { emitirRegistrada, siguienteOperacion } from './helpers/operaciones-emitidas';

// H5 (CENTINELA): errores HTTP 4xx antes de registrar la operación no deben dejar operaciones sin rastro en el servidor.


describe('Contingencia concurrencia: serialización por operación en PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-concurrencia-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-concurrencia-')) {
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

  /** Segunda versión del cobro: mismo UUID, otro contenido. */
  const variante = (op: any, e: any, cantidad = 300) => ({
    ...op, lineas: [{ productoId: e.p1, cantidadCentesimas: cantidad, precioCentavos: 1000 }],
    subtotalCentavos: cantidad * 10, isvCentavos: cantidad * 1.5, totalCentavos: cantidad * 11.5, efectivoRecibidoCentavos: cantidad * 11.5 + 50, cambioCentavos: 50,
  });
  const lote = (e: any, ops: any[], usuario = e.cajero) => svc.recibirLote(e.tenantId, usuario, 'CAJERO', { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);
  const conflictoAlterada = (r: any) => (r.conflictos ?? []).some((c: any) => c.codigo === 'OPERACION_ALTERADA');
  const alteradas = (tenantId: string) => prisma.auditoriaOperacion.count({ where: { tenantId, operacion: 'CONTINGENCIA_OPERACION_ALTERADA' } });

  // Reproducción autorizada por el propietario (antes: 7 de 25 sin venta, 18 de 25 con la fila en REVISION y una venta).
  it('dos payloads distintos con el mismo UUID en paralelo: 25 repeticiones, siempre una venta aplicada y la alteración registrada', async () => {
    for (let i = 0; i < 25; i++) {
      const e = await empresa();
      const op = operacion(e);
      const otra = variante(op, e);
      const [a, b] = await Promise.all([lote(e, [op]), lote(e, [otra])]);
      const ra = a.resultados[0], rb = b.resultados[0];
      // Exactamente una venta y la fila queda APLICADA con el payload del primero que obtuvo el bloqueo.
      expect(await ventasDe(e.tenantId), `repetición ${i}`).toBe(1);
      const fila = await filaDe(e.tenantId, op.operacionId);
      expect(fila, `repetición ${i}`).toMatchObject({ estado: 'APLICADA' });
      const ganadora = fila!.totalCentavos === op.totalCentavos ? op : otra;
      const venta = await prisma.venta.findUniqueOrThrow({ where: { id: fila!.ventaId! } });
      expect(Math.round(Number(venta.total) * 100), `repetición ${i}`).toBe(ganadora.totalCentavos);
      // El perdedor no sobrescribe: ambas respuestas son APLICADA, una sin conflicto (la ganadora) y otra con la alteración.
      expect([ra.estado, rb.estado], `repetición ${i}`).toEqual(['APLICADA', 'APLICADA']);
      expect([conflictoAlterada(ra), conflictoAlterada(rb)].filter(Boolean), `repetición ${i}`).toHaveLength(1);
      expect(await alteradas(e.tenantId), `repetición ${i}`).toBe(1);
    }
  }, 600000);

  it('el mismo payload reenviado en paralelo 10 veces: una sola venta, todas aplicadas, sin alteración', async () => {
    const e = await empresa();
    const op = operacion(e);
    const rs = await Promise.all(Array.from({ length: 10 }, () => lote(e, [op])));
    expect(rs.map((r) => r.resultados[0].estado)).toEqual(Array(10).fill('APLICADA'));
    expect(await ventasDe(e.tenantId)).toBe(1);
    expect(await alteradas(e.tenantId)).toBe(0);
    expect(await prisma.operacionContingencia.count({ where: { tenantId: e.tenantId } })).toBe(1);
  });

  it('tres variantes distintas del mismo UUID en paralelo: una venta y dos alteraciones registradas', async () => {
    const e = await empresa();
    const op = operacion(e);
    const rs = await Promise.all([lote(e, [op]), lote(e, [variante(op, e, 300)]), lote(e, [variante(op, e, 400)])]);
    expect(rs.map((r) => r.resultados[0].estado)).toEqual(['APLICADA', 'APLICADA', 'APLICADA']);
    expect(await ventasDe(e.tenantId)).toBe(1);
    expect(await alteradas(e.tenantId)).toBe(2);
    expect(await filaDe(e.tenantId, op.operacionId)).toMatchObject({ estado: 'APLICADA' });
  });

  it('una alteración posterior (secuencial) no sobrescribe una venta ya aplicada', async () => {
    const e = await empresa();
    const op = operacion(e);
    expect((await lote(e, [op])).resultados[0]).toMatchObject({ estado: 'APLICADA' });
    const antes = await filaDe(e.tenantId, op.operacionId);
    const r = (await lote(e, [variante(op, e)])).resultados[0];
    expect(r).toMatchObject({ estado: 'APLICADA' });
    expect(conflictoAlterada(r)).toBe(true);
    const despues = await filaDe(e.tenantId, op.operacionId);
    expect(despues).toMatchObject({ estado: 'APLICADA', payloadHash: antes!.payloadHash, ventaId: antes!.ventaId, totalCentavos: antes!.totalCentavos });
    expect(await ventasDe(e.tenantId)).toBe(1);
    expect(await alteradas(e.tenantId)).toBe(1);
  });

  it('rollback: un fallo técnico durante la aplicación no deja fila, venta ni auditoría; el reintento con el mismo UUID se aplica', async () => {
    const e = await empresa();
    const op = operacion(e);
    const espia = vi.spyOn(svc as any, 'aplicar').mockRejectedValueOnce(new Error('fallo técnico simulado'));
    try {
      const r = (await lote(e, [op])).resultados[0];
      expect(r).toMatchObject({ operacionId: op.operacionId, estado: 'ERROR_TEMPORAL' });
    } finally {
      espia.mockRestore();
    }
    expect(await filaDe(e.tenantId, op.operacionId)).toBeNull();
    expect(await ventasDe(e.tenantId)).toBe(0);
    expect((await lote(e, [op])).resultados[0]).toMatchObject({ estado: 'APLICADA' });
    expect(await ventasDe(e.tenantId)).toBe(1);
  });

  it('operaciones distintas de una misma empresa en paralelo: todas se aplican, sin interbloqueos ni pérdidas', async () => {
    const e = await empresa();
    const ops = [operacion(e), operacion(e), operacion(e), operacion(e)];
    const rs = await Promise.all(ops.map((o) => lote(e, [o])));
    expect(rs.map((r) => r.resultados[0].estado)).toEqual(Array(4).fill('APLICADA'));
    expect(await ventasDe(e.tenantId)).toBe(4);
  });

  it('H-5 con concurrencia: el dueño y un cajero ajeno envían el mismo UUID a la vez; la fila es del dueño y hay una venta', async () => {
    const e = await empresa();
    const b = await segundoCajero(e);
    const op = operacion(e);
    const [rb, rd] = await Promise.all([lote(e, [{ ...op, cajeroId: b.id }], b.id), lote(e, [op], e.cajero)]);
    expect(rd.resultados[0]).toMatchObject({ estado: 'APLICADA' });
    expect(rb.resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA' });
    expect(await ventasDe(e.tenantId)).toBe(1);
    expect(await filaDe(e.tenantId, op.operacionId)).toMatchObject({ usuarioId: e.cajero, cajaId: e.cajaId });
  });
});
