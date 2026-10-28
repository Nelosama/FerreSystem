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
import { GuiaController } from '../src/auth/guia.controller';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { SuperAdminController } from '../src/super-admin/super-admin.controller';
import { SuperAdminService } from '../src/super-admin/super-admin.service';
import { TenantsController } from '../src/tenants/tenants.controller';
import { TenantsService } from '../src/tenants/tenants.service';
import { TenantLogoService } from '../src/tenants/tenant-logo.service';
import { AlmacenLogotipoLocal, LOGOTIPO_ALMACEN } from '../src/tenants/logotipo-almacen';
import { UsuariosController } from '../src/usuarios/usuarios.controller';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { DEFAULT_TENANT_MODULES } from '../src/common/tenant-modules';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';

// NEXUS: alta SaaS y aislamiento con HTTP/JWT y PostgreSQL temporal real.
// Sin mocks de Prisma: se verifican defaults, selects, transacciones y sesiones persistidas.
// Ejecutar sin root (initdb lo exige). Pruebas con backend real; el almacenamiento es el driver LOCAL.
describe('Alta SaaS, usuarios y formatos / HTTP y PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = 'Clave-sintetica-1234!';
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

  const http = (metodo: string, ruta: string, token?: string, cuerpo?: unknown) => fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });
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
    directorio = mkdtempSync(join(tmpdir(), 'jowa-saas-audit-'));
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
    const configService = { get: (clave: string, valorPorDefecto?: unknown) => (clave === 'JWT_SECRET' ? jwtSecret : valorPorDefecto) } as unknown as ConfigService;
    const modulo = await Test.createTestingModule({
      controllers: [GuiaController, AuthController, SuperAdminController, TenantsController, UsuariosController],
      providers: [
        AuthService, SuperAdminService, TenantsService, TenantLogoService, UsuariosService, JwtStrategy,
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
      if (directorio && resolve(directorio).startsWith(resolve(tmpdir()) + sep) && directorio.includes('jowa-saas-audit-')) {
        rmSync(directorio, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const alta = () => ({
    nombreComercial: `Alta ${randomUUID()}`, direccion: 'Calle de prueba', telefono: '99990000',
    email: `negocio-${randomUUID()}@example.test`, colorPrimario: '#123456',
    adminNombre: 'Administración inicial', adminEmail: `admin-${randomUUID()}@example.test`, adminPassword: password,
  });

  it('solo SUPERADMIN puede dar de alta negocios; los rechazos no escriben filas', async () => {
    const admin = await loginNegocio(adminA, A);
    const cajero = await loginNegocio(cajeroA, A);
    const dto = alta();
    for (const [token, status] of [[undefined, 401], [admin.accessToken, 403], [cajero.accessToken, 403]] as const) {
      expect((await http('POST', '/api/admin/tenants', token, dto)).status).toBe(status);
    }
    expect(await prisma.tenant.count({ where: { nombreComercial: dto.nombreComercial } })).toBe(0);
    expect(await prisma.usuario.count({ where: { email: dto.adminEmail } })).toBe(0);
  });

  it.each(['A4', 'ROLLO_80MM', 'ROLLO_58MM'])('alta y configuración persistida del formato %s, sin alterar otro negocio', async formatoImpresion => {
    const sa = await loginSuperAdmin();
    const dto = alta();
    const bAntes = await prisma.tenant.findUniqueOrThrow({ where: { id: B } });
    const respuesta = await http('POST', '/api/admin/tenants', sa.accessToken, {
      ...dto, adminEmail: `  ${dto.adminEmail.toUpperCase()}  `,
    });
    expect(respuesta.status).toBe(201);
    const creado = await respuesta.json() as { tenant: { id: string }; adminUsuario: { id: string; email: string; rol: string } };
    expect(creado.adminUsuario).toEqual({ id: expect.any(String), nombre: dto.adminNombre, email: dto.adminEmail, rol: 'ADMIN' });
    const tenantId = creado.tenant.id;
    expect(await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).toMatchObject({
      nombreComercial: dto.nombreComercial, direccion: dto.direccion, telefono: dto.telefono,
      email: dto.email, colorPrimario: dto.colorPrimario, estado: 'ACTIVO', modoNavegacion: 'SIDEBAR',
    });
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { id: creado.adminUsuario.id } });
    expect(admin).toMatchObject({ tenantId, nombre: dto.adminNombre, email: dto.adminEmail, rol: 'ADMIN', activo: true });
    expect(admin.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, admin.passwordHash)).toBe(true);
    expect(await prisma.secuenciaTenant.findMany({ where: { tenantId }, orderBy: { tipo: 'asc' } })).toEqual([
      expect.objectContaining({ tenantId, tipo: 'VENTA', ultimoNumero: 0 }),
      expect.objectContaining({ tenantId, tipo: 'COTIZACION', ultimoNumero: 0 }),
    ]);
    const modulos = await prisma.tenantModule.findMany({ where: { tenantId } });
    expect(modulos.map(m => m.moduleKey).sort()).toEqual([...DEFAULT_TENANT_MODULES].sort());
    expect(modulos.every(m => m.enabled)).toBe(true);
    const primero = await loginNegocio(dto.adminEmail, tenantId);
    expect(jwt.verify(primero.accessToken)).toMatchObject({ sub: admin.id, tenantId, rol: 'ADMIN', type: 'tenant' });
    expect(primero.tenant.formatoImpresion).toBe('A4');
    const configuracion = { formatoImpresion, rubro: 'MINIMARKET' };
    const guardado = await http('PUT', `/api/admin/tenants/${tenantId}/settings`, sa.accessToken, { configuracion });
    expect(guardado.status).toBe(200);
    expect(await guardado.json()).toMatchObject({ id: tenantId, ...configuracion });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).configuracion).toEqual(configuracion);
    const nuevoLogin = await loginNegocio(dto.adminEmail, tenantId);
    expect(nuevoLogin.tenant).toMatchObject({ id: tenantId, ...configuracion });
    const consulta = await http('GET', '/api/tenant/settings', nuevoLogin.accessToken);
    expect(consulta.status).toBe(200);
    expect(await consulta.json()).toMatchObject({ id: tenantId, ...configuracion });
    expect(await prisma.tenant.findUniqueOrThrow({ where: { id: B } })).toEqual(bAntes);
    const listado = await http('GET', '/api/admin/tenants', sa.accessToken);
    expect(listado.status).toBe(200);
    const negocio = (await listado.json() as { id: string; usuarios: unknown[] }[]).find(t => t.id === tenantId);
    expect(negocio?.usuarios).toEqual([expect.objectContaining({ id: admin.id, email: dto.adminEmail })]);
    expect(JSON.stringify(negocio)).not.toContain('passwordHash');
    expect(JSON.stringify(negocio)).not.toContain(admin.passwordHash);
  });

  it.each(['', 'abc', 'Ferre2026!', 'solo-letras', 'A1' + 'x'.repeat(127)])('alta rechaza contraseña inválida %j antes de escribir', async adminPassword => {
    const sa = await loginSuperAdmin();
    const dto = { ...alta(), adminPassword };
    const antes = await Promise.all([prisma.tenant.count(), prisma.usuario.count(), prisma.secuenciaTenant.count(), prisma.tenantModule.count()]);
    const respuesta = await http('POST', '/api/admin/tenants', sa.accessToken, dto);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ message: expect.stringContaining('contraseña') });
    expect(await Promise.all([prisma.tenant.count(), prisma.usuario.count(), prisma.secuenciaTenant.count(), prisma.tenantModule.count()])).toEqual(antes);
  });

  it('un fallo al crear el administrador revierte negocio, secuencias y módulos', async () => {
    const dto = { ...alta(), adminEmail: 'rollback-alta@example.test' };
    const antes = await Promise.all([prisma.tenant.count(), prisma.usuario.count(), prisma.secuenciaTenant.count(), prisma.tenantModule.count()]);
    // Solo en este clúster desechable: el fallo exige comprobar las escrituras previas
    // dentro de PostgreSQL. Un rechazo anterior a la transacción NO satisface el test.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_fallar_admin_alta() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.email = 'rollback-alta@example.test' THEN
          IF EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
             AND (SELECT count(*) FROM secuencias_tenant WHERE tenant_id = NEW.tenant_id) = 2
             AND EXISTS (SELECT 1 FROM tenant_modules WHERE tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'QA_ALTA_POST_MODULOS';
          END IF;
          RAISE EXCEPTION 'QA_ALTA_ORDEN_INESPERADO';
        END IF;
        RETURN NEW;
      END $$`);
    try {
      await prisma.$executeRawUnsafe('CREATE TRIGGER qa_fallar_admin_alta BEFORE INSERT ON usuarios FOR EACH ROW EXECUTE FUNCTION qa_fallar_admin_alta()');
      await expect(app.get(SuperAdminService).createTenant(dto)).rejects.toThrow('QA_ALTA_POST_MODULOS');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS qa_fallar_admin_alta ON usuarios');
      await prisma.$executeRawUnsafe('DROP FUNCTION qa_fallar_admin_alta()');
    }
    expect(await Promise.all([prisma.tenant.count(), prisma.usuario.count(), prisma.secuenciaTenant.count(), prisma.tenantModule.count()])).toEqual(antes);
    expect(await prisma.tenant.count({ where: { nombreComercial: dto.nombreComercial } })).toBe(0);
  });

  it('usuario creado por ADMIN queda en su negocio y no expone el hash ni permite lectura o edición cruzada', async () => {
    const admin = await loginNegocio(adminA, A);
    const otro = await loginNegocio(adminB, B);
    const email = `empleado-${randomUUID()}@example.test`;
    const creado = await http('POST', '/api/usuarios', admin.accessToken, { nombre: 'Empleado', email, rol: 'VENDEDOR', tenantId: B });
    expect(creado.status).toBe(201);
    const usuario = await creado.json() as { id: string; tenantId: string };
    expect(usuario.tenantId).toBe(A);
    expect(usuario).not.toHaveProperty('passwordHash');
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).toMatchObject({ tenantId: A, email, nombre: 'Empleado', rol: 'VENDEDOR', activo: true });
    const propios = await http('GET', '/api/usuarios', admin.accessToken);
    expect(propios.status).toBe(200);
    const listaA = await propios.json() as { id: string; tenantId: string }[];
    expect(listaA).toContainEqual(expect.objectContaining({ id: usuario.id }));
    expect(listaA.every(u => u.tenantId === A)).toBe(true);
    expect(JSON.stringify(listaA)).not.toContain('passwordHash');
    const ajenos = await http('GET', '/api/usuarios', otro.accessToken);
    expect(ajenos.status).toBe(200);
    const listaB = await ajenos.json() as { id: string; tenantId: string }[];
    expect(listaB.length).toBeGreaterThan(0);
    expect(listaB.every(u => u.tenantId === B)).toBe(true);
    expect(listaB.some(u => u.id === usuario.id)).toBe(false);
    expect((await http('GET', `/api/usuarios/${usuario.id}`, otro.accessToken)).status).toBe(404);
    expect((await http('PUT', `/api/usuarios/${usuario.id}`, otro.accessToken, { nombre: 'Intruso' })).status).toBe(404);
    expect((await http('DELETE', `/api/usuarios/${usuario.id}`, otro.accessToken)).status).toBe(404);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).toMatchObject({ nombre: 'Empleado', activo: true, tenantId: A });
  });

  it('CAJERO no puede listar ni crear usuarios y los rechazos no escriben', async () => {
    const cajero = await loginNegocio(cajeroA, A);
    const email = `prohibido-${randomUUID()}@example.test`;
    expect((await http('GET', '/api/usuarios', cajero.accessToken)).status).toBe(403);
    expect((await http('POST', '/api/usuarios', cajero.accessToken, { nombre: 'No autorizado', email, password, rol: 'ADMIN' })).status).toBe(403);
    expect(await prisma.usuario.count({ where: { email } })).toBe(0);
  });

  it('el mismo correo heredado en dos negocios solo entra con el enlace de su empresa; sin él no se resuelve y las altas nuevas no pueden repetirlo', async () => {
    const email = `compartido-${randomUUID()}@example.test`;
    // La misma contraseña impide que el test pase identificando por contraseña en lugar de tenantId.
    const hash = await bcrypt.hash(password, 4);
    const usuarios = await Promise.all([A, B].map(tenantId => prisma.usuario.create({ data: { tenantId, email, nombre: 'Compartido', rol: 'CAJERO', passwordHash: hash } })));
    for (const usuario of usuarios) {
      const sesion = await loginNegocio(email, usuario.tenantId);
      const payload = jwt.verify(sesion.accessToken);
      expect(payload).toMatchObject({ sub: usuario.id, tenantId: usuario.tenantId, rol: 'CAJERO', type: 'tenant', sid: expect.any(String) });
      expect(await prisma.sesionAuth.findUniqueOrThrow({ where: { id: payload.sid } })).toMatchObject({ sujetoId: usuario.id, tenantId: usuario.tenantId, tipo: 'TENANT', revokedAt: null });
      expect(sesion.tenant.id).toBe(usuario.tenantId);
    }
    expect((await http('POST', '/api/auth/login', undefined, { email, password })).status).toBe(401);
    expect((await http('POST', '/api/auth/login', undefined, { email, password, tenantId: randomUUID() })).status).toBe(401);
    // Las altas nuevas ya no pueden repetir un identificador de otro negocio: el login sin empresa resuelve una sola cuenta.
    const plataforma = (await prisma.superAdmin.findUniqueOrThrow({ where: { email: emailSuperAdmin } })).id;
    await prisma.usuario.update({ where: { id: usuarios[1].id }, data: { email: `b-${randomUUID()}@example.test` } });
    // En B el correo ya no existe localmente, pero sigue usado en A: el alta global lo rechaza (409) sin decir dónde.
    await expect(app.get(UsuariosService).create(B, { nombre: 'Otro', email: email.toUpperCase(), rol: 'CAJERO' } as any, plataforma, true)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('no está disponible') });
    await expect(app.get(UsuariosService).create(B, { nombre: 'Otro', email: `nuevo-${randomUUID()}@example.test`, rol: 'CAJERO' } as any, plataforma, true)).resolves.toMatchObject({ tenantId: B });
  });

  it('usuario desactivado y negocio suspendido no obtienen sesión nueva ni conservan acceso con su JWT', async () => {
    const dto = alta();
    const creado = await app.get(SuperAdminService).createTenant(dto);
    const tenantId = creado.tenant.id;
    const sesion = await loginNegocio(dto.adminEmail, tenantId);
    await prisma.usuario.update({ where: { id: creado.adminUsuario.id }, data: { activo: false } });
    expect((await http('POST', '/api/auth/login', undefined, { email: dto.adminEmail, password, tenantId })).status).toBe(401);
    expect((await http('GET', '/api/tenant/settings', sesion.accessToken)).status).toBe(401);
    await prisma.usuario.update({ where: { id: creado.adminUsuario.id }, data: { activo: true } });
    await prisma.tenant.update({ where: { id: tenantId }, data: { estado: 'SUSPENDIDO' } });
    expect((await http('POST', '/api/auth/login', undefined, { email: dto.adminEmail, password, tenantId })).status).toBe(401);
    expect((await http('GET', '/api/tenant/settings', sesion.accessToken)).status).toBe(401);
  });

  it('soporte rechaza usuario de otro negocio y Super Admin inactivo antes de emitir sesión o auditoría', async () => {
    const sa = await loginSuperAdmin();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { email: adminA, tenantId: A } });
    const antes = await Promise.all([prisma.auditoriaOperacion.count(), prisma.sesionAuth.count()]);
    const body = { tenantId: B, usuarioId: admin.id, readOnly: true, motivo: 'Verificación sintética de aislamiento' };
    expect((await http('POST', '/api/admin/support/token', sa.accessToken, body)).status).toBe(404);
    await prisma.superAdmin.update({ where: { id: superAdminId }, data: { activo: false } });
    try {
      expect((await http('POST', '/api/admin/support/token', sa.accessToken, { ...body, tenantId: A })).status).toBe(401);
    } finally {
      await prisma.superAdmin.update({ where: { id: superAdminId }, data: { activo: true } });
    }
    expect(await Promise.all([prisma.auditoriaOperacion.count(), prisma.sesionAuth.count()])).toEqual(antes);
  });

  it('soporte autorizado emite identidad, sesión y auditoría coherentes antes de devolver el token', async () => {
    const sa = await loginSuperAdmin();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { email: adminA, tenantId: A } });
    const motivo = 'Verificación sintética de impresión';
    const respuesta = await http('POST', '/api/admin/support/token', sa.accessToken, { tenantId: A, usuarioId: admin.id, readOnly: true, motivo });
    expect(respuesta.status).toBe(201);
    const soporte = await respuesta.json() as { accessToken: string };
    const payload = jwt.verify(soporte.accessToken);
    expect(payload).toMatchObject({ sub: admin.id, tenantId: A, impersonatedBy: superAdminId, readOnly: true, type: 'tenant', sid: expect.any(String), soporteSesionId: expect.any(String) });
    expect(await prisma.sesionAuth.findUniqueOrThrow({ where: { id: payload.sid } })).toMatchObject({ tipo: 'SOPORTE', sujetoId: admin.id, tenantId: A, revokedAt: null });
    const auditoria = await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId: A, usuarioId: admin.id, operacion: 'SOPORTE_IMPERSONAR' }, orderBy: { createdAt: 'desc' } });
    expect(auditoria.datos).toMatchObject({ superAdminId, readOnly: true, motivo, soporteSesionId: payload.soporteSesionId });
    expect((await http('GET', '/api/tenant/settings', soporte.accessToken)).status).toBe(200);
  });
  it('Modo Guía conservador, control exclusivo y progreso PostgreSQL por usuario/negocio', async () => {
    const sa = (await loginSuperAdmin()).accessToken;
    const a = (await loginNegocio(adminA, A)).accessToken;
    const b = (await loginNegocio(adminB, B)).accessToken;
    expect(await (await http('GET', '/api/auth/guia', a)).json()).toEqual({ enabled: false });
    expect((await http('PUT', '/api/auth/guia', a, { status: 'completed', step: '' })).status).toBe(403);
    expect((await http('PUT', `/api/admin/tenants/${A}/settings`, a, { configuracion: { modoGuia: true } })).status).toBe(403);
    expect((await http('PUT', '/api/tenant/settings', a, { configuracion: { modoGuia: true } })).status).toBe(403);
    expect((await http('PUT', `/api/admin/tenants/${A}/settings`, sa, { configuracion: { modoGuia: 'true' } })).status).toBe(400);
    expect((await http('PUT', `/api/admin/tenants/${A}/settings`, sa, { configuracion: { modoGuia: true } })).status).toBe(200);
    for (const status of ['active', 'dismissed', 'completed', 'pending']) {
      expect((await http('PUT', '/api/auth/guia', a, { status, step: 'inventario', tenantId: B })).status).toBe(200);
      const loaded = await (await http('GET', '/api/auth/guia', a)).json();
      expect(loaded.progress.status).toBe(status);
      expect(loaded.progress.step).toBe('inventario');
      const user = await prisma.usuario.findFirstOrThrow({ where: { tenantId: A, email: adminA } });
      expect((user.guiaProgreso as any).status).toBe(status);
      expect(await (await http('GET', '/api/auth/guia', b)).json()).toEqual({ enabled: false });
    }
    expect((await http('PUT', '/api/auth/guia', a, { status: 'invalid', step: '' })).status).toBe(400);
    expect((await http('PUT', '/api/auth/guia', a, { status: 'active', step: 'x'.repeat(81) })).status).toBe(400);
    const c = (await loginNegocio(cajeroA, A)).accessToken;
    expect((await (await http('GET', '/api/auth/guia', c)).json()).progress).toEqual({});
    expect((await http('PUT', '/api/auth/guia', sa, { status: 'completed', step: 'status' })).status).toBe(200);
    expect((await (await http('GET', '/api/auth/guia', sa)).json()).progress.status).toBe('completed');
    expect((await http('PUT', `/api/admin/tenants/${A}/settings`, sa, { configuracion: { modoGuia: false } })).status).toBe(200);
    expect((await http('PUT', '/api/auth/guia', a, { status: 'active', step: '' })).status).toBe(403);
  });

  it('16 módulos configurables: persistencia, recuperación, dependencias, historial y tenant aislado', async () => {
    const sa = (await loginSuperAdmin()).accessToken;
    const a = (await loginNegocio(adminA, A)).accessToken;
    const c = (await loginNegocio(cajeroA, A)).accessToken;
    const bBefore = await prisma.tenantModule.findMany({ where: { tenantId: B } });
    const product = await prisma.producto.create({ data: { tenantId: A, codigo: 'GUIA-HIST', nombre: 'Histórico', precioVenta: 12, precioCosto: 8, stockActual: 7 } });
    const off = DEFAULT_TENANT_MODULES.map(moduleKey => ({ moduleKey, enabled: false }));
    const put = (modules: unknown, token = sa) => http('PUT', `/api/admin/tenants/${A}/modules`, token, { modules });
    expect((await put(off, a)).status).toBe(403);
    expect((await put(off, c)).status).toBe(403);
    for (const invalid of [null, [{ moduleKey: 'inventado', enabled: true }], [{ moduleKey: 'pos', enabled: 'false' }], [off[0], off[0]]]) expect((await put(invalid)).status).toBe(400);
    expect((await put([{ moduleKey: 'inventario', enabled: false }])).status).toBe(400);
    expect((await put(off)).status).toBe(200);
    expect((await (await http('GET', '/api/tenant/settings', a)).json()).modulosHabilitados).toEqual([]);
    expect((await http('GET', '/api/usuarios', a)).status).toBe(403);
    expect((await http('GET', `/api/admin/tenants/${A}/usuarios?gestion=true`, sa)).status).toBe(200);
    // Each module can be activated and disabled; operational dependencies are activated together.
    const dependencies: Record<string, string[]> = { pos: ['inventario','arqueo_caja','clientes'], cotizaciones: ['inventario','clientes'], levantamiento: ['inventario'], ordenes_compra: ['inventario'], comisiones_venta: ['pos','usuarios','inventario','arqueo_caja','clientes'] };
    for (const key of DEFAULT_TENANT_MODULES) {
      const enabled = [key, ...(dependencies[key] || [])];
      expect((await put(off.map(item => ({ ...item, enabled: enabled.includes(item.moduleKey) })))).status).toBe(200);
      const persisted = await (await http('GET', '/api/tenant/settings', a)).json();
      expect(persisted.modulosHabilitados.sort()).toEqual(enabled.sort());
      expect((await put(off)).status).toBe(200);
      expect((await (await http('GET', '/api/tenant/settings', a)).json()).modulosHabilitados).toEqual([]);
    }
    expect(await prisma.producto.findUnique({ where: { id: product.id } })).toEqual(product);
    expect(await prisma.tenantModule.findMany({ where: { tenantId: B } })).toEqual(bBefore);
    const audit = await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId: A, operacion: 'ACTUALIZAR_SERVICIOS' }, orderBy: { createdAt: 'desc' } });
    const auditHttp = await (await http('GET', `/api/admin/tenants/${A}/auditoria`, sa)).json();
    expect(auditHttp.find((row: any) => row.id === audit.id).usuario_nombre).toBe('Super Admin de prueba');
    expect(audit.usuarioId).toBe(superAdminId); expect(audit.createdAt).toBeInstanceOf(Date);
    expect((audit.datos as any).before).toHaveLength(16); expect((audit.datos as any).modules).toHaveLength(16);
    expect((await put(off.map(item => ({ ...item, enabled: true })))).status).toBe(200);
    expect((await http('GET', '/api/usuarios', a)).status).toBe(200);
    expect((await http('GET', '/api/usuarios', c)).status).toBe(403);
  }, 30000);

});
