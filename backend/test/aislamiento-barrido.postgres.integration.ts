import { syntheticPlatformMfa } from './synthetic-platform-mfa';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParserImport from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { VentasService } from '../src/ventas/ventas.service';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { SuperAdminGuard } from '../src/common/guards/super-admin.guard';
import { configurarPipesGlobales } from '../src/common/pipes/profundidad-maxima.pipe';
import { noStore } from '../src/common/no-store.middleware';

// Barrido de aislamiento multi-tenant y RBAC sobre la aplicación completa (AppModule) y PostgreSQL real.
// Enumera TODAS las rutas registradas en Nest y las ataca con identificadores reales de la empresa A usando:
//  - el ADMIN y el CAJERO de la empresa B (IDOR entre empresas),
//  - el Super Admin (sus tokens no llevan tenantId: ninguna ruta de negocio debe aceptarlos),
// y comprueba que ninguna respuesta exitosa contenga datos de A y que los datos de A no cambien.
// También verifica que cada ruta restringida por @Roles rechace a un rol no incluido.
// Ejecutar sin root (initdb lo exige). Clúster temporal y exclusivo; nunca usa DATABASE_URL.
describe('Barrido de aislamiento entre empresas y de roles / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  const cookieParser = (cookieParserImport as any).default || cookieParserImport;
  const claves = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'CONTINGENCIA_CLAVE_OPERACIONES', 'POS_OFFLINE_ENABLED'];
  const anteriores = new Map(claves.map(k => [k, process.env[k]]));
  const password = `Barrido-${randomBytes(8).toString('hex')}!`;
  const MARCA = `SECRETO-A-${randomBytes(6).toString('hex')}`;
  const A = randomUUID(), B = randomUUID();
  const adminA = randomUUID(), cajeroA = randomUUID(), adminB = randomUUID(), cajeroB = randomUUID();
  let directory = '', started = false, port = 0;
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  let rutas: { metodo: string; ruta: string; roles?: string[]; superAdmin: boolean }[] = [];
  let candidatos: string[] = [];
  let idsDeA: string[] = [];

  const psql = (args: string[]) => execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args], { stdio: 'pipe', timeout: 60000 });

  // Huella de todas las filas de la empresa A en cada tabla con tenant_id.
  async function huellaDeA(): Promise<Record<string, string>> {
    const tablas = await prisma.$queryRawUnsafe<{ t: string }[]>(
      `SELECT table_name AS t FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id' ORDER BY 1`);
    const huella: Record<string, string> = {};
    for (const { t } of tablas) {
      const [fila] = await prisma.$queryRawUnsafe<{ h: string | null }[]>(
        `SELECT md5(string_agg(x::text, '|' ORDER BY x::text)) AS h FROM "${t}" x WHERE tenant_id = $1`, A);
      huella[t] = fila.h ?? '';
    }
    return huella;
  }

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-barrido-'));
    const listener = createServer();
    await new Promise<void>((ok, ko) => { listener.once('error', ko); listener.listen(0, '127.0.0.1', ok); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>(ok => listener.close(() => ok()));
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { stdio: 'pipe', timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { stdio: 'ignore', timeout: 60000 });
    started = true;
    for (const m of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', m, 'migration.sql');
      if (existsSync(archivo)) psql(['-f', archivo]);
    }
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres?connection_limit=10`;
    Object.assign(process.env, { DATABASE_URL: url, DIRECT_URL: url, JWT_SECRET: randomBytes(32).toString('hex'), CONTINGENCIA_CLAVE_OPERACIONES: randomBytes(32).toString('hex'), POS_OFFLINE_ENABLED: 'true' });

    const modulo = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.use(noStore);
    app.use(cookieParser());
    configurarPipesGlobales(app);
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    // ---------- Datos de las dos empresas. A lleva la marca en todos los textos posibles.
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.tenant.createMany({ data: [
      { id: A, nombreComercial: `Ferretería ${MARCA}`, email: `${MARCA.toLowerCase()}@a.invalid`, telefono: MARCA },
      { id: B, nombreComercial: 'Ferretería B' },
    ] });
    await prisma.usuario.createMany({ data: [
      { id: adminA, tenantId: A, nombre: `Admin ${MARCA}`, email: 'admin@a.barrido.invalid', passwordHash, rol: 'ADMIN' },
      { id: cajeroA, tenantId: A, nombre: `Cajero ${MARCA}`, email: 'cajero@a.barrido.invalid', passwordHash, rol: 'CAJERO' },
      { id: adminB, tenantId: B, nombre: 'Admin B', email: 'admin@b.barrido.invalid', passwordHash, rol: 'ADMIN' },
      { id: cajeroB, tenantId: B, nombre: 'Cajero B', email: 'cajero@b.barrido.invalid', passwordHash, rol: 'CAJERO' },
    ] as any });
    const producto = await prisma.producto.create({ data: { tenantId: A, codigo: 'A-1', codigoBarras: '7501031311309', nombre: `Taladro ${MARCA}`, descripcion: MARCA, precioVenta: 100, precioCosto: 60, precioAprobado: true, stockActual: 50, stockMinimo: 100 } as any });
    const cliente = await prisma.cliente.create({ data: { tenantId: A, nombre: `Cliente ${MARCA}`, rtn: '08011999000001', telefono: MARCA, creditoHabilitado: true, limiteCredito: 10000 } as any });
    const proveedor = await prisma.proveedor.create({ data: { tenantId: A, nombre: `Proveedor ${MARCA}` } as any });
    await prisma.sucursal.create({ data: { tenantId: A, nombre: `Sucursal ${MARCA}` } as any });
    await prisma.levantamiento.create({ data: { tenantId: A, nombre: `Conteo ${MARCA}` } as any });
    await prisma.productoProveedor.create({ data: { tenantId: A, productoId: producto.id, proveedorId: proveedor.id } as any }).catch(() => undefined);
    await prisma.cotizacion.create({ data: { tenantId: A, numeroCotizacion: 1, usuarioId: adminA, subtotal: 100, isv: 15, total: 115, fechaValidez: new Date(), clienteNombre: `Cliente ${MARCA}` } as any }).catch(() =>
      prisma.cotizacion.create({ data: { tenantId: A, numeroCotizacion: 1, usuarioId: adminA, subtotal: 100, isv: 15, total: 115, fechaValidez: new Date() } as any }));
    await prisma.garantia.create({ data: { id: randomUUID(), tenantId: A, codigo: 'GAR-A-1', clienteNombre: `Cliente ${MARCA}`, productoId: producto.id, motivoFalla: MARCA } as any });
    await prisma.caja.create({ data: { tenantId: A, codigo: 'CAJA-A', usuarioId: cajeroA, montoApertura: 500, estado: 'ABIERTA' } as any });
    const ventas = app.get(VentasService);
    const venta: any = await ventas.create(A, cajeroA, { detalles: [{ productoId: producto.id, cantidad: 1, precioUnitario: 100 }], solicitudId: randomUUID(), clienteNombre: `Cliente ${MARCA}` } as any);
    await prisma.cuentaOperativa.create({ data: { tenantId: A, tipo: 'CXC', documentoId: venta.id, monto: 115, saldo: 115, usuarioId: cajeroA, clienteId: cliente.id, vencimiento: new Date() } as any }).catch(() => undefined);

    // ---------- Tokens reales por login (Super Admin incluido).
    const entrar = async (email: string, tenantId?: string) => (await request(app.getHttpServer()).post('/api/auth/login').send({ email, password, ...(tenantId ? { tenantId } : {}) }).expect(200)).body.accessToken as string;
    tokens.adminB = await entrar('admin@b.barrido.invalid', B);
    tokens.cajeroB = await entrar('cajero@b.barrido.invalid', B);
    tokens.cajeroA = await entrar('cajero@a.barrido.invalid', A);
    await prisma.superAdmin.create({ data: { nombre: 'Plataforma', email: 'plataforma@barrido.invalid', passwordHash } });
    tokens.superAdmin = (await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'plataforma@barrido.invalid', password, mfaCode: await syntheticPlatformMfa(prisma, 'plataforma@barrido.invalid') }).expect(200)).body.accessToken;

    // ---------- Identificadores reales de A en todas las tablas con tenant_id, más números de documento.
    const tablas = await prisma.$queryRawUnsafe<{ t: string }[]>(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.columns i ON i.table_name=c.table_name AND i.table_schema=c.table_schema AND i.column_name='id'
        WHERE c.table_schema='public' AND c.column_name='tenant_id' ORDER BY 1`);
    const ids = new Set<string>();
    for (const { t } of tablas) {
      for (const f of await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text AS id FROM "${t}" WHERE tenant_id=$1 LIMIT 3`, A)) ids.add(f.id);
    }
    idsDeA = [...ids];
    candidatos = [...idsDeA, String(venta.numeroVenta), 'V-1', '1', producto.codigo, '7501031311309'];

    // ---------- Todas las rutas registradas en Nest con sus metadatos de roles y de Super Admin.
    const discovery = app.get(DiscoveryService);
    const verbos: Record<number, string> = { [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.PATCH]: 'patch', [RequestMethod.DELETE]: 'delete' };
    for (const wrapper of discovery.getControllers()) {
      const clase = wrapper.metatype as any;
      if (!clase?.prototype) continue;
      const bases = [Reflect.getMetadata(PATH_METADATA, clase)].flat().filter((b): b is string => typeof b === 'string');
      const guardsClase = Reflect.getMetadata(GUARDS_METADATA, clase) ?? [];
      for (const nombre of Object.getOwnPropertyNames(clase.prototype)) {
        const handler = clase.prototype[nombre];
        if (nombre === 'constructor' || typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
        const metodo = verbos[Reflect.getMetadata(METHOD_METADATA, handler)];
        if (!metodo) continue;
        const roles = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, clase);
        const guards = [...guardsClase, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
        for (const base of bases) {
          for (const sub of [Reflect.getMetadata(PATH_METADATA, handler)].flat()) {
            const ruta = ('/api/' + [base, sub].filter(p => p && p !== '/').join('/')).replace(/\/+/g, '/');
            rutas.push({ metodo, ruta, roles, superAdmin: guards.includes(SuperAdminGuard) });
          }
        }
      }
    }
  }, 240000);

  afterAll(async () => {
    try { await app?.close(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore', timeout: 30000 });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-barrido-')) rmSync(directory, { recursive: true, force: true });
      for (const [k, v] of anteriores) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  const PUBLICAS = new Set(['/api/auth/security/request', '/api/auth/security/reset', '/api/auth/security/verify-email', '/api/auth/security/mfa/bootstrap-request', '/api/auth/security/mfa/bootstrap', '/api/auth/security/mfa/confirm', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout', '/api/admin/auth/login', '/api/admin/auth/refresh', '/api/admin/auth/logout', '/api', '/api/health', '/api/health/db']);
  const exitosa = (status: number) => status >= 200 && status < 300;
  const enviar = (metodo: string, ruta: string, token: string) =>
    (request(app.getHttpServer()) as any)[metodo](ruta).auth(token, { type: 'bearer' }).send(metodo === 'get' || metodo === 'delete' ? undefined : {});
  // Ejecuta en lotes para no saturar el pool de conexiones.
  async function enLotes<T>(tareas: (() => Promise<T>)[], tamano = 8): Promise<T[]> {
    const salida: T[] = [];
    for (let i = 0; i < tareas.length; i += tamano) salida.push(...await Promise.all(tareas.slice(i, i + tamano).map(t => t())));
    return salida;
  }
  const sustituir = (ruta: string, valor: string) => ruta.replace(/:[A-Za-z_]+/g, encodeURIComponent(valor));
  const filtra = (cuerpo: string) => cuerpo.includes(MARCA) || idsDeA.some(id => cuerpo.includes(id));

  it('el barrido encontró las rutas y datos esperados (control del propio barrido)', () => {
    expect(rutas.length).toBeGreaterThan(100);
    expect(rutas.filter(r => r.ruta.includes(':')).length).toBeGreaterThan(40);
    expect(idsDeA.length).toBeGreaterThan(10);
  });

  it('control positivo: el detector reconoce los datos de A cuando los pide un usuario de A', async () => {
    const res = await request(app.getHttpServer()).get('/api/productos/comercial').auth(tokens.cajeroA, { type: 'bearer' }).expect(200);
    expect(filtra(JSON.stringify(res.body))).toBe(true);
  });

  it('ADMIN y CAJERO de B: ninguna ruta devuelve datos de A, con o sin identificadores de A, y los datos de A no cambian', async () => {
    const antes = await huellaDeA();
    const fugas: string[] = [];
    const tareas: (() => Promise<void>)[] = [];
    for (const quien of ['adminB', 'cajeroB'] as const) {
      for (const r of rutas.filter(x => !PUBLICAS.has(x.ruta))) {
        const valores = r.ruta.includes(':') ? candidatos : [''];
        for (const v of valores) {
          const ruta = v ? sustituir(r.ruta, v) : r.ruta;
          tareas.push(async () => {
            const res = await enviar(r.metodo, ruta, tokens[quien]);
            if (exitosa(res.status) && filtra(JSON.stringify(res.body ?? '') + (res.text ?? ''))) fugas.push(`${quien} ${r.metodo.toUpperCase()} ${ruta} → ${res.status}`);
          });
        }
      }
    }
    await enLotes(tareas);
    expect(fugas).toEqual([]);
    expect(await huellaDeA()).toEqual(antes);
  }, 600000);

  it('Super Admin: ninguna ruta de negocio acepta su token (no lleva tenantId) ni devuelve datos de A', async () => {
    const aceptadas: string[] = [];
    // /auth/guia, como /auth/me, es recurso propio de la identidad: Super Admin solo recibe su progreso global.
    const tareas = rutas.filter(r => !PUBLICAS.has(r.ruta) && !r.ruta.startsWith('/api/admin/') && !r.ruta.startsWith('/api/maintenance') && r.ruta !== '/api/auth/me' && r.ruta !== '/api/auth/guia')
      .map(r => async () => {
        const ruta = sustituir(r.ruta, idsDeA[0]);
        const res = await enviar(r.metodo, ruta, tokens.superAdmin);
        if (exitosa(res.status)) aceptadas.push(`${r.metodo.toUpperCase()} ${ruta} → ${res.status}`);
      });
    const antes = await huellaDeA();
    await enLotes(tareas);
    expect(aceptadas).toEqual([]);
    expect(await huellaDeA()).toEqual(antes);
  }, 300000);

  it('rutas de plataforma (SuperAdminGuard): ADMIN y CAJERO de una empresa reciben 403', async () => {
    const plataforma = rutas.filter(r => r.superAdmin && !PUBLICAS.has(r.ruta));
    expect(plataforma.length).toBeGreaterThan(15);
    const indebidas: string[] = [];
    await enLotes(plataforma.flatMap(r => (['adminB', 'cajeroB'] as const).map(quien => async () => {
      const res = await enviar(r.metodo, sustituir(r.ruta, A), tokens[quien]);
      if (res.status !== 403) indebidas.push(`${quien} ${r.metodo.toUpperCase()} ${r.ruta} → ${res.status}`);
    })));
    expect(indebidas).toEqual([]);
  }, 300000);

  it('@Roles: el CAJERO recibe 403 en cada ruta que no incluye su rol (comprobación del cableado de RolesGuard)', async () => {
    const restringidas = rutas.filter(r => r.roles?.length && !r.roles.includes('CAJERO') && !r.superAdmin && !PUBLICAS.has(r.ruta));
    expect(restringidas.length).toBeGreaterThan(20);
    const indebidas: string[] = [];
    await enLotes(restringidas.map(r => async () => {
      const res = await enviar(r.metodo, sustituir(r.ruta, randomUUID()), tokens.cajeroB);
      if (res.status !== 403) indebidas.push(`${r.metodo.toUpperCase()} ${r.ruta} → ${res.status}`);
    }));
    expect(indebidas).toEqual([]);
  }, 300000);

  it('inventario: toda ruta no pública declara roles o es de plataforma (sin rutas abiertas a cualquier sesión por omisión)', () => {
    const sinRestriccion = rutas.filter(r => !PUBLICAS.has(r.ruta) && !r.superAdmin && !r.roles?.length).map(r => `${r.metodo.toUpperCase()} ${r.ruta}`);
    // Rutas que por diseño sirven a cualquier sesión válida de su propio negocio (o a la propia sesión).
    expect(sinRestriccion.sort()).toEqual(EXCEPCIONES_REVISADAS);
  });
});

// Revisadas una a una: cada servicio filtra por el tenantId/usuario del token. Si aparece otra, debe revisarse.
const EXCEPCIONES_REVISADAS: string[] = [
  'GET /api/auth/me', // la propia sesión
  'GET /api/productos', // lectura de inventario de su negocio; CashierResponseInterceptor quita costos a quien no es ADMIN
  'GET /api/productos/:id',
  'GET /api/productos/alertas/stock-bajo',
  'GET /api/tenant/logo', // su propio negocio (tenantId del token)
  'GET /api/tenant/settings',
  'POST /api/auth/security/verification', // own verified mailbox; service rejects employees/support
  'POST /api/auth/security/change-password', // current password required, own identity only
  'POST /api/auth/security/admin-reset', // fresh administrator and tenant revalidation in service
  'POST /api/auth/security/mfa/enroll', // current password and verified mailbox required
  'POST /api/admin/support/finalizar', // solo actúa sobre la propia sesión de soporte; sin ella responde 403
].sort();
