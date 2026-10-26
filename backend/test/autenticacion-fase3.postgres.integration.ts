import { RecoveryService } from '../src/auth/recovery.service';
import { syntheticPlatformMfa } from './synthetic-platform-mfa';
import { noStore } from '../src/common/no-store.middleware';
import { idSolicitud } from '../src/operaciones/ledger';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParserImport from 'cookie-parser';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CashierResponseInterceptor } from '../src/common/interceptors/cashier-response.interceptor';
import { ContingenciaController } from '../src/contingencia/contingencia.controller';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { SuperAdminController } from '../src/super-admin/super-admin.controller';
import { SuperAdminService } from '../src/super-admin/super-admin.service';
import { TenantsService } from '../src/tenants/tenants.service';
import { TenantLogoService } from '../src/tenants/tenant-logo.service';
import { LOGOTIPO_ALMACEN } from '../src/tenants/logotipo-almacen';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { sesionVigente } from '../src/auth/sesiones-auth';
import { leerConfiguracionAuth } from '../src/auth/auth-config';

// Autenticación fase 3: límite de intentos, sesiones revocables, transición de tokens y contingencia offline.
// Clúster PostgreSQL temporal y dedicado. Ejecutar sin root (initdb lo exige).
describe('Autenticación fase 3 / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  const password = 'Clave-Segura-2026!';
  const cookieParser = (cookieParserImport as any).default || cookieParserImport;
  // Límites bajos para que las pruebas sean rápidas y deterministas. Producción usa los defectos de auth-config.ts.
  const env: Record<string, string | undefined> = {
    JWT_SECRET: secret,
    AUTH_LOGIN_MAX_FALLOS_CUENTA: '3',
    AUTH_LOGIN_MAX_FALLOS_IP: '50',
    AUTH_LOGIN_VENTANA_SEGUNDOS: '900',
    AUTH_LOGIN_BLOQUEO_SEGUNDOS: '900',
  };
  let directory: string;
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let contingencia: ContingenciaService;
  let superAdmin: SuperAdminService;
  let usuarios: UsuariosService;

  const tenantId = randomUUID();
  const adminId = randomUUID();
  const cajeroId = randomUUID();
  const otroCajeroId = randomUUID();
  const superAdminId = randomUUID();
  let dispositivoId: string;
  let productoId: string;

  const login = (email: string, pass = password, extra: Record<string, unknown> = { tenantId }) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email, password: pass, ...extra });
  const refreshCookie = (res: request.Response) => {
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('refreshToken='))!;
    return cookie.split(';')[0];
  };
  const get = (path: string, token: string) => request(app.getHttpServer()).get(`/api${path}`).auth(token, { type: 'bearer' });
  const sesionDe = async (token: string) => jwt.decode<{ sid: string }>(token).sid;

  beforeAll(async () => {
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-auth3-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const options = { windowsHide: true, timeout: 30000, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' }, stdio: 'pipe' as const };
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
    contingencia = new ContingenciaService(prisma);
    const config = { get: (key: string, fallback?: unknown) => env[key] ?? fallback } as unknown as ConfigService;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, SuperAdminController, ContingenciaController],
      providers: [
        AuthService, JwtStrategy, SuperAdminService, ContingenciaService, TenantsService, TenantLogoService,
        { provide: LOGOTIPO_ALMACEN, useValue: null },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(noStore);
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
    superAdmin = moduleRef.get(SuperAdminService);
    usuarios = new UsuariosService(prisma);

    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería Auth', estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: true } } as any } });
    const passwordHash = await bcrypt.hash(password, 4);
    for (const [id, rol, email] of [[adminId, 'ADMIN', 'admin@auth.test.invalid'], [cajeroId, 'CAJERO', 'cajero@auth.test.invalid'], [otroCajeroId, 'CAJERO', 'otro@auth.test.invalid']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email, passwordHash, rol: rol as any, permisosConfigurados: false, permisos: [] } });
    }
    await prisma.superAdmin.create({ data: { id: superAdminId, nombre: 'Plataforma', email: 'plataforma@auth.test.invalid', passwordHash } });
    await prisma.caja.create({ data: { tenantId, codigo: 'CAJA-1', usuarioId: cajeroId, montoApertura: 100, estado: 'ABIERTA' } as any });
    productoId = (await prisma.producto.create({ data: { tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioAprobado: true, precioCosto: 4, stockActual: 20 } as any })).id;
    dispositivoId = randomUUID();
    await contingencia.registrarDispositivo(tenantId, cajeroId, { dispositivoId, nombre: 'Caja principal' } as any);
  }, 180000);

  afterAll(async () => {
    try {
      await app?.close();
      await prisma?.$disconnect();
    } finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-auth3-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  // Cada prueba empieza sin contadores de intentos (los temporales por identificador/IP y el persistente por cuenta, que bloquea
  // a los roles operativos en el sexto fallo y se prueba en auth-recovery). Las sesiones se conservan: cada prueba crea las suyas.
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM intentos_login');
    await prisma.$executeRawUnsafe('UPDATE usuarios SET intentos_fallidos = 0, ultimo_fallo_at = NULL, bloqueado_at = NULL WHERE intentos_fallidos > 0 OR bloqueado_at IS NOT NULL');
    await prisma.$executeRawUnsafe('UPDATE super_admins SET intentos_fallidos = 0, ultimo_fallo_at = NULL WHERE intentos_fallidos > 0');
  });

  it('las respuestas privadas y los rechazos de autenticación llevan no-store', async () => {
    const res = await login('admin@auth.test.invalid').expect(200);
    expect(res.headers['cache-control']).toBe('no-store, private');
    await get('/auth/me', res.body.accessToken).expect(200).expect('Cache-Control', 'no-store, private');
    await get('/auth/me', 'token-invalido').expect(401).expect('Cache-Control', 'no-store, private');
  });

  it('refresh no cambia de tenant aunque un token firmado afirme otro tenant', async () => {
    const res = await login('admin@auth.test.invalid').expect(200);
    const original = jwt.decode<any>(res.body.accessToken);
    const invalid = jwt.sign({ sub: adminId, tenantId: randomUUID(), type: 'tenant', typ: 'refresh', sid: original.sid });
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', `refreshToken=${invalid}`).expect(401);
    await get('/auth/me', res.body.accessToken).expect(200);
  });

  describe('límite de intentos de inicio de sesión', () => {
    it('bloquea la cuenta tras el máximo de fallos y responde 429 aunque la contraseña sea correcta', async () => {
      for (let i = 0; i < 3; i++) await login('cajero@auth.test.invalid', 'mala-clave').expect(401);
      const bloqueado = await login('cajero@auth.test.invalid').expect(429);
      expect(bloqueado.body.message).toMatch(/Demasiados intentos/);
      expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('una cuenta inexistente se bloquea igual que una real: no revela qué correos existen', async () => {
      for (let i = 0; i < 3; i++) await login('no-existe@auth.test.invalid', 'mala-clave').expect(401);
      await login('no-existe@auth.test.invalid', 'mala-clave').expect(429);
    });

    it('otra cuenta desde la misma IP sigue pudiendo entrar mientras no llegue al límite de IP', async () => {
      for (let i = 0; i < 3; i++) await login('cajero@auth.test.invalid', 'mala-clave').expect(401);
      await login('cajero@auth.test.invalid').expect(429);
      await login('admin@auth.test.invalid').expect(200);
    });

    it('un inicio correcto reinicia el contador de la cuenta', async () => {
      await login('cajero@auth.test.invalid', 'mala-clave').expect(401);
      await login('cajero@auth.test.invalid', 'mala-clave').expect(401);
      await login('cajero@auth.test.invalid').expect(200);
      await login('cajero@auth.test.invalid', 'mala-clave').expect(401);
      await login('cajero@auth.test.invalid', 'mala-clave').expect(401);
      await login('cajero@auth.test.invalid').expect(200);
    });

    it('el bloqueo expira: al vencer, vuelve a permitirse el inicio de sesión', async () => {
      for (let i = 0; i < 3; i++) await login('cajero@auth.test.invalid', 'mala-clave').expect(401);
      await login('cajero@auth.test.invalid').expect(429);
      await prisma.$executeRawUnsafe(`UPDATE intentos_login SET bloqueado_hasta = now() - interval '1 second'`);
      await login('cajero@auth.test.invalid').expect(200);
    });

    it('el límite por IP bloquea a todas las cuentas de esa IP cuando se alcanza', async () => {
      const previo = env.AUTH_LOGIN_MAX_FALLOS_IP;
      env.AUTH_LOGIN_MAX_FALLOS_IP = '4';
      try {
        const cuentas = ['a1', 'a2', 'a3', 'a4'];
        for (const c of cuentas) await login(`${c}@auth.test.invalid`, 'mala-clave').expect(401);
        // La IP ya tiene 4 fallos; el límite aplica al contar, así que la siguiente cuenta válida queda bloqueada.
        await login('admin@auth.test.invalid').expect(429);
      } finally {
        env.AUTH_LOGIN_MAX_FALLOS_IP = previo;
      }
    });

    it('sin TRUST_PROXY, cambiar X-Forwarded-For no evade el límite de IP', async () => {
      const previo = env.AUTH_LOGIN_MAX_FALLOS_IP;
      env.AUTH_LOGIN_MAX_FALLOS_IP = '2';
      try {
        await login('x1@auth.test.invalid', 'mala-clave').set('X-Forwarded-For', '10.0.0.1').expect(401);
        await login('x2@auth.test.invalid', 'mala-clave').set('X-Forwarded-For', '10.0.0.2').expect(401);
        await login('admin@auth.test.invalid').set('X-Forwarded-For', '10.0.0.3').expect(429);
      } finally {
        env.AUTH_LOGIN_MAX_FALLOS_IP = previo;
      }
    });

    it('con TRUST_PROXY=1, cada IP real de X-Forwarded-For tiene su propio contador', async () => {
      const instancia = app.getHttpAdapter().getInstance();
      instancia.set('trust proxy', 1);
      try {
        const previo = env.AUTH_LOGIN_MAX_FALLOS_IP;
        env.AUTH_LOGIN_MAX_FALLOS_IP = '2';
        try {
          await login('cajero@auth.test.invalid', 'mala-clave').set('X-Forwarded-For', '203.0.113.7').expect(401);
          await login('cajero@auth.test.invalid', 'mala-clave').set('X-Forwarded-For', '203.0.113.7').expect(401);
          await login('admin@auth.test.invalid').set('X-Forwarded-For', '203.0.113.7').expect(429);
          await login('admin@auth.test.invalid').set('X-Forwarded-For', '198.51.100.20').expect(200);
        } finally {
          env.AUTH_LOGIN_MAX_FALLOS_IP = previo;
        }
      } finally {
        instancia.set('trust proxy', false);
      }
    });

    it('el Super Admin también tiene límite de intentos', async () => {
      for (let i = 0; i < 3; i++) await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'plataforma@auth.test.invalid', password: 'mala-clave' }).expect(401);
      await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'plataforma@auth.test.invalid', password, mfaCode: await syntheticPlatformMfa(prisma, 'plataforma@auth.test.invalid') }).expect(429);
    });

    it('los fallos se guardan como hash, sin correo en claro', async () => {
      await login('secreto@auth.test.invalid', 'mala-clave').expect(401);
      const filas = await prisma.$queryRawUnsafe<{ clave: string }[]>('SELECT clave FROM intentos_login');
      expect(filas.length).toBeGreaterThan(0);
      expect(filas.every(f => !f.clave.includes('secreto@auth.test.invalid'))).toBe(true);
    });
  });

  describe('sesiones revocables y logout', () => {
    it('el logout con cookie revoca el access token y el refresh token de esa sesión', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const access = res.body.accessToken as string;
      const cookie = refreshCookie(res);
      await get('/auth/me', access).expect(200);
      await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(200);
      await get('/auth/me', access).expect(401);
      await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('el logout con solo el Bearer (cookie ausente) también revoca la sesión', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const access = res.body.accessToken as string;
      await request(app.getHttpServer()).post('/api/auth/logout').auth(access, { type: 'bearer' }).expect(200);
      await get('/auth/me', access).expect(401);
    });

    it('cerrar una sesión no cierra las demás sesiones del mismo usuario (otro dispositivo)', async () => {
      const dispositivo1 = await login('admin@auth.test.invalid').expect(200);
      const dispositivo2 = await login('admin@auth.test.invalid').expect(200);
      await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', refreshCookie(dispositivo1)).expect(200);
      await get('/auth/me', dispositivo1.body.accessToken).expect(401);
      await get('/auth/me', dispositivo2.body.accessToken).expect(200);
    });

    it('un refresh activo renueva el access token dentro de la misma sesión', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const renovado = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', refreshCookie(res)).expect(200);
      expect(await sesionDe(renovado.body.accessToken)).toBe(await sesionDe(res.body.accessToken));
      await get('/auth/me', renovado.body.accessToken).expect(200);
    });

    it('una sesión vencida no autoriza aunque la firma del token sea válida', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      await prisma.sesionAuth.updateMany({ where: { id: await sesionDe(res.body.accessToken) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await get('/auth/me', res.body.accessToken).expect(401);
    });

    it('un token con el sid de la sesión de otro usuario no autoriza', async () => {
      const dueño = await login('admin@auth.test.invalid').expect(200);
      const sidAjeno = await sesionDe(dueño.body.accessToken);
      const suplantado = jwt.sign({ sub: cajeroId, tenantId, type: 'tenant', rol: 'CAJERO', sid: sidAjeno });
      await get('/auth/me', suplantado).expect(401);
    });

    it('un token sin sid se rechaza cuando AUTH_ACEPTAR_TOKENS_SIN_SESION=false y se acepta en la transición', async () => {
      const sinSesion = jwt.sign({ sub: adminId, tenantId, type: 'tenant', rol: 'ADMIN' }, { expiresIn: '5m' });
      const estrictaConfig = { get: (k: string) => (k === 'JWT_SECRET' ? secret : k === 'AUTH_ACEPTAR_TOKENS_SIN_SESION' ? 'false' : undefined) } as unknown as ConfigService;
      const transicionConfig = { get: (k: string) => (k === 'JWT_SECRET' ? secret : undefined) } as unknown as ConfigService;
      const estricta = new JwtStrategy(estrictaConfig, prisma);
      await expect(estricta.validate(jwt.decode(sinSesion))).rejects.toThrow(UnauthorizedException);
      const transicion = new JwtStrategy(transicionConfig, prisma);
      await expect(transicion.validate(jwt.decode(sinSesion))).resolves.toMatchObject({ sub: adminId });
    });

    it('el token de refresh no sirve como access token de API', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      await get('/auth/me', refreshCookie(res).split('=')[1]).expect(401);
    });

    it('el logout del Super Admin revoca su sesión y su refresh', async () => {
      const res = await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'plataforma@auth.test.invalid', password, mfaCode: await syntheticPlatformMfa(prisma, 'plataforma@auth.test.invalid') }).expect(200);
      const access = res.body.accessToken as string;
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('superAdminRefreshToken='))!.split(';')[0];
      await get('/auth/me', access).expect(200);
      await request(app.getHttpServer()).post('/api/admin/auth/logout').set('Cookie', cookie).expect(200);
      await get('/auth/me', access).expect(401);
      await request(app.getHttpServer()).post('/api/admin/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('cerrar la sesión de soporte con su Bearer revoca el token de soporte', async () => {
      const soporte = await superAdmin.supportToken(superAdminId, tenantId, cajeroId, true, { motivo: 'Revisar caja del turno de prueba' });
      await get('/auth/me', soporte.accessToken).expect(200);
      await request(app.getHttpServer()).post('/api/admin/auth/logout').auth(soporte.accessToken, { type: 'bearer' }).expect(200);
      await get('/auth/me', soporte.accessToken).expect(401);
    });

    it('cambiar la contraseña revoca todas las sesiones del usuario', async () => {
      const sesion = await login('otro@auth.test.invalid').expect(200);
      await get('/auth/me', sesion.body.accessToken).expect(200);
      await new RecoveryService(prisma, new ConfigService(env), {} as any).change({ sub: otroCajeroId, type: 'tenant', tenantId }, { currentPassword: password, password: 'Nueva-Clave-2026!' });
      await get('/auth/me', sesion.body.accessToken).expect(401);
      await login('otro@auth.test.invalid', password).expect(401);
      await login('otro@auth.test.invalid', 'Nueva-Clave-2026!').expect(200);
    });

    it('desactivar un usuario revoca sus sesiones', async () => {
      const id = randomUUID();
      await prisma.usuario.create({ data: { id, tenantId, nombre: 'Temporal', email: 'temporal@auth.test.invalid', passwordHash: await bcrypt.hash(password, 4), rol: 'CAJERO', permisosConfigurados: false, permisos: [] } as any });
      const sesion = await login('temporal@auth.test.invalid').expect(200);
      await usuarios.update(tenantId, id, { activo: false } as any, adminId);
      await get('/auth/me', sesion.body.accessToken).expect(401);
    });

    it('sesionVigente exige el mismo sujeto, sesión no revocada y no vencida', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const sid = await sesionDe(res.body.accessToken);
      expect(await sesionVigente(prisma, sid, adminId, (await prisma.usuario.findUniqueOrThrow({ where: { id: adminId } })).passwordHash)).toBe(true);
      expect(await sesionVigente(prisma, sid, cajeroId)).toBe(false);
      expect(await sesionVigente(prisma, randomUUID(), adminId)).toBe(false);
    });
  });

  describe('rotación de refresh y detección de reutilización (H-04)', () => {
    const refrescar = (cookie: string) => request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie);
    const fila = (sid: string) => prisma.sesionAuth.findUnique({ where: { id: sid } });
    const maxAge = (res: request.Response, nombre = 'refreshToken') =>
      Number(/Max-Age=(\d+)/.exec((res.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith(`${nombre}=`))!)![1]);
    // Simula que la última rotación ocurrió hace `segundos`, sin esperar en tiempo real.
    const envejecerRotacion = (sid: string, segundos: number) =>
      prisma.sesionAuth.update({ where: { id: sid }, data: { refreshRotadoAt: new Date(Date.now() - segundos * 1000) } });

    it('cada refresh entrega una cookie nueva, conserva el sid y no alarga la sesión', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const original = refreshCookie(res);
      const r1 = await refrescar(original).expect(200);
      const c1 = refreshCookie(r1);
      expect(c1).not.toBe(original);
      expect(await sesionDe(r1.body.accessToken)).toBe(sid);
      expect(jwt.decode<any>(c1.split('=')[1]).jti).toBe((await fila(sid))!.refreshJti);
      const r2 = await refrescar(c1).expect(200);
      expect(refreshCookie(r2)).not.toBe(c1);
      expect(maxAge(r2)).toBeLessThanOrEqual(maxAge(res));
      expect(jwt.decode<any>(refreshCookie(r2).split('=')[1]).exp).toBeLessThanOrEqual(jwt.decode<any>(original.split('=')[1]).exp);
      await get('/auth/me', r2.body.accessToken).expect(200);
    });

    it('la cookie recién sustituida se acepta en la ventana de gracia sin volver a rotar ni cerrar la sesión', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const original = refreshCookie(res);
      const rotada = await refrescar(original).expect(200);
      const vigente = (await fila(sid))!.refreshJti;
      const tardia = await refrescar(original).expect(200);
      expect(jwt.decode<any>(refreshCookie(tardia).split('=')[1]).jti).toBe(vigente);
      expect((await fila(sid))!.refreshJti).toBe(vigente);
      expect((await fila(sid))!.revokedAt).toBeNull();
      await get('/auth/me', rotada.body.accessToken).expect(200);
    });

    it('pestañas que renuevan a la vez con la misma cookie: todas reciben token y la sesión sigue abierta', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const cookie = refreshCookie(res);
      const respuestas = await Promise.all(Array.from({ length: 6 }, () => refrescar(cookie)));
      expect(respuestas.map(r => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      const s = (await fila(sid))!;
      expect(s.revokedAt).toBeNull();
      // Una sola rotación: el anterior es el jti de login y todas las respuestas llevan el jti vigente.
      expect(s.refreshJtiAnterior).toBe(jwt.decode<any>(cookie.split('=')[1]).jti);
      expect(new Set(respuestas.map(r => jwt.decode<any>(refreshCookie(r).split('=')[1]).jti))).toEqual(new Set([s.refreshJti]));
    });

    it('una cookie sustituida reutilizada fuera de la gracia revoca la sesión entera (también el token nuevo)', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const robada = refreshCookie(res);
      const legitimo = await refrescar(robada).expect(200);
      await envejecerRotacion(sid, 121);
      await refrescar(robada).expect(401);
      expect((await fila(sid))!).toMatchObject({ revocationMotivo: 'REUTILIZACION_REFRESH' });
      expect((await fila(sid))!.revokedAt).not.toBeNull();
      await get('/auth/me', legitimo.body.accessToken).expect(401);
      await refrescar(refreshCookie(legitimo)).expect(401);
    });

    it('un refresh más antiguo que el anterior es reutilización aunque esté dentro de la gracia', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const primera = refreshCookie(res);
      const segunda = refreshCookie(await refrescar(primera).expect(200));
      await envejecerRotacion(sid, 121);
      await refrescar(segunda).expect(200); // rota de nuevo: «primera» ya no es ni vigente ni anterior
      await refrescar(primera).expect(401);
      expect((await fila(sid))!.revocationMotivo).toBe('REUTILIZACION_REFRESH');
    });

    it('un refresh emitido antes de la rotación (sin jti) se acepta una vez y queda sustituido', async () => {
      const sid = randomUUID();
      const expiresAt = new Date(Date.now() + 3600_000);
      await prisma.sesionAuth.create({ data: { id: sid, tipo: 'TENANT', sujetoId: adminId, tenantId, expiresAt } });
      const legado = jwt.sign({ sub: adminId, tenantId, rol: 'ADMIN', type: 'tenant', sid, typ: 'refresh' }, { expiresIn: 3600 });
      const nuevo = await refrescar(`refreshToken=${legado}`).expect(200);
      expect((await fila(sid))!.refreshJtiAnterior).toBe('sin-jti');
      await refrescar(`refreshToken=${legado}`).expect(200); // gracia
      await envejecerRotacion(sid, 121);
      await refrescar(`refreshToken=${legado}`).expect(401);
      await get('/auth/me', nuevo.body.accessToken).expect(401);
    });

    it('un refresh con un jti inventado para una sesión válida revoca la sesión', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const falso = jwt.sign({ sub: adminId, tenantId, rol: 'ADMIN', type: 'tenant', sid, typ: 'refresh' }, { expiresIn: 600, jwtid: randomUUID() });
      await refrescar(`refreshToken=${falso}`).expect(401);
      await get('/auth/me', res.body.accessToken).expect(401);
    });

    it('logout tras rotar revoca la sesión con la cookie vigente', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      const r1 = await refrescar(refreshCookie(res)).expect(200);
      await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', refreshCookie(r1)).expect(200);
      await get('/auth/me', r1.body.accessToken).expect(401);
      await refrescar(refreshCookie(r1)).expect(401);
    });

    it('el refresh del Super Admin rota y detecta la reutilización', async () => {
      const cookieDe = (r: request.Response) => (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('superAdminRefreshToken='))!.split(';')[0];
      const res = await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'plataforma@auth.test.invalid', password, mfaCode: await syntheticPlatformMfa(prisma, 'plataforma@auth.test.invalid') }).expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const original = cookieDe(res);
      const r1 = await request(app.getHttpServer()).post('/api/admin/auth/refresh').set('Cookie', original).expect(200);
      expect(cookieDe(r1)).not.toBe(original);
      expect(maxAge(r1, 'superAdminRefreshToken')).toBeLessThanOrEqual(maxAge(res, 'superAdminRefreshToken'));
      await envejecerRotacion(sid, 121);
      await request(app.getHttpServer()).post('/api/admin/auth/refresh').set('Cookie', original).expect(401);
      await get('/auth/me', r1.body.accessToken).expect(401);
      expect((await fila(sid))!.revocationMotivo).toBe('REUTILIZACION_REFRESH');
    });
  });

  describe('CSRF en los endpoints con cookie (H-05)', () => {
    const ajeno = 'https://atacante.example';
    const local = 'http://localhost:5173';

    it('login, refresh y logout desde otro origen responden 403 sin crear, rotar ni cerrar sesiones', async () => {
      const antes = await prisma.sesionAuth.count();
      await request(app.getHttpServer()).post('/api/auth/login').set('Origin', ajeno).send({ email: 'admin@auth.test.invalid', password, tenantId }).expect(403);
      await request(app.getHttpServer()).post('/api/admin/auth/login').set('Origin', ajeno).send({ email: 'plataforma@auth.test.invalid', password, mfaCode: await syntheticPlatformMfa(prisma, 'plataforma@auth.test.invalid') }).expect(403);
      expect(await prisma.sesionAuth.count()).toBe(antes);

      const res = await login('admin@auth.test.invalid').set('Origin', local).expect(200);
      const sid = await sesionDe(res.body.accessToken);
      const jtiAntes = (await prisma.sesionAuth.findUnique({ where: { id: sid } }))!.refreshJti;
      await request(app.getHttpServer()).post('/api/auth/refresh').set('Origin', ajeno).set('Cookie', refreshCookie(res)).expect(403);
      await request(app.getHttpServer()).post('/api/auth/logout').set('Origin', ajeno).set('Cookie', refreshCookie(res)).expect(403);
      // Formulario HTML clásico: sin Origin en algunos navegadores antiguos, pero con Sec-Fetch-Site.
      await request(app.getHttpServer()).post('/api/auth/logout').set('Sec-Fetch-Site', 'cross-site').type('form').send('x=1').set('Cookie', refreshCookie(res)).expect(403);
      const fila = (await prisma.sesionAuth.findUnique({ where: { id: sid } }))!;
      expect(fila.revokedAt).toBeNull();
      expect(fila.refreshJti).toBe(jtiAntes);
      await get('/auth/me', res.body.accessToken).expect(200);

      await request(app.getHttpServer()).post('/api/auth/refresh').set('Origin', local).set('Cookie', refreshCookie(res)).expect(200);
      await request(app.getHttpServer()).post('/api/auth/logout').set('Origin', local).set('Cookie', refreshCookie(res)).expect(200);
    });

    it('frontend servido por un proxy en el mismo origen (sin FRONTEND_URL): Sec-Fetch-Site same-origin entra y renueva', async () => {
      const proxy = 'http://127.0.0.1:43587';
      const res = await login('admin@auth.test.invalid').set('Origin', proxy).set('Sec-Fetch-Site', 'same-origin').expect(200);
      await request(app.getHttpServer()).post('/api/auth/refresh').set('Origin', proxy).set('Sec-Fetch-Site', 'same-origin').set('Cookie', refreshCookie(res)).expect(200);
      // El mismo origen no autorizado sin la garantía del navegador sigue rechazado.
      await request(app.getHttpServer()).post('/api/auth/logout').set('Origin', proxy).set('Sec-Fetch-Site', 'cross-site').set('Cookie', refreshCookie(res)).expect(403);
    });

    it('los endpoints de API con Bearer no dependen del Origin (no usan la cookie)', async () => {
      const res = await login('admin@auth.test.invalid').expect(200);
      await get('/auth/me', res.body.accessToken).set('Origin', ajeno).expect(200);
    });
  });

  describe('contingencia offline y sesiones', () => {
    /** Un lote de una venta de 2 tornillos (20.00 + ISV 3.00), creado en el equipo mientras no había conexión. */
    async function ventanaYLote() {
      const ventanaRes = await contingencia.emitirVentana(tenantId, cajeroId, { dispositivoId } as any);
      // H-5: la operación usa un identificador emitido por la ventana (índice 0), como el equipo.
      const operacionId = ventanaRes.ventana.operacionesEmitidas[0];
      const lote = {
        dispositivoId, pendientesRestantes: 0,
        operaciones: [{
          operacionId, indiceOperacion: 0, dispositivoId, ventanaId: ventanaRes.ventana.id, secuenciaLocal: 1, correlativoLocal: 'CT-01-0001',
          ocurridoAtLocal: new Date().toISOString(), cajeroId,
          lineas: [{ productoId, cantidadCentesimas: 200, precioCentavos: 1000 }],
          subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200, esquemaVersion: 1,
        }],
      };
      return { operacionId, lote };
    }

    it('un lote enviado con la sesión cerrada no crea nada; tras volver a entrar, el mismo lote se aplica una sola vez', async () => {
      const { operacionId, lote } = await ventanaYLote();
      const stockAntes = Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual);

      // 1) El cajero cierra sesión con el lote todavía en cola local.
      const sesion = await login('cajero@auth.test.invalid').expect(200);
      await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', refreshCookie(sesion)).expect(200);

      // 2) El equipo intenta sincronizar con la sesión cerrada: 401, sin efectos.
      await request(app.getHttpServer()).post('/api/contingencia/operaciones').auth(sesion.body.accessToken, { type: 'bearer' }).send(lote).expect(401);
      expect(await prisma.venta.count({ where: { id: idSolicitud(tenantId, operacionId) } })).toBe(0);
      expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(stockAntes);

      // 3) Nueva sesión: el mismo UUID se aplica una vez.
      const nueva = await login('cajero@auth.test.invalid').expect(200);
      const primera = await request(app.getHttpServer()).post('/api/contingencia/operaciones').auth(nueva.body.accessToken, { type: 'bearer' }).send(lote).expect(201);
      expect(primera.body.resultados[0]).toMatchObject({ operacionId, estado: 'APLICADA' });
      expect(await prisma.venta.count({ where: { id: idSolicitud(tenantId, operacionId) } })).toBe(1);

      // 4) Reintento tras otro inicio de sesión: no duplica venta, caja ni stock.
      const otra = await login('cajero@auth.test.invalid').expect(200);
      await request(app.getHttpServer()).post('/api/contingencia/operaciones').auth(otra.body.accessToken, { type: 'bearer' }).send(lote).expect(201);
      expect(await prisma.venta.count({ where: { id: idSolicitud(tenantId, operacionId) } })).toBe(1);
      expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual)).toBe(stockAntes - 2);
    });

    it('la sesión de otro cajero no puede enviar el lote de este equipo: la operación se rechaza por operación y no crea venta', async () => {
      const { operacionId, lote } = await ventanaYLote();
      // La prueba de cambio de contraseña dejó a este usuario con la clave nueva.
      const ajena = await login('otro@auth.test.invalid', 'Nueva-Clave-2026!').expect(200);
      const res = await request(app.getHttpServer()).post('/api/contingencia/operaciones').auth(ajena.body.accessToken, { type: 'bearer' }).send(lote).expect(201);
      // El lote responde 201 con el resultado de cada operación: el rechazo viaja en el cuerpo, no como error HTTP.
      expect(res.body.resultados[0]).toMatchObject({ operacionId, estado: 'RECHAZADA_TECNICA' });
      expect(await prisma.venta.count({ where: { id: idSolicitud(tenantId, operacionId) } })).toBe(0);
    });
  });

  describe('validación final: sincronización, proxy, empresas y transición', () => {
    it('access token vencido: el refresh renueva la sesión y el lote pendiente se aplica una vez', async () => {
      const ventanaRes = await contingencia.emitirVentana(tenantId, cajeroId, { dispositivoId } as any);
      // H-5: la operación usa un identificador emitido por la ventana (índice 0), como el equipo.
      const operacionId = ventanaRes.ventana.operacionesEmitidas[0];
      const lote = { dispositivoId, pendientesRestantes: 0, operaciones: [{
        operacionId, indiceOperacion: 0, dispositivoId, ventanaId: ventanaRes.ventana.id, secuenciaLocal: 9, correlativoLocal: 'CT-01-0009',
        ocurridoAtLocal: new Date().toISOString(), cajeroId,
        lineas: [{ productoId, cantidadCentesimas: 100, precioCentavos: 1000 }],
        subtotalCentavos: 1000, isvCentavos: 150, totalCentavos: 1150, efectivoRecibidoCentavos: 1150, cambioCentavos: 0, esquemaVersion: 1,
      }] };
      const sesion = await login('cajero@auth.test.invalid').expect(200);
      // Access token ya vencido con el mismo sid; el refresh de la cookie sigue vigente.
      const vencido = jwt.sign({ sub: cajeroId, tenantId, email: 'cajero@auth.test.invalid', rol: 'CAJERO', type: 'tenant', sid: await sesionDe(sesion.body.accessToken), exp: Math.floor(Date.now() / 1000) - 60 }, { noTimestamp: true });
      await request(app.getHttpServer()).post('/api/contingencia/operaciones').auth(vencido, { type: 'bearer' }).send(lote).expect(401);
      const renovado = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', refreshCookie(sesion)).expect(200);
      const res = await request(app.getHttpServer()).post('/api/contingencia/operaciones').auth(renovado.body.accessToken, { type: 'bearer' }).send(lote).expect(201);
      expect(res.body.resultados[0]).toMatchObject({ operacionId, estado: 'APLICADA' });
      expect(await prisma.venta.count({ where: { id: idSolicitud(tenantId, operacionId) } })).toBe(1);
    });

    it('con TRUST_PROXY=1, un X-Forwarded-For falsificado por el cliente no cambia el cubo: se usa la IP que añade el proxy', async () => {
      const instancia = app.getHttpAdapter().getInstance();
      instancia.set('trust proxy', 1);
      const previo = env.AUTH_LOGIN_MAX_FALLOS_IP;
      env.AUTH_LOGIN_MAX_FALLOS_IP = '2';
      try {
        // El cliente real es 203.0.113.50; el proxy añade esa IP al final de la cadena.
        await login('y1@auth.test.invalid', 'mala-clave').set('X-Forwarded-For', '10.66.66.1, 203.0.113.50').expect(401);
        await login('y2@auth.test.invalid', 'mala-clave').set('X-Forwarded-For', '10.66.66.2, 203.0.113.50').expect(401);
        await login('admin@auth.test.invalid').set('X-Forwarded-For', '10.66.66.3, 203.0.113.50').expect(429);
        await login('admin@auth.test.invalid').set('X-Forwarded-For', '10.66.66.4, 198.51.100.1').expect(200);
      } finally {
        env.AUTH_LOGIN_MAX_FALLOS_IP = previo;
        instancia.set('trust proxy', false);
      }
    });

    it('un token con el sid de una sesión de otra empresa no autoriza, aunque la firma sea válida', async () => {
      const otraEmpresa = randomUUID();
      const otroUsuario = randomUUID();
      await prisma.tenant.create({ data: { id: otraEmpresa, nombreComercial: 'Otra empresa', estado: 'ACTIVO' } });
      await prisma.usuario.create({ data: { id: otroUsuario, tenantId: otraEmpresa, nombre: 'Ajeno', email: 'ajeno@auth.test.invalid', passwordHash: await bcrypt.hash(password, 4), rol: 'ADMIN', permisosConfigurados: false, permisos: [] } as any });
      const sesionAjena = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'ajeno@auth.test.invalid', password, tenantId: otraEmpresa }).expect(200);
      const sidAjeno = await sesionDe(sesionAjena.body.accessToken);
      // Sujeto de la empresa A con el sid de la empresa B y tenantId de A: no coincide con la sesión.
      const cruzado = jwt.sign({ sub: adminId, tenantId, type: 'tenant', rol: 'ADMIN', sid: sidAjeno });
      await get('/auth/me', cruzado).expect(401);
      // Mismo sid con tenantId de B: el usuario no existe en B con ese id.
      const cruzadoB = jwt.sign({ sub: adminId, tenantId: otraEmpresa, type: 'tenant', rol: 'ADMIN', sid: sidAjeno });
      await get('/auth/me', cruzadoB).expect(401);
    });

    it('transición con fecha límite vencida: un token sin sesión deja de aceptarse sin reiniciar la API', async () => {
      const sinSesion = jwt.sign({ sub: adminId, tenantId, type: 'tenant', rol: 'ADMIN' }, { expiresIn: '5m' });
      const config = { get: (k: string) => (k === 'JWT_SECRET' ? secret : k === 'AUTH_ACEPTAR_TOKENS_SIN_SESION' ? 'true' : k === 'NODE_ENV' ? 'production' : k === 'AUTH_TOKENS_SIN_SESION_HASTA' ? new Date(Date.now() + 2000).toISOString() : undefined) } as unknown as ConfigService;
      const estrategia = new JwtStrategy(config, prisma);
      await expect(estrategia.validate(jwt.decode(sinSesion))).resolves.toMatchObject({ sub: adminId });
      await new Promise(r => setTimeout(r, 2100));
      await expect(estrategia.validate(jwt.decode(sinSesion))).rejects.toThrow(UnauthorizedException);
      expect(leerConfiguracionAuth({ get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined) }).aceptarTokensSinSesion).toBe(false);
    });
  });
});
