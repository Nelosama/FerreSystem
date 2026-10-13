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


describe('Contingencia hallazgos de la auditoría CENTINELA sobre 632daed0 (H-A a H-D) / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-hallazgos2-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-hallazgos2-')) {
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

  // H-A: PostgreSQL no admite el carácter nulo; llegaba hasta la base y la operación se reintentaba sin fin.
  it('H-A: un carácter nulo en un campo de texto se responde por operación como formato inválido y el lote sigue', async () => {
    const e = await empresa();
    const buena = operacion(e);
    const conNulEnCliente = operacion(e, { clienteNombre: 'Cliente\u0000Malo' });
    const conNulEnProducto = operacion(e, { lineas: [{ productoId: `${e.p1}\u0000`, cantidadCentesimas: 100, precioCentavos: 1000 }] });
    const conNulEnCajero = operacion(e, { cajeroId: `${e.cajero}\u0000` });
    const otra = operacion(e);
    const r = (await lote(e, [buena, conNulEnCliente, conNulEnProducto, conNulEnCajero, otra])).resultados;
    expect(r).toHaveLength(5);
    expect(r[0]).toMatchObject({ operacionId: buena.operacionId, estado: 'APLICADA' });
    for (const i of [1, 2, 3]) expect(r[i], `operación ${i}`).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'FORMATO_INVALIDO' });
    expect(r[4]).toMatchObject({ operacionId: otra.operacionId, estado: 'APLICADA' });
    expect(await ventasDe(e.tenantId)).toBe(2);
  });

  it('H-A: un error interno no devuelve al equipo el texto del error (rutas ni código fuente)', async () => {
    const e = await empresa();
    const op = operacion(e);
    const secreto = 'Invalid `prisma.operacionContingencia.createMany()` invocation in /home/user/FerreSystem/backend/src/contingencia/contingencia.service.ts:468';
    const espia = vi.spyOn(svc as any, 'procesarOperacion').mockRejectedValueOnce(new Error(secreto));
    try {
      const r = (await lote(e, [op])).resultados[0];
      expect(r).toMatchObject({ operacionId: op.operacionId, estado: 'ERROR_TEMPORAL' });
      expect(JSON.stringify(r)).not.toContain('prisma');
      expect(JSON.stringify(r)).not.toContain('/home/');
      expect(JSON.stringify(r)).not.toContain('contingencia.service');
    } finally {
      espia.mockRestore();
    }
  });

  // H-C: los textos libres se miden sin relleno ni caracteres de ancho cero.
  it('H-C: la nota, la referencia y el motivo se recortan y no admiten texto vacío ni caracteres de ancho cero', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { ResolverOperacionDto, ActualizarReferenciaDto } = await import('../src/contingencia/dto/contingencia.dto');
    const ok = async (dto: any) => (await validate(plainToInstance(ResolverOperacionDto, dto))).length === 0;
    const base = { accion: 'MARCAR_REVISADA', nota: 'Nota de la decisión suficientemente larga' };
    expect(await ok(base)).toBe(true);
    expect(await ok({ ...base, nota: ' '.repeat(12) })).toBe(false);
    expect(await ok({ ...base, nota: '\u200B'.repeat(12) })).toBe(false);
    expect(await ok({ ...base, nota: ` ${'a'.repeat(9)} ` })).toBe(false);
    expect(await ok({ ...base, nota: 'caja\u0000nula larga suficiente' })).toBe(false);
    const regularizar = { accion: 'CERRAR_MANUAL', nota: 'Regularización con motivo vacío real', regularizarCajaCerrada: true };
    expect(await ok({ ...regularizar, motivoRegularizacion: '\u200B'.repeat(25) })).toBe(false);
    expect(await ok({ ...regularizar, motivoRegularizacion: 'Motivo suficiente y claro' })).toBe(true);
    const ref = plainToInstance(ActualizarReferenciaDto, { referenciaFacturaExterna: '  F-0001\u200B  ' });
    expect(await validate(ref)).toHaveLength(0);
    expect(ref.referenciaFacturaExterna).toBe('F-0001');
    expect((await validate(plainToInstance(ActualizarReferenciaDto, { referenciaFacturaExterna: 'F\u0000' }))).length).toBeGreaterThan(0);
  });

  it('H-C: el servidor rechaza un motivo de regularización de caracteres de ancho cero', async () => {
    const e = await empresa();
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    await lote(e, [op]);
    await prisma.caja.update({ where: { id: e.cajaId }, data: { estado: 'CERRADA', montoCierreFisico: 100, montoEsperado: 100, diferencia: 0 } });
    await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Regularización sin motivo real', regularizarCajaCerrada: true, motivoRegularizacion: '\u200B'.repeat(25) } as any)).rejects.toThrow(/al menos 20 caracteres/);
  });

  // H-D: una línea de importe gigante daba un 500 al aceptar la operación.
  it('H-D: una línea cuyo importe supera el máximo se rechaza al recibirla y no se puede forzar (ni da 500)', async () => {
    const e = await empresa();
    const op = operacion(e, { lineas: [{ productoId: e.p1, cantidadCentesimas: 99_999_999, precioCentavos: 9_999_999_999 }], totalCentavos: 100, subtotalCentavos: 100, isvCentavos: 0, efectivoRecibidoCentavos: 100, cambioCentavos: 0 });
    const r = (await lote(e, [op])).resultados[0];
    expect(r).toMatchObject({ operacionId: op.operacionId, estado: 'RECHAZADA_TECNICA', codigo: 'IMPORTE_INVALIDO' });
    expect(await filaDe(e.tenantId, op.operacionId)).toMatchObject({ estado: 'RECHAZADA', ventaId: null });
    await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Intento de forzar una línea gigante' } as any)).rejects.toThrow(/rechazada nunca se aplica/);
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('H-D: una línea con importe dentro del máximo sigue aplicándose', async () => {
    const e = await empresa();
    expect((await lote(e, [operacion(e)])).resultados[0]).toMatchObject({ estado: 'APLICADA' });
  });
});
