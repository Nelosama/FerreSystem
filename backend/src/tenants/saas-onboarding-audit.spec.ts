import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SuperAdminService } from '../super-admin/super-admin.service';
import { TenantsService } from './tenants.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from '../auth/auth.service';
import { ForbiddenException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('SaaS Onboarding, Multi-tenant Isolation & Access Control Audit', () => {
  let superAdminService: SuperAdminService;
  let tenantsService: TenantsService;
  let usuariosService: UsuariosService;
  let authService: AuthService;

  let prismaMock: any;
  let jwtMock: any;
  let configMock: any;
  let responseMock: any;

  // In-memory mock store representing PostgreSQL tables
  let tenantsStore: any[] = [];
  let usuariosStore: any[] = [];
  let tenantModulesStore: any[] = [];
  let sesionesAuthStore: any[] = [];
  let auditoriaStore: any[] = [];

  beforeEach(() => {
    tenantsStore = [];
    usuariosStore = [];
    tenantModulesStore = [];
    sesionesAuthStore = [];
    auditoriaStore = [];

    prismaMock = {
      $queryRawUnsafe: vi.fn(async (sql: string, ...args: any[]) => {
        if (sql.includes('SELECT 1 FROM pg_advisory_xact_lock')) {
          return [];
        }
        if (sql.includes('FROM usuarios u JOIN tenants t ON t.id=u.tenant_id')) {
          const userId = args[0];
          const tenantId = args[1];
          const usr = usuariosStore.find((u) => u.id === userId && u.tenantId === tenantId && u.activo);
          const tnt = tenantsStore.find((t) => t.id === tenantId && t.estado === 'ACTIVO');
          if (usr && tnt) {
            return [
              {
                rol: usr.rol,
                permisos: usr.permisos || [],
                permisos_configurados: usr.permisosConfigurados || false,
                descuento_maximo: usr.descuentoMaximo || 0,
              },
            ];
          }
          return [];
        }
        if (sql.includes('INSERT INTO auditoria_operaciones')) {
          return [{ id: `audit-${Date.now()}` }];
        }
        return [];
      }),
      $queryRaw: vi.fn().mockResolvedValue([{ segundos: 0 }]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      tenant: {
        findUnique: vi.fn(async ({ where, include }: any) => {
          const tenant = tenantsStore.find((t) => t.id === where.id);
          if (!tenant) return null;
          const modulos = tenantModulesStore.filter((tm) => tm.tenantId === tenant.id);
          return { ...tenant, modulos };
        }),
        findMany: vi.fn(async ({ include }: any = {}) => {
          return tenantsStore.map((t) => {
            const modulos = tenantModulesStore.filter((tm) => tm.tenantId === t.id);
            if (include?.usuarios) {
              const usuarios = usuariosStore
                .filter((u) => u.tenantId === t.id)
                .map(({ passwordHash, ...rest }) => rest);
              return { ...t, modulos, usuarios, _count: { usuarios: usuarios.length } };
            }
            return { ...t, modulos };
          });
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const idx = tenantsStore.findIndex((t) => t.id === where.id);
          if (idx === -1) throw new NotFoundException('Ferretería no encontrada');
          tenantsStore[idx] = { ...tenantsStore[idx], ...data };
          const modulos = tenantModulesStore.filter((tm) => tm.tenantId === where.id);
          return { ...tenantsStore[idx], modulos };
        }),
      },
      usuario: {
        findFirst: vi.fn(async ({ where, include }: any) => {
          const usr = usuariosStore.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.tenantId && u.tenantId !== where.tenantId) return false;
            if (where.email && u.email.toLowerCase() !== where.email.toLowerCase()) return false;
            if (where.activo !== undefined && u.activo !== where.activo) return false;
            return true;
          });
          if (!usr) return null;
          if (include?.tenant) {
            const tenant = tenantsStore.find((t) => t.id === usr.tenantId);
            return { ...usr, tenant };
          }
          return usr;
        }),
        findMany: vi.fn(async ({ where }: any = {}) => {
          return usuariosStore.filter((u) => {
            if (where.tenantId && u.tenantId !== where.tenantId) return false;
            if (where.activo !== undefined && u.activo !== where.activo) return false;
            return true;
          });
        }),
        count: vi.fn(async ({ where }: any) => {
          return usuariosStore.filter((u) => {
            if (where.tenantId && u.tenantId !== where.tenantId) return false;
            if (where.rol && u.rol !== where.rol) return false;
            if (where.activo !== undefined && u.activo !== where.activo) return false;
            return true;
          }).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const newUser = {
            id: data.id || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            createdAt: new Date(),
            ...data,
          };
          usuariosStore.push(newUser);
          return newUser;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const idx = usuariosStore.findIndex((u) => u.id === where.id);
          if (idx === -1) throw new NotFoundException('Usuario no encontrado');
          usuariosStore[idx] = { ...usuariosStore[idx], ...data };
          return usuariosStore[idx];
        }),
      },
      superAdmin: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id === 'sa-super' || where.email === 'superadmin@jowasystem.com') {
            return {
              id: 'sa-super',
              nombre: 'Super Administrator',
              email: 'superadmin@jowasystem.com',
              passwordHash: await bcrypt.hash('SuperPassword123!', 4),
              activo: true,
            };
          }
          return null;
        }),
      },
      auditoriaOperacion: {
        create: vi.fn(async ({ data }: any) => {
          const entry = { id: `audit-${Date.now()}`, ...data };
          auditoriaStore.push(entry);
          return entry;
        }),
      },
      sesionAuth: {
        create: vi.fn(async ({ data }: any) => {
          const session = { id: `ses-${Date.now()}`, ...data };
          sesionesAuthStore.push(session);
          return session;
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          return sesionesAuthStore.find((s) => s.id === where.id) || null;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          sesionesAuthStore.forEach((s) => {
            if (where.sujetoId && s.sujetoId === where.sujetoId) {
              Object.assign(s, data);
              count++;
            }
          });
          return { count };
        }),
      },
      secuenciaTenant: {
        createMany: vi.fn(async () => ({ count: 2 })),
      },
      tenantModule: {
        createMany: vi.fn(async ({ data }: any) => {
          tenantModulesStore.push(...data);
          return { count: data.length };
        }),
      },
      $transaction: vi.fn(async (callback: any) => callback(prismaMock)),
    };

    jwtMock = {
      sign: vi.fn().mockReturnValue('mocked-jwt-token'),
      verify: vi.fn().mockReturnValue({ sub: 'user-id', tenantId: 'tenant-id' }),
      decode: vi.fn().mockReturnValue({ exp: 4102444800 }),
    };

    configMock = {
      get: vi.fn((key: string, fallback?: any) => (key === 'NODE_ENV' ? 'test' : fallback)),
    };

    responseMock = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      setHeader: vi.fn(),
    };

    superAdminService = new SuperAdminService(prismaMock, jwtMock, configMock);
    tenantsService = new TenantsService(prismaMock);
    usuariosService = new UsuariosService(prismaMock);
    authService = new AuthService(prismaMock, jwtMock, configMock);
  });

  describe('1. Business Onboarding Flow (Full Simulation)', () => {
    it('provisions 3 synthetic businesses with unique settings, branding, users, and print formats', async () => {
      // Create Tenant 1: Ferreteria El Sol
      prismaMock.tenant.create = vi.fn(async ({ data }: any) => {
        const tenant = {
          id: 'tenant-sol',
          nombreComercial: data.nombreComercial,
          email: data.email,
          telefono: data.telefono,
          plan: 'Plan Pro',
          estado: 'ACTIVO',
          colorPrimario: data.colorPrimario,
          modoNavegacion: 'SIDEBAR',
          configuracion: { formatoImpresion: 'A4', rubro: 'FERRETERIA' },
          createdAt: new Date(),
        };
        tenantsStore.push(tenant);
        return tenant;
      });

      const solResult = await superAdminService.createTenant({
        nombreComercial: 'Ferreteria El Sol',
        adminNombre: 'Carlos Solano',
        adminEmail: 'carlos@elsol.com',
        adminPassword: 'Password123!',
        telefono: '50425501111',
        colorPrimario: '#FF5733',
      });

      expect(solResult.tenant.id).toBe('tenant-sol');
      expect(solResult.adminUsuario.email).toBe('carlos@elsol.com');

      // Create Tenant 2: Comercial Constructora
      prismaMock.tenant.create = vi.fn(async ({ data }: any) => {
        const tenant = {
          id: 'tenant-const',
          nombreComercial: data.nombreComercial,
          email: data.email,
          telefono: data.telefono,
          plan: 'Plan Enterprise',
          estado: 'ACTIVO',
          colorPrimario: '#0055FF',
          modoNavegacion: 'TOPNAV',
          configuracion: { formatoImpresion: 'ROLLO_80MM', rubro: 'MATERIALES_CONSTRUCCION' },
          createdAt: new Date(),
        };
        tenantsStore.push(tenant);
        return tenant;
      });

      const constResult = await superAdminService.createTenant({
        nombreComercial: 'Comercial Constructora',
        adminNombre: 'Maria Constructora',
        adminEmail: 'maria@constructora.hn',
        adminPassword: 'Password123!',
        telefono: '50425502222',
        colorPrimario: '#0055FF',
      });

      expect(constResult.tenant.id).toBe('tenant-const');

      // Create Tenant 3: Suministros Industriales
      prismaMock.tenant.create = vi.fn(async ({ data }: any) => {
        const tenant = {
          id: 'tenant-sum',
          nombreComercial: data.nombreComercial,
          email: data.email,
          telefono: data.telefono,
          plan: 'Plan Pyme',
          estado: 'ACTIVO',
          colorPrimario: '#10B981',
          modoNavegacion: 'SIDEBAR',
          configuracion: { formatoImpresion: 'ROLLO_58MM', rubro: 'SUMINISTROS' },
          createdAt: new Date(),
        };
        tenantsStore.push(tenant);
        return tenant;
      });

      const sumResult = await superAdminService.createTenant({
        nombreComercial: 'Suministros Industriales',
        adminNombre: 'Jorge Suministros',
        adminEmail: 'jorge@suministros.com',
        adminPassword: 'Password123!',
        telefono: '50425503333',
        colorPrimario: '#10B981',
      });

      expect(sumResult.tenant.id).toBe('tenant-sum');

      // Verify all 3 synthetic businesses exist
      const allTenants = await superAdminService.listTenants();
      expect(allTenants.length).toBe(3);

      // Verify print format configuration settings per tenant
      const settingsSol = await tenantsService.getTenantSettings('tenant-sol');
      expect(settingsSol.formatoImpresion).toBe('A4');

      const settingsConst = await tenantsService.getTenantSettings('tenant-const');
      expect(settingsConst.formatoImpresion).toBe('ROLLO_80MM');

      const settingsSum = await tenantsService.getTenantSettings('tenant-sum');
      expect(settingsSum.formatoImpresion).toBe('ROLLO_58MM');
    });
  });

  describe('2. Multi-tenant Security, Access Control & Isolation', () => {
    beforeEach(async () => {
      // Setup 2 tenants with users
      const passwordHash = await bcrypt.hash('Password123!', 4);

      tenantsStore.push(
        {
          id: 'tenant-A',
          nombreComercial: 'Empresa A',
          email: 'admin@empresaA.com',
          estado: 'ACTIVO',
          configuracion: { formatoImpresion: 'A4' },
        },
        {
          id: 'tenant-B',
          nombreComercial: 'Empresa B',
          email: 'admin@empresaB.com',
          estado: 'ACTIVO',
          configuracion: { formatoImpresion: 'ROLLO_80MM' },
        },
      );

      usuariosStore.push(
        {
          id: 'usr-admin-A',
          tenantId: 'tenant-A',
          nombre: 'Admin A',
          email: 'admin@empresaa.com',
          passwordHash,
          rol: 'ADMIN',
          activo: true,
        },
        {
          id: 'usr-cajero-A',
          tenantId: 'tenant-A',
          nombre: 'Cajero A',
          email: 'cajero@empresaa.com',
          passwordHash,
          rol: 'CAJERO',
          activo: true,
        },
        {
          id: 'usr-admin-B',
          tenantId: 'tenant-B',
          nombre: 'Admin B',
          email: 'admin@empresab.com',
          passwordHash,
          rol: 'ADMIN',
          activo: true,
        },
        {
          id: 'usr-disabled-A',
          tenantId: 'tenant-A',
          nombre: 'Inactivo A',
          email: 'inactivo@empresaa.com',
          passwordHash,
          rol: 'CAJERO',
          activo: false,
        },
      );
    });

    it('enforces multi-tenant isolation when creating users', async () => {
      const newUser = await usuariosService.create(
        'tenant-A',
        {
          nombre: 'Nuevo Empleado A',
          email: 'nuevo@empresaA.com',
          password: 'Password123!',
          rol: 'VENDEDOR',
        },
        'usr-admin-A',
      );

      expect(newUser.tenantId).toBe('tenant-A');

      // Verify user list for Tenant A contains new user
      const usersA = await usuariosService.findAll('tenant-A');
      expect(usersA.find((u) => u.email === 'nuevo@empresaa.com')).toBeDefined();

      // Verify user list for Tenant B DOES NOT contain Tenant A's user
      const usersB = await usuariosService.findAll('tenant-B');
      expect(usersB.find((u) => u.email === 'nuevo@empresaa.com')).toBeUndefined();
    });

    it('prevents deactivated users from authenticating', async () => {
      await expect(
        authService.login(
          {
            email: 'inactivo@empresaA.com',
            password: 'Password123!',
            tenantId: 'tenant-A',
          },
          responseMock,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('allows identical email authentication across different tenants when tenantId is specified', async () => {
      const sameEmailHash = await bcrypt.hash('SamePassword123!', 4);
      usuariosStore.push({
        id: 'usr-shared-B',
        tenantId: 'tenant-B',
        nombre: 'Shared Email B',
        email: 'cajero@empresaa.com', // Duplicate email across tenant-A and tenant-B
        passwordHash: sameEmailHash,
        rol: 'CAJERO',
        activo: true,
      });

      // Login targeting tenant-A
      const loginA = await authService.login(
        {
          email: 'cajero@empresaA.com',
          password: 'Password123!',
          tenantId: 'tenant-A',
        },
        responseMock,
      );
      expect(loginA.accessToken).toBe('mocked-jwt-token');

      // Login targeting tenant-B
      const loginB = await authService.login(
        {
          email: 'cajero@empresaA.com',
          password: 'SamePassword123!',
          tenantId: 'tenant-B',
        },
        responseMock,
      );
      expect(loginB.accessToken).toBe('mocked-jwt-token');
    });

    it('creates audit log entries when Super Admin impersonates tenant users for support', async () => {
      const supportSession = await superAdminService.supportToken(
        'sa-super',
        'tenant-A',
        'usr-admin-A',
        true, // readOnly
        { motivo: '[Reporte de error] Verificación de configuración de impresión' },
      );

      expect(supportSession.accessToken).toBe('mocked-jwt-token');
      expect(supportSession.user.id).toBe('usr-admin-A');

      // Verify support audit log entry was created
      expect(auditoriaStore.length).toBe(1);
      expect(auditoriaStore[0]).toMatchObject({
        tenantId: 'tenant-A',
        usuarioId: 'usr-admin-A',
        operacion: 'SOPORTE_IMPERSONAR',
      });
      expect(auditoriaStore[0].datos).toMatchObject({
        superAdminId: 'sa-super',
        readOnly: true,
        motivo: '[Reporte de error] Verificación de configuración de impresión',
      });
    });

    it('rejects support impersonation if company is suspended', async () => {
      tenantsStore[0].estado = 'SUSPENDIDO';

      await expect(
        superAdminService.supportToken('sa-super', 'tenant-A', 'usr-admin-A', true, {
          motivo: '[Solicitud del cliente] Prueba en empresa suspendida',
        }),
      ).rejects.toThrow('no disponible para soporte');
    });
  });
});
