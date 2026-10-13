import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService, claveDeOperaciones } from '../src/contingencia/contingencia.service';
import { operacionEmitida } from '../src/contingencia/operaciones-emitidas';
import { idSolicitud } from '../src/operaciones/ledger';
import { emitirRegistrada, siguienteOperacion } from './helpers/operaciones-emitidas';

// H5 (CENTINELA): errores HTTP 4xx antes de registrar la operación no deben dejar operaciones sin rastro en el servidor.


describe('Contingencia hallazgos de la auditoría CENTINELA sobre 92982427 (H-1 a H-4) / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-hallazgos-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-hallazgos-')) {
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

  const lote = (e: any, ops: any[], usuario = e.cajero, rol = 'CAJERO') =>
    svc.recibirLote(e.tenantId, usuario, rol, { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);
  const movimientos = (cajaId: string) => prisma.movimientoCaja.count({ where: { cajaId } });

  // H-1 (MEDIO): un importe que no cabe en el entero de 32 bits tumbaba el lote entero y era irrecuperable.
  it('H-1: un importe fuera del rango se responde por operación y no impide procesar las demás del lote', async () => {
    const e = await empresa();
    const a = operacion(e);
    const enorme = operacion(e, { totalCentavos: 3_000_000_000, subtotalCentavos: 3_000_000_000, isvCentavos: 0, efectivoRecibidoCentavos: 0, cambioCentavos: 0 });
    const c = operacion(e);
    const r = (await lote(e, [a, enorme, c])).resultados;
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ operacionId: a.operacionId, estado: 'APLICADA' });
    expect(r[1]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'FORMATO_INVALIDO' });
    expect(r[2]).toMatchObject({ operacionId: c.operacionId, estado: 'APLICADA' });
    expect(await filaDe(e.tenantId, enorme.operacionId)).toBeNull();
    // El reintento del mismo lote responde igual y no falla de forma permanente.
    const otra = (await lote(e, [a, enorme, c])).resultados;
    expect(otra.map((x: any) => x.estado)).toEqual(['APLICADA', 'RECHAZADA_TECNICA', 'APLICADA']);
    expect(await ventasDe(e.tenantId)).toBe(2);
  });

  it('H-1: si falla el registro de un rechazo, esa operación queda como error temporal y el lote sigue', async () => {
    const e = await empresa();
    const mala = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    const buena = operacion(e);
    const espia = vi.spyOn(svc as any, 'registrarRechazoDefinitivo').mockRejectedValueOnce(new Error('fallo al registrar el rechazo'));
    try {
      const r = (await lote(e, [mala, buena])).resultados;
      expect(r[0]).toMatchObject({ operacionId: mala.operacionId, estado: 'ERROR_TEMPORAL' });
      expect(r[1]).toMatchObject({ operacionId: buena.operacionId, estado: 'APLICADA' });
    } finally {
      espia.mockRestore();
    }
    // Nada definitivo quedó escrito para la rechazada: al reintentar se registra con normalidad.
    expect(await filaDe(e.tenantId, mala.operacionId)).toBeNull();
    expect((await lote(e, [mala])).resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    expect(await filaDe(e.tenantId, mala.operacionId)).toMatchObject({ estado: 'RECHAZADA' });
  });

  // H-2 (BAJO): un rechazo persistido no cuenta para los acumulados ni para el cupo de la venta siguiente.
  it('H-2: un rechazo propio no hace que la venta legítima siguiente quede con conflictos de límite ni de cupo', async () => {
    const e = await empresa();
    const rechazada = operacion(e, { efectivoRecibidoCentavos: 0, cambioCentavos: 0, totalCentavos: 2_000_000_000, subtotalCentavos: 2_000_000_000, isvCentavos: 0,
      lineas: [{ productoId: e.p1, cantidadCentesimas: 1500, precioCentavos: 1000 }] });
    expect((await lote(e, [rechazada])).resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    expect(await filaDe(e.tenantId, rechazada.operacionId)).toMatchObject({ estado: 'RECHAZADA' });
    const legitima = operacion(e);
    const r = (await lote(e, [legitima])).resultados[0];
    expect(r).toMatchObject({ operacionId: legitima.operacionId, estado: 'APLICADA', requiereRevision: false });
    expect(r.conflictos).toEqual([]);
  });

  // H-3 (BAJO): espacios en blanco no son un motivo.
  it('H-3: un motivo de regularización compuesto de espacios se rechaza en el servidor y no mueve efectivo', async () => {
    const e = await empresa();
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    await lote(e, [op]);
    await prisma.caja.update({ where: { id: e.cajaId }, data: { estado: 'CERRADA', montoCierreFisico: 100, montoEsperado: 100, diferencia: 0 } });
    await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Regularización sin motivo real', regularizarCajaCerrada: true, motivoRegularizacion: ' '.repeat(25) } as any)).rejects.toThrow(/al menos 20 caracteres/);
    expect(await movimientos(e.cajaId)).toBe(0);
    expect((await filaDe(e.tenantId, op.operacionId))?.estado).toBe('RECHAZADA');
  });

  it('H-3: el DTO recorta el motivo antes de medir su longitud', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { ResolverOperacionDto } = await import('../src/contingencia/dto/contingencia.dto');
    const base = { accion: 'CERRAR_MANUAL', nota: 'Regularización con espacios de relleno', regularizarCajaCerrada: true };
    expect((await validate(plainToInstance(ResolverOperacionDto, { ...base, motivoRegularizacion: ' '.repeat(25) }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(ResolverOperacionDto, { ...base, motivoRegularizacion: `   ${'a'.repeat(10)}   ` }))).length).toBeGreaterThan(0);
    const bien = plainToInstance(ResolverOperacionDto, { ...base, motivoRegularizacion: `  ${'Motivo suficiente y claro'}  ` });
    expect(await validate(bien)).toHaveLength(0);
    expect(bien.motivoRegularizacion).toBe('Motivo suficiente y claro');
  });

  // H-4 (BAJO): el administrador no puede declarar un cajero que no es de la empresa.
  it('H-4: un administrador no puede enviar una operación con un cajero que no es usuario de la empresa', async () => {
    const e = await empresa();
    const ajeno = randomUUID();
    const op = operacion(e, { cajeroId: ajeno });
    const r = (await lote(e, [op], e.admin, 'ADMIN')).resultados[0];
    expect(r).toMatchObject({ operacionId: op.operacionId, estado: 'RECHAZADA_TECNICA', codigo: 'CAJERO_DESCONOCIDO' });
    expect(await filaDe(e.tenantId, op.operacionId)).toBeNull();
    expect(await ventasDe(e.tenantId)).toBe(0);
    // Con un cajero de la empresa, el administrador sí puede enviar la operación.
    const valida = operacion(e);
    expect((await lote(e, [valida], e.admin, 'ADMIN')).resultados[0]).toMatchObject({ estado: 'APLICADA' });
  });

  it('F4: una clave compuesta de espacios no cuenta como clave', () => {
    expect(() => claveDeOperaciones({ CONTINGENCIA_CLAVE_OPERACIONES: ' '.repeat(40) })).toThrow(/obligatoria/);
  });
});
