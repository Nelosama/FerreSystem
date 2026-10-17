import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { SuperAdminController } from '../src/super-admin/super-admin.controller';
import { SuperAdminService } from '../src/super-admin/super-admin.service';
import { TenantsController } from '../src/tenants/tenants.controller';
import { TenantsService } from '../src/tenants/tenants.service';
import { TenantLogoService } from '../src/tenants/tenant-logo.service';
import { AlmacenLogotipoLocal, LOGOTIPO_ALMACEN } from '../src/tenants/logotipo-almacen';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';

// Autorización, aislamiento entre negocios, configuración del SUPERADMIN, auditoría y logotipo
// privado contra HTTP real, controladores y servicios reales y PostgreSQL temporal con las migraciones del repositorio.
// Ejecutar sin root (initdb lo exige). Pruebas con backend real; el almacenamiento es el driver LOCAL.
describe('Configuración del negocio, auditoría y logotipo / HTTP y PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = 'clave-sintetica-de-integracion';
  let directorio = '';
  let arrancado = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let base = '';
  let almacenDirectorio = '';
  let A = '';
  let B = '';
  let adminA = '';
  let cajeroA = '';
  let adminB = '';
  let superAdminId = '';
  let emailSuperAdmin = '';

  const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452000000100000001008060000001ff3ff61', 'hex'), Buffer.alloc(40)]);
  const WEBP_CABECERA = Buffer.from('52494646' + '1e000000' + '57454250' + '5650384c' + '12000000' + '2f' + '0f000000' + '00000000' + '00000000' + '00000000', 'hex');

  const http = (metodo: string, ruta: string, token?: string, cuerpo?: unknown) => fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });
  const subirLogo = (token: string, tenantId: string, datos: Buffer, mime: string, nombre = 'logo') => {
    const formulario = new FormData();
    formulario.append('archivo', new Blob([new Uint8Array(datos)], { type: mime }), nombre);
    return fetch(`${base}/api/admin/tenants/${tenantId}/logo`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Connection: 'close' }, body: formulario });
  };
  const loginNegocio = async (email: string, tenantId: string) => {
    const respuesta = await http('POST', '/api/auth/login', undefined, { email, password, tenantId });
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as { accessToken: string; tenant: Record<string, unknown> };
  };
  const loginSuperAdmin = async () => {
    const respuesta = await http('POST', '/api/admin/auth/login', undefined, { email: emailSuperAdmin, password });
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as { accessToken: string };
  };

  beforeAll(async () => {
    directorio = mkdtempSync(join(tmpdir(), 'jowa-config-logo-'));
    almacenDirectorio = join(directorio, 'logotipos');
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const puerto = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${puerto}/postgres`;
    const entorno = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(puerto), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const opciones = { windowsHide: true, timeout: 60000, env: entorno, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directorio, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], opciones);
    execFileSync(exe('pg_ctl'), ['-D', join(directorio, 'data'), '-l', join(directorio, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${puerto} -k ${directorio}`, '-w', 'start'], { ...opciones, stdio: 'ignore' });
    arrancado = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(puerto), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], opciones);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();

    const hash = await bcrypt.hash(password, 4);
    const tA = await prisma.tenant.create({ data: { nombreComercial: 'Negocio A' } });
    const tB = await prisma.tenant.create({ data: { nombreComercial: 'Negocio B' } });
    A = tA.id; B = tB.id;
    const admA = await prisma.usuario.create({ data: { nombre: 'Admin A', rol: 'ADMIN', tenantId: A, email: `admin-a-${randomUUID()}@example.test`, passwordHash: hash } });
    const cajA = await prisma.usuario.create({ data: { nombre: 'Cajero A', rol: 'CAJERO', tenantId: A, email: `cajero-a-${randomUUID()}@example.test`, passwordHash: hash } });
    const admB = await prisma.usuario.create({ data: { nombre: 'Admin B', rol: 'ADMIN', tenantId: B, email: `admin-b-${randomUUID()}@example.test`, passwordHash: hash } });
    adminA = admA.email; cajeroA = cajA.email; adminB = admB.email;
    emailSuperAdmin = `super-${randomUUID()}@example.test`;
    superAdminId = (await prisma.superAdmin.create({ data: { nombre: 'Super Admin de prueba', email: emailSuperAdmin, passwordHash: hash } })).id;
    // Auditoría previa de cada negocio: la consulta del SUPERADMIN debe devolver solo la de su negocio.
    await prisma.auditoriaOperacion.create({ data: { tenantId: A, usuarioId: admA.id, operacion: 'VENTA_CREAR', entidadId: 'venta-a', datos: { negocio: 'A' } } });
    await prisma.auditoriaOperacion.create({ data: { tenantId: B, usuarioId: admB.id, operacion: 'VENTA_CREAR', entidadId: 'venta-b', datos: { negocio: 'B' } } });

    const configService = { get: (clave: string, valorPorDefecto?: unknown) => (clave === 'JWT_SECRET' ? jwtSecret : valorPorDefecto) } as unknown as ConfigService;
    const modulo = await Test.createTestingModule({
      controllers: [AuthController, SuperAdminController, TenantsController, OperacionesController],
      providers: [
        AuthService, SuperAdminService, TenantsService, TenantLogoService, OperacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: configService },
        { provide: LOGOTIPO_ALMACEN, useValue: new AlmacenLogotipoLocal(almacenDirectorio) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalGuards(new TenantModuleGuard(modulo.get(Reflector), prisma));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 180000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (arrancado) execFileSync(exe('pg_ctl'), ['-D', join(directorio, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directorio && resolve(directorio).startsWith(resolve(tmpdir()) + sep) && directorio.includes('jowa-config-logo-')) {
        rmSync(directorio, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  describe('autorización en el backend (no solo en la interfaz)', () => {
    it('ADMIN recibe 403 al modificar la configuración del negocio por la ruta de tenant', async () => {
      const admin = await loginNegocio(adminA, A);
      const respuesta = await http('PUT', '/api/tenant/settings', admin.accessToken, { nombreComercial: 'Intento de ADMIN' });
      expect(respuesta.status).toBe(403);
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).nombreComercial).toBe('Negocio A');
    });

    it('CAJERO recibe 403 al modificar la configuración del negocio', async () => {
      const cajero = await loginNegocio(cajeroA, A);
      expect((await http('PUT', '/api/tenant/settings', cajero.accessToken, { colorPrimario: '#000000' })).status).toBe(403);
    });

    it('ADMIN recibe 403 al consultar la auditoría por la ruta de tenant', async () => {
      const admin = await loginNegocio(adminA, A);
      expect((await http('GET', '/api/operaciones/auditoria?page=0', admin.accessToken)).status).toBe(403);
    });

    it('CAJERO recibe 403 al consultar la auditoría por la ruta de tenant', async () => {
      const cajero = await loginNegocio(cajeroA, A);
      expect((await http('GET', '/api/operaciones/auditoria?page=0', cajero.accessToken)).status).toBe(403);
    });

    it('un token de negocio no entra a las rutas del SUPERADMIN, ni siquiera con el identificador de su negocio', async () => {
      const admin = await loginNegocio(adminA, A);
      expect((await http('GET', `/api/admin/tenants/${A}/settings`, admin.accessToken)).status).toBe(403);
      expect((await http('GET', `/api/admin/tenants/${A}/auditoria?page=0`, admin.accessToken)).status).toBe(403);
      expect((await subirLogo(admin.accessToken, A, PNG, 'image/png')).status).toBe(403);
    });

    it('sin token no hay acceso a las rutas administrativas', async () => {
      expect((await http('GET', `/api/admin/tenants/${A}/settings`)).status).toBe(401);
    });
  });

  describe('SUPERADMIN configura un negocio seleccionado', () => {
    it('modifica la configuración de Negocio A y el cambio persiste y lo ve el negocio', async () => {
      const sa = await loginSuperAdmin();
      const cambios = { nombreComercial: 'Negocio A Renovado', colorPrimario: '#345678', modoNavegacion: 'TOPNAV', configuracion: { impuesto: { nombre: 'ISV', tasa: 15 }, moneda: { simbolo: 'L.', codigo: 'HNL' } } };
      const respuesta = await http('PUT', `/api/admin/tenants/${A}/settings`, sa.accessToken, cambios);
      expect(respuesta.status).toBe(200);
      const fila = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
      expect(fila).toMatchObject({ nombreComercial: 'Negocio A Renovado', colorPrimario: '#345678', modoNavegacion: 'TOPNAV' });
      const admin = await loginNegocio(adminA, A);
      const visto = await (await http('GET', '/api/tenant/settings', admin.accessToken)).json() as Record<string, unknown>;
      expect(visto).toMatchObject({ nombreComercial: 'Negocio A Renovado', colorPrimario: '#345678', modoNavegacion: 'TOPNAV', impuesto: { tasa: 15 } });
    });

    it('el SUPERADMIN elige el formato de impresión (A4 o rollo) y el negocio lo recibe; valores fuera de lista se rechazan', async () => {
      const sa = await loginSuperAdmin();
      const configuracion = { formatoImpresion: 'ROLLO_80MM', impuesto: { nombre: 'ISV', tasa: 15 }, moneda: { simbolo: 'L.', codigo: 'HNL' } };
      expect((await http('PUT', `/api/admin/tenants/${A}/settings`, sa.accessToken, { configuracion })).status).toBe(200);
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).configuracion).toMatchObject({ formatoImpresion: 'ROLLO_80MM' });
      const admin = await loginNegocio(adminA, A);
      const visto = await (await http('GET', '/api/tenant/settings', admin.accessToken)).json() as Record<string, unknown>;
      expect(visto.formatoImpresion).toBe('ROLLO_80MM');
      expect((await http('PUT', `/api/admin/tenants/${A}/settings`, sa.accessToken, { configuracion: { formatoImpresion: 'LETTER' } })).status).toBe(400);
      expect((await http('PUT', `/api/admin/tenants/${A}/settings`, sa.accessToken, { configuracion: { formatoImpresion: 'ROLLO_80MM', impuesto: { nombre: 'ISV', tasa: 15 }, moneda: { simbolo: 'L.', codigo: 'HNL' } } })).status).toBe(200);
    });

    it('no modifica el negocio B al configurar el A', async () => {
      const b = await prisma.tenant.findUniqueOrThrow({ where: { id: B } });
      const adminDeB = await loginNegocio(adminB, B);
      const visto = await (await http('GET', '/api/tenant/settings', adminDeB.accessToken)).json() as Record<string, unknown>;
      expect(visto.nombreComercial).toBe(b.nombreComercial);
      expect(visto.nombreComercial).not.toBe('Negocio A Renovado');
    });

    it('cada cambio de configuración deja registro en auditoría con la identidad del SUPERADMIN', async () => {
      const registro = await prisma.auditoriaOperacion.findFirst({ where: { tenantId: A, operacion: 'CONFIGURACION_NEGOCIO_ACTUALIZAR' } });
      expect(registro).not.toBeNull();
      expect(registro?.usuarioId).toBe(superAdminId);
      expect((registro?.datos as any).superAdminId).toBe(superAdminId);
      expect((registro?.datos as any).campos).toEqual(expect.arrayContaining(['nombreComercial', 'configuracion']));
    });

    it('rechaza un logotipo por URL externa y no escribe en la base', async () => {
      const sa = await loginSuperAdmin();
      const respuesta = await http('PATCH', `/api/admin/tenants/${A}`, sa.accessToken, { logoUrl: 'https://ejemplo.com/logo.png' });
      expect(respuesta.status).toBe(400);
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).logoUrl).toBeNull();
    });

    it('un negocio inexistente responde 404 y no revela datos', async () => {
      const sa = await loginSuperAdmin();
      expect((await http('GET', `/api/admin/tenants/${randomUUID()}/settings`, sa.accessToken)).status).toBe(404);
    });
  });

  describe('auditoría exclusiva del SUPERADMIN', () => {
    it('SUPERADMIN consulta la auditoría del negocio seleccionado, sin eventos de otros negocios', async () => {
      const sa = await loginSuperAdmin();
      const respuesta = await http('GET', `/api/admin/tenants/${A}/auditoria?page=0`, sa.accessToken);
      expect(respuesta.status).toBe(200);
      const eventos = await respuesta.json() as { tenant_id: string; operacion: string }[];
      expect(eventos.length).toBeGreaterThan(0);
      expect(eventos.every(e => e.tenant_id === A)).toBe(true);
      expect(eventos.some(e => e.operacion === 'CONFIGURACION_NEGOCIO_ACTUALIZAR')).toBe(true);
      expect(eventos.some(e => e.operacion === 'VENTA_CREAR' && (e as any).entidad_id === 'venta-b')).toBe(false);
    });

    it('la auditoría de B solo contiene eventos de B', async () => {
      const sa = await loginSuperAdmin();
      const eventos = await (await http('GET', `/api/admin/tenants/${B}/auditoria?page=0`, sa.accessToken)).json() as { tenant_id: string }[];
      expect(eventos.every(e => e.tenant_id === B)).toBe(true);
    });
  });

  describe('logotipo privado por negocio', () => {
    it('sin logotipo, el negocio recibe 404 y el ícono predeterminado se decide en la interfaz', async () => {
      const admin = await loginNegocio(adminA, A);
      expect((await http('GET', '/api/tenant/logo', admin.accessToken)).status).toBe(404);
      const settings = await (await http('GET', '/api/tenant/settings', admin.accessToken)).json() as Record<string, unknown>;
      expect(settings.logotipo).toBeNull();
      expect(settings).not.toHaveProperty('logoStorageKey');
    });

    it('SUPERADMIN carga un PNG para Negocio A; queda referencia y metadatos, sin binarios en PostgreSQL', async () => {
      const sa = await loginSuperAdmin();
      const respuesta = await subirLogo(sa.accessToken, A, PNG, 'image/png');
      expect(respuesta.status).toBe(201);
      const fila = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
      expect(fila.logoStorageKey).toMatch(new RegExp(`^tenants/${A}/logo/[A-Za-z0-9-]+$`));
      expect(fila).toMatchObject({ logoMime: 'image/png', logoBytes: PNG.length });
      expect(readFileSync(join(almacenDirectorio, fila.logoStorageKey!)).equals(PNG)).toBe(true);
    });

    it('el negocio A lee su logotipo tras volver a iniciar sesión (persistencia entre sesiones)', async () => {
      const admin = await loginNegocio(adminA, A);
      const respuesta = await http('GET', '/api/tenant/logo', admin.accessToken);
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await respuesta.arrayBuffer()).equals(PNG)).toBe(true);
      const settings = await (await http('GET', '/api/tenant/settings', admin.accessToken)).json() as Record<string, any>;
      expect(settings.logotipo).toMatchObject({ mime: 'image/png', bytes: PNG.length });
    });

    it('el negocio B no ve el logotipo de A y su propio logotipo es independiente', async () => {
      const adminDeB = await loginNegocio(adminB, B);
      expect((await http('GET', '/api/tenant/logo', adminDeB.accessToken)).status).toBe(404);
      const sa = await loginSuperAdmin();
      expect((await subirLogo(sa.accessToken, B, WEBP_CABECERA, 'image/webp')).status).toBe(201);
      const delB = await http('GET', '/api/tenant/logo', adminDeB.accessToken);
      expect(delB.headers.get('content-type')).toBe('image/webp');
      const adminDeA = await loginNegocio(adminA, A);
      const delA = Buffer.from(await (await http('GET', '/api/tenant/logo', adminDeA.accessToken)).arrayBuffer());
      expect(delA.equals(PNG)).toBe(true);
      expect(delA.equals(Buffer.from(await delB.arrayBuffer()))).toBe(false);
    });

    it('reemplaza el logotipo de A por WEBP sin dejar el anterior', async () => {
      const sa = await loginSuperAdmin();
      expect((await subirLogo(sa.accessToken, A, WEBP_CABECERA, 'image/webp')).status).toBe(201);
      const admin = await loginNegocio(adminA, A);
      const respuesta = await http('GET', '/api/tenant/logo', admin.accessToken);
      expect(respuesta.headers.get('content-type')).toBe('image/webp');
      expect(Buffer.from(await respuesta.arrayBuffer()).equals(WEBP_CABECERA)).toBe(true);
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).logoMime).toBe('image/webp');
    });

    it('rechaza archivos que no son imágenes, aunque declaren PNG, sin cambiar el logotipo actual', async () => {
      const sa = await loginSuperAdmin();
      const html = Buffer.from('<!doctype html><script>alert(1)</script>');
      expect((await subirLogo(sa.accessToken, A, html, 'image/png', 'logo.png')).status).toBe(415);
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect((await subirLogo(sa.accessToken, A, svg, 'image/svg+xml', 'logo.svg')).status).toBe(415);
      expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).logoMime).toBe('image/webp');
    });

    it('rechaza archivos mayores de 2 MB', async () => {
      const sa = await loginSuperAdmin();
      const grande = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
      expect((await subirLogo(sa.accessToken, A, grande, 'image/png')).status).toBe(413);
    });

    it('ADMIN de A no puede eliminar ni reemplazar el logotipo', async () => {
      const admin = await loginNegocio(adminA, A);
      expect((await fetch(`${base}/api/admin/tenants/${A}/logo`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin.accessToken}` } })).status).toBe(403);
    });

    it('SUPERADMIN elimina el logotipo de A: referencia, archivo y respuesta de tenant quedan vacíos', async () => {
      const sa = await loginSuperAdmin();
      const anterior = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
      const respuesta = await fetch(`${base}/api/admin/tenants/${A}/logo`, { method: 'DELETE', headers: { Authorization: `Bearer ${sa.accessToken}` } });
      expect(respuesta.status).toBe(200);
      expect(await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).toMatchObject({ logoStorageKey: null, logoMime: null, logoBytes: null });
      expect(existsSync(join(almacenDirectorio, anterior.logoStorageKey!))).toBe(false);
      const admin = await loginNegocio(adminA, A);
      expect((await http('GET', '/api/tenant/logo', admin.accessToken)).status).toBe(404);
    });

    it('registra en auditoría la carga y la eliminación del logotipo', async () => {
      const operaciones = (await prisma.auditoriaOperacion.findMany({ where: { tenantId: A, operacion: { in: ['LOGOTIPO_GUARDAR', 'LOGOTIPO_ELIMINAR'] } }, orderBy: { createdAt: 'asc' } })).map(r => r.operacion);
      expect(operaciones).toEqual(expect.arrayContaining(['LOGOTIPO_GUARDAR', 'LOGOTIPO_ELIMINAR']));
    });
  });
});
