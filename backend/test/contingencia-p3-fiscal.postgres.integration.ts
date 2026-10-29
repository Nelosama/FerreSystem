import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { idSolicitud } from '../src/operaciones/ledger';
import { emitirRegistrada, siguienteOperacion } from './helpers/operaciones-emitidas';

// P3: una aceptación de un administrador no convierte en venta una operación de contingencia fiscalmente incoherente.
// Y desglose histórico por línea de las ventas de contingencia (FISCAL_DESGLOSE_POR_LINEA). Datos sintéticos.


describe('Contingencia P3: importes fiscales y desglose por línea / PostgreSQL aislado', () => {
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
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-p3-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-p3-')) {
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
  const ventasDe = async (tenantId: string) => (await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id='${tenantId}'`))[0].n;
  const filaDe = (tenantId: string, operacionId: string) => prisma.operacionContingencia.findFirst({ where: { tenantId, id: { in: [idSolicitud(tenantId, operacionId), operacionId] } } });

  const lote = (e: any, ops: any[], usuario = e.cajero) => svc.recibirLote(e.tenantId, usuario, 'CAJERO', { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);

  const conflictosDe = async (tenantId: string, operacionId: string) => ((await filaDe(tenantId, operacionId))!.conflictos as any[]).map((c) => c.codigo).sort();
  const lineasVenta = (ventaId: string) => prisma.$queryRawUnsafe<any[]>('SELECT exento, base_gravada::float AS g, base_exenta::float AS e, isv::float AS isv, tasa_isv::float AS tasa FROM detalles_venta WHERE venta_id=$1', ventaId);

  it('ISV del equipo en cero con subtotal gravado: queda en revisión y ACEPTAR no crea la venta; se cierra sin venta', async () => {
    const e = await empresa();
    const op = operacion(e, { isvCentavos: 0, totalCentavos: 2000, efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    await lote(e, [op]);
    expect(await conflictosDe(e.tenantId, op.operacionId)).toEqual(['IMPORTE_FISCAL_INCONSISTENTE', 'TOTAL_DIFERENTE']);
    const r: any = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Intento de aceptar sin ISV' } as any);
    expect(r.estado).toBe('REVISION');
    expect(await ventasDe(e.tenantId)).toBe(0);
    const cerrada: any = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Se factura aparte con el ISV correcto' } as any);
    expect(cerrada.estado).toBe('RESUELTA_MANUAL');
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('subtotal + ISV distinto del total: tampoco es aceptable', async () => {
    const e = await empresa();
    const op = operacion(e, { isvCentavos: 300, totalCentavos: 2400, efectivoRecibidoCentavos: 2400, cambioCentavos: 0 });
    await lote(e, [op]);
    expect(await conflictosDe(e.tenantId, op.operacionId)).toEqual(['IMPORTE_FISCAL_INCONSISTENTE', 'TOTAL_DIFERENTE']);
    await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Intento' } as any);
    expect(await ventasDe(e.tenantId)).toBe(0);
  });

  it('diferencia de precio con importes fiscalmente coherentes: sigue siendo aceptable y la venta queda sin desglose', async () => {
    const e = await empresa();
    process.env.FISCAL_DESGLOSE_POR_LINEA = 'true';
    try {
      // Líneas 2 × 10.00 = 20.00, pero el equipo cobró 18.00 + 2.70 de ISV (coherente con su subtotal).
      const op = operacion(e, { subtotalCentavos: 1800, isvCentavos: 270, totalCentavos: 2070, efectivoRecibidoCentavos: 2070, cambioCentavos: 0 });
      await lote(e, [op]);
      expect(await conflictosDe(e.tenantId, op.operacionId)).toEqual(['TOTAL_DIFERENTE']);
      const r: any = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Precio negociado verificado' } as any);
      expect(r.estado).toBe('APLICADA');
      const fila = await filaDe(e.tenantId, op.operacionId);
      const venta = await prisma.venta.findUniqueOrThrow({ where: { id: fila!.ventaId! } });
      expect([Number(venta.subtotal), Number(venta.isv), Number(venta.total)]).toEqual([18, 2.7, 20.7]);
      expect(await lineasVenta(venta.id)).toEqual([{ exento: null, g: null, e: null, isv: null, tasa: null }]);
    } finally { delete process.env.FISCAL_DESGLOSE_POR_LINEA; }
  });

  it('operación coherente con el interruptor encendido: la venta de contingencia se guarda con desglose gravado', async () => {
    const e = await empresa();
    process.env.FISCAL_DESGLOSE_POR_LINEA = 'true';
    try {
      const op = operacion(e);
      await lote(e, [op]);
      const fila = await filaDe(e.tenantId, op.operacionId);
      expect(fila!.estado).toBe('APLICADA');
      expect(await lineasVenta(fila!.ventaId!)).toEqual([{ exento: false, g: 20, e: 0, isv: 3, tasa: 15 }]);
    } finally { delete process.env.FISCAL_DESGLOSE_POR_LINEA; }
  });
});
