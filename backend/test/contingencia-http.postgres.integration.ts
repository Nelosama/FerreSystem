import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaController } from '../src/contingencia/contingencia.controller';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';

// H5 por HTTP real (FARO): errores 4xx de POST /api/contingencia/operaciones con PostgreSQL temporal, login JWT real,
// ValidationPipe y guardas como en producción. Cada prueba comprueba el estado de la base antes y después.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Contingencia H5 por HTTP: 4xx en recepción offline / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  let svc: ContingenciaService;
  const jwtSecret = randomUUID();
  const jwt = new JwtService({ secret: jwtSecret });
  const password = 'h5-http-verificacion';

  beforeAll(async () => {
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-http-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((done) => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const options = { windowsHide: true, timeout: 60000, stdio: 'pipe' as const };
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
    svc = new ContingenciaService(prisma);
    const module = await Test.createTestingModule({
      controllers: [ContingenciaController, AuthController],
      providers: [ContingenciaService, JwtStrategy, AuthService,
        { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => key === 'JWT_SECRET' ? jwtSecret : fallback } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalGuards(new TenantModuleGuard(module.get(Reflector), prisma));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
  }, 240000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-http-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  const http = (method: 'get' | 'post', path: string, token: string, body?: unknown) => {
    const ruta = `/api${path}`;
    const req = request(app.getHttpServer())[method](ruta).auth(token, { type: 'bearer' });
    return body === undefined ? req : req.send(body as object);
  };

  async function persona(tenantId: string, rol: string, permisos: string[] = []) {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId, rol: rol as any, nombre: `${rol} ${id.slice(0, 4)}`, email: `${id}@example.test`, passwordHash: await bcrypt.hash(password, 4), permisosConfigurados: true, permisos } as any });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: `${id}@example.test`, password, tenantId }).expect(200);
    return { id, token: login.body.accessToken as string };
  }

  /** Empresa con cajero (pos.vender), caja abierta, producto aprobado y ventana emitida para un equipo registrado. */
  async function empresa() {
    const tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'H5 HTTP', estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: true } } as any } });
    const admin = await persona(tenantId, 'ADMIN');
    const cajero = await persona(tenantId, 'CAJERO', ['pos.vender']);
    await prisma.caja.create({ data: { tenantId, codigo: 'CAJA-1', usuarioId: cajero.id, montoApertura: 100, estado: 'ABIERTA' } as any });
    const p1 = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    const equipoId = randomUUID();
    await svc.registrarDispositivo(tenantId, cajero.id, { dispositivoId: equipoId, nombre: 'Caja principal' });
    const { ventana } = await svc.emitirVentana(tenantId, cajero.id, { dispositivoId: equipoId });
    return { tenantId, admin, cajero, p1: p1.id, equipoId, ventanaId: ventana.id as string };
  }

  const operacion = (e: any, extra: Record<string, any> = {}) => ({
    operacionId: randomUUID(), dispositivoId: e.equipoId, ventanaId: e.ventanaId, secuenciaLocal: 900 + Math.floor(Math.random() * 1000),
    correlativoLocal: 'CT-01-0900', ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero.id,
    lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }],
    subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
    esquemaVersion: 1, ...extra,
  });
  const lote = (e: any, operaciones: any[]) => ({ dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones });
  const conteos = async (tenantId: string) => ({
    ventas: await prisma.venta.count({ where: { tenantId } }),
    filas: await prisma.operacionContingencia.count({ where: { tenantId } }),
    auditorias: await prisma.auditoriaOperacion.count({ where: { tenantId } }),
    movimientosCaja: await prisma.movimientoCaja.count({ where: { caja: { tenantId } } }),
  });

  it('4xx por rol sin permiso pos.vender: 403, sin fila, sin venta, sin movimientos', async () => {
    const e = await empresa();
    const sinPermiso = await persona(e.tenantId, 'CAJERO', []);
    const antes = await conteos(e.tenantId);
    const r = await http('post', '/contingencia/operaciones', sinPermiso.token, lote(e, [operacion(e)]));
    expect(r.status).toBe(403);
    expect(await conteos(e.tenantId)).toEqual(antes);
  });

  it('4xx por formato inválido: 400 sin fila ni venta; un reenvío válido con el mismo lote se aplica una sola vez', async () => {
    const e = await empresa();
    const buena = operacion(e);
    const mala = { ...operacion(e), correlativoLocal: 'no-valido' };
    const antes = await conteos(e.tenantId);
    const r400 = await http('post', '/contingencia/operaciones', e.cajero.token, lote(e, [mala]));
    expect(r400.status).toBe(400);
    expect(await conteos(e.tenantId)).toEqual(antes);
    const ok = await http('post', '/contingencia/operaciones', e.cajero.token, lote(e, [buena]));
    expect(ok.status).toBeLessThan(300);
    expect(ok.body.resultados[0]).toMatchObject({ operacionId: buena.operacionId, estado: 'APLICADA' });
    const tras = await http('post', '/contingencia/operaciones', e.cajero.token, lote(e, [buena]));
    expect(tras.status).toBeLessThan(300);
    expect((await conteos(e.tenantId)).ventas).toBe(antes.ventas + 1);
  });

  it('rechazo definitivo por HTTP (2xx con RECHAZADA_TECNICA): sin venta, consulta igual a la primera respuesta, reenvío sin duplicar', async () => {
    const e = await empresa();
    const op = operacion(e, { cajeroId: e.admin.id });
    const antes = await conteos(e.tenantId);
    const primera = await http('post', '/contingencia/operaciones', e.cajero.token, lote(e, [op]));
    expect(primera.status).toBeLessThan(300);
    const r1 = primera.body.resultados[0];
    expect(r1).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'CAJERO_NO_AUTORIZADO' });
    // La operación está atribuida al administrador: la consulta la hace quien puede verla (un cajero no ve operaciones de otro).
    const consulta = await http('get', `/contingencia/operaciones/estados?ids=${op.operacionId}`, e.admin.token);
    expect(consulta.status).toBe(200);
    expect(consulta.body[0]).toMatchObject({ estado: r1.estado, codigo: r1.codigo, mensaje: r1.mensaje, instruccion: r1.instruccion });
    const reenvio = await http('post', '/contingencia/operaciones', e.cajero.token, lote(e, [op]));
    expect(reenvio.body.resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'CAJERO_NO_AUTORIZADO' });
    const despues = await conteos(e.tenantId);
    expect(despues.ventas).toBe(antes.ventas);
    expect(despues.movimientosCaja).toBe(antes.movimientosCaja);
    expect(despues.filas).toBe(antes.filas + 1);
  });
});
