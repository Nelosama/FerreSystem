import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { emitirRegistrada, siguienteOperacion } from './helpers/operaciones-emitidas';

// Migración aditiva 20261016000000: RECHAZADA como estado terminal. Se prueba sobre una base con TODAS las migraciones
// anteriores ya aplicadas y con filas legadas en REVISION (forma que dejó 87c72fdb), no solo sobre una base vacía.
const NUEVA = '20261016000000_contingencia_estado_rechazada';

describe('Contingencia: migración RECHAZADA sobre base con migraciones previas / PostgreSQL aislado', () => {
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
    // Base "previamente migrada": todas las migraciones excepto la nueva, en orden.
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      if (migracion === NUEVA) continue;
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
    const tenantId = randomUUID();
    const admin = randomUUID();
    const cajero = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería migración', estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: true } } as any } });
    for (const [id, rol] of [[admin, 'ADMIN'], [cajero, 'CAJERO']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: false, permisos: [] } as any });
    }
    const caja = await prisma.caja.create({ data: { tenantId, codigo: 'CAJA-1', usuarioId: cajero, montoApertura: 100, estado: 'ABIERTA' } as any });
    const p1 = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    const dispositivoId = randomUUID();
    await svc.registrarDispositivo(tenantId, cajero, { dispositivoId, nombre: 'Caja principal' });
    const { ventana } = await emitirRegistrada(svc, tenantId, cajero, { dispositivoId });
    // La FK de la operación apunta al id interno del dispositivo, no al identificador que envía el equipo.
    const interno = await prisma.dispositivoPos.findFirstOrThrow({ where: { tenantId } });
    return { tenantId, admin, cajero, cajaId: caja.id, p1: p1.id, dispositivoId: interno.id, ventanaId: ventana.id as string };
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

  describe('con datos legados en una base migrada hasta 20261015', () => {
    let e: Awaited<ReturnType<typeof empresa>>;
    let rechazoObsoleto: string, rechazoOtroCajero: string, revisionStock: string, revisionConResolucion: string, cerradaManual: string;
    let antes: Map<string, { estado: string; conflictos: string; payload: string; resolucion: string | null }>;

    beforeAll(async () => {
      e = await empresa();
      rechazoObsoleto = await filaLegada(e, 'REVISION', obsoleta);
      rechazoOtroCajero = await filaLegada(e, 'REVISION', otroCajero);
      revisionStock = await filaLegada(e, 'REVISION', stock);
      revisionConResolucion = await filaLegada(e, 'REVISION', obsoleta, { accion: 'REINTENTAR', nota: 'ya revisada' });
      cerradaManual = await filaLegada(e, 'RESUELTA_MANUAL', obsoleta, { accion: 'CERRAR_MANUAL', nota: 'cerrada' });
      const leer = () => prisma.$queryRawUnsafe<any[]>(`SELECT id, estado, conflictos::text AS conflictos, payload::text AS payload, resolucion::text AS resolucion FROM operaciones_contingencia WHERE tenant_id='${e.tenantId}'`);
      antes = new Map((await leer()).map((r) => [r.id, { estado: r.estado, conflictos: r.conflictos, payload: r.payload, resolucion: r.resolucion }]));
      expect(antes.get(rechazoObsoleto)?.estado).toBe('REVISION');

      // Aplicación de la migración nueva sobre la base ya migrada.
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
        '-f', resolve('prisma/migrations', NUEVA, 'migration.sql')], { windowsHide: true, timeout: 60000, stdio: 'pipe' });
      (globalThis as any).__despues = new Map((await leer()).map((r) => [r.id, r]));
    }, 120000);

    const despues = () => (globalThis as any).__despues as Map<string, any>;

    it('solo los rechazos definitivos sin venta ni resolución pasan a RECHAZADA', () => {
      expect(despues().get(rechazoObsoleto).estado).toBe('RECHAZADA');
      expect(despues().get(rechazoOtroCajero).estado).toBe('RECHAZADA');
      expect(despues().get(revisionStock).estado).toBe('REVISION');
      expect(despues().get(revisionConResolucion).estado).toBe('REVISION');
      expect(despues().get(cerradaManual).estado).toBe('RESUELTA_MANUAL');
    });

    it('la trazabilidad se conserva: conflictos, payload y resolución no cambian', () => {
      for (const [id, previo] of antes) {
        const ahora = despues().get(id);
        expect({ conflictos: ahora.conflictos, payload: ahora.payload, resolucion: ahora.resolucion }).toEqual({ conflictos: previo.conflictos, payload: previo.payload, resolucion: previo.resolucion });
      }
    });

    it('el CHECK de estado admite RECHAZADA y la restricción sin venta existe', async () => {
      const [r] = await prisma.$queryRawUnsafe<any[]>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='operaciones_contingencia_estado_check'`);
      expect(r.def).toContain("'RECHAZADA'");
      const [s] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM pg_constraint WHERE conname='operaciones_contingencia_rechazada_sin_venta_check'`);
      expect(s.n).toBe(1);
    });

    it('la restricción impide una RECHAZADA con venta asociada', async () => {
      // Venta real de la misma empresa: así el fallo solo puede venir de la restricción nueva y no de la clave foránea.
      const venta = await prisma.venta.create({ data: { tenantId: e.tenantId, numeroVenta: 9001, usuarioId: e.cajero, subtotal: 20, isv: 3, total: 23, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', origen: 'CONTINGENCIA' } as any });
      await expect(prisma.$executeRawUnsafe(`UPDATE operaciones_contingencia SET venta_id = '${venta.id}' WHERE id = '${rechazoObsoleto}'`)).rejects.toThrow(/operaciones_contingencia_rechazada_sin_venta_check/);
      // Y una operación en REVISION sí puede enlazarse a una venta: la restricción solo afecta a RECHAZADA.
      await expect(prisma.$executeRawUnsafe(`UPDATE operaciones_contingencia SET venta_id = '${venta.id}' WHERE id = '${revisionStock}'`)).resolves.toBe(1);
    });

    it('una operación migrada no se aplica nunca: ACEPTAR y REINTENTAR responden 409 y no crean venta', async () => {
      const contarVentas = async () => (await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id='${e.tenantId}'`))[0].n;
      const previas = await contarVentas();
      for (const accion of ['ACEPTAR', 'REINTENTAR'] as const) {
        await expect(svc.resolver(e.tenantId, e.admin, rechazoObsoleto, { accion, nota: `intento ${accion}` } as any)).rejects.toBeInstanceOf(ConflictException);
      }
      expect(await contarVentas()).toBe(previas);
    });

    it('cerrar sin venta sigue disponible y deja la conciliación de efectivo y de inventario separadas', async () => {
      const cierre: any = await svc.resolver(e.tenantId, e.admin, rechazoObsoleto, { accion: 'CERRAR_MANUAL', nota: 'Venta física verificada; efectivo en caja' } as any);
      expect(cierre.estado).toBe('RESUELTA_MANUAL');
      expect(cierre.conciliacionCaja.monto).toBe(23);
      expect(cierre.inventarioPendiente).toEqual([expect.objectContaining({ productoId: e.p1, cantidad: 2 })]);
      const [s] = await prisma.$queryRawUnsafe<any[]>(`SELECT stock_actual::float AS stock FROM productos WHERE id='${e.p1}'`);
      expect(s.stock).toBe(20);
    });

    it('H1 (CENTINELA): ACEPTAR no aplica una operación de otro usuario en la caja del cajero de la ventana', async () => {
      // Fila legada (forma previa a DEF-04): usuario A con la ventana y la caja del cajero B.
      const id = await filaLegada(e, 'REVISION', stock, null, e.admin);
      const contar = async () => ({
        caja: await prisma.movimientoCaja.count({ where: { cajaId: e.cajaId } }),
        ventas: (await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id='${e.tenantId}'`))[0].n,
      });
      const antes = await contar();
      const r: any = await svc.resolver(e.tenantId, e.admin, id, { accion: 'ACEPTAR', nota: 'intento cruzado entre cajeros' } as any);
      expect(r.estado).toBe('RECHAZADA');
      expect(r.conflictos.map((c: any) => c.codigo)).toContain('VENTANA_DE_OTRO_CAJERO');
      expect(await contar()).toEqual(antes);
    });

    it('O-02: una consulta posterior a la migración devuelve RECHAZADA_TECNICA con motivo e instrucción', async () => {
      const [r] = await svc.estados(e.tenantId, e.cajero, 'CAJERO', [rechazoOtroCajero]);
      expect(r).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_DE_OTRO_CAJERO' });
      expect(r.instruccion).toMatch(/No cobre con la ventana de otro cajero/);
    });
  });
});
