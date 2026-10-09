import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { SupportAuditInterceptor } from '../src/common/interceptors/support-audit.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';

// Clúster PostgreSQL desechable; nunca usa DATABASE_URL externo ni datos reales.
describe('SEC-012 / auditoría de soporte en PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication, started = false;
  let tenantId: string, usuarioId: string, superAdminId: string, cuentaId: string, sesionId: string;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-sec012-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [OperacionesController],
      providers: [OperacionesService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: SupportAuditInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 120000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-sec012-')) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID(); usuarioId = randomUUID(); superAdminId = randomUUID(); cuentaId = randomUUID(); sesionId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'SEC-012 sintético' } });
    await prisma.usuario.create({ data: { id: usuarioId, tenantId, nombre: 'ADMIN', email: `${usuarioId}@test.invalid`, passwordHash: 'no-es-clave', rol: 'ADMIN' } });
    await prisma.superAdmin.create({ data: { id: superAdminId, nombre: 'SA', email: `${superAdminId}@test.invalid`, passwordHash: 'no-es-clave' } });
    await prisma.caja.create({ data: { tenantId, usuarioId, codigo: `C-${usuarioId}`, montoApertura: 1000 } });
    const proveedor = await prisma.proveedor.create({ data: { tenantId, nombre: 'Proveedor sintético' } });
    await prisma.cuentaOperativa.create({ data: { id: cuentaId, tenantId, tipo: 'CXP', proveedorId: proveedor.id, documentoId: randomUUID(), monto: 1000, saldo: 1000, usuarioId } });
  });

  const token = (readOnly: boolean, extra: object = {}) => jwt.sign({ sub: usuarioId, tenantId, type: 'tenant', email: 'x@test.invalid', impersonatedBy: superAdminId, soporteSesionId: sesionId, readOnly, ...extra }, { expiresIn: '5m' });
  const pagar = (t: string, id = cuentaId, monto = 300) => request(app.getHttpServer()).post(`/operaciones/cuentas/${id}/pagos`).set('Authorization', `Bearer ${t}`).send({ solicitudId: randomUUID(), monto, metodo: 'EFECTIVO' });
  const saldo = async () => Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuentaId } })).saldo);
  const auditoria = () => prisma.auditoriaOperacion.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  const bloquearAuditoria = async (operacion: string, fn: () => Promise<void>) => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fallo_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operacion = '${operacion}' THEN RAISE EXCEPTION 'Fallo sintético de auditoría'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fallo_auditoria BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION fallo_auditoria()');
    try { await fn(); } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fallo_auditoria ON auditoria_operaciones');
      await prisma.$executeRawUnsafe('DROP FUNCTION fallo_auditoria()');
    }
  };

  it('pago autorizado: queda atribuido al Super Admin real, con inicio, resultado y misma sesión', async () => {
    await pagar(token(false)).expect(201);
    expect(await saldo()).toBe(700);
    await vi.waitFor(async () => expect((await auditoria()).map(a => a.operacion).sort()).toEqual(['CUENTA_PAGAR', 'SOPORTE_ESCRITURA_INICIO', 'SOPORTE_ESCRITURA_RESULTADO']));
    const filas = await auditoria();
    for (const fila of filas) {
      expect(fila.tenantId).toBe(tenantId);
      expect(fila.usuarioId).toBe(usuarioId);
      expect((fila.datos as any)._soporte).toMatchObject({ superAdminId, soporteSesionId: sesionId });
    }
    expect((filas.find(a => a.operacion === 'CUENTA_PAGAR')!.datos as any)._soporte.resultado).toBe('OK');
    expect(JSON.stringify(filas)).not.toContain('Bearer');
    // La operación y su evidencia se pueden cruzar en SQL por el Super Admin responsable.
    const [quien] = await prisma.$queryRawUnsafe<any[]>(`SELECT datos->'_soporte'->>'superAdminId' AS sa FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CUENTA_PAGAR'`, tenantId);
    expect(quien.sa).toBe(superAdminId);
  });

  it('solo lectura: 403, saldo y caja intactos, y queda el intento denegado', async () => {
    await pagar(token(true)).expect(403);
    expect(await saldo()).toBe(1000);
    expect(await prisma.pagoCuenta.count({ where: { tenantId } })).toBe(0);
    await vi.waitFor(async () => expect((await auditoria()).map(a => a.operacion)).toEqual(['SOPORTE_ESCRITURA_DENEGADA']));
  });

  it('atomicidad: si la auditoría de la operación falla, el pago y el movimiento de caja se revierten', async () => {
    await bloquearAuditoria('CUENTA_PAGAR', async () => { await pagar(token(false)).expect(500); });
    expect(await saldo()).toBe(1000);
    expect(await prisma.pagoCuenta.count({ where: { tenantId } })).toBe(0);
    const movimientos = await prisma.$queryRawUnsafe<any[]>("SELECT m.id FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1 AND m.tipo='PAGO_CXP'", tenantId);
    expect(movimientos).toHaveLength(0);
  });

  it('si no se puede registrar la evidencia previa de soporte, la escritura no se ejecuta', async () => {
    await bloquearAuditoria('SOPORTE_ESCRITURA_INICIO', async () => { await pagar(token(false)).expect(500); });
    expect(await saldo()).toBe(1000);
    expect(await prisma.pagoCuenta.count({ where: { tenantId } })).toBe(0);
  });

  it('aislamiento: no se puede pagar la cuenta de otro tenant y no se altera', async () => {
    const otro = randomUUID(); const otroUsuario = randomUUID();
    await prisma.tenant.create({ data: { id: otro, nombreComercial: 'Otro' } });
    await prisma.usuario.create({ data: { id: otroUsuario, tenantId: otro, nombre: 'ADMIN', email: `${otroUsuario}@test.invalid`, passwordHash: 'x', rol: 'ADMIN' } });
    await pagar(token(false, { tenantId: otro })).expect(401); // el usuario del tenant A no existe en B
    await prisma.caja.create({ data: { tenantId: otro, usuarioId: otroUsuario, codigo: `C-${otroUsuario}`, montoApertura: 1000 } });
    const tokenOtro = jwt.sign({ sub: otroUsuario, tenantId: otro, type: 'tenant', email: 'o@test.invalid', impersonatedBy: superAdminId, soporteSesionId: sesionId, readOnly: false }, { expiresIn: '5m' });
    await pagar(tokenOtro).expect(404);
    expect(await saldo()).toBe(1000);
  });

  it('Super Admin desactivado: el token de soporte deja de ser válido de inmediato', async () => {
    await prisma.superAdmin.update({ where: { id: superAdminId }, data: { activo: false } });
    await pagar(token(false)).expect(401);
    expect(await saldo()).toBe(1000);
  });
});
