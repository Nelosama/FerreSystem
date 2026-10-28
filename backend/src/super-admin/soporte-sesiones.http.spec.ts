import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { TenantsService } from '../tenants/tenants.service';
import { TenantLogoService } from '../tenants/tenant-logo.service';
import { SupportAuditInterceptor } from '../common/interceptors/support-audit.interceptor';

// Pruebas HTTP reales de guards, JWT, interceptor y servicio. Solo la base de datos es simulada en memoria.
const SECRET = 'soporte-sesiones-test-secret-0123456789abcdef0123456789';

describe('Soporte remoto · usuarios reales, fin de sesión y trazabilidad (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let sesiones: Map<string, { sujetoId: string; revokedAt: Date | null; revocationMotivo: string | null; expiresAt: Date }>;
  let auditorias: any[];
  let usuarios: any[];
  let prisma: any;
  let usuarioFindManyArgs: any;

  const SA = () => jwt.sign({ sub: 'sa-1', email: 'sa@ferresystem.test', type: 'super_admin' }, { expiresIn: '5m' });
  const tenantAdmin = () => jwt.sign({ sub: 'u-admin', tenantId: 't1', email: 'admin@t1.hn', type: 'tenant', sid: 's-admin' }, { expiresIn: '5m' });
  const soporteToken = (sid = 's-soporte', readOnly = true) => jwt.sign({
    sub: 'u-admin', tenantId: 't1', email: 'admin@t1.hn', type: 'tenant', impersonatedBy: 'sa-1', soporteSesionId: 'ses-1', readOnly, sid,
  }, { expiresIn: '5m' });

  beforeEach(async () => {
    sesiones = new Map([
      ['s-admin', { sujetoId: 'u-admin', revokedAt: null, revocationMotivo: null, expiresAt: new Date(Date.now() + 3_600_000) }],
      ['s-soporte', { sujetoId: 'u-admin', revokedAt: null, revocationMotivo: null, expiresAt: new Date(Date.now() + 900_000) }],
    ]);
    auditorias = [];
    usuarios = [
      { id: 'u-admin', tenantId: 't1', nombre: 'Dueño', email: 'admin@t1.hn', rol: 'ADMIN', activo: true, passwordHash: 'HASH-SECRETO', permisos: [], permisosConfigurados: false, descuentoMaximo: 0, tenant: { estado: 'ACTIVO' } },
      { id: 'u-caja', tenantId: 't1', nombre: 'Caja', email: 'caja@t1.hn', rol: 'CAJERO', activo: false, passwordHash: 'x', permisos: [], permisosConfigurados: false, descuentoMaximo: 0, tenant: { estado: 'ACTIVO' } },
      { id: 'u-b', tenantId: 't1', nombre: 'Bodega', email: 'bod@t1.hn', rol: 'BODEGUERO', activo: true, passwordHash: 'x', permisos: [], permisosConfigurados: false, descuentoMaximo: 0, tenant: { estado: 'ACTIVO' } },
    ];
    prisma = {
      tenant: { findUnique: vi.fn(async ({ where }: any) => (where.id === 't1' ? { id: 't1', estado: 'ACTIVO' } : null)) },
      usuario: {
        findFirst: vi.fn(async ({ where }: any) => usuarios.find(u => u.id === where.id && u.tenantId === where.tenantId && u.activo === (where.activo ?? u.activo)) ?? null),
        findMany: vi.fn(async (args: any) => { usuarioFindManyArgs = args; return usuarios.filter(u => u.tenantId === args.where.tenantId && u.activo).map(({ id, nombre, email, rol }) => ({ id, nombre, email, rol })); }),
      },
      superAdmin: { findUnique: vi.fn(async ({ where }: any) => (where.id === 'sa-1' ? { id: 'sa-1', email: 'sa@ferresystem.test', activo: true } : null)) },
      sesionAuth: {
        create: vi.fn(async ({ data }: any) => { sesiones.set(data.id, { sujetoId: data.sujetoId, revokedAt: null, revocationMotivo: null, expiresAt: data.expiresAt }); return data; }),
        findUnique: vi.fn(async ({ where }: any) => { const s = sesiones.get(where.id); return s ? { sujetoId: s.sujetoId, revokedAt: s.revokedAt, expiresAt: s.expiresAt } : null; }),
        updateMany: vi.fn(async ({ where, data }: any) => { const s = sesiones.get(where.id); if (s && s.revokedAt === null) Object.assign(s, data); return { count: s ? 1 : 0 }; }),
      },
      auditoriaOperacion: {
        create: vi.fn(async ({ data }: any) => { const row = { id: `aud-${auditorias.length + 1}`, createdAt: new Date(), ...data }; auditorias.push(row); return row; }),
        findMany: vi.fn(async ({ where }: any) => auditorias.filter(a => where.operacion.in.includes(a.operacion) && (!where.tenantId || a.tenantId === where.tenantId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
      },
    };
    const module = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [
        JwtStrategy,
        SuperAdminService,
        // Servicios de configuración y logotipo: estas pruebas cubren soporte y sesiones, no el logotipo.
        { provide: TenantsService, useValue: {} },
        { provide: TenantLogoService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => (key === 'JWT_SECRET' ? SECRET : undefined) } },
        { provide: JwtService, useValue: new JwtService({ secret: SECRET }) },
        { provide: APP_INTERCEPTOR, useClass: SupportAuditInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = new JwtService({ secret: SECRET });
  });
  afterEach(async () => { await app?.close(); });

  const http = () => request(app.getHttpServer());

  describe('usuarios reales de la empresa', () => {
    it('Super Admin ve solo usuarios activos, con campos mínimos y sin hash ni permisos', async () => {
      const res = await http().get('/admin/tenants/t1/usuarios').set('Authorization', `Bearer ${SA()}`);
      expect(res.status).toBe(200);
      expect(res.body.usuarios.map((u: any) => u.email)).toEqual(['admin@t1.hn', 'bod@t1.hn']);
      expect(JSON.stringify(res.body)).not.toContain('HASH-SECRETO');
      expect(Object.keys(res.body.usuarios[0]).sort()).toEqual(['email', 'id', 'nombre', 'rol']);
      expect(usuarioFindManyArgs.select).not.toHaveProperty('passwordHash');
      expect(usuarioFindManyArgs.where).toMatchObject({ tenantId: 't1', activo: true });
    });

    it('empresa inexistente responde 404 sin revelar usuarios', async () => {
      const res = await http().get('/admin/tenants/otra/usuarios').set('Authorization', `Bearer ${SA()}`);
      expect(res.status).toBe(404);
    });

    it('un administrador de empresa no puede listar usuarios de ninguna empresa', async () => {
      const res = await http().get('/admin/tenants/t1/usuarios').set('Authorization', `Bearer ${tenantAdmin()}`);
      expect(res.status).toBe(403);
      expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    });

    it('sin token no hay acceso', async () => {
      expect((await http().get('/admin/tenants/t1/usuarios')).status).toBe(401);
    });
  });

  describe('fin de sesión de soporte', () => {
    it('una sesión de soporte de solo lectura puede finalizarse; el token deja de valer aunque no haya vencido', async () => {
      const token = soporteToken('s-soporte', true);
      const fin = await http().post('/admin/support/finalizar').set('Authorization', `Bearer ${token}`);
      expect(fin.status).toBe(200);
      expect(sesiones.get('s-soporte')?.revokedAt).toBeInstanceOf(Date);
      expect(sesiones.get('s-soporte')?.revocationMotivo).toBe('SOPORTE_FINALIZADO');

      const despues = await http().get('/admin/tenants/t1/usuarios').set('Authorization', `Bearer ${token}`);
      expect(despues.status).toBe(401);
      const segundaVez = await http().post('/admin/support/finalizar').set('Authorization', `Bearer ${token}`);
      expect(segundaVez.status).toBe(401);
    });

    it('registra la finalización con la identidad original y el tenant', async () => {
      await http().post('/admin/support/finalizar').set('Authorization', `Bearer ${soporteToken('s-soporte', true)}`);
      const fila = auditorias.find(a => a.operacion === 'SOPORTE_FINALIZAR');
      expect(fila).toMatchObject({ tenantId: 't1', usuarioId: 'u-admin', entidadId: 'u-admin' });
      expect(fila.datos).toMatchObject({ superAdminId: 'sa-1', soporteSesionId: 'ses-1', readOnly: true, resultado: 'FINALIZADA' });
    });

    it('un token normal de la empresa no puede usar el fin de soporte', async () => {
      const res = await http().post('/admin/support/finalizar').set('Authorization', `Bearer ${tenantAdmin()}`);
      expect(res.status).toBe(403);
      expect(sesiones.get('s-admin')?.revokedAt).toBeNull();
      expect(auditorias.find(a => a.operacion === 'SOPORTE_FINALIZAR')).toBeUndefined();
    });

    it('la sesión de soporte de solo lectura no puede ejecutar escrituras administrativas', async () => {
      const res = await http().post('/admin/tenants').set('Authorization', `Bearer ${soporteToken()}`).send({});
      expect([401, 403]).toContain(res.status);
      expect(prisma.tenant.findUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'nuevo' }) }));
    });

    it('una sesión de soporte no sirve para rutas de Super Admin', async () => {
      const res = await http().get('/admin/tenants/t1/usuarios').set('Authorization', `Bearer ${soporteToken()}`);
      expect(res.status).toBe(403);
    });

    it('si el Super Admin que originó el soporte fue desactivado, la sesión de soporte deja de valer', async () => {
      prisma.superAdmin.findUnique.mockResolvedValueOnce({ id: 'sa-1', activo: false });
      const res = await http().post('/admin/support/finalizar').set('Authorization', `Bearer ${soporteToken()}`);
      expect(res.status).toBe(401);
    });
  });

  describe('trazabilidad de sesiones de soporte', () => {
    it('Super Admin consulta inicio, modo, motivo, identidad original y fin', async () => {
      auditorias.push(
        { id: 'a1', tenantId: 't1', usuarioId: 'u-admin', operacion: 'SOPORTE_IMPERSONAR', entidadId: 'u-admin', createdAt: new Date('2026-10-13T10:00:00Z'), datos: { superAdminId: 'sa-1', superAdminEmail: 'sa@ferresystem.test', usuarioEmail: 'admin@t1.hn', readOnly: true, motivo: '[Reporte de error] Caja no cuadra', soporteSesionId: 'ses-1' } },
        { id: 'a2', tenantId: 't1', usuarioId: 'u-admin', operacion: 'SOPORTE_FINALIZAR', entidadId: 'u-admin', createdAt: new Date('2026-10-13T10:20:00Z'), datos: { superAdminId: 'sa-1', soporteSesionId: 'ses-1', readOnly: true, resultado: 'FINALIZADA' } },
        { id: 'a3', tenantId: 'otra', usuarioId: 'u-x', operacion: 'SOPORTE_IMPERSONAR', entidadId: 'u-x', createdAt: new Date(), datos: { superAdminId: 'sa-1', soporteSesionId: 'ses-9', readOnly: true, motivo: 'Otra empresa' } },
      );
      const res = await http().get('/admin/soporte/trazas').query({ tenantId: 't1' }).set('Authorization', `Bearer ${SA()}`);
      expect(res.status).toBe(200);
      expect(res.body.map((r: any) => r.operacion)).toEqual(['SOPORTE_FINALIZAR', 'SOPORTE_IMPERSONAR']);
      const inicio = res.body.find((r: any) => r.operacion === 'SOPORTE_IMPERSONAR');
      expect(inicio).toMatchObject({ superAdminId: 'sa-1', superAdminEmail: 'sa@ferresystem.test', modo: 'SOLO_LECTURA', motivo: '[Reporte de error] Caja no cuadra', soporteSesionId: 'ses-1' });
      expect(JSON.stringify(res.body)).not.toContain('Otra empresa');
    });

    it('solo Super Admin consulta trazas', async () => {
      expect((await http().get('/admin/soporte/trazas').set('Authorization', `Bearer ${tenantAdmin()}`)).status).toBe(403);
    });
  });
});
