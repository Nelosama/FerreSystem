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
 * AUDITORÍA INTEGRAL DE COMPRAS Y PROVEEDORES — SUITE DE PRUEBAS DE REGRESIÓN
 * ============================================================================
 *
 * Escenarios probados:
 * 1. Registrar una factura de compra asociada a un proveedor.
 * 2. Detectar facturas duplicadas del mismo proveedor (ConflictException).
 * 3. Registrar vencimientos y estados de pago / deudas (vencidas).
 * 4. Registrar pagos sin duplicarlos (idempotencia y validación de saldo).
 * 5. Verificar que el costo vigente del producto se actualice con la última compra, tanto si sube como si baja.
 * 6. Verificar que las compras anteriores conserven su costo histórico en costos_compra.
 * 7. Validar inventario recibido y cantidades decimales (p. ej. 2.50 unidades).
 * 8. Verificar permisos: un cajero no debe modificar costos ni registrar compras administrativas (ForbiddenException).
 * 9. Verificar aislamiento entre tenants.
 * 10. Verificar manejo de errores y operaciones repetidas (idempotencia con solicitudId/fingerprint).
 */

describe('Auditoría Compras y Proveedores — Escenarios 1 al 10', () => {
  let app: INestApplication;
  let service: OperacionesService;
  let jwtService: JwtService;

  const TEST_JWT_SECRET = 'compras-proveedores-audit-secret-98765';

  // Base de datos simulada en memoria para aislamiento e higienización
  let dbUsers: Record<string, any> = {};
  let dbSuppliers: Record<string, any> = {};
  let dbProducts: Record<string, any> = {};
  let dbOrders: Record<string, any> = {};
  let dbOrderDetails: Record<string, any[]> = {};
  let dbReceptions: Record<string, any> = {};
  let dbCostsHistory: Record<string, any[]> = {};
  let dbAccounts: Record<string, any> = {};
  let dbPayments: Record<string, any> = {};
  let dbCashBoxes: Record<string, any> = {};
  let dbCashMovements: Record<string, any[]> = {};
  let dbAuditLogs: Record<string, any[]> = {};
  let dbStockMovements: Record<string, any[]> = {};

  const mockPrisma = {
    $transaction: vi.fn(async (cb: any, _options?: any) => cb(mockPrisma)),
    $queryRawUnsafe: vi.fn(async (sql: string, ...params: any[]) => {
      // Bloqueo de concurrencia
      if (sql.includes('pg_advisory_xact_lock')) {
        return [{ locked: 1 }];
      }

      // 1. Consulta de usuario
      if (sql.includes('FROM usuarios u') || sql.includes('FROM usuarios')) {
        const userId = params[0];
        const tenantId = params[1];
        const u = dbUsers[userId];
        if (u && u.tenant_id === tenantId) return [u];
        return [];
      }

      // 2. Proveedores
      if (sql.includes('SELECT id,nombre,telefono,rtn FROM proveedores')) {
        const tenantId = params[0];
        return Object.values(dbSuppliers).filter((s: any) => s.tenant_id === tenantId);
      }
      if (sql.includes('SELECT p.*,a.datos FROM proveedores p')) {
        const [provId, tenantId] = params;
        const p = dbSuppliers[provId];
        if (p && p.tenant_id === tenantId) {
          const audit = (dbAuditLogs[tenantId] || []).find(a => a.entidad_id === provId && a.operacion === 'PROVEEDOR_CREAR');
          if (audit) return [{ ...p, datos: audit.datos }];
        }
        return [];
      }
      if (sql.includes('SELECT id FROM proveedores WHERE id=$1 AND tenant_id=$2')) {
        const [id, tenantId] = params;
        const p = dbSuppliers[id];
        return p && p.tenant_id === tenantId ? [p] : [];
      }
      if (sql.includes('INSERT INTO proveedores')) {
        const [id, tenantId, nombre, telefono, rtn] = params;
        const p = { id, tenant_id: tenantId, nombre, telefono, rtn, updated_at: new Date().toISOString() };
        dbSuppliers[id] = p;
        return [p];
      }

      // 3. Órdenes de compra / Facturas de proveedor
      if (sql.includes('SELECT o.*, a.datos FROM ordenes_compra o JOIN auditoria_operaciones a')) {
        const [orderId, tenantId] = params;
        const o = dbOrders[orderId];
        if (o && o.tenant_id === tenantId) {
          const audit = (dbAuditLogs[tenantId] || []).find(a => a.entidad_id === orderId && a.operacion === 'COMPRA_CREAR');
          if (audit) return [{ ...o, datos: audit.datos }];
        }
        return [];
      }
      if (sql.includes('SELECT id FROM ordenes_compra WHERE tenant_id=$1 AND proveedor_id=$2 AND numero_factura=$3')) {
        const [tenantId, provId, numFactura] = params;
        const duplicate = Object.values(dbOrders).find(
          (o: any) => o.tenant_id === tenantId && o.proveedor_id === provId && o.numero_factura === numFactura,
        );
        return duplicate ? [duplicate] : [];
      }
      if (sql.includes('INSERT INTO ordenes_compra')) {
        const [id, tenantId, codigo, proveedorId, usuarioId, subtotal, isv, total, numeroFactura, vencimiento] = params;
        const order = {
          id, tenant_id: tenantId, codigo, proveedor_id: proveedorId, usuario_id: usuarioId,
          subtotal, isv, total, estado: 'SOLICITADA', numero_factura: numeroFactura, vencimiento,
          created_at: new Date().toISOString(),
        };
        dbOrders[id] = order;
        return [order];
      }
      if (sql.includes('INSERT INTO detalles_orden_compra')) {
        const [id, ordenId, productoId, cantidad, precioCosto, subtotal] = params;
        if (!dbOrderDetails[ordenId]) dbOrderDetails[ordenId] = [];
        const detail = { id, orden_id: ordenId, producto_id: productoId, cantidad, precio_costo: precioCosto, cantidad_recibida: 0, subtotal };
        dbOrderDetails[ordenId].push(detail);
        return [{ id }];
      }
      if (sql.includes('SELECT * FROM ordenes_compra WHERE id=$1 AND tenant_id=$2 FOR UPDATE')) {
        const [id, tenantId] = params;
        const o = dbOrders[id];
        return o && o.tenant_id === tenantId ? [o] : [];
      }
      if (sql.includes('SELECT o.*, p.nombre AS proveedor_nombre FROM ordenes_compra o')) {
        const tenantId = params[0];
        return Object.values(dbOrders).filter((o: any) => o.tenant_id === tenantId);
      }
      if (sql.includes('SELECT d.*, p.nombre, p.codigo FROM detalles_orden_compra d')) {
        const orderId = params[0];
        return (dbOrderDetails[orderId] || []).map(d => ({
          ...d,
          nombre: dbProducts[d.producto_id]?.nombre || 'Producto',
          codigo: dbProducts[d.producto_id]?.codigo || 'PROD',
        }));
      }

      // 4. Recepciones de compra
      if (sql.includes('SELECT * FROM recepciones_compra WHERE tenant_id=$1 AND solicitud_id=$2')) {
        const [tenantId, solId] = params;
        const r = Object.values(dbReceptions).find((rec: any) => rec.tenant_id === tenantId && rec.solicitud_id === solId);
        return r ? [r] : [];
      }
      if (sql.includes('INSERT INTO recepciones_compra')) {
        const [id, tenantId, ordenId, solicitudId, solicitudHash, usuarioId] = params;
        const rec = { id, tenant_id: tenantId, orden_id: ordenId, solicitud_id: solicitudId, solicitud_hash: solicitudHash, usuario_id: usuarioId, fecha: new Date().toISOString() };
        dbReceptions[id] = rec;
        return [rec];
      }
      if (sql.includes('SELECT * FROM detalles_orden_compra WHERE id=$1 AND orden_id=$2 FOR UPDATE')) {
        const [detailId, orderId] = params;
        const details = dbOrderDetails[orderId] || [];
        const d = details.find(x => x.id === detailId);
        return d ? [d] : [];
      }
      if (sql.includes('UPDATE detalles_orden_compra SET cantidad_recibida=cantidad_recibida+$1 WHERE id=$2')) {
        const [qty, detailId] = params;
        Object.values(dbOrderDetails).forEach(list => {
          const d = list.find(x => x.id === detailId);
          if (d) d.cantidad_recibida = Number(d.cantidad_recibida) + Number(qty);
        });
        return [{ id: detailId }];
      }
      if (sql.includes('SELECT COUNT(*)::int AS cantidad FROM detalles_orden_compra WHERE orden_id=$1 AND cantidad_recibida<cantidad')) {
        const orderId = params[0];
        const details = dbOrderDetails[orderId] || [];
        const pendingCount = details.filter(d => Number(d.cantidad_recibida) < Number(d.cantidad)).length;
        return [{ cantidad: pendingCount }];
      }
      if (sql.includes("UPDATE ordenes_compra SET estado='RECIBIDA'")) {
        const orderId = params[0];
        if (dbOrders[orderId]) dbOrders[orderId].estado = 'RECIBIDA';
        return [{ id: orderId }];
      }

      // 5. Productos y Costos
      if (sql.includes('SELECT * FROM productos WHERE id=$1 AND tenant_id=$2')) {
        const [prodId, tenantId] = params;
        const p = dbProducts[prodId];
        return p && p.tenant_id === tenantId ? [p] : [];
      }
      if (sql.includes('UPDATE productos SET stock_actual=stock_actual+$1,precio_costo=$2')) {
        const [qty, cost, fecha, prodId, tenantId] = params;
        const p = dbProducts[prodId];
        if (p && p.tenant_id === tenantId) {
          p.stock_actual = Number(p.stock_actual) + Number(qty);
          p.precio_costo = Number(cost);
          p.ultima_compra_at = fecha;
        }
        return [{ id: prodId }];
      }
      if (sql.includes('INSERT INTO costos_compra')) {
        const [id, tenantId, productoId, proveedorId, ordenId, recepcionId, cantidad, costo, fecha] = params;
        if (!dbCostsHistory[productoId]) dbCostsHistory[productoId] = [];
        const entry = { id, tenant_id: tenantId, producto_id: productoId, proveedor_id: proveedorId, orden_id: ordenId, recepcion_id: recepcionId, cantidad, costo, fecha };
        dbCostsHistory[productoId].push(entry);
        return [{ id }];
      }
      if (sql.includes('SELECT c.*,p.nombre AS proveedor_nombre,o.numero_factura FROM costos_compra c')) {
        const [tenantId, productoId] = params;
        const list = dbCostsHistory[productoId] || [];
        return list.filter(c => c.tenant_id === tenantId).map(c => ({
          ...c,
          proveedor_nombre: dbSuppliers[c.proveedor_id]?.nombre || 'Proveedor',
          numero_factura: dbOrders[c.orden_id]?.numero_factura || 'FACT',
        }));
      }

      // 6. Cuentas operativas (CXP / CXC)
      if (sql.includes('INSERT INTO cuentas_operativas')) {
        const [id, tenantId, usuarioId, tipo, docId, clienteId, proveedorId, total, vencimiento] = params;
        const acc = { id, tenant_id: tenantId, usuario_id: usuarioId, tipo, documento_id: docId, proveedor_id: proveedorId, cliente_id: clienteId, monto: total, saldo: total, vencimiento, created_at: new Date().toISOString() };
        dbAccounts[id] = acc;
        return [{ id }];
      }
      if (sql.includes('SELECT c.*, COALESCE(cl.nombre,p.nombre) AS nombre')) {
        const [tenantId, tipo] = params;
        const accs = Object.values(dbAccounts).filter((a: any) => a.tenant_id === tenantId && a.tipo === tipo);
        const now = new Date().toISOString();
        return accs.map(a => ({
          ...a,
          nombre: dbSuppliers[a.proveedor_id]?.nombre || 'Proveedor',
          documento: dbOrders[a.documento_id]?.numero_factura || 'COMPRA',
          vencida: Number(a.saldo) > 0 && a.vencimiento && new Date(a.vencimiento).getTime() < new Date(now).getTime(),
          pagos: Object.values(dbPayments).filter((p: any) => p.cuenta_id === a.id),
        }));
      }
      if (sql.includes('SELECT * FROM cuentas_operativas WHERE id=$1 AND tenant_id=$2 FOR UPDATE')) {
        const [accId, tenantId] = params;
        const a = dbAccounts[accId];
        return a && a.tenant_id === tenantId ? [a] : [];
      }
      if (sql.includes('SELECT * FROM pagos_cuenta WHERE tenant_id=$1 AND solicitud_id=$2')) {
        const [tenantId, solId] = params;
        const p = Object.values(dbPayments).find((pay: any) => pay.tenant_id === tenantId && pay.solicitud_id === solId);
        return p ? [p] : [];
      }
      if (sql.includes('INSERT INTO pagos_cuenta')) {
        const [id, tenantId, cuentaId, solicitudId, hash, monto, metodo, userId, cajaId, notas] = params;
        const pay = { id, tenant_id: tenantId, cuenta_id: cuentaId, solicitud_id: solicitudId, solicitud_hash: hash, monto, metodo, usuario_id: userId, caja_id: cajaId, notas, created_at: new Date().toISOString() };
        dbPayments[id] = pay;
        return [pay];
      }
      if (sql.includes('UPDATE cuentas_operativas SET saldo=saldo-$1 WHERE id=$2')) {
        const [monto, accId] = params;
        if (dbAccounts[accId]) {
          dbAccounts[accId].saldo = Number(dbAccounts[accId].saldo) - Number(monto);
        }
        return [{ id: accId }];
      }

      // 7. Caja
      if (sql.includes("SELECT * FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA'")) {
        const [tenantId, userId] = params;
        const c = Object.values(dbCashBoxes).find((box: any) => box.tenant_id === tenantId && box.usuario_id === userId && box.estado === 'ABIERTA');
        return c ? [c] : [];
      }
      if (sql.includes("SELECT COALESCE(SUM(monto),0) AS total FROM movimientos_caja WHERE caja_id=$1 AND metodo='EFECTIVO'")) {
        const [cajaId] = params;
        const movs = dbCashMovements[cajaId] || [];
        const total = movs.filter(m => m.metodo === 'EFECTIVO').reduce((sum, m) => sum + Number(m.monto), 0);
        return [{ total }];
      }
      if (sql.includes('INSERT INTO movimientos_caja')) {
        const [id, cajaId, userId, tipo, monto, metodo, refId, concepto] = params;
        if (!dbCashMovements[cajaId]) dbCashMovements[cajaId] = [];
        const mov = { id, caja_id: cajaId, usuario_id: userId, tipo, monto, metodo, referencia_id: refId, concepto, created_at: new Date().toISOString() };
        dbCashMovements[cajaId].push(mov);
        return [mov];
      }

      // 8. Auditoría y Movimientos de inventario
      if (sql.includes('INSERT INTO auditoria_operaciones')) {
        const [id, tenantId, userId, operacion, entidadId, datosStr] = params;
        if (!dbAuditLogs[tenantId]) dbAuditLogs[tenantId] = [];
        const log = { id, tenant_id: tenantId, usuario_id: userId, operacion, entidad_id: entidadId, datos: typeof datosStr === 'string' ? JSON.parse(datosStr) : datosStr, created_at: new Date().toISOString() };
        dbAuditLogs[tenantId].push(log);
        return [log];
      }
      if (sql.includes('INSERT INTO movimientos_inventario')) {
        const [id, tenantId, userId, prodId, tipo, anterior, nuevo, cantidad, docId, motivo] = params;
        if (!dbStockMovements[prodId]) dbStockMovements[prodId] = [];
        const mov = { id, tenant_id: tenantId, usuario_id: userId, producto_id: prodId, tipo, anterior, nuevo, cantidad, documento_id: docId, motivo, created_at: new Date().toISOString() };
        dbStockMovements[prodId].push(mov);
        return [mov];
      }

      return [];
    }),
    tenantModule: {
      findUnique: vi.fn().mockResolvedValue({ enabled: true }),
    },
    producto: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        const p = dbProducts[where.id];
        if (p && p.tenant_id === where.tenantId && (!where.activo || p.activo)) {
          return { ...p, precioCosto: p.precio_costo, stockActual: p.stock_actual };
        }
        return null;
      }),
    },
    usuario: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        const u = dbUsers[where.id];
        if (u && (!where.tenantId || u.tenant_id === where.tenantId) && (!where.activo || u.activo)) {
          return { ...u, tenant: { id: u.tenant_id, estado: 'ACTIVO' } };
        }
        return null;
      }),
    },
  };

  beforeEach(async () => {
    // Restablecer base de datos sintética
    dbUsers = {
      'admin-1': { id: 'admin-1', tenant_id: 'tenant-A', nombre: 'Ana Admin', rol: 'ADMIN', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 100 },
      'bodeguero-1': { id: 'bodeguero-1', tenant_id: 'tenant-A', nombre: 'Bruno Bodeguero', rol: 'BODEGUERO', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 0 },
      'cajero-1': { id: 'cajero-1', tenant_id: 'tenant-A', nombre: 'Carlos Cajero', rol: 'CAJERO', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 0 },
      'admin-B': { id: 'admin-B', tenant_id: 'tenant-B', nombre: 'Bernardo Admin B', rol: 'ADMIN', activo: true, permisosConfigurados: false, permisos: [], descuentoMaximo: 100 },
    };

    dbSuppliers = {
      'prov-1': { id: 'prov-1', tenant_id: 'tenant-A', nombre: 'Distribuidora Ferretera S.A.', telefono: '2233-4455', rtn: '08011990123456' },
      'prov-B': { id: 'prov-B', tenant_id: 'tenant-B', nombre: 'Proveedor Exclusivo Tenant B', telefono: '2211-0000', rtn: '08011995999999' },
    };

    dbProducts = {
      'prod-cement': { id: 'prod-cement', tenant_id: 'tenant-A', codigo: 'CEM-01', nombre: 'Cemento Gris 42.5kg', precio_costo: 180.00, stock_actual: 50.00, activo: true },
      'prod-iron': { id: 'prod-iron', tenant_id: 'tenant-A', codigo: 'HIERRO-38', nombre: 'Varilla Hierro 3/8"', precio_costo: 120.00, stock_actual: 100.00, activo: true },
      'prod-B': { id: 'prod-B', tenant_id: 'tenant-B', codigo: 'PROD-B', nombre: 'Producto Tenant B', precio_costo: 50.00, stock_actual: 10.00, activo: true },
    };

    dbOrders = {};
    dbOrderDetails = {};
    dbReceptions = {};
    dbCostsHistory = {};
    dbAccounts = {};
    dbPayments = {};
    dbStockMovements = {};
    dbAuditLogs = {};

    dbCashBoxes = {
      'caja-admin-1': { id: 'caja-admin-1', tenant_id: 'tenant-A', usuario_id: 'admin-1', estado: 'ABIERTA', monto_apertura: 5000 },
    };
    dbCashMovements = {
      'caja-admin-1': [{ id: 'mov-init', caja_id: 'caja-admin-1', metodo: 'EFECTIVO', monto: 5000 }],
    };

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
    return jwtService.sign({ sub, tenantId, rol, type: 'tenant', email: `${sub}@test.com` });
  }

  // Escenario 1: Registrar una factura de compra asociada a un proveedor
  it('Escenario 1: Registrar una factura de compra asociada a un proveedor genera la orden y la Cuenta por Pagar (CXP)', async () => {
    const order = await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-compra-1',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-2026-001',
      vencimiento: '2026-11-15',
      isv: 0,
      items: [
        { productoId: 'prod-cement', cantidad: 10, costo: 200 }, // 10 x 200 = 2000
      ],
    });

    expect(order.id).toBe('sol-compra-1');
    expect(order.total).toBe(2000);
    expect(order.numero_factura).toBe('FACT-2026-001');

    // Verifica que se haya generado la cuenta por pagar (CXP)
    const accounts = await service.cuentas('tenant-A', 'admin-1', 'CXP');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].documento).toBe('FACT-2026-001');
    expect(accounts[0].monto).toBe(2000);
    expect(accounts[0].saldo).toBe(2000);
  });

  // Escenario 2: Detectar facturas duplicadas del mismo proveedor
  it('Escenario 2: Detectar facturas duplicadas del mismo proveedor lanza ConflictException', async () => {
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-compra-orig',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-DUP-100',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 5, costo: 200 }],
    });

    // Intentar registrar la misma factura para prov-1
    await expect(
      service.compra('tenant-A', 'admin-1', {
        solicitudId: 'sol-compra-dup',
        proveedorId: 'prov-1',
        numeroFactura: 'FACT-DUP-100',
        isv: 0,
        items: [{ productoId: 'prod-cement', cantidad: 5, costo: 200 }],
      }),
    ).rejects.toThrow('Esta factura de proveedor ya está registrada');
  });

  // Escenario 3: Registrar vencimientos y estados de pago / deudas (vencidas)
  it('Escenario 3: Calcula correctamente el vencimiento y estado de deuda vencida (vencida=true)', async () => {
    // Registrar compra con fecha de vencimiento en el pasado
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-compra-vencida',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-VENCIDA-2025',
      vencimiento: '2025-01-01T00:00:00.000Z',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 2, costo: 180 }],
    });

    const accounts = await service.cuentas('tenant-A', 'admin-1', 'CXP');
    const vencidaAcc = accounts.find(a => a.documento === 'FACT-VENCIDA-2025');

    expect(vencidaAcc).toBeDefined();
    expect(vencidaAcc.vencida).toBe(true);
  });

  // Escenario 4: Registrar pagos sin duplicarlos (idempotencia y limite de saldo)
  it('Escenario 4: Registrar pagos de CXP valida no superar saldo e impide duplicidad por solicitudId (idempotencia)', async () => {
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-compra-pago',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-PAGO-01',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 10, costo: 100 }], // Total 1000
    });

    const accounts = await service.cuentas('tenant-A', 'admin-1', 'CXP');
    const acc = accounts.find(a => a.documento === 'FACT-PAGO-01');

    // 1. Intentar pagar más del saldo pendiente (1500 > 1000)
    await expect(
      service.pagar('tenant-A', 'admin-1', acc.id, {
        solicitudId: 'pay-exceed',
        monto: 1500,
        metodo: 'EFECTIVO',
      }),
    ).rejects.toThrow('Pago mayor al saldo');

    // 2. Realizar un pago válido de 400
    const pay1 = await service.pagar('tenant-A', 'admin-1', acc.id, {
      solicitudId: 'pay-valid-1',
      monto: 400,
      metodo: 'EFECTIVO',
    });
    expect(pay1.monto).toBe(400);

    // Ver que el saldo disminuyó de 1000 a 600
    const accountsAfter = await service.cuentas('tenant-A', 'admin-1', 'CXP');
    const accAfter = accountsAfter.find(a => a.id === acc.id);
    expect(accAfter.saldo).toBe(600);

    // 3. Re-enviar exactamente la misma solicitudId de pago (idempotencia)
    const pay1Repeat = await service.pagar('tenant-A', 'admin-1', acc.id, {
      solicitudId: 'pay-valid-1',
      monto: 400,
      metodo: 'EFECTIVO',
    });
    expect(pay1Repeat.id).toBe(pay1.id); // Devuelve el mismo registro sin volver a restar saldo
    expect(accAfter.saldo).toBe(600);
  });

  // Escenario 5: Actualización de costo vigente al subir o bajar en la recepción
  it('Escenario 5: La recepción de mercancía actualiza el costo vigente tanto si sube como si baja', async () => {
    // Cemento costo inicial = 180.00

    // 1. Compra con costo superior (220.00)
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-sube',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-SUBE',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 5, costo: 220 }],
    });
    const detailIdSube = dbOrderDetails['sol-sube'][0].id;

    await service.recibir('tenant-A', 'bodeguero-1', 'sol-sube', {
      solicitudId: 'rec-sube',
      items: [{ detalleId: detailIdSube, cantidad: 5 }],
    });

    // Costo vigente actualizado a 220
    expect(dbProducts['prod-cement'].precio_costo).toBe(220);

    // 2. Compra posterior con costo menor (150.00)
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-baja',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-BAJA',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 5, costo: 150 }],
    });
    const detailIdBaja = dbOrderDetails['sol-baja'][0].id;

    await service.recibir('tenant-A', 'bodeguero-1', 'sol-baja', {
      solicitudId: 'rec-baja',
      items: [{ detalleId: detailIdBaja, cantidad: 5 }],
    });

    // Costo vigente actualizado a 150 (bajó correctamente)
    expect(dbProducts['prod-cement'].precio_costo).toBe(150);
  });

  // Escenario 6: Conservación inmutable del historial de costos
  it('Escenario 6: Conserva inalterable el historial de costos en costos_compra', async () => {
    // 1. Compra 1 con costo 220
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-hist-1',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-HIST-1',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 5, costo: 220 }],
    });
    await service.recibir('tenant-A', 'bodeguero-1', 'sol-hist-1', {
      solicitudId: 'rec-hist-1',
      items: [{ detalleId: dbOrderDetails['sol-hist-1'][0].id, cantidad: 5 }],
    });

    // 2. Compra 2 con costo 150
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-hist-2',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-HIST-2',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 5, costo: 150 }],
    });
    await service.recibir('tenant-A', 'bodeguero-1', 'sol-hist-2', {
      solicitudId: 'rec-hist-2',
      items: [{ detalleId: dbOrderDetails['sol-hist-2'][0].id, cantidad: 5 }],
    });

    // Historial actual de prod-cement debe contener los registros de las recepciones anteriores
    const history = await service.historial('tenant-A', 'prod-cement');
    expect(history.costos.length).toBe(2);

    const costSube = history.costos.find(c => Number(c.costo) === 220);
    const costBaja = history.costos.find(c => Number(c.costo) === 150);

    expect(costSube).toBeDefined();
    expect(costBaja).toBeDefined();
    expect(costSube.proveedor_nombre).toBe('Distribuidora Ferretera S.A.');
  });

  // Escenario 7: Validar inventario recibido y cantidades decimales
  it('Escenario 7: Soporta cantidades decimales al recibir mercancía (p. ej. 2.50 unidades)', async () => {
    const initialStock = Number(dbProducts['prod-cement'].stock_actual);

    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-decimal',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-DECIMAL',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 2.5, costo: 100 }],
    });

    const detailIdDecimal = dbOrderDetails['sol-decimal'][0].id;

    await service.recibir('tenant-A', 'bodeguero-1', 'sol-decimal', {
      solicitudId: 'rec-decimal',
      items: [{ detalleId: detailIdDecimal, cantidad: 2.5 }],
    });

    // Stock incrementado con precisión decimal exacta (+2.50)
    expect(dbProducts['prod-cement'].stock_actual).toBe(initialStock + 2.5);
  });

  // Escenario 8: Verificar permisos - Cajero rechazado (403)
  it('Escenario 8: Un CAJERO es rechazado (403 Forbidden) al intentar registrar compras o pagos a proveedores', async () => {
    const tokenCajero = createToken('cajero-1', 'tenant-A', 'CAJERO');

    // 1. Crear compra vía HTTP con token de cajero -> 403
    await request(app.getHttpServer())
      .post('/operaciones/compras')
      .set('Authorization', `Bearer ${tokenCajero}`)
      .send({
        solicitudId: 'sol-cajero-forbidden',
        proveedorId: 'prov-1',
        numeroFactura: 'FACT-CAJERO',
        isv: 0,
        items: [{ productoId: 'prod-cement', cantidad: 1, costo: 100 }],
      })
      .expect(403);

    // 2. Registrar compra directamente en servicio con rol CAJERO -> ForbiddenException
    await expect(
      service.compra('tenant-A', 'cajero-1', {
        solicitudId: 'sol-compra-cajero',
        proveedorId: 'prov-1',
        numeroFactura: 'FACT-CAJERO-SERVICE',
        isv: 0,
        items: [{ productoId: 'prod-cement', cantidad: 1, costo: 100 }],
      }),
    ).rejects.toThrow('Su rol de usuario no tiene autorización para acceder a esta función');

    // 3. Registrar pago a proveedor en servicio directamente con rol CAJERO sobre una CXP -> ForbiddenException
    // Primero crear una CXP como admin
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-cxp-test',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-CXP-TEST',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 1, costo: 100 }],
    });
    const accounts = await service.cuentas('tenant-A', 'admin-1', 'CXP');
    const acc = accounts.find(a => a.documento === 'FACT-CXP-TEST');

    await expect(
      service.pagar('tenant-A', 'cajero-1', acc.id, {
        solicitudId: 'pay-cajero',
        monto: 100,
        metodo: 'EFECTIVO',
      }),
    ).rejects.toThrow('Pago a proveedor requiere administrador');
  });

  // Escenario 9: Aislamiento entre tenants
  it('Escenario 9: Aislamiento estricto entre tenants (Tenant A no puede acceder ni comprar con entidades de Tenant B)', async () => {
    // Admin de Tenant A intenta comprar un producto que pertenece a Tenant B
    await expect(
      service.compra('tenant-A', 'admin-1', {
        solicitudId: 'sol-cross-tenant',
        proveedorId: 'prov-1',
        numeroFactura: 'FACT-CROSS',
        isv: 0,
        items: [{ productoId: 'prod-B', cantidad: 1, costo: 50 }], // prod-B es de tenant-B
      }),
    ).rejects.toThrow('Producto no encontrado');

    // Admin de Tenant A intenta consultar compras con proveedor de Tenant B
    await expect(
      service.compra('tenant-A', 'admin-1', {
        solicitudId: 'sol-cross-prov',
        proveedorId: 'prov-B', // Proveedor de tenant-B
        numeroFactura: 'FACT-CROSS-PROV',
        isv: 0,
        items: [{ productoId: 'prod-cement', cantidad: 1, costo: 100 }],
      }),
    ).rejects.toThrow('Proveedor no encontrado');
  });

  // Escenario 10: Idempotencia en recepción y tolerancia a fallos
  it('Escenario 10: Idempotencia al reintentar una recepción de compra evita duplicar el incremento de existencias', async () => {
    await service.compra('tenant-A', 'admin-1', {
      solicitudId: 'sol-idem-rec',
      proveedorId: 'prov-1',
      numeroFactura: 'FACT-IDEM-REC',
      isv: 0,
      items: [{ productoId: 'prod-cement', cantidad: 10, costo: 100 }],
    });

    const detailIdIdem = dbOrderDetails['sol-idem-rec'][0].id;
    const stockBefore = dbProducts['prod-cement'].stock_actual;

    // Recepción 1
    const rec1 = await service.recibir('tenant-A', 'bodeguero-1', 'sol-idem-rec', {
      solicitudId: 'rec-idem-unique',
      items: [{ detalleId: detailIdIdem, cantidad: 10 }],
    });

    const stockAfterFirst = dbProducts['prod-cement'].stock_actual;
    expect(stockAfterFirst).toBe(stockBefore + 10);

    // Reintento con misma solicitudId (Simulando fallo de red / reconexión)
    const rec1Repeat = await service.recibir('tenant-A', 'bodeguero-1', 'sol-idem-rec', {
      solicitudId: 'rec-idem-unique',
      items: [{ detalleId: detailIdIdem, cantidad: 10 }],
    });

    expect(rec1Repeat.id).toBe(rec1.id);
    // El stock no volvió a incrementarse (+10), se mantuvo intacto
    expect(dbProducts['prod-cement'].stock_actual).toBe(stockAfterFirst);
  });
});
