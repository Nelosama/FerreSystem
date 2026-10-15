import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { SuperAdminService } from '../src/super-admin/super-admin.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { crearSesion, sesionVigente } from '../src/auth/sesiones-auth';

// Administración en PostgreSQL real (clúster temporal y dedicado; ejecutar sin root porque initdb lo exige):
// concurrencia del último administrador, aislamiento entre empresas, usuario desactivado y ciclo de soporte con sesiones reales.
describe('Administración · usuarios, soporte y tenant cruzado / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  const config = { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? secret : fallback) } as unknown as ConfigService;
  const T1 = randomUUID(), T2 = randomUUID(), T3 = randomUUID();
  const A1 = randomUUID(), A2 = randomUUID(), C1 = randomUUID(), B1 = randomUUID(), S1 = randomUUID(), SA = randomUUID();
  let directory: string;
  let started = false;
  let prisma: PrismaService;
  let usuarios: UsuariosService;
  let superAdmin: SuperAdminService;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-admin-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const entorno = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres', PGSSLMODE: 'disable' };
    const opciones = { windowsHide: true, timeout: 60000, env: entorno, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], opciones);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...opciones, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], opciones);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    usuarios = new UsuariosService(prisma);
    superAdmin = new SuperAdminService(prisma, jwt, config);

    const hash = '$2b$04$abcdefghijklmnopqrstuuqVvtb4f5gt8nkPDZ2h7hWxuCJ0uyV6W'; // hash ficticio: nunca se valida contraseña aquí
    for (const [id, nombre, estado] of [[T1, 'Empresa uno', 'ACTIVO'], [T2, 'Empresa dos', 'ACTIVO'], [T3, 'Empresa suspendida', 'SUSPENDIDO']] as const) {
      await prisma.tenant.create({ data: { id, nombreComercial: nombre, estado: estado as any } });
    }
    const usuario = (id: string, tenantId: string, rol: string, email: string) =>
      prisma.usuario.create({ data: { id, tenantId, nombre: email, email, passwordHash: hash, rol: rol as any, permisosConfigurados: false, permisos: [] } });
    await usuario(A1, T1, 'ADMIN', 'a1@t1.test.invalid');
    await usuario(A2, T1, 'ADMIN', 'a2@t1.test.invalid');
    await usuario(C1, T1, 'CAJERO', 'c1@t1.test.invalid');
    await usuario(B1, T2, 'ADMIN', 'b1@t2.test.invalid');
    await usuario('00000000-0000-4000-8000-000000000003', T3, 'ADMIN', 'x@t3.test.invalid');
    await prisma.superAdmin.create({ data: { id: SA, nombre: 'Plataforma', email: 'plataforma@test.invalid', passwordHash: hash, activo: true } as any });
    await crearSesion(prisma, { id: S1, tipo: 'SUPER_ADMIN', sujetoId: SA, expiresAt: new Date(Date.now() + 3_600_000) });
  }, 240000);

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-admin-')) rmSync(directory, { recursive: true, force: true });
    }
  });

  const activos = (tenantId: string, rol = 'ADMIN') => prisma.usuario.count({ where: { tenantId, rol: rol as any, activo: true } });
  // Qué administrador de T1 sigue activo depende del orden de la prueba concurrente: las pruebas usan el que quede.
  const adminActivo = async (tenantId: string) => (await prisma.usuario.findFirstOrThrow({ where: { tenantId, rol: 'ADMIN', activo: true } })).id;

  it('concurrencia: dos administradores que se desactivan entre sí a la vez no dejan la empresa sin administrador', async () => {
    const resultados = await Promise.allSettled([usuarios.remove(T1, A2, A1), usuarios.remove(T1, A1, A2)]);
    const ok = resultados.filter(r => r.status === 'fulfilled');
    const rechazados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    // La segunda operación pierde la autorización de su actor (ya desactivado por la primera) o el último administrador: ambas son rechazos válidos.
    expect(rechazados[0].reason instanceof ForbiddenException || rechazados[0].reason instanceof ConflictException).toBe(true);
    expect(await activos(T1)).toBe(1);
  });

  it('la desactivación no borra la fila y deja auditoría con quién lo hizo', async () => {
    const restante = await adminActivo(T1);
    const desactivado = restante === A1 ? A2 : A1;
    expect(await prisma.usuario.count({ where: { id: desactivado } })).toBe(1);
    const fila = await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId: T1, operacion: 'USUARIO_DESACTIVAR', entidadId: desactivado } });
    expect(fila.usuarioId).toBeDefined();
    expect(fila.datos).toMatchObject({ anterior: expect.objectContaining({ activo: true }), nuevo: expect.objectContaining({ activo: false }) });
  });

  it('un administrador no puede desactivar su propia cuenta', async () => {
    const restante = await adminActivo(T1);
    await expect(usuarios.remove(T1, restante, restante)).rejects.toBeInstanceOf(ConflictException);
    expect(await activos(T1)).toBe(1);
  });

  it('aislamiento: no se puede desactivar, editar ni leer un usuario de otra empresa', async () => {
    const actorT1 = await adminActivo(T1);
    await expect(usuarios.remove(T1, B1, actorT1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(usuarios.update(T2, C1, { nombre: 'Robado' }, B1)).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: B1 } })).activo).toBe(true);
  });

  it('usuario desactivado: su sesión y su token dejan de autorizar', async () => {
    const sid = randomUUID();
    await crearSesion(prisma, { id: sid, tipo: 'TENANT', sujetoId: C1, tenantId: T1, expiresAt: new Date(Date.now() + 3_600_000) });
    const estrategia = new JwtStrategy(config, prisma);
    const payload = { sub: C1, tenantId: T1, email: 'c1@t1.test.invalid', type: 'tenant', sid };
    await expect(estrategia.validate(payload)).resolves.toMatchObject({ sub: C1, type: 'tenant' });
    await usuarios.remove(T1, C1, await adminActivo(T1));
    await expect(estrategia.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await sesionVigente(prisma, sid, C1)).toBe(false);
  });

  it('ciclo de soporte real: inicio, uso, fin revocado y trazabilidad por empresa', async () => {
    const motivo = '[Reporte de error] Caja no cuadra en prueba';
    const { accessToken, user } = await superAdmin.supportToken(SA, T2, B1, true, { motivo });
    expect(user.id).toBe(B1);
    const decodificado = jwt.decode<{ sid: string; soporteSesionId: string; impersonatedBy: string; readOnly: boolean }>(accessToken);
    expect(decodificado).toMatchObject({ impersonatedBy: SA, readOnly: true });
    expect(await sesionVigente(prisma, decodificado.sid, B1)).toBe(true);

    await superAdmin.finalizarSoporte({ sub: B1, tenantId: T2, impersonatedBy: SA, soporteSesionId: decodificado.soporteSesionId, sid: decodificado.sid, readOnly: true });
    expect(await sesionVigente(prisma, decodificado.sid, B1)).toBe(false);

    const traza = await superAdmin.trazaSoporte(T2);
    const inicio = traza.find(t => t.operacion === 'SOPORTE_IMPERSONAR');
    const fin = traza.find(t => t.operacion === 'SOPORTE_FINALIZAR');
    expect(inicio).toMatchObject({ superAdminId: SA, soporteSesionId: decodificado.soporteSesionId, modo: 'SOLO_LECTURA', motivo });
    expect(fin).toMatchObject({ superAdminId: SA, soporteSesionId: decodificado.soporteSesionId, resultado: 'FINALIZADA' });
    expect(traza.every(t => t.tenantId === T2)).toBe(true);
  });

  it('soporte: no se abre sobre usuarios inactivos, empresas suspendidas ni sin motivo suficiente', async () => {
    await expect(superAdmin.supportToken(SA, T2, C1, true, { motivo: 'motivo válido largo' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(superAdmin.supportToken(SA, T3, '00000000-0000-4000-8000-000000000003', true, { motivo: 'motivo válido largo' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(superAdmin.supportToken(SA, T2, B1, true, { motivo: 'corto' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(superAdmin.supportToken(SA, T2, B1, false, { motivo: 'escritura sin confirmar' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('soporte: un Super Admin desactivado no puede abrir soporte', async () => {
    await prisma.superAdmin.update({ where: { id: SA }, data: { activo: false } as any });
    try {
      await expect(superAdmin.supportToken(SA, T2, B1, true, { motivo: 'motivo válido largo' })).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await prisma.superAdmin.update({ where: { id: SA }, data: { activo: true } as any });
    }
  });
});
