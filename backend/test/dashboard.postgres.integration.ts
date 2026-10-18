import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

// Dashboard contra PostgreSQL real con clúster temporal y cadena completa de migraciones.
// Nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Dashboard / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let dashboard: DashboardService;
  let tenantId: string;
  let rolPrueba = 'ADMIN';
  let subPrueba = 'admin-sin-registro';
  let permisosPrueba: { permisos?: string[]; permisosConfigurados?: boolean } = {};
  let app: INestApplication;
  let psqlEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-dashboard-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    psqlEnv = env;
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    dashboard = new DashboardService(prisma);
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboard }, { provide: PrismaService, useValue: prisma }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: any) {
        context.switchToHttp().getRequest().user = { tenantId, type: 'tenant', rol: rolPrueba, sub: subPrueba, ...permisosPrueba };
        return true;
      },
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  }, 120000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-dashboard-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    rolPrueba = 'ADMIN';
    subPrueba = 'admin-sin-registro';
    permisosPrueba = {};
    tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Dashboard de prueba' } });
  });

  it('responde sin error con un negocio sin datos', async () => {
    const data = await dashboard.getDashboardData(tenantId);
    expect(data.ventasDelDia.total).toBe(0);
    expect(data.tendenciaSemanal).toHaveLength(7);
  });

  it('responde sin error con ventas, devoluciones, stock bajo y cotizaciones', async () => {
    const usuario = await prisma.usuario.create({ data: { tenantId, nombre: 'Cajero', email: `c-${tenantId}@prueba.test`, passwordHash: 'x', rol: 'ADMIN' } as any });
    const producto = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'P-1', nombre: 'Clavo', precioVenta: 10, precioCosto: 5, stockActual: 1, stockMinimo: 5 } as any });
    const hace = (h: number) => new Date(Date.now() - h * 3600 * 1000);
    for (const [i, createdAt] of [[1, hace(1)], [2, hace(30)]] as const) {
      await prisma.venta.create({ data: { tenantId, numeroVenta: i, usuarioId: usuario.id, subtotal: 100, isv: 15, total: 115, estado: 'COMPLETADA', createdAt, detalles: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 100, subtotal: 100 }] } } as any });
    }
    const venta = await prisma.venta.findFirstOrThrow({ where: { tenantId, numeroVenta: 1 } });
    await prisma.devolucion.create({ data: { tenantId, ventaId: venta.id, usuarioId: usuario.id, solicitudHash: 'h', motivo: 'Prueba', monto: 10, creditoCancelado: 0, reembolso: 10, metodo: 'EFECTIVO' } as any });
    await prisma.cotizacion.create({ data: { tenantId, numeroCotizacion: 1, usuarioId: usuario.id, subtotal: 100, isv: 15, total: 115, fechaValidez: new Date(new Date().toISOString().slice(0, 10)), estado: 'ENVIADA' } as any });

    const data = await dashboard.getDashboardData(tenantId);

    expect(data.alertasStock.cantidad).toBe(1);
    expect(data.cotizacionesPendientes.cantidad).toBe(1);
    expect(data.ultimasVentas.length).toBeGreaterThan(0);
  });

  it('suma las ventas del día al centavo exacto (en PostgreSQL), cuenta solo las completadas y respeta la tendencia', async () => {
    const usuario = await prisma.usuario.create({ data: { tenantId, nombre: 'Cajero', email: `s-${tenantId}@prueba.test`, passwordHash: 'x' } });
    // Diez ventas de L 0.10 suman 0.9999999999999999 en coma flotante; el total correcto es L 1.00.
    const hoy = new Date(Date.now() - 60 * 1000);
    for (let i = 1; i <= 10; i++) await prisma.venta.create({ data: { tenantId, usuarioId: usuario.id, numeroVenta: i, subtotal: 0.1, isv: 0, total: 0.1, createdAt: hoy } });
    await prisma.venta.create({ data: { tenantId, usuarioId: usuario.id, numeroVenta: 11, subtotal: 500, isv: 0, total: 500, estado: 'ANULADA', createdAt: hoy } });
    const data = await dashboard.getDashboardData(tenantId);
    expect(data.ventasDelDia).toMatchObject({ total: 1, cantidad: 10 });
    expect(data.tendenciaSemanal.at(-1)).toMatchObject({ esHoy: true, total: 1 });
  });

  it.each([
    ['productos', 'version'],
    ['ventas', 'reserva_pendiente'],
    ['cotizaciones', 'cliente_email'],
  ])('no depende de %s.%s que el resumen no utiliza', async (tabla, columna) => {
    const usuario = await prisma.usuario.create({ data: { tenantId, nombre: 'Cajero real', email: `${tenantId}@example.test`, passwordHash: 'x' } });
    await prisma.venta.create({ data: { tenantId, usuarioId: usuario.id, numeroVenta: 1, subtotal: 125, isv: 0, total: 125 } });
    await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'P', nombre: 'Producto real', precioVenta: 10, precioCosto: 5, stockActual: 3, stockReservado: 2, stockMinimo: 1 } });
    await prisma.cotizacion.create({ data: { tenantId, usuarioId: usuario.id, numeroCotizacion: 1, subtotal: 10, isv: 0, total: 10, fechaValidez: new Date() } });
    // DDL exclusivamente en el clúster temporal. Renombrar conserva datos, índices y defaults.
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tabla}" RENAME COLUMN "${columna}" TO "${columna}_prueba"`);
    try {
      const { body: data } = await request(app.getHttpServer()).get('/dashboard').expect(200);
      expect(data.ultimasVentas).toHaveLength(1);
      expect(data.ultimasVentas[0]).toMatchObject({ total: 125, cajero: 'Cajero real' });
      expect(data.alertasStock.items[0]).toMatchObject({ nombre: 'Producto real', stockActual: '3' });
      expect(data.cotizacionesPendientes.cantidad).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${tabla}" RENAME COLUMN "${columna}_prueba" TO "${columna}"`);
    }
  });

  it('propaga P2022 si falta stock_reservado, necesario para calcular el stock disponible', async () => {
    await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN stock_reservado TO stock_reservado_prueba');
    try {
      await expect(dashboard.getDashboardData(tenantId)).rejects.toMatchObject({ code: 'P2022' });
      await request(app.getHttpServer()).get('/dashboard').expect(500);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN stock_reservado_prueba TO stock_reservado');
    }
  });

  it('ejecuta el diagnóstico con un rol sin permisos de escritura y detecta columnas ausentes', async () => {
    await prisma.$executeRawUnsafe('CREATE ROLE dashboard_lectura LOGIN');
    await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO dashboard_lectura');
    await prisma.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_lectura');
    await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN version TO version_prueba');
    try {
      const output = execFileSync(exe('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-f', resolve('scripts/diagnostico-dashboard-lectura.sql')], {
        env: { ...psqlEnv, PGUSER: 'dashboard_lectura' }, encoding: 'utf8', timeout: 30000,
      });
      expect(output).toContain('productos');
      expect(output).toContain('version');
      expect(output).toContain('ROLLBACK');
      expect(output).toContain('Sin tabla _prisma_migrations');
      const requiredSection = output.split('COLUMNAS DEL ESQUEMA COMPLETO')[0];
      expect(requiredSection).toContain('(0 rows)');
      expect(output).not.toContain('password_hash');
      expect(await prisma.producto.count({ where: { tenantId } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE productos RENAME COLUMN version_prueba TO version');
      await prisma.$executeRawUnsafe('DROP OWNED BY dashboard_lectura');
      await prisma.$executeRawUnsafe('DROP ROLE dashboard_lectura');
    }
  });

  it('JW-10 BODEGUERO recibe existencias y cotizaciones, pero ninguna cifra ni detalle de ventas', async () => {
    const usuario = await prisma.usuario.create({ data: { tenantId, nombre: 'Cajero', email: `b-${tenantId}@example.test`, passwordHash: 'x' } });
    const cliente = await prisma.cliente.create({ data: { tenantId, nombre: 'Cliente confidencial' } });
    await prisma.venta.create({ data: { tenantId, usuarioId: usuario.id, clienteId: cliente.id, numeroVenta: 1, subtotal: 900, isv: 135, total: 1035 } });
    await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'BAJO', nombre: 'Producto bajo', precioVenta: 10, precioCosto: 5, stockActual: 1, stockMinimo: 5 } });
    rolPrueba = 'BODEGUERO';
    const { body } = await request(app.getHttpServer()).get('/dashboard').expect(200);
    expect(body.alertasStock.cantidad).toBe(1);
    expect(body.cotizacionesPendientes).toMatchObject({ cantidad: 0 });
    expect(body.ventasDelDia).toBeNull();
    expect(body.tendenciaSemanal).toEqual([]);
    expect(body.ultimasVentas).toEqual([]);
    const texto = JSON.stringify(body);
    expect(texto).not.toContain('1035');
    expect(texto).not.toContain('Cliente confidencial');
    // VENDEDOR y ADMIN conservan el resumen de ventas.
    for (const rol of ['VENDEDOR', 'ADMIN']) {
      rolPrueba = rol;
      const { body: completo } = await request(app.getHttpServer()).get('/dashboard').expect(200);
      expect(completo.ultimasVentas[0]).toMatchObject({ total: 1035, cliente: 'Cliente confidencial' });
      expect(completo.tendenciaSemanal).toHaveLength(7);
    }
  });

  it('el resumen no devuelve registros de otro tenant', async () => {
    const otroTenant = await prisma.tenant.create({ data: { nombreComercial: 'Otro negocio' } });
    const usuario = await prisma.usuario.create({ data: { tenantId: otroTenant.id, nombre: 'Otro cajero', email: `${otroTenant.id}@example.test`, passwordHash: 'x' } });
    await prisma.venta.create({ data: { tenantId: otroTenant.id, usuarioId: usuario.id, numeroVenta: 1, subtotal: 900, isv: 0, total: 900 } });
    await prisma.producto.create({ data: {precioAprobado:true, tenantId: otroTenant.id, codigo: 'OTRO', nombre: 'Otro producto', precioVenta: 10, precioCosto: 5, stockActual: 0, stockMinimo: 5 } });
    await prisma.cotizacion.create({ data: { tenantId: otroTenant.id, usuarioId: usuario.id, numeroCotizacion: 1, subtotal: 10, isv: 0, total: 10, fechaValidez: new Date() } });
    const { body } = await request(app.getHttpServer()).get('/dashboard').expect(200);
    expect(body.ultimasVentas).toEqual([]);
    expect(body.alertasStock.cantidad).toBe(0);
    expect(body.cotizacionesPendientes.cantidad).toBe(0);
    expect(body.ventasDelDia.total).toBe(0);
    expect(body.tendenciaSemanal.every((dia: { total: number }) => dia.total === 0)).toBe(true);
  });
  // ── GET /dashboard/pendientes: contadores reales del inicio ──────────────────────────────────────────
  async function sembrarPendientes(tenant: string, prefijo: string) {
    const cajero = await prisma.usuario.create({ data: { tenantId: tenant, nombre: `Cajero ${prefijo}`, email: `${prefijo}-c-${tenant}@example.test`, passwordHash: 'x', rol: 'CAJERO' } });
    const otroCajero = await prisma.usuario.create({ data: { tenantId: tenant, nombre: `Otro ${prefijo}`, email: `${prefijo}-o-${tenant}@example.test`, passwordHash: 'x', rol: 'CAJERO' } });
    // Precios: dos activos pendientes, uno inactivo pendiente (no aparece en /precios) y uno aprobado.
    const aprobado = await prisma.producto.create({ data: { tenantId: tenant, codigo: `${prefijo}-A`, nombre: 'Aprobado', precioVenta: 10, precioCosto: 5, precioAprobado: true, stockActual: 100, stockMinimo: 1 } });
    await prisma.producto.create({ data: { tenantId: tenant, codigo: `${prefijo}-P1`, nombre: 'Pendiente 1', precioVenta: 10, precioCosto: 5, stockActual: 100, stockMinimo: 1 } });
    await prisma.producto.create({ data: { tenantId: tenant, codigo: `${prefijo}-P2`, nombre: 'Pendiente 2', precioVenta: 0, precioCosto: 0, stockActual: 100, stockMinimo: 1 } });
    await prisma.producto.create({ data: { tenantId: tenant, codigo: `${prefijo}-PI`, nombre: 'Pendiente inactivo', precioVenta: 10, precioCosto: 5, activo: false, stockActual: 0, stockMinimo: 5 } });
    // Existencias: disponible = actual − reservado; 3 − 2 = 1 ≤ 1 cuenta, aunque el actual supere el mínimo.
    await prisma.producto.create({ data: { tenantId: tenant, codigo: `${prefijo}-B`, nombre: 'Bajo mínimo', precioVenta: 10, precioCosto: 5, precioAprobado: true, stockActual: 3, stockReservado: 2, stockMinimo: 1 } });
    // Entregas: venta del cajero con bodega pendiente, otra del otro cajero, una entregada, una cancelada y una anulada.
    let numero = 0;
    const venta = async (usuarioId: string, linea: Record<string, unknown>, extra: Record<string, unknown> = {}) => prisma.venta.create({ data: {
      tenantId: tenant, usuarioId, numeroVenta: ++numero, subtotal: 10, isv: 0, total: 10, reservaPendiente: true, ...extra,
      detalles: { create: [{ tenantId: tenant, productoId: aprobado.id, cantidad: 2, precioUnitario: 5, subtotal: 10, ...linea }] },
    } as any });
    await venta(cajero.id, { cantidadEntregada: 1 });
    await venta(otroCajero.id, {});
    await venta(cajero.id, { cantidadEntregada: 2 });
    await venta(cajero.id, { cantidadEntregada: 1, cantidadCancelada: 1 });
    await venta(cajero.id, { modoEntrega: 'INMEDIATA' });
    await venta(cajero.id, {}, { estado: 'ANULADA' });
    // Cotizaciones: una vence hoy (vigente), otra vence hoy pero ya convertida, otra vence mañana.
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' });
    const manana = new Date(Date.parse(`${hoy}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    await prisma.cotizacion.create({ data: { tenantId: tenant, usuarioId: cajero.id, numeroCotizacion: 1, subtotal: 10, isv: 0, total: 10, fechaValidez: new Date(`${hoy}T00:00:00Z`), estado: 'ENVIADA' } as any });
    await prisma.cotizacion.create({ data: { tenantId: tenant, usuarioId: cajero.id, numeroCotizacion: 2, subtotal: 10, isv: 0, total: 10, fechaValidez: new Date(`${hoy}T00:00:00Z`), estado: 'CONVERTIDA' } as any });
    await prisma.cotizacion.create({ data: { tenantId: tenant, usuarioId: cajero.id, numeroCotizacion: 3, subtotal: 10, isv: 0, total: 10, fechaValidez: new Date(`${manana}T00:00:00Z`), estado: 'ENVIADA' } as any });
    // Contingencia: dos operaciones requieren revisión, una ya revisada.
    const dispositivo = await prisma.dispositivoPos.create({ data: { id: randomUUID(), tenantId: tenant, codigo: `${prefijo}-D`, nombre: 'Caja 1', registradoPor: cajero.id } });
    const caja = await prisma.caja.create({ data: { tenantId: tenant, codigo: `${prefijo}-CAJA`, usuarioId: cajero.id, montoApertura: 0 } as any });
    await prisma.catalogoInstantanea.create({ data: { tenantId: tenant, hash: `${prefijo}-h`, datos: {} } });
    const ventana = await prisma.contingenciaVentana.create({ data: { tenantId: tenant, dispositivoId: dispositivo.id, usuarioId: cajero.id, cajaId: caja.id, vigenteHasta: new Date(Date.now() + 3600000), catalogoHash: `${prefijo}-h`, limites: {} } });
    for (const [i, requiereRevision, estado] of [[1, true, 'REVISION'], [2, true, 'APLICADA'], [3, false, 'APLICADA']] as const) {
      await prisma.operacionContingencia.create({ data: {
        id: randomUUID(), tenantId: tenant, dispositivoId: dispositivo.id, ventanaId: ventana.id, usuarioId: cajero.id, cajaId: caja.id,
        secuenciaLocal: i, correlativoLocal: `${prefijo}-${i}`, ocurridoAtLocal: new Date(), ocurridoAtEstimado: new Date(),
        payload: {}, payloadHash: `${prefijo}-${i}`, totalCentavos: 1000, efectivoRecibidoCentavos: 1000, estado, requiereRevision,
      } });
    }
    return { cajero, otroCajero };
  }
  const mapa = (body: any) => Object.fromEntries(body.indicadores.map((i: any) => [i.clave, i.cantidad]));

  it('pendientes ADMIN: cuenta en PostgreSQL con las reglas de cada pantalla y conduce a su ruta', async () => {
    await sembrarPendientes(tenantId, 'a');
    const { body } = await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200);
    expect(mapa(body)).toEqual({ contingencia_revision: 2, precios_pendientes: 2, entregas_pendientes: 2, cotizaciones_vencen_hoy: 1, stock_bajo_minimo: 1 });
    expect(body.indicadores.map((i: any) => i.ruta)).toEqual(['/contingencia-admin', '/precios', '/entregas', '/cotizaciones', '/inventario']);
  });

  it('pendientes: coinciden con la lista de GET /entregas/pendientes', async () => {
    const { EntregasService } = await import('../src/entregas/entregas.service');
    const admin = await prisma.usuario.create({ data: { tenantId, nombre: 'Admin', email: `adm-${tenantId}@example.test`, passwordHash: 'x', rol: 'ADMIN' } });
    const { cajero } = await sembrarPendientes(tenantId, 'e');
    const entregas = new EntregasService(prisma);
    subPrueba = admin.id;
    const { body } = await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200);
    expect(mapa(body).entregas_pendientes).toBe((await entregas.pendientes(tenantId, admin.id)).pendientes.length);
    rolPrueba = 'CAJERO'; subPrueba = cajero.id;
    const { body: propio } = await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200);
    expect(mapa(propio).entregas_pendientes).toBe((await entregas.pendientes(tenantId, cajero.id)).pendientes.length);
    expect(mapa(propio).entregas_pendientes).toBe(1);
  });

  it('pendientes: aislamiento estricto por tenant y cero confirmado sin datos', async () => {
    const otro = await prisma.tenant.create({ data: { nombreComercial: 'Otro negocio pendientes' } });
    await sembrarPendientes(otro.id, 'x');
    const { body } = await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200);
    expect(mapa(body)).toEqual({ contingencia_revision: 0, precios_pendientes: 0, entregas_pendientes: 0, cotizaciones_vencen_hoy: 0, stock_bajo_minimo: 0 });
  });

  it('pendientes por rol: CAJERO solo sus entregas, VENDEDOR solo cotizaciones, BODEGUERO sin precios ni contingencia', async () => {
    const { cajero } = await sembrarPendientes(tenantId, 'r');
    rolPrueba = 'CAJERO'; subPrueba = cajero.id;
    const cajeroBody = (await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200)).body;
    expect(mapa(cajeroBody)).toEqual({ entregas_pendientes: 1, cotizaciones_vencen_hoy: 1 });
    expect(cajeroBody.indicadores[0].alcance).toBe('PROPIAS');
    rolPrueba = 'VENDEDOR';
    expect(mapa((await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200)).body)).toEqual({ cotizaciones_vencen_hoy: 1 });
    rolPrueba = 'BODEGUERO';
    expect(mapa((await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200)).body)).toEqual({ entregas_pendientes: 2, stock_bajo_minimo: 1 });
    rolPrueba = 'SUPERADMIN';
    await request(app.getHttpServer()).get('/dashboard/pendientes').expect(403);
  });

  it('pendientes: un módulo deshabilitado oculta sus contadores', async () => {
    await sembrarPendientes(tenantId, 'm');
    await prisma.tenantModule.create({ data: { tenantId, moduleKey: 'pos', enabled: false } as any });
    const { body } = await request(app.getHttpServer()).get('/dashboard/pendientes').expect(200);
    expect(Object.keys(mapa(body))).toEqual(['precios_pendientes', 'cotizaciones_vencen_hoy', 'stock_bajo_minimo']);
  });
});
