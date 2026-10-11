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


describe('Contingencia identidad (H-5 / H-6): cajeros y tenants en PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-identidad-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-identidad-')) {
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
      operacionId: randomUUID(), dispositivoId: e.equipoId, ventanaId: e.ventanaId, secuenciaLocal: 900 + n,
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
    const { ventana } = await svc.emitirVentana(e.tenantId, id, { dispositivoId: e.equipoId });
    return { id, cajaId: caja.id, ventanaId: ventana.id as string };
  }

  // H-5 (CENTINELA): el UUID de la operación lo fija el cliente. Sin un identificador emitido por el servidor, un segundo
  // cajero del mismo equipo que envía primero el UUID del dueño con su propia ventana crea la operación a su nombre.
  // Estas pruebas FIJAN EL COMPORTAMIENTO ACTUAL (vulnerable) hasta la decisión del propietario (opciones A/B/C en el informe).
  it('H-5 (vulnerabilidad conocida): un segundo cajero que envía primero el UUID del dueño se queda con la operación y bloquea al dueño', async () => {
    const e = await empresa();
    const b = await segundoCajero(e);
    const op = operacion(e); // operación del dueño, todavía no enviada
    // El segundo cajero envía ese UUID con su ventana y su cajeroId: el servidor lo acepta como venta suya.
    const primera = (await recibir(e, [{ ...op, ventanaId: b.ventanaId, cajeroId: b.id }], b.id)).resultados[0];
    expect(primera).toMatchObject({ operacionId: op.operacionId, estado: 'APLICADA' });
    expect((await filaDe(e.tenantId, op.operacionId))).toMatchObject({ usuarioId: b.id, cajaId: b.cajaId });
    // El dueño, al enviar su venta real, queda bloqueado (CAJERO_NO_AUTORIZADO) y su cobro no se aplica.
    const duenio = (await recibir(e, [op], e.cajero)).resultados[0];
    expect(duenio).toMatchObject({ operacionId: op.operacionId, codigo: 'CAJERO_NO_AUTORIZADO' });
    expect(await ventasDe(e.tenantId)).toBe(1);
  });

  // H-6 (CENTINELA): aislamiento entre empresas. El mismo UUID en dos tenants es dos operaciones independientes.
  it('H-6: un UUID ya aplicado en otra empresa no se ve, no se altera y no bloquea la venta de esta empresa', async () => {
    const a = await empresa();
    const op = operacion(a);
    expect((await recibir(a, [op])).resultados[0]).toMatchObject({ estado: 'APLICADA' });
    const antes = await filaDe(a.tenantId, op.operacionId);

    const b = await empresa();
    const ajena = { ...operacion(b), operacionId: op.operacionId };
    const r = (await recibir(b, [ajena])).resultados[0];
    expect(r).toMatchObject({ operacionId: op.operacionId, estado: 'APLICADA' });
    expect(await ventasDe(b.tenantId)).toBe(1);

    // La fila de la empresa A no cambió.
    const despues = await filaDe(a.tenantId, op.operacionId);
    expect(despues).toMatchObject({ usuarioId: antes!.usuarioId, payloadHash: antes!.payloadHash, estado: 'APLICADA' });
    expect(despues!.id).toBe(antes!.id);
  });

  it('H-6: un payload distinto con el mismo UUID desde otra empresa no registra alteración en la empresa original', async () => {
    const a = await empresa();
    const op = operacion(a);
    await recibir(a, [op]);
    const b = await empresa();
    const alterada = { ...operacion(b), operacionId: op.operacionId, totalCentavos: 9999, efectivoRecibidoCentavos: 9999 };
    const r = (await recibir(b, [alterada])).resultados[0];
    expect(r).toMatchObject({ operacionId: op.operacionId });
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId: a.tenantId, operacion: 'CONTINGENCIA_OPERACION_ALTERADA' } })).toBe(0);
    expect(await ventasDe(a.tenantId)).toBe(1);
    expect((await filaDe(a.tenantId, op.operacionId))!.totalCentavos).toBe(2300);
  });

  it('H-6: estados no revela a una empresa una operación de otra', async () => {
    const a = await empresa();
    const op = operacion(a);
    await recibir(a, [op]);
    const b = await empresa();
    const [r] = await svc.estados(b.tenantId, b.admin, 'ADMIN', [op.operacionId]);
    expect(r).toMatchObject({ operacionId: op.operacionId, estado: 'NO_REGISTRADA' });
  });
});
