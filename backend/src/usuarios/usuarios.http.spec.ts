import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

// Matriz de permisos HTTP del módulo de usuarios: guards y JWT reales; la base de datos es simulada en memoria.
const SECRET = 'matriz-usuarios-test-secret-0123456789abcdef0123456789';
const ROLES = ['CAJERO', 'VENDEDOR', 'BODEGUERO'] as const;

describe('Matriz de permisos · módulo de usuarios (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let usuarios: Record<string, any>;
  let sesiones: Set<string>;
  let prisma: any;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  const tokenDe = (usuarioId: string, tenantId = 't1', sid = `s-${usuarioId}`) => jwt.sign({ sub: usuarioId, tenantId, email: `${usuarioId}@t.test`, type: 'tenant', sid }, { expiresIn: '5m' });

  beforeEach(async () => {
    usuarios = {
      admin: { id: 'admin', tenantId: 't1', rol: 'ADMIN', activo: true },
      admin2: { id: 'admin2', tenantId: 't1', rol: 'ADMIN', activo: true },
      adminInactivo: { id: 'adminInactivo', tenantId: 't1', rol: 'ADMIN', activo: false },
      adminOtra: { id: 'adminOtra', tenantId: 't2', rol: 'ADMIN', activo: true },
      cajero: { id: 'cajero', tenantId: 't1', rol: 'CAJERO', activo: true },
      vendedor: { id: 'vendedor', tenantId: 't1', rol: 'VENDEDOR', activo: true },
      bodeguero: { id: 'bodeguero', tenantId: 't1', rol: 'BODEGUERO', activo: true },
    };
    sesiones = new Set(Object.keys(usuarios).map(id => `s-${id}`));
    prisma = {
      usuario: {
        findFirst: vi.fn(async ({ where }: any) => {
          const u = Object.values(usuarios).find((x: any) => x.id === where.id && x.tenantId === where.tenantId && (where.activo === undefined || x.activo === where.activo));
          return u ? { ...u, permisos: [], permisosConfigurados: false, descuentoMaximo: 0, tenant: { estado: 'ACTIVO' } } : null;
        }),
      },
      superAdmin: { findUnique: vi.fn(async () => ({ activo: true })) },
      sesionAuth: { findUnique: vi.fn(async ({ where }: any) => (sesiones.has(where.id) ? { sujetoId: where.id.replace(/^s-/, ''), revokedAt: null, expiresAt: new Date(Date.now() + 600_000) } : null)) },
    };
    service = {
      findAll: vi.fn(async () => []), findById: vi.fn(async () => ({ id: 'x' })), create: vi.fn(async () => ({ id: 'nuevo' })),
      update: vi.fn(async () => ({ id: 'x' })), remove: vi.fn(async () => ({ id: 'x', activo: false })),
    };
    const module = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) } },
        { provide: UsuariosService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = new JwtService({ secret: SECRET });
  });
  afterEach(async () => { await app?.close(); });

  const http = () => request(app.getHttpServer());
  const llamadas = [
    ['listar', (t: string) => http().get('/usuarios').set('Authorization', `Bearer ${t}`)],
    ['crear', (t: string) => http().post('/usuarios').set('Authorization', `Bearer ${t}`).send({ nombre: 'N', email: 'n@t.hn', password: 'Clave-Segura-2026!' })],
    ['editar', (t: string) => http().put('/usuarios/cajero').set('Authorization', `Bearer ${t}`).send({ nombre: 'N2' })],
    ['desactivar', (t: string) => http().delete('/usuarios/cajero').set('Authorization', `Bearer ${t}`)],
  ] as const;

  it('ADMIN de la empresa: puede listar, crear, editar y desactivar', async () => {
    const t = tokenDe('admin');
    expect((await llamadas[0][1](t)).status).toBe(200);
    expect((await llamadas[1][1](t)).status).toBe(201);
    expect((await llamadas[2][1](t)).status).toBe(200);
    expect((await llamadas[3][1](t)).status).toBe(200);
    expect(service.remove).toHaveBeenCalledWith('t1', 'cajero', 'admin');
  });

  it.each(ROLES)('%s: ninguna operación de administración de usuarios (403) y el servicio no se invoca', async (rol) => {
    const t = tokenDe(rol.toLowerCase());
    for (const [, llamada] of llamadas) expect((await llamada(t)).status).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('Super Admin con token de plataforma: no administra usuarios de empresa (403)', async () => {
    sesiones.add('s-sa-1');
    const tokenSA = jwt.sign({ sub: 'sa-1', email: 'sa@p.test', type: 'super_admin', sid: 's-sa-1' }, { expiresIn: '5m' });
    for (const [, llamada] of llamadas) expect((await llamada(tokenSA)).status).toBe(403);
  });

  it('administrador desactivado: 401 aunque su token no haya vencido', async () => {
    expect((await llamadas[0][1](tokenDe('adminInactivo'))).status).toBe(401);
  });

  it('token de un administrador de otra empresa presentado con tenant t1: 401 (no se falsifica la empresa)', async () => {
    const falsificado = tokenDe('adminOtra', 't1', 's-adminOtra');
    expect((await llamadas[0][1](falsificado)).status).toBe(401);
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('sin token o con token malformado: 401', async () => {
    expect((await http().get('/usuarios')).status).toBe(401);
    expect((await http().get('/usuarios').set('Authorization', 'Bearer no-es-jwt')).status).toBe(401);
  });

  it('sesión revocada: 401 aunque la firma y el vencimiento sean válidos', async () => {
    sesiones.delete('s-admin');
    expect((await llamadas[0][1](tokenDe('admin'))).status).toBe(401);
  });
});
