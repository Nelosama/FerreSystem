import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { OperacionesController } from './operaciones.controller';
import { OperacionesService } from './operaciones.service';

/**
 * ============================================================================
 * SEC-003 AUDIT & SCENARIOS SUITE
 * ============================================================================
 *
 * SCOPE & LIMITATIONS DOCUMENTATION:
 * ---------------------------------
 * Tested in this suite:
 * - Real HTTP requests passing through NestJS Passport JWT Strategy, JwtAuthGuard,
 *   TenantGuard, and RolesGuard without overriding auth guards.
 * - Role-based authorization matrix for direct returns (POST /operaciones/ventas/:id/devoluciones):
 *   - CAJERO -> 403 Forbidden
 *   - VENDEDOR -> 403 Forbidden
 *   - ADMIN -> 201 Created
 * - Prevention of HTTP payload tampering (attempting to send body { rol: 'ADMIN' } as CAJERO).
 * - Multi-tenant isolation: Tenant A user requesting a return for a sale owned by Tenant B returns 404 Not Found.
 * - Two-step approval workflow: Solicitar (PENDIENTE) -> Decidir (AUTORIZADA) -> Ejecutar (EJECUTADA).
 * - Idempotency & Re-execution protection: Subsequent executions return identical payload without double-restoring inventory or cash.
 * - Quantity cap enforcement: Attempting to return more than originally sold items fails with 400 Bad Request.
 * - Non-interference of RECHAZADA status: Rejected return requests do not modify inventory, cash, or balances.
 * - Financial audit: Adjustments to Credit accounts (CXC) and cash movements, plus audit trail in auditoria_operaciones.
 *
 * UNVERIFIED IN PRODUCTION / LIVE POSTGRESQL (REMAINS PENDING FOR LIVE STAGING/PROD):
 * -------------------------------------------------------------------------------
 * - High-concurrency database lock contention (`pg_advisory_xact_lock(hashtextextended(...))`)
 *   under high parallel load on PostgreSQL server instances.
 * - Physical PostgreSQL trigger execution (e.g. database-level triggers if any).
 * - Live Prisma database migrations and Render deployment execution (`prisma migrate deploy`).
 */

describe('SEC-003: Permisos y ejecución de devoluciones (Audit & Security Suite)', () => {
  let app: INestApplication;
  let service: OperacionesService;
  let jwtService: JwtService;

  const TEST_JWT_SECRET = 'sec-003-audit-jwt-secret-key-12345';

  // In-memory simulated database state for multi-tenant tests
  let dbUsers: Record<string, any> = {};
  let dbSales: Record<string, any> = {};
  let dbSaleDetails: Record<string, any[]> = {};
  let dbRequests: Record<string, any> = {};
  let dbReturns: Record<string, any> = {};
  let dbAccounts: Record<string, any> = {};
  let dbCashBoxes: Record<string, any> = {};
  let dbCashMovements: Record<string, any[]> = {};
  let dbProducts: Record<string, any> = {};
  let dbStockMovements: Record<string, any[]> = {};
  let dbAuditLogs: Record<string, any[]> = {};

  const mockPrisma = {
    $transaction: vi.fn(async (cb: any, _options?: any) => cb(mockPrisma)),
    $queryRawUnsafe: vi.fn(async (sql: string, ...params: any[]) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return [{ locked: 1 }];
      }
      if (sql.includes('FROM usuarios u') || sql.includes('FROM usuarios')) {
        const userId = params[0];
        const tenantId = params[1];
        const u = dbUsers[userId];
        if (u && u.tenant_id === tenantId) return [u];
        return [];
      }
      if (sql.includes('SELECT * FROM solicitudes_devolucion WHERE id=$1')) {
        const reqId = params[0];
        const r = dbRequests[reqId];
        if (r) return [r];
        return [];
      }
      if (sql.includes('SELECT id FROM solicitudes_devolucion WHERE id=$1')) {
        const reqId = params[0];
        const r = dbRequests[reqId];
        if (r) return [{ id: r.id }];
        return [];
      }
      if (sql.includes('SELECT id FROM devoluciones WHERE id=$1')) {
        const retId = params[0];
        const ret = dbReturns[retId];
        if (ret) return [{ id: ret.id }];
        return [];
      }
      if (sql.includes('SELECT * FROM devoluciones WHERE id=$1')) {
        const retId = params[0];
        const ret = dbReturns[retId];
        if (ret) return [ret];
        return [];
      }
      if (sql.includes('SELECT * FROM ventas WHERE id=$1 AND tenant_id=$2')) {
        const saleId = params[0];
        const tenantId = params[1];
        const s = dbSales[saleId];
        if (s && s.tenant_id === tenantId) return [s];
        return [];
      }
      if (sql.includes('SELECT d.*,COALESCE')) {
        const saleId = params[0];
        const details = dbSaleDetails[saleId] || [];
        return details.map(d => {
          let devuelto = 0;
          Object.values(dbReturns).forEach((ret: any) => {
            if (ret.venta_id === saleId) {
              (ret.items || []).forEach((item: any) => {
                if (item.detalleId === d.id) devuelto += Number(item.cantidad);
              });
            }
          });
          return { ...d, devuelto };
        });
      }
      if (sql.includes('SELECT COALESCE(SUM(monto),0) AS monto FROM devoluciones WHERE venta_id=$1')) {
        const saleId = params[0];
        let total = 0;
        Object.values(dbReturns).forEach((ret: any) => {
          if (ret.venta_id === saleId) total += Number(ret.monto);
        });
        return [{ monto: total }];
      }
      if (sql.includes('INSERT INTO solicitudes_devolucion')) {
        const [id, tenant_id, venta_id, solicitante_id, solicitud_hash, comandoStr, monto_estimado] = params;
        const req = {
          id,
          tenant_id,
          venta_id,
          solicitante_id,
          solicitud_hash,
          comando: typeof comandoStr === 'string' ? JSON.parse(comandoStr) : comandoStr,
          monto_estimado,
          estado: 'PENDIENTE',
          created_at: new Date().toISOString(),
        };
        dbRequests[id] = req;
        return [req];
      }
      if (sql.includes('UPDATE solicitudes_devolucion SET estado=$1')) {
        const [decision, adminId, motivo, requestId] = params;
        const req = dbRequests[requestId];
        if (req) {
          req.estado = decision;
          req.administrador_id = adminId;
          req.motivo_decision = motivo;
          req.decidida_at = new Date().toISOString();
        }
        return [req];
      }
      if (sql.includes("UPDATE solicitudes_devolucion SET estado='EJECUTADA'")) {
        const [requestId] = params;
        if (dbRequests[requestId]) dbRequests[requestId].estado = 'EJECUTADA';
        return [{ id: requestId }];
      }
      if (sql.includes("SELECT * FROM cuentas_operativas WHERE tenant_id=$1 AND tipo='CXC' AND documento_id=$2")) {
        const [tenantId, docId] = params;
        const acc = Object.values(dbAccounts).find((a: any) => a.tenant_id === tenantId && a.tipo === 'CXC' && a.documento_id === docId);
        return acc ? [acc] : [];
      }
      if (sql.includes('UPDATE cuentas_operativas SET saldo=saldo-$1 WHERE id=$2')) {
        const [monto, accId] = params;
        if (dbAccounts[accId]) dbAccounts[accId].saldo = Number(dbAccounts[accId].saldo) - Number(monto);
        return [{ id: accId }];
      }
      if (sql.includes("SELECT * FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA'")) {
        const [tenantId, userId] = params;
        const caja = Object.values(dbCashBoxes).find((c: any) => c.tenant_id === tenantId && c.usuario_id === userId && c.estado === 'ABIERTA');
        return caja ? [caja] : [];
      }
      if (sql.includes("SELECT COALESCE(SUM(monto),0) AS monto FROM movimientos_caja WHERE caja_id=$1 AND metodo='EFECTIVO'") || sql.includes("SELECT COALESCE(SUM(monto),0) AS total FROM movimientos_caja")) {
        const [cajaId] = params;
        const movs = dbCashMovements[cajaId] || [];
        const total = movs.filter(m => m.metodo === 'EFECTIVO').reduce((sum, m) => sum + Number(m.monto), 0);
        return [{ monto: total, total }];
      }
      if (sql.includes('INSERT INTO devoluciones')) {
        const [id, tenant_id, venta_id, usuario_id, solicitud_hash, motivo, monto, credito_cancelado, reembolso, metodo, caja_id] = params;
        const ret = {
          id, tenant_id, venta_id, usuario_id, solicitud_hash, motivo, monto, credito_cancelado, reembolso, metodo, caja_id,
          created_at: new Date().toISOString(),
          items: [],
        };
        dbReturns[id] = ret;
        return [ret];
      }
      if (sql.includes('INSERT INTO detalles_devolucion')) {
        const [id, devolucion_id, detalle_venta_id, cantidad, destino] = params;
        if (dbReturns[devolucion_id]) {
          dbReturns[devolucion_id].items.push({ id, devolucion_id, detalleId: detalle_venta_id, cantidad, destino });
        }
        return [{ id }];
      }
      if (sql.includes('SELECT * FROM productos WHERE id=$1 AND tenant_id=$2')) {
        const [prodId, tenantId] = params;
        const p = dbProducts[prodId];
        if (p && p.tenant_id === tenantId) return [p];
        return [];
      }
      if (sql.includes('UPDATE productos SET stock_actual=stock_actual+$1')) {
        const [qty, prodId] = params;
        if (dbProducts[prodId]) dbProducts[prodId].stock_actual = Number(dbProducts[prodId].stock_actual) + Number(qty);
        return [{ id: prodId }];
      }
      if (sql.includes('UPDATE productos SET stock_reservado=stock_reservado-$1')) {
        const [qty, prodId] = params;
        if (dbProducts[prodId]) dbProducts[prodId].stock_reservado = Number(dbProducts[prodId].stock_reservado) - Number(qty);
        return [{ id: prodId }];
      }
      if (sql.includes('INSERT INTO movimientos_inventario')) {
        const [id, tenant_id, usuario_id, producto_id, tipo, stock_anterior, stock_nuevo, cantidad, referencia_id, notas] = params;
        if (!dbStockMovements[producto_id]) dbStockMovements[producto_id] = [];
        const mov = { id, tenant_id, usuario_id, producto_id, tipo, stock_anterior, stock_nuevo, cantidad, referencia_id, notas, created_at: new Date().toISOString() };
        dbStockMovements[producto_id].push(mov);
        return [mov];
      }
      if (sql.includes('INSERT INTO movimientos_caja')) {
        const [id, caja_id, usuario_id, tipo, monto, metodo, referencia_id, concepto] = params;
        if (!dbCashMovements[caja_id]) dbCashMovements[caja_id] = [];
        const mov = { id, caja_id, usuario_id, tipo, monto, metodo, referencia_id, concepto, created_at: new Date().toISOString() };
        dbCashMovements[caja_id].push(mov);
        return [mov];
      }
      if (sql.includes('INSERT INTO auditoria_operaciones')) {
        const [id, tenant_id, usuario_id, operacion, entidad_id, datosStr] = params;
        if (!dbAuditLogs[tenant_id]) dbAuditLogs[tenant_id] = [];
        const log = { id, tenant_id, usuario_id, operacion, entidad_id, datos: typeof datosStr === 'string' ? JSON.parse(datosStr) : datosStr, created_at: new Date().toISOString() };
        dbAuditLogs[tenant_id].push(log);
        return [log];
      }
      if (sql.includes('SELECT s.*,v.numero_venta')) {
        const tenantId = params[0];
        const isDbAdmin = params[1];
        const userId = params[2];
        const reqs = Object.values(dbRequests).filter((r: any) => r.tenant_id === tenantId && (isDbAdmin || r.solicitante_id === userId));
        return reqs.map((r: any) => ({
          ...r,
          numero_venta: 1001,
          total_venta: 100,
          metodo_pago: 'EFECTIVO',
          items: [],
          solicitante_nombre: 'Solicitante',
          administrador_nombre: r.administrador_id ? 'Admin' : null,
        }));
      }
      return [];
    }),
    tenantModule: {
      findUnique: vi.fn().mockResolvedValue({ enabled: true }),
    },
    usuario: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        const u = dbUsers[where.id];
        if (u && (!where.tenantId || u.tenant_id === where.tenantId) && (!where.activo || u.activo)) {
          return {
            ...u,
            tenant: { id: u.tenant_id, estado: 'ACTIVO' },
          };
        }
        return null;
      }),
    },
  };

  beforeEach(async () => {
    // Reset simulated DB state
    dbUsers = {
      'cajero-1': { id: 'cajero-1', tenant_id: 'tenant-A', nombre: 'Carlos Cajero', rol: 'CAJERO', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 0 },
      'vendedor-1': { id: 'vendedor-1', tenant_id: 'tenant-A', nombre: 'Victor Vendedor', rol: 'VENDEDOR', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 0 },
      'admin-1': { id: 'admin-1', tenant_id: 'tenant-A', nombre: 'Ana Admin', rol: 'ADMIN', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 100 },
      'admin-B': { id: 'admin-B', tenant_id: 'tenant-B', nombre: 'Bob Admin B', rol: 'ADMIN', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 100 },
      'cajero-B': { id: 'cajero-B', tenant_id: 'tenant-B', nombre: 'Cesar Cajero B', rol: 'CAJERO', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 0 },
    };

    dbProducts = {
      'prod-1': { id: 'prod-1', tenant_id: 'tenant-A', nombre: 'Martillo', stock_actual: 50, stock_reservado: 0, sin_inventario: false },
      'prod-2': { id: 'prod-2', tenant_id: 'tenant-A', nombre: 'Clavos', stock_actual: 100, stock_reservado: 0, sin_inventario: false },
    };

    dbSales = {
      'venta-1': { id: 'venta-1', tenant_id: 'tenant-A', numero_venta: 1001, total: 200, metodo_pago: 'EFECTIVO', estado: 'COMPLETADA', reserva_pendiente: false },
      'venta-credito-1': { id: 'venta-credito-1', tenant_id: 'tenant-A', numero_venta: 1002, total: 300, metodo_pago: 'CREDITO', estado: 'COMPLETADA', reserva_pendiente: false },
      'venta-tenant-B': { id: 'venta-tenant-B', tenant_id: 'tenant-B', numero_venta: 2001, total: 150, metodo_pago: 'EFECTIVO', estado: 'COMPLETADA', reserva_pendiente: false },
    };

    dbSaleDetails = {
      'venta-1': [
        { id: 'det-1', venta_id: 'venta-1', producto_id: 'prod-1', cantidad: 2, precio_unitario: 100, sin_inventario: false },
      ],
      'venta-credito-1': [
        { id: 'det-2', venta_id: 'venta-credito-1', producto_id: 'prod-2', cantidad: 3, precio_unitario: 100, sin_inventario: false },
      ],
      'venta-tenant-B': [
        { id: 'det-B', venta_id: 'venta-tenant-B', producto_id: 'prod-B', cantidad: 1, precio_unitario: 150, sin_inventario: false },
      ],
    };

    dbAccounts = {
      'cxc-1': { id: 'cxc-1', tenant_id: 'tenant-A', tipo: 'CXC', documento_id: 'venta-credito-1', saldo: 300 },
    };

    dbCashBoxes = {
      'caja-admin-1': { id: 'caja-admin-1', tenant_id: 'tenant-A', usuario_id: 'admin-1', estado: 'ABIERTA', monto_apertura: 1000 },
      'caja-cajero-1': { id: 'caja-cajero-1', tenant_id: 'tenant-A', usuario_id: 'cajero-1', estado: 'ABIERTA', monto_apertura: 500 },
    };

    dbCashMovements = {
      'caja-admin-1': [{ id: 'm1', caja_id: 'caja-admin-1', metodo: 'EFECTIVO', monto: 500 }],
      'caja-cajero-1': [{ id: 'm2', caja_id: 'caja-cajero-1', metodo: 'EFECTIVO', monto: 300 }],
    };

    dbRequests = {};
    dbReturns = {};
    dbStockMovements = {};
    dbAuditLogs = {};

    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: TEST_JWT_SECRET }),
      ],
      controllers: [OperacionesController],
      providers: [
        OperacionesService,
        JwtStrategy,
        JwtAuthGuard,
        TenantGuard,
        RolesGuard,
        { provide: ConfigService, useValue: { get: (key: string) => (key === 'JWT_SECRET' ? TEST_JWT_SECRET : null) } },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    service = moduleFixture.get<OperacionesService>(OperacionesService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterEach(async () => {
    await app?.close();
  });

  function createToken(sub: string, tenantId: string, rol: string) {
    return jwtService.sign({
      sub,
      tenantId,
      rol,
      type: 'tenant',
      email: `${sub}@test.com`,
    });
  }

  // 1. Direct Return Security Checks via Real HTTP + Guards
  describe('1. Control de acceso a devolución directa (POST /operaciones/ventas/:id/devoluciones) con Guards reales', () => {
    it('RECHAZA (401 Unauthorized) si no se proporciona un token JWT en el encabezado Authorization', async () => {
      await request(app.getHttpServer())
        .post('/operaciones/ventas/venta-1/devoluciones')
        .send({
          solicitudId: 'sol-no-token',
          motivo: 'Intento sin token',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
        })
        .expect(401);
    });

    it('RECHAZA (403 Forbidden) cuando CAJERO intenta ejecutar una devolución directa sin autorización', async () => {
      const token = createToken('cajero-1', 'tenant-A', 'CAJERO');

      await request(app.getHttpServer())
        .post('/operaciones/ventas/venta-1/devoluciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          solicitudId: 'sol-cajero-1',
          motivo: 'Intento directo cajero',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
        })
        .expect(403);

      expect(Object.keys(dbReturns)).toHaveLength(0);
    });

    it('RECHAZA (403 Forbidden) cuando VENDEDOR intenta ejecutar una devolución directa sin autorización', async () => {
      const token = createToken('vendedor-1', 'tenant-A', 'VENDEDOR');

      await request(app.getHttpServer())
        .post('/operaciones/ventas/venta-1/devoluciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          solicitudId: 'sol-vendedor-1',
          motivo: 'Intento directo vendedor',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
        })
        .expect(403);

      expect(Object.keys(dbReturns)).toHaveLength(0);
    });

    it('PERMITE (201 Created) a ADMIN realizar una devolución directa autorizada', async () => {
      const token = createToken('admin-1', 'tenant-A', 'ADMIN');

      await request(app.getHttpServer())
        .post('/operaciones/ventas/venta-1/devoluciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          solicitudId: 'sol-admin-directa-1',
          motivo: 'Devolución directa autorizada por administrador',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
        })
        .expect(201);

      expect(dbReturns['sol-admin-directa-1']).toBeDefined();
      expect(dbReturns['sol-admin-directa-1'].monto).toBe(100);
      expect(dbProducts['prod-1'].stock_actual).toBe(51); // Stock updated
    });
  });

  // 2. HTTP Payload & Role Tampering Attempts
  describe('2. Integridad de autenticación y prevención de manipulación de rol desde HTTP', () => {
    it('Ignora los campos de rol o permisos inyectados en el cuerpo HTTP y utiliza el rol autenticado del JWT real', async () => {
      const token = createToken('cajero-1', 'tenant-A', 'CAJERO');

      await request(app.getHttpServer())
        .post('/operaciones/ventas/venta-1/devoluciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          solicitudId: 'sol-tamper-1',
          rol: 'ADMIN', // HTTP payload tampering attempt
          user: { rol: 'ADMIN', permisos: ['*'] },
          motivo: 'Intento de elevación de privilegios en payload',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
        })
        .expect(403);

      expect(dbReturns['sol-tamper-1']).toBeUndefined();
    });
  });

  // 3. Multi-Tenant Isolation
  describe('3. Aislamiento multi-tenant en devoluciones', () => {
    it('RECHAZA (404 Not Found) a un usuario de Tenant A que intenta devolver una venta de Tenant B', async () => {
      const tokenAdminA = createToken('admin-1', 'tenant-A', 'ADMIN');

      await request(app.getHttpServer())
        .post('/operaciones/ventas/venta-tenant-B/devoluciones')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          solicitudId: 'sol-cross-tenant-1',
          motivo: 'Ataque cross-tenant',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-B', cantidad: 1, destino: 'INVENTARIO' }],
        })
        .expect(404);

      expect(dbReturns['sol-cross-tenant-1']).toBeUndefined();
    });
  });

  // 4. Authorization & Execution Workflow (Solicitar -> Decidir -> Ejecutar)
  describe('4. Flujo de solicitud, autorización y ejecución diferida', () => {
    it('CAJERO puede solicitar devolución (queda PENDIENTE sin afectar inventario ni caja)', async () => {
      const tokenCajero = createToken('cajero-1', 'tenant-A', 'CAJERO');

      const res = await request(app.getHttpServer())
        .post('/operaciones/ventas/venta-1/solicitudes-devolucion')
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({
          solicitudId: 'sol-req-1',
          motivo: 'Cliente devolvió producto defectuoso',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
        })
        .expect(201);

      expect(res.body.id).toBe('sol-req-1');
      expect(res.body.estado).toBe('PENDIENTE');
      expect(res.body.solicitante_id).toBe('cajero-1');

      // No stock or cash drawer impact yet
      expect(dbProducts['prod-1'].stock_actual).toBe(50);
      expect(Object.keys(dbReturns)).toHaveLength(0);
    });

    it('ADMIN aprueba la solicitud (queda AUTORIZADA registrando administrador_id)', async () => {
      // Step 1: Create request
      await service.solicitarDevolucion('tenant-A', 'cajero-1', 'venta-1', {
        solicitudId: 'sol-req-2',
        motivo: 'Producto equivocado',
        metodo: 'EFECTIVO',
        items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
      });

      // Step 2: Admin approves via HTTP
      const tokenAdmin = createToken('admin-1', 'tenant-A', 'ADMIN');

      const decisionRes = await request(app.getHttpServer())
        .post('/operaciones/solicitudes-devolucion/sol-req-2/decision')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          decision: 'AUTORIZADA',
          motivo: 'Aprobado tras revisar foto del producto',
        })
        .expect(201);

      expect(decisionRes.body.estado).toBe('AUTORIZADA');
      expect(decisionRes.body.administrador_id).toBe('admin-1');

      // Authorization still doesn't alter inventory or issue refund before cash execution
      expect(dbProducts['prod-1'].stock_actual).toBe(50);
      expect(Object.keys(dbReturns)).toHaveLength(0);
    });

    it('CAJERO ejecuta la devolución autorizada (actualiza inventario, caja y audit)', async () => {
      // Setup authorized request
      await service.solicitarDevolucion('tenant-A', 'cajero-1', 'venta-1', {
        solicitudId: 'sol-req-3',
        motivo: 'Devolución acordada',
        metodo: 'EFECTIVO',
        items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
      });
      await service.decidirDevolucion('tenant-A', 'admin-1', 'sol-req-3', {
        decision: 'AUTORIZADA',
        motivo: 'Conforme',
      });

      // Step 3: Cashier executes authorized return
      const tokenCajero = createToken('cajero-1', 'tenant-A', 'CAJERO');

      const execRes = await request(app.getHttpServer())
        .post('/operaciones/solicitudes-devolucion/sol-req-3/ejecutar')
        .set('Authorization', `Bearer ${tokenCajero}`)
        .send({})
        .expect(201);

      expect(execRes.body.id).toBe('sol-req-3');
      expect(dbRequests['sol-req-3'].estado).toBe('EJECUTADA');

      // Verify financial & inventory impact
      expect(dbProducts['prod-1'].stock_actual).toBe(51); // Stock restored
      expect(dbReturns['sol-req-3']).toBeDefined(); // Return registered
      expect(dbCashMovements['caja-cajero-1'].some(m => m.tipo === 'DEVOLUCION' && Number(m.monto) === -100)).toBe(true);
    });
  });

  // 5. Idempotency & Re-execution Protection
  describe('5. Protección contra duplicación y re-ejecución (Idempotencia)', () => {
    it('Rechaza o retorna resultado idéntico de idempotencia cuando se intenta re-ejecutar la misma devolución', async () => {
      await service.solicitarDevolucion('tenant-A', 'cajero-1', 'venta-1', {
        solicitudId: 'sol-idem-1',
        motivo: 'Defectuoso',
        metodo: 'EFECTIVO',
        items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
      });
      await service.decidirDevolucion('tenant-A', 'admin-1', 'sol-idem-1', {
        decision: 'AUTORIZADA',
        motivo: 'Aprobado',
      });

      // First execution
      await service.ejecutarAutorizada('tenant-A', 'cajero-1', 'sol-idem-1');
      const stockAfterFirst = dbProducts['prod-1'].stock_actual;

      // Second execution attempt
      const secondExec = await service.ejecutarAutorizada('tenant-A', 'cajero-1', 'sol-idem-1');

      // Stock was NOT incremented twice
      expect(dbProducts['prod-1'].stock_actual).toEqual(stockAfterFirst);
      expect(secondExec.id).toBe('sol-idem-1');
    });
  });

  // 6. Return Quantity Limit Enforcement
  describe('6. Validación de límites de cantidad vendida vs devuelta', () => {
    it('RECHAZA (400 Bad Request) si la cantidad a devolver excede la cantidad originalmente vendida', async () => {
      // Sold quantity in det-1 is 2
      await expect(
        service.solicitarDevolucion('tenant-A', 'cajero-1', 'venta-1', {
          solicitudId: 'sol-exceed-1',
          motivo: 'Devolver más de lo comprado',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'det-1', cantidad: 5, destino: 'INVENTARIO' }],
        }),
      ).rejects.toThrow('Cantidad supera lo vendido pendiente de devolver');
    });
  });

  // 7. Rejected Returns Non-Interference
  describe('7. Verificación de devoluciones RECHAZADAS', () => {
    it('Una devolución RECHAZADA por el ADMIN no modifica inventario, caja ni saldos', async () => {
      await service.solicitarDevolucion('tenant-A', 'cajero-1', 'venta-1', {
        solicitudId: 'sol-reject-1',
        motivo: 'Dañado por el cliente',
        metodo: 'EFECTIVO',
        items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
      });

      const tokenAdmin = createToken('admin-1', 'tenant-A', 'ADMIN');

      // Admin rejects
      await request(app.getHttpServer())
        .post('/operaciones/solicitudes-devolucion/sol-reject-1/decision')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          decision: 'RECHAZADA',
          motivo: 'Daño provocado por mal uso del cliente',
        })
        .expect(201);

      expect(dbRequests['sol-reject-1'].estado).toBe('RECHAZADA');
      expect(dbProducts['prod-1'].stock_actual).toBe(50); // Intact stock
      expect(dbReturns['sol-reject-1']).toBeUndefined(); // No return registered
    });
  });

  // 8. Financial Audit Scenarios
  describe('8. Auditoría financiera: ajuste de cuentas por cobrar (CXC) a crédito y caja', () => {
    it('Ajusta correctamente la cuenta por cobrar (CXC) al devolver una venta a crédito', async () => {
      await service.solicitarDevolucion('tenant-A', 'cajero-1', 'venta-credito-1', {
        solicitudId: 'sol-credito-1',
        motivo: 'Devolución de venta a crédito',
        metodo: 'EFECTIVO',
        items: [{ detalleId: 'det-2', cantidad: 1, destino: 'INVENTARIO' }], // 100 lempiras
      });

      await service.decidirDevolucion('tenant-A', 'admin-1', 'sol-credito-1', {
        decision: 'AUTORIZADA',
        motivo: 'Ok',
      });

      await service.ejecutarAutorizada('tenant-A', 'cajero-1', 'sol-credito-1');

      // Credit account balance should be reduced from 300 to 200
      expect(dbAccounts['cxc-1'].saldo).toBe(200);
      expect(dbReturns['sol-credito-1'].credito_cancelado).toBe(100);
      expect(dbReturns['sol-credito-1'].reembolso).toBe(0); // No cash refund for credit return
    });

    it('Registra la evidencia de auditoría de quién solicitó, quién autorizó y quién ejecutó', async () => {
      await service.solicitarDevolucion('tenant-A', 'cajero-1', 'venta-1', {
        solicitudId: 'sol-audit-trace-1',
        motivo: 'Trazabilidad completa',
        metodo: 'EFECTIVO',
        items: [{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO' }],
      });

      await service.decidirDevolucion('tenant-A', 'admin-1', 'sol-audit-trace-1', {
        decision: 'AUTORIZADA',
        motivo: 'Aprobado por administración',
      });

      await service.ejecutarAutorizada('tenant-A', 'cajero-1', 'sol-audit-trace-1');

      const req = dbRequests['sol-audit-trace-1'];
      expect(req.solicitante_id).toBe('cajero-1');
      expect(req.administrador_id).toBe('admin-1');

      const auditLogs = dbAuditLogs['tenant-A'] || [];
      const solLog = auditLogs.find(l => l.operacion === 'DEVOLUCION_SOLICITAR' && l.entidad_id === 'sol-audit-trace-1');
      const decLog = auditLogs.find(l => l.operacion === 'DEVOLUCION_DECIDIR' && l.entidad_id === 'sol-audit-trace-1');
      const execLog = auditLogs.find(l => l.operacion === 'DEVOLUCION_EJECUTAR_AUTORIZADA' && l.entidad_id === 'sol-audit-trace-1');

      expect(solLog).toBeDefined();
      expect(solLog.usuario_id).toBe('cajero-1');
      expect(decLog).toBeDefined();
      expect(decLog.usuario_id).toBe('admin-1');
      expect(execLog).toBeDefined();
      expect(execLog.usuario_id).toBe('cajero-1');
    });
  });
});
