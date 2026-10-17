import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
import { AlmacenLogotipoPostgres, crearAlmacenLogotipo, LOGOTIPO_ALMACEN } from '../src/tenants/logotipo-almacen';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';

// Autorización, aislamiento entre negocios, configuración del SUPERADMIN, auditoría y logotipo
// privado contra HTTP real, controladores y servicios reales y PostgreSQL temporal con las migraciones del repositorio.
// Ejecutar sin root (initdb lo exige). Pruebas con backend real; el almacenamiento es el driver LOCAL.
describe('Administración cloud / HTTP y PostgreSQL aislado', () => {
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
        { provide: LOGOTIPO_ALMACEN, useValue: crearAlmacenLogotipo({}, prisma) },
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

  let sa: string;
  beforeAll(async () => { sa = (await loginSuperAdmin()).accessToken; });
  const endpoint = (tenant: string, tipo: string) => `/api/admin/tenants/${tenant}/${tipo}`;

  it('PostgreSQL es el almacén real predeterminado; ninguna credencial de Storage es necesaria', () => {
    expect(crearAlmacenLogotipo({}, prisma)).toBeInstanceOf(AlmacenLogotipoPostgres);
    expect(() => crearAlmacenLogotipo({ LOGOTIPO_ALMACEN: 'desconocido' }, prisma)).toThrow();
  });

  it.each(['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'])('%s no accede a administración de usuarios, sucursales ni auditoría', async rol => {
    const usuario = await prisma.usuario.create({ data: { tenantId: A, nombre: rol, email: `${rol.toLowerCase()}@cloud.test`, passwordHash: await bcrypt.hash(password, 4), rol: rol as any } });
    const token = (await loginNegocio(usuario.email, A)).accessToken;
    for (const tipo of ['usuarios?gestion=true', 'sucursales']) expect((await http('GET', endpoint(A, tipo), token)).status).toBe(403);
    expect((await http('GET', '/api/admin/auditoria', token)).status).toBe(403);
    for (const tipo of ['usuarios', 'sucursales']) {
      expect((await http('POST', endpoint(A, tipo), token, { nombre: 'No autorizado' })).status).toBe(403);
      expect((await http('PATCH', `${endpoint(A, tipo)}/otro`, token, { activo: false, activa: false })).status).toBe(403);
      expect((await http('DELETE', `${endpoint(A, tipo)}/otro`, token)).status).toBe(403);
    }
  });

  it('crea, edita, desactiva y reactiva sucursales; conserva filas, aislamiento y auditoría', async () => {
    const created = await http('POST', endpoint(A, 'sucursales'), sa, { nombre: 'Centro', direccion: 'Dirección', telefono: '5555' });
    expect(created.status).toBe(201); const sucursal = await created.json() as any;
    expect((await http('PATCH', `${endpoint(B, 'sucursales')}/${sucursal.id}`, sa, { nombre: 'Cruce' })).status).toBe(404);
    expect((await http('DELETE', `${endpoint(B, 'sucursales')}/${sucursal.id}`, sa)).status).toBe(404);
    expect((await http('PATCH', `${endpoint(A, 'sucursales')}/${sucursal.id}`, sa, { nombre: 'Centro nuevo' })).status).toBe(200);
    expect((await http('DELETE', `${endpoint(A, 'sucursales')}/${sucursal.id}`, sa)).status).toBe(200);
    expect(await prisma.sucursal.findUniqueOrThrow({ where: { id: sucursal.id } })).toMatchObject({ tenantId: A, nombre: 'Centro nuevo', activa: false });
    expect((await http('PATCH', `${endpoint(A, 'sucursales')}/${sucursal.id}`, sa, { activa: true })).status).toBe(200);
    const lista = await (await http('GET', endpoint(A, 'sucursales'), sa)).json() as any[];
    expect(lista).toHaveLength(1); expect(lista[0].activa).toBe(true);
    expect(await prisma.auditoriaOperacion.count({ where: { tenantId: A, entidadId: sucursal.id, usuarioId: superAdminId } })).toBe(4);
    expect((await http('POST', endpoint(A, 'sucursales'), sa, { nombre: 'Centro nuevo' })).status).toBe(400);
    expect((await http('POST', endpoint(B, 'sucursales'), sa, { nombre: 'Centro nuevo' })).status).toBe(201);
    expect((await http('POST', endpoint(A, 'sucursales'), sa, { nombre: '   ' })).status).toBe(400);
  });

  it('Super Admin crea usuarios por rol y conserva historial y revocación al desactivar', async () => {
    for (const rol of ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO']) {
      const email = `nuevo-${rol}@cloud.test`;
      const response = await http('POST', endpoint(A, 'usuarios'), sa, { nombre: `Nuevo ${rol}`, email, password: 'Nueva-clave123', rol });
      expect(response.status).toBe(201); const usuario = await response.json() as any;
      expect(usuario).not.toHaveProperty('passwordHash');
      const login = await http('POST', '/api/auth/login', undefined, { email, password: 'Nueva-clave123', tenantId: A });
      expect(login.status).toBe(200); const token = (await login.json() as any).accessToken;
      expect((await http('PATCH', `${endpoint(B, 'usuarios')}/${usuario.id}`, sa, { activo: false })).status).toBe(404);
      expect((await http('PATCH', `${endpoint(A, 'usuarios')}/${usuario.id}`, sa, { nombre: 'Editado', permisos: ['inventario.ver'], descuentoMaximo: 5 })).status).toBe(200);
      expect((await http('DELETE', `${endpoint(A, 'usuarios')}/${usuario.id}`, sa)).status).toBe(200);
      expect((await http('GET', '/api/auth/me', token)).status).toBe(401);
      expect(await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).toMatchObject({ activo: false, nombre: 'Editado', permisos: ['inventario.ver'] });
      expect((await http('PATCH', `${endpoint(A, 'usuarios')}/${usuario.id}`, sa, { activo: true })).status).toBe(200);
      expect(await prisma.auditoriaOperacion.count({ where: { tenantId: A, entidadId: usuario.id, usuarioId: superAdminId } })).toBe(4);
    }
    expect((await http('POST', endpoint(A, 'usuarios'), sa, { nombre: 'Inválido', email: 'bad@cloud.test', password: '123', rol: 'ADMIN' })).status).toBe(400);
  });

  it('protege al último administrador bajo desactivaciones concurrentes y cambios de rol', async () => {
    const tenant = await prisma.tenant.create({ data: { nombreComercial: 'Concurrencia' } });
    const crear = async (suffix: string) => (await (await http('POST', endpoint(tenant.id, 'usuarios'), sa, { nombre: suffix, email: `${suffix}@concurrencia.test`, password: 'Prueba-segura123', rol: 'ADMIN' })).json()) as any;
    const a = await crear('primero'), b = await crear('segundo');
    const respuestas = await Promise.all([a,b].map(user => http('PATCH', `${endpoint(tenant.id, 'usuarios')}/${user.id}`, sa, { activo: false })));
    expect(respuestas.map(r => r.status).sort()).toEqual([200,409]);
    const ultimo = await prisma.usuario.findFirstOrThrow({ where: { tenantId: tenant.id, activo: true, rol: 'ADMIN' } });
    expect((await http('PATCH', `${endpoint(tenant.id, 'usuarios')}/${ultimo.id}`, sa, { rol: 'CAJERO' })).status).toBe(409);
    expect(await prisma.usuario.count({ where: { tenantId: tenant.id, activo: true, rol: 'ADMIN' } })).toBe(1);
  });

  it('idioma persiste por tenant y los guardados parciales no lo revierten', async () => {
    expect((await http('PUT', endpoint(A, 'settings'), sa, { configuracion: { idioma: 'en' } })).status).toBe(200);
    expect((await http('PUT', endpoint(A, 'settings'), sa, { configuracion: { estiloUI: 'MODERNO' } })).status).toBe(200);
    const admin = await loginNegocio(adminA, A);
    expect((await (await http('GET', '/api/tenant/settings', admin.accessToken)).json() as any).idioma).toBe('en');
    expect((await (await http('GET', endpoint(B, 'settings'), sa)).json() as any).idioma).toBe('es');
    expect((await http('PUT', '/api/tenant/settings', admin.accessToken, { configuracion: { idioma: 'es' } })).status).toBe(403);
    expect((await http('PUT', endpoint(A, 'settings'), sa, { configuracion: { idioma: 'xx' } })).status).toBe(400);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).configuracion).toMatchObject({ idioma: 'en' });
  });

  it('PNG persiste en PostgreSQL y se lee tras reiniciar el servicio; B no puede leer A', async () => {
    expect((await subirLogo(sa, A, PNG, 'image/png')).status).toBe(201);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
    expect(tenant.logoStorageKey).toMatch(new RegExp(`^tenants/${A}/logo/`));
    const almacen = new AlmacenLogotipoPostgres(prisma);
    expect(await almacen.leer(tenant.logoStorageKey!)).toEqual(PNG);
    const servicioNuevo = new TenantLogoService(prisma, crearAlmacenLogotipo({}, prisma));
    expect((await servicioNuevo.leer(A))?.datos).toEqual(PNG);
    const admin = await loginNegocio(adminB, B);
    expect((await http('GET', '/api/tenant/logo', admin.accessToken)).status).toBe(404);
    const actorA = await loginNegocio(adminA, A);
    expect(Buffer.from(await (await http('GET', '/api/tenant/logo', actorA.accessToken)).arrayBuffer())).toEqual(PNG);
  });

  it('un fallo de auditoría revierte los metadatos y conserva los bytes anteriores', async () => {
    const antes = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
    const objetosAntes = await prisma.logotipoObjeto.count();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fallar_logo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operacion='LOGOTIPO_GUARDAR' THEN RAISE EXCEPTION 'Fallo de auditoría de prueba'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER prueba_logo BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION fallar_logo()');
    try { expect((await subirLogo(sa, A, WEBP_CABECERA, 'image/webp')).status).toBe(500); }
    finally { await prisma.$executeRawUnsafe('DROP TRIGGER prueba_logo ON auditoria_operaciones'); }
    const despues = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
    expect(despues.logoStorageKey).toBe(antes.logoStorageKey); expect(despues.logoMime).toBe('image/png');
    expect(await prisma.logotipoObjeto.count()).toBe(objetosAntes);
    expect((await new TenantLogoService(prisma, crearAlmacenLogotipo({}, prisma)).leer(A))?.datos).toEqual(PNG);
  });

  it('un fallo del almacén conserva referencia y datos; formatos inválidos tampoco reemplazan', async () => {
    const antes = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fallar_objeto() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Almacén fuera de servicio'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER prueba_objeto BEFORE INSERT ON logotipo_objetos FOR EACH ROW EXECUTE FUNCTION fallar_objeto()');
    try { expect((await subirLogo(sa, A, WEBP_CABECERA, 'image/webp')).status).toBe(500); }
    finally { await prisma.$executeRawUnsafe('DROP TRIGGER prueba_objeto ON logotipo_objetos'); }
    expect((await subirLogo(sa, A, Buffer.from('<svg/>'), 'image/png')).status).toBe(415);
    expect((await subirLogo(sa, A, Buffer.concat([PNG, Buffer.alloc(2*1024*1024)]), 'image/png')).status).toBe(413);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).logoStorageKey).toBe(antes.logoStorageKey);
    expect(await new AlmacenLogotipoPostgres(prisma).leer(antes.logoStorageKey!)).toEqual(PNG);
  });

  it('dos reemplazos concurrentes publican un objeto coherente y auditan ambos', async () => {
    const antes = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
    expect((await Promise.all([subirLogo(sa, A, PNG, 'image/png'), subirLogo(sa, A, WEBP_CABECERA, 'image/webp')])).map(r => r.status)).toEqual([201,201]);
    const actual = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
    expect(actual.logoStorageKey).not.toBe(antes.logoStorageKey);
    const datos = await new AlmacenLogotipoPostgres(prisma).leer(actual.logoStorageKey!);
    expect(datos).toEqual(actual.logoMime === 'image/png' ? PNG : WEBP_CABECERA);
    expect(await prisma.logotipoObjeto.findUnique({ where: { clave: antes.logoStorageKey! } })).toBeNull();
  });

  it('el borrado es lógico primero; el archivo solo se retira después del commit auditado', async () => {
    const antes = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
    expect((await http('DELETE', endpoint(A, 'logo'), sa)).status).toBe(200);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).logoStorageKey).toBeNull();
    expect(await prisma.logotipoObjeto.findUnique({ where: { clave: antes.logoStorageKey! } })).toBeNull();
    expect((await http('GET', endpoint(A, 'logo'), sa)).status).toBe(404);
  });

  it('RLS impide lecturas directas con un rol no propietario y SQL rechaza claves de otro tenant', async () => {
    await prisma.logotipoObjeto.create({ data: { clave: `tenants/${A}/logo/privado`, tenantId: A, datos: PNG } });
    await expect(prisma.logotipoObjeto.create({ data: { clave: `tenants/${A}/logo/cruzado`, tenantId: B, datos: PNG } })).rejects.toThrow();
    await prisma.$executeRawUnsafe('CREATE ROLE prueba_anon NOLOGIN');
    await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO prueba_anon');
    await prisma.$executeRawUnsafe('GRANT SELECT ON logotipo_objetos,sucursales TO prueba_anon');
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE prueba_anon');
      expect(await tx.$queryRawUnsafe('SELECT * FROM logotipo_objetos')).toEqual([]);
      expect(await tx.$queryRawUnsafe('SELECT * FROM sucursales')).toEqual([]);
    });
  });

  it('auditoría global proviene de PostgreSQL y mantiene la identidad del Super Admin', async () => {
    const result = await http('GET', '/api/admin/auditoria', sa);
    expect(result.status).toBe(200);
    const filas = await result.json() as any[];
    expect(filas.some(fila => fila.usuarioId === superAdminId && fila.operacion === 'USUARIO_CREAR')).toBe(true);
    expect(filas.some(fila => fila.usuarioId === superAdminId && fila.operacion === 'SUCURSAL_CREAR')).toBe(true);
  });
});
