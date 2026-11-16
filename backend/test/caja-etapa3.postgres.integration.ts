import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { CotizacionesService } from '../src/cotizaciones/cotizaciones.service';
import { AutorizacionesService } from '../src/autorizaciones/autorizaciones.service';
import { DashboardService } from '../src/dashboard/dashboard.service';

// Etapa 3 de las decisiones del dueño del 2026-11-12: caja.
// Caja por persona; ADMIN configura si el cajero abre/cierra solo o con autorización; cierre ciego con recuento; cierre con
// diferencia según la autonomía; saldo trasladable; aviso a todos los ADMIN por diferencias ≥ umbral hasta revisarlas.
// Cadena completa de migraciones sobre un clúster temporal; servicios reales, sin mocks.
describe('Caja — etapa 3 (cierre ciego, autonomía, traslado y avisos) / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let ventas: VentasService;
  let ops: OperacionesService;
  let autorizaciones: AutorizacionesService;
  let dashboard: DashboardService;
  let tenantA: string, tenantB: string;
  let admin: string, admin2: string, cajero: string, cajero2: string, adminB: string;
  let productoId: string;

  const sql = (q: string, ...args: any[]) => prisma.$queryRawUnsafe<any[]>(q, ...args);
  const abrir = (usuario: string, monto = 100, solicitudId = randomUUID()) => ops.abrir(tenantA, usuario, { solicitudId, monto } as any) as Promise<any>;
  /** Venta en efectivo de 1 unidad a 100 + ISV 15 % = 115 en la caja abierta del usuario. */
  const venderEfectivo = (usuario: string) => ventas.create(tenantA, usuario, { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId, cantidad: 1 }] } as any);
  const configurar = (cfg: Partial<{ aperturaAutonoma: boolean; cierreAutonomo: boolean; umbralAvisoDiferencia: number }>) =>
    ops.guardarConfiguracionCaja(tenantA, admin, { aperturaAutonoma: true, cierreAutonomo: true, umbralAvisoDiferencia: 0, ...cfg });
  const pendientes = async (usuario: string) => Object.fromEntries((await dashboard.getPendientes(tenantA, { sub: usuario, rol: 'ADMIN' })).indicadores.map((i) => [i.clave, i.cantidad]));
  const solicitudPendiente = async (tipo: string) => (await sql("SELECT id FROM solicitudes_autorizacion WHERE tenant_id=$1 AND tipo=$2::\"TipoSolicitudAutorizacion\" AND estado='PENDIENTE'", tenantA, tipo))[0]?.id as string | undefined;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-caja-etapa3-'));
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
    autorizaciones = new AutorizacionesService(prisma, new CotizacionesService(prisma));
    dashboard = new DashboardService(prisma);
  }, 240000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-caja-etapa3-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantA = randomUUID(); tenantB = randomUUID();
    for (const id of [tenantA, tenantB]) await prisma.tenant.create({ data: { id, nombreComercial: 'Caja etapa 3', estado: 'ACTIVO' } as any });
    const crear = async (tenant: string, rol: string, nombre: string) => {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId: tenant, nombre, email: `${id}@test.invalid`, passwordHash: 'x', rol: rol as any } as any });
      return id;
    };
    admin = await crear(tenantA, 'ADMIN', 'Admin A'); admin2 = await crear(tenantA, 'ADMIN', 'Admin A2');
    cajero = await crear(tenantA, 'CAJERO', 'Cajero A'); cajero2 = await crear(tenantA, 'CAJERO', 'Cajero A2');
    adminB = await crear(tenantB, 'ADMIN', 'Admin B');
    productoId = (await prisma.producto.create({ data: { tenantId: tenantA, codigo: `P-${randomUUID().slice(0, 6)}`, nombre: 'Martillo', precioCosto: 60, precioVenta: 100, stockActual: 100, precioAprobado: true } as any })).id;
  });

  it('con la configuración por defecto, cada persona abre su caja sola; el cajero no ve el esperado con la caja abierta', async () => {
    expect(await ops.configuracionCaja(tenantA, admin)).toEqual({ aperturaAutonoma: true, cierreAutonomo: true, umbralAvisoDiferencia: 0 });
    const c = await abrir(cajero, 100);
    expect(c).toMatchObject({ estado: 'ABIERTA', usuario_id: cajero });
    await abrir(cajero2, 50);
    await venderEfectivo(cajero);
    const [vista] = await ops.caja(tenantA, cajero);
    expect(vista.resumen).toEqual({ fondoInicial: 100, ciego: true });
    expect(vista.efectivoEsperado).toBeUndefined();
    expect(vista.totales).toBeUndefined();
    expect((await ops.cajaDetalle(tenantA, cajero, c.id)).resumen).toEqual({ fondoInicial: 100, ciego: true });
    // El ADMIN sí ve el esperado de cualquier caja abierta.
    expect((await ops.cajaDetalle(tenantA, admin, c.id)).resumen.efectivoEsperado).toBe(215);
  });

  it('cierre ciego: el conteo devuelve si falta, sobra o cuadra y cuánto, sin el esperado; cada recuento queda registrado', async () => {
    const c = await abrir(cajero, 100);
    await venderEfectivo(cajero);
    const primero = await ops.conteoCaja(tenantA, cajero, c.id, { monto: 210 });
    expect(primero).toMatchObject({ numero: 1, monto: 210, diferencia: -5, resultado: 'FALTA' });
    expect(primero).not.toHaveProperty('esperado');
    expect(await ops.conteoCaja(tenantA, cajero, c.id, { monto: 220 })).toMatchObject({ numero: 2, diferencia: 5, resultado: 'SOBRA' });
    expect(await ops.conteoCaja(tenantA, cajero, c.id, { monto: 215 })).toMatchObject({ numero: 3, diferencia: 0, resultado: 'CUADRA' });
    expect((await ops.caja(tenantA, cajero))[0].ultimoConteo).toMatchObject({ numero: 3, resultado: 'CUADRA' });
    // Otra persona no cuenta la caja ajena.
    await expect(ops.conteoCaja(tenantA, cajero2, c.id, { monto: 1 })).rejects.toThrow(NotFoundException);
    const cerrada = await ops.cerrar(tenantA, cajero, c.id, { monto: 215 } as any) as any;
    expect(cerrada.estado).toBe('CERRADA');
    expect(Number(cerrada.diferencia)).toBe(0);
    // El cierre usó el último conteo: no se registró uno nuevo.
    expect(Number((await sql('SELECT COUNT(*) AS n FROM conteos_caja WHERE caja_id=$1', c.id))[0].n)).toBe(3);
    expect((await ops.cajaDetalle(tenantA, cajero, c.id)).conteos.map((k: any) => Number(k.diferencia))).toEqual([-5, 5, 0]);
    await expect(ops.conteoCaja(tenantA, cajero, c.id, { monto: 1 })).rejects.toThrow(ConflictException);
  });

  it('diferencia con cierre autónomo: exige motivo, cierra y avisa a cada ADMIN hasta que uno la revisa', async () => {
    const c = await abrir(cajero, 100);
    await venderEfectivo(cajero);
    await ops.conteoCaja(tenantA, cajero, c.id, { monto: 210 });
    await expect(ops.cerrar(tenantA, cajero, c.id, { monto: 210 } as any)).rejects.toThrow(BadRequestException);
    const cerrada = await ops.cerrar(tenantA, cajero, c.id, { monto: 210, notas: 'Faltan 5 por vuelto mal dado' } as any) as any;
    expect(cerrada).toMatchObject({ estado: 'CERRADA', notas: 'Faltan 5 por vuelto mal dado' });
    expect(Number(cerrada.diferencia)).toBe(-5);
    expect((await pendientes(admin)).diferencias_caja).toBe(1);
    expect((await pendientes(admin2)).diferencias_caja).toBe(1);
    const lista = await ops.cierresCaja(tenantA, admin, {});
    expect(lista.find((x: any) => x.id === c.id)).toMatchObject({ requiere_revision: true, conteos: 1 });
    await expect(ops.revisarDiferenciaCaja(tenantA, cajero, c.id)).rejects.toThrow(ForbiddenException);
    await expect(ops.revisarDiferenciaCaja(tenantB, adminB, c.id)).rejects.toThrow(NotFoundException);
    const revisada = await ops.revisarDiferenciaCaja(tenantA, admin2, c.id);
    expect(revisada).toMatchObject({ diferencia_revisada_por: admin2 });
    expect((await pendientes(admin)).diferencias_caja).toBe(0);
    await expect(ops.revisarDiferenciaCaja(tenantA, admin, c.id)).rejects.toThrow(/ya fue revisada/);
    expect((await sql("SELECT operacion FROM auditoria_operaciones WHERE tenant_id=$1 AND entidad_id=$2 ORDER BY created_at", tenantA, c.id)).map((a) => a.operacion))
      .toEqual(expect.arrayContaining(['CAJA_ABRIR', 'CAJA_CONTEO', 'CAJA_CERRAR', 'CAJA_REVISAR_DIFERENCIA']));
  });

  it('el umbral informativo lo configura el ADMIN: diferencias por debajo no avisan; iguales o mayores sí', async () => {
    await expect(ops.guardarConfiguracionCaja(tenantA, cajero, { aperturaAutonoma: true, cierreAutonomo: true, umbralAvisoDiferencia: 1 })).rejects.toThrow(ForbiddenException);
    expect(await configurar({ umbralAvisoDiferencia: 10 })).toEqual({ aperturaAutonoma: true, cierreAutonomo: true, umbralAvisoDiferencia: 10 });
    const c1 = await abrir(cajero, 100);
    await ops.cerrar(tenantA, cajero, c1.id, { monto: 95, notas: 'Faltan 5' } as any);
    expect((await pendientes(admin)).diferencias_caja).toBe(0);
    const c2 = await abrir(cajero2, 100);
    await ops.cerrar(tenantA, cajero2, c2.id, { monto: 90, notas: 'Faltan 10' } as any);
    expect((await pendientes(admin)).diferencias_caja).toBe(1);
    expect((await sql("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CAJA_CONFIGURAR'", tenantA))[0].datos).toMatchObject({ despues: { umbralAvisoDiferencia: 10 } });
  });

  it('apertura con autorización: el cajero no abre sin aprobación; el ADMIN aprueba y entonces abre; el ADMIN abre sin pedirla', async () => {
    await configurar({ aperturaAutonoma: false });
    expect(await ops.aperturaCaja(tenantA, cajero)).toMatchObject({ requiereAutorizacionApertura: true, requiereAutorizacionCierre: false });
    expect(await ops.aperturaCaja(tenantA, admin)).toMatchObject({ requiereAutorizacionApertura: false });
    const solicitudId = randomUUID();
    const pendiente = await abrir(cajero, 80, solicitudId);
    expect(pendiente).toMatchObject({ estado: 'PENDIENTE_AUTORIZACION', monto: 80 });
    expect(Number((await sql('SELECT COUNT(*) AS n FROM cajas WHERE tenant_id=$1 AND usuario_id=$2', tenantA, cajero))[0].n)).toBe(0);
    // Repetirla no duplica la solicitud.
    expect((await abrir(cajero, 80, solicitudId)).solicitudAutorizacionId).toBe(pendiente.solicitudAutorizacionId);
    expect((await pendientes(admin)).autorizaciones_caja).toBe(1);
    const lista = await autorizaciones.listar(tenantA, admin, 'PENDIENTE', 1, ['APERTURA_CAJA', 'CIERRE_CAJA']);
    expect(lista.solicitudes).toHaveLength(1);
    expect(lista.solicitudes[0]).toMatchObject({ tipo: 'APERTURA_CAJA', solicitanteId: cajero, resumen: { monto: 80 } });
    await expect(autorizaciones.aprobar(tenantA, cajero, pendiente.solicitudAutorizacionId)).rejects.toThrow(ForbiddenException);
    await autorizaciones.aprobar(tenantA, admin, pendiente.solicitudAutorizacionId);
    const abierta = await abrir(cajero, 80, solicitudId);
    expect(abierta).toMatchObject({ estado: 'ABIERTA', usuario_id: cajero });
    expect(Number(abierta.monto_apertura)).toBe(80);
    const [registro] = await sql("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CAJA_ABRIR' AND entidad_id=$2", tenantA, abierta.id);
    expect(registro.datos.autorizacionId).toBe(pendiente.solicitudAutorizacionId);
    // El ADMIN abre su propia caja sin autorización.
    expect(await abrir(admin, 10)).toMatchObject({ estado: 'ABIERTA' });
  });

  it('apertura rechazada: el mismo intento no abre ni se vuelve a pedir solo; cambiar el monto es una solicitud nueva', async () => {
    await configurar({ aperturaAutonoma: false });
    const solicitudId = randomUUID();
    const pendiente = await abrir(cajero, 80, solicitudId);
    await autorizaciones.rechazar(tenantA, admin, pendiente.solicitudAutorizacionId, 'Hoy no abre esa caja');
    await expect(abrir(cajero, 80, solicitudId)).rejects.toThrow(/rechazó esta apertura/);
    const otra = await abrir(cajero, 80);
    expect(otra).toMatchObject({ estado: 'PENDIENTE_AUTORIZACION' });
    expect(otra.solicitudAutorizacionId).not.toBe(pendiente.solicitudAutorizacionId);
  });

  it('una aprobación de apertura sirve para una sola apertura: las solicitudes sobrantes no quedan utilizables', async () => {
    await configurar({ aperturaAutonoma: false });
    const estadoDe = async (id: string) => (await sql('SELECT estado::text AS estado FROM solicitudes_autorizacion WHERE id=$1', id))[0].estado;
    // El cajero pide abrir dos veces con solicitudes distintas (otro equipo, o perdió la espera guardada): solo la última sigue viva.
    const a = await abrir(cajero, 80);
    const b = await abrir(cajero, 80);
    expect(b.solicitudAutorizacionId).not.toBe(a.solicitudAutorizacionId);
    expect(await estadoDe(a.solicitudAutorizacionId)).toBe('INVALIDADA');
    expect((await pendientes(admin)).autorizaciones_caja).toBe(1);
    await expect(autorizaciones.aprobar(tenantA, admin, a.solicitudAutorizacionId)).rejects.toThrow(ConflictException);
    // Las solicitudes de otra persona no se tocan.
    const ajena = await abrir(cajero2, 50);
    expect(await estadoDe(b.solicitudAutorizacionId)).toBe('PENDIENTE');
    expect(await estadoDe(ajena.solicitudAutorizacionId)).toBe('PENDIENTE');

    // Una aprobación sin usar no sobrevive a otra apertura de la misma persona.
    const sinUsar = randomUUID();
    const c = await abrir(cajero, 60, sinUsar);
    await autorizaciones.aprobar(tenantA, admin, c.solicitudAutorizacionId);
    await configurar({ aperturaAutonoma: true });
    const directa = await abrir(cajero, 40);
    expect(directa).toMatchObject({ estado: 'ABIERTA' });
    expect(await estadoDe(c.solicitudAutorizacionId)).toBe('INVALIDADA');
    expect((await sql('SELECT decisor_id FROM solicitudes_autorizacion WHERE id=$1', c.solicitudAutorizacionId))[0].decisor_id).toBe(admin);
    expect((await sql("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='AUTORIZACION_INVALIDADA' AND entidad_id=$2", tenantA, c.solicitudAutorizacionId))[0].n).toBe(1);
    await ops.conteoCaja(tenantA, cajero, directa.id, { monto: 40 });
    await ops.cerrar(tenantA, cajero, directa.id, { monto: 40 } as any);
    await configurar({ aperturaAutonoma: false });
    // Con la tienda otra vez bajo autorización, la aprobación antigua no abre: hace falta una nueva.
    const otraVez = await abrir(cajero, 60, sinUsar);
    expect(otraVez).toMatchObject({ estado: 'PENDIENTE_AUTORIZACION' });
    expect(otraVez.solicitudAutorizacionId).not.toBe(c.solicitudAutorizacionId);
    expect(Number((await sql("SELECT COUNT(*) AS n FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA'", tenantA, cajero))[0].n)).toBe(0);
    // La aprobación que sí se usó queda como historial, APROBADA.
    await autorizaciones.aprobar(tenantA, admin2, otraVez.solicitudAutorizacionId);
    const usada = await abrir(cajero, 60, sinUsar);
    expect(usada).toMatchObject({ estado: 'ABIERTA' });
    await ops.conteoCaja(tenantA, cajero, usada.id, { monto: 60 });
    await ops.cerrar(tenantA, cajero, usada.id, { monto: 60 } as any);
    await abrir(cajero, 10);
    expect(await estadoDe(otraVez.solicitudAutorizacionId)).toBe('APROBADA');
  });

  it('la solicitud de apertura de una persona no la invalida ni la usa otra con el mismo identificador', async () => {
    await configurar({ aperturaAutonoma: false });
    const solicitudId = randomUUID();
    const propia = await abrir(cajero, 80, solicitudId);
    await expect(abrir(cajero2, 90, solicitudId)).rejects.toThrow(ConflictException);
    await expect(abrir(cajero2, 80, solicitudId)).rejects.toThrow(ConflictException);
    const [fila] = await sql('SELECT estado::text AS estado, solicitante_id FROM solicitudes_autorizacion WHERE id=$1', propia.solicitudAutorizacionId);
    expect(fila).toMatchObject({ estado: 'PENDIENTE', solicitante_id: cajero });
    expect((await sql("SELECT COUNT(*)::int AS n FROM solicitudes_autorizacion WHERE tenant_id=$1 AND tipo='APERTURA_CAJA'", tenantA))[0].n).toBe(1);
    // Aprobada, tampoco la aprovecha otra persona.
    await autorizaciones.aprobar(tenantA, admin, propia.solicitudAutorizacionId);
    await expect(abrir(cajero2, 80, solicitudId)).rejects.toThrow(ConflictException);
    expect(Number((await sql('SELECT COUNT(*) AS n FROM cajas WHERE tenant_id=$1 AND usuario_id=$2', tenantA, cajero2))[0].n)).toBe(0);
    expect(await abrir(cajero, 80, solicitudId)).toMatchObject({ estado: 'ABIERTA', usuario_id: cajero });
  });

  it('al cerrar la caja no queda ninguna solicitud de cierre pendiente', async () => {
    const c = await abrir(cajero, 100);
    await configurar({ cierreAutonomo: false });
    await ops.conteoCaja(tenantA, cajero, c.id, { monto: 100 });
    const pedida = await ops.cerrar(tenantA, cajero, c.id, { monto: 100 } as any) as any;
    expect(pedida.estado).toBe('PENDIENTE_AUTORIZACION');
    expect((await pendientes(admin)).autorizaciones_caja).toBe(1);
    // El ADMIN vuelve a permitir el cierre autónomo antes de decidir: el cajero cierra y la solicitud deja de esperar decisión.
    await configurar({ cierreAutonomo: true });
    expect(await ops.cerrar(tenantA, cajero, c.id, { monto: 100 } as any)).toMatchObject({ estado: 'CERRADA' });
    const [fila] = await sql('SELECT estado::text AS estado, decisor_id FROM solicitudes_autorizacion WHERE id=$1', pedida.solicitudAutorizacionId);
    expect(fila).toMatchObject({ estado: 'INVALIDADA', decisor_id: cajero });
    expect((await pendientes(admin)).autorizaciones_caja).toBe(0);
    expect((await pendientes(admin2)).autorizaciones_caja).toBe(0);
  });

  it('cierre con autorización: pide aprobación del último conteo; un recuento la invalida; aprobado, el cajero cierra', async () => {
    const c = await abrir(cajero, 100);
    await configurar({ cierreAutonomo: false });
    await ops.conteoCaja(tenantA, cajero, c.id, { monto: 90 });
    const primera = await ops.cerrar(tenantA, cajero, c.id, { monto: 90, notas: 'Faltan 10' } as any) as any;
    expect(primera).toMatchObject({ estado: 'PENDIENTE_AUTORIZACION', conteo: { numero: 1, diferencia: -10, resultado: 'FALTA' } });
    expect((await sql('SELECT estado::text AS estado FROM cajas WHERE id=$1', c.id))[0].estado).toBe('ABIERTA');
    // El cajero vuelve a contar: la aprobación pedida para el conteo anterior ya no sirve.
    await ops.conteoCaja(tenantA, cajero, c.id, { monto: 100 });
    await expect(autorizaciones.aprobar(tenantA, admin, primera.solicitudAutorizacionId)).rejects.toThrow(/volvió a contar/);
    const segunda = await ops.cerrar(tenantA, cajero, c.id, { monto: 100 } as any) as any;
    expect(segunda.estado).toBe('PENDIENTE_AUTORIZACION');
    expect((await sql('SELECT estado::text AS estado FROM solicitudes_autorizacion WHERE id=$1', primera.solicitudAutorizacionId))[0].estado).toBe('INVALIDADA');
    await autorizaciones.aprobar(tenantA, admin2, segunda.solicitudAutorizacionId);
    const cerrada = await ops.cerrar(tenantA, cajero, c.id, { monto: 100 } as any) as any;
    expect(cerrada).toMatchObject({ estado: 'CERRADA' });
    expect(Number(cerrada.diferencia)).toBe(0);
    // El ADMIN cierra su propia caja sin autorización.
    const propia = await abrir(admin, 20);
    expect(await ops.cerrar(tenantA, admin, propia.id, { monto: 20 } as any)).toMatchObject({ estado: 'CERRADA' });
  });

  it('dos ADMIN deciden a la vez un cierre: gana una sola decisión', async () => {
    const c = await abrir(cajero, 100);
    await configurar({ cierreAutonomo: false });
    const pendiente = await ops.cerrar(tenantA, cajero, c.id, { monto: 100 } as any) as any;
    const r = await Promise.allSettled([
      autorizaciones.aprobar(tenantA, admin, pendiente.solicitudAutorizacionId),
      autorizaciones.rechazar(tenantA, admin2, pendiente.solicitudAutorizacionId),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  /** Solicitud de cierre PENDIENTE del cajero (cierre no autónomo). */
  const solicitudCierre = async () => {
    const c = await abrir(cajero, 100);
    await configurar({ cierreAutonomo: false });
    return (await ops.cerrar(tenantA, cajero, c.id, { monto: 100 } as any) as any).solicitudAutorizacionId as string;
  };
  const estadoDe = async (id: string) => (await sql('SELECT estado::text AS estado, decisor_id FROM solicitudes_autorizacion WHERE id=$1', id))[0];
  const decisionesAuditadas = async (id: string) => (await sql(
    "SELECT operacion, usuario_id FROM auditoria_operaciones WHERE entidad_id=$1 AND operacion IN ('AUTORIZACION_CANCELADA','AUTORIZACION_APROBADA','AUTORIZACION_RECHAZADA') ORDER BY created_at", id)) as { operacion: string; usuario_id: string }[];

  it('cancelar una solicitud de caja es atómico: si falla la auditoría, la solicitud sigue PENDIENTE', async () => {
    const id = await solicitudCierre();
    // Revalidación de empresa y solicitante: otra empresa u otro cajero no la ven ni la cancelan.
    await expect(autorizaciones.cancelar(tenantB, adminB, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(autorizaciones.cancelar(tenantA, cajero2, id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await estadoDe(id)).estado).toBe('PENDIENTE');
    // Falla forzada solo para la auditoría de esta cancelación (base temporal de la prueba).
    await prisma.$executeRawUnsafe(`CREATE FUNCTION prueba_falla_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.operacion = 'AUTORIZACION_CANCELADA' AND NEW.entidad_id = '${id}' THEN RAISE EXCEPTION 'auditoría no disponible'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER prueba_falla_auditoria BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION prueba_falla_auditoria()');
    try {
      await expect(autorizaciones.cancelar(tenantA, cajero, id)).rejects.toThrow(/auditoría no disponible/);
      expect(await estadoDe(id)).toMatchObject({ estado: 'PENDIENTE', decisor_id: null });
      expect(await decisionesAuditadas(id)).toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER prueba_falla_auditoria ON auditoria_operaciones');
      await prisma.$executeRawUnsafe('DROP FUNCTION prueba_falla_auditoria()');
    }
    // Sin la falla, la misma cancelación se completa con su auditoría.
    expect(await autorizaciones.cancelar(tenantA, cajero, id)).toMatchObject({ estado: 'CANCELADA', decisorId: cajero });
    expect(await decisionesAuditadas(id)).toEqual([{ operacion: 'AUTORIZACION_CANCELADA', usuario_id: cajero }]);
  });

  it('cancelación concurrente con una decisión: la que espera el bloqueo vuelve a validar y recibe 409, sin estado ni auditoría propios', async () => {
    const id = await solicitudCierre();
    // Un ADMIN aprueba dentro de una transacción que retiene la fila; la cancelación arranca mientras tanto (su lectura
    // previa todavía ve PENDIENTE) y debe esperar el bloqueo y releer el estado ya decidido.
    let liberar!: () => void;
    const bloqueada = new Promise<void>((r) => { liberar = r; });
    let aviso!: () => void;
    const filaTomada = new Promise<void>((r) => { aviso = r; });
    const aprobacion = prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM solicitudes_autorizacion WHERE id=$1 FOR UPDATE', id);
      aviso();
      await bloqueada;
      await tx.$queryRawUnsafe("UPDATE solicitudes_autorizacion SET estado='APROBADA', decisor_id=$2, decidida_at=now() WHERE id=$1", id, admin);
      await tx.$queryRawUnsafe("INSERT INTO auditoria_operaciones (id,tenant_id,usuario_id,operacion,entidad_id,datos) VALUES ($1,$2,$3,'AUTORIZACION_APROBADA',$4,'{}'::jsonb)", randomUUID(), tenantA, admin, id);
    }, { timeout: 20000 });
    await filaTomada;
    const cancelacion = autorizaciones.cancelar(tenantA, cajero, id);
    await new Promise((r) => setTimeout(r, 300));
    liberar();
    await aprobacion;
    await expect(cancelacion).rejects.toBeInstanceOf(ConflictException);
    expect(await estadoDe(id)).toMatchObject({ estado: 'APROBADA', decisor_id: admin });
    expect(await decisionesAuditadas(id)).toEqual([{ operacion: 'AUTORIZACION_APROBADA', usuario_id: admin }]);

    // Carreras reales entre cancelar, aprobar y rechazar: una sola gana y estado y auditoría coinciden con ella.
    for (let i = 0; i < 5; i += 1) {
      const caja = (await sql("SELECT id FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA'", tenantA, cajero))[0].id;
      const sid = (await ops.cerrar(tenantA, cajero, caja, { monto: 100 + i + 1, notas: `Recuento ${i}` } as any) as any).solicitudAutorizacionId as string;
      const r = await Promise.allSettled([
        autorizaciones.cancelar(tenantA, cajero, sid),
        autorizaciones.aprobar(tenantA, admin, sid),
        autorizaciones.rechazar(tenantA, admin2, sid),
      ]);
      const ganadoras = r.filter((x) => x.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      expect(ganadoras).toHaveLength(1);
      for (const x of r) if (x.status === 'rejected') expect(x.reason).toBeInstanceOf(ConflictException);
      const final = await estadoDe(sid);
      expect(final.estado).toBe(ganadoras[0].value.estado);
      const auditadas = await decisionesAuditadas(sid);
      expect(auditadas).toHaveLength(1);
      expect(auditadas[0]).toEqual({ operacion: `AUTORIZACION_${final.estado}`, usuario_id: final.decisor_id });
    }
  });

  it('integridad multiempresa: la base rechaza conteos, traslados, revisiones y configuración con caja o usuario de otra empresa; las lecturas cruzadas no ven nada', async () => {
    const cajaA = await abrir(cajero, 100);
    await ops.conteoCaja(tenantA, cajero, cajaA.id, { monto: 100 });
    const cajaB = await ops.abrir(tenantB, adminB, { solicitudId: randomUUID(), monto: 50 } as any) as any;
    const exec = (q: string, ...args: any[]) => prisma.$executeRawUnsafe(q, ...args);
    const insertarConteo = (tenant: string, caja: string, usuario: string) =>
      exec('INSERT INTO conteos_caja (id, tenant_id, caja_id, usuario_id, monto, esperado, diferencia) VALUES ($1,$2,$3,$4,10,10,0)', randomUUID(), tenant, caja, usuario);
    const rechazo = /conteos_caja_caja_id_fkey|no pertenece a la empresa|foreign key/i;

    // Conteo de la empresa A con la caja de B: lo rechaza la FK compuesta (tenant_id, caja_id) → cajas(tenant_id, id).
    await expect(insertarConteo(tenantA, cajaB.id, cajero)).rejects.toThrow(/conteos_caja_caja_id_fkey/);
    // Conteo de la empresa A con un usuario de B: lo rechaza el trigger de misma empresa.
    await expect(insertarConteo(tenantA, cajaA.id, adminB)).rejects.toThrow(/no pertenece a la empresa/);
    // Mover un conteo existente a otra empresa o a otro usuario ajeno tampoco pasa.
    const [{ id: conteoId }] = await sql('SELECT id FROM conteos_caja WHERE caja_id=$1', cajaA.id);
    await expect(exec('UPDATE conteos_caja SET usuario_id=$2 WHERE id=$1', conteoId, adminB)).rejects.toThrow(rechazo);
    await expect(exec('UPDATE conteos_caja SET tenant_id=$2 WHERE id=$1', conteoId, tenantB)).rejects.toThrow(rechazo);
    // Las demás referencias nuevas de la migración: caja anterior, revisor y autor de la configuración.
    await expect(exec('UPDATE cajas SET caja_anterior_id=$2 WHERE id=$1', cajaA.id, cajaB.id)).rejects.toThrow(/no pertenece a la empresa/);
    await expect(exec('UPDATE cajas SET diferencia_revisada_por=$2, diferencia_revisada_at=now() WHERE id=$1', cajaA.id, adminB)).rejects.toThrow(/no pertenece a la empresa/);
    await expect(exec('INSERT INTO configuracion_caja (tenant_id, actualizado_por) VALUES ($1,$2)', tenantA, adminB)).rejects.toThrow(/no pertenece a la empresa/);
    // Control: con caja y usuario de la misma empresa sí se guarda.
    await insertarConteo(tenantA, cajaA.id, cajero);
    expect((await sql('SELECT COUNT(*)::int AS n FROM conteos_caja WHERE caja_id=$1', cajaA.id))[0].n).toBe(2);
    expect((await sql('SELECT COUNT(*)::int AS n FROM conteos_caja c JOIN cajas k ON k.id=c.caja_id WHERE c.tenant_id <> k.tenant_id'))[0].n).toBe(0);

    // Lecturas y operaciones cruzadas con la sesión de la empresa B sobre la caja de A: no la encuentran.
    await expect(ops.cajaDetalle(tenantB, adminB, cajaA.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ops.conteoCaja(tenantB, adminB, cajaA.id, { monto: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(ops.revisarDiferenciaCaja(tenantB, adminB, cajaA.id)).rejects.toBeInstanceOf(NotFoundException);
    const cierresB = await ops.cierresCaja(tenantB, adminB, {}) as any[];
    expect(cierresB.map((c) => c.id)).not.toContain(cajaA.id);
    // Y la empresa A ve sus conteos en el detalle, ninguno de B.
    const detalleA = await ops.cajaDetalle(tenantA, admin, cajaA.id) as any;
    expect(detalleA.conteos).toHaveLength(2);
  });

  it('saldo trasladable: como máximo lo contado; la siguiente apertura de la misma persona queda vinculada', async () => {
    const c = await abrir(cajero, 100);
    await expect(ops.cerrar(tenantA, cajero, c.id, { monto: 100, montoTrasladado: 150 } as any)).rejects.toThrow(/no puede superar/);
    const cerrada = await ops.cerrar(tenantA, cajero, c.id, { monto: 100, montoTrasladado: 60 } as any) as any;
    expect(Number(cerrada.monto_trasladado)).toBe(60);
    expect((await ops.aperturaCaja(tenantA, cajero)).saldoTrasladado).toEqual({ cajaId: c.id, monto: 60 });
    // Otro cajero no hereda ese saldo.
    expect((await ops.aperturaCaja(tenantA, cajero2)).saldoTrasladado).toBeNull();
    const siguiente = await abrir(cajero, 60);
    expect(siguiente).toMatchObject({ caja_anterior_id: c.id, saldo_trasladado: 60 });
    expect((await ops.aperturaCaja(tenantA, cajero)).saldoTrasladado).toBeNull();
  });

  it('la base protege el traslado, la revisión y los conteos', async () => {
    const c = await abrir(cajero, 100);
    await expect(sql('UPDATE cajas SET monto_trasladado=10 WHERE id=$1', c.id)).rejects.toThrow(/23514|cajas_traslado_chk/);
    await expect(sql('UPDATE cajas SET diferencia_revisada_por=$2 WHERE id=$1', c.id, admin)).rejects.toThrow(/23514|cajas_revision_chk/);
    await expect(sql('INSERT INTO conteos_caja (id, tenant_id, caja_id, usuario_id, monto, esperado, diferencia) VALUES ($1,$2,$3,$4,10,5,1)', randomUUID(), tenantA, c.id, cajero))
      .rejects.toThrow(/23514|conteos_caja_diferencia_chk/);
  });
});
