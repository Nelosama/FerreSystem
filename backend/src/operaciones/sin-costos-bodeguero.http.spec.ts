import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantModuleGuard } from '../common/guards/tenant-module.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OperacionesController } from './operaciones.controller';
import { OperacionesService } from './operaciones.service';

// KARDEX (P0 privacidad): BODEGUERO no recibe costos, totales de compra ni costos de proveedor por ninguna ruta de operaciones.
// Servicios simulados con la forma real de la base; la prueba mide solo lo que sale por HTTP.
const costosCompra = { subtotal: 30, isv: 4.5, total: 34.5, precio_costo: 3 };
const datos = {
  compras: [{ id: 'o1', numero_factura: 'F-1', estado: 'SOLICITADA', proveedor_nombre: 'Proveedor A', ...costosCompra,
    items: [{ id: 'd1', producto_id: 'p1', nombre: 'Cable', cantidad: 10, cantidad_recibida: 0, precio_costo: 3, subtotal: 30 }] }],
  historial: { movimientos: [{ id: 'm1', tipo: 'COMPRA', anterior: 0, nuevo: 10, cantidad: 10 }],
    costos: [{ id: 'c1', costo: 3, proveedor_nombre: 'Proveedor A', numero_factura: 'F-1' }] },
  proveedoresProducto: [{ id: 'pp1', proveedor_id: 'v1', proveedor_nombre: 'Proveedor A', codigo_proveedor: 'X-1', es_preferido: true, ultimo_costo: 3 }],
  entregas: [{ id: 'v1', numero_venta: 7, items: [{ id: 'l1', nombre: 'Cable', cantidad: 2, precio_unitario: 4, costo_unitario: 3 }] }],
  compra: { id: 'o2', total: 34.5, subtotal: 30, isv: 4.5, precio_costo: 3, items: [] },
};

describe('KARDEX · BODEGUERO sin costos por ninguna ruta de operaciones (HTTP)', () => {
  let app: INestApplication;
  const servicio = {
    compras: vi.fn(async () => structuredClone(datos.compras)),
    compra: vi.fn(async () => structuredClone(datos.compra)),
    historial: vi.fn(async () => structuredClone(datos.historial)),
    proveedoresProducto: vi.fn(async () => structuredClone(datos.proveedoresProducto)),
    entregas: vi.fn(async () => structuredClone(datos.entregas)),
  };

  beforeAll(async () => {
    vi.spyOn(JwtAuthGuard.prototype, 'canActivate').mockImplementation(async (context) => {
      const req = context.switchToHttp().getRequest();
      req.user = { sub: 'u', tenantId: 'A', rol: req.headers['x-test-role'] ?? 'ADMIN', type: 'tenant', permisosConfigurados: true, permisos: ['inventario.ver', 'inventario.editar', 'pos.vender'] };
      return true;
    });
    const module = await Test.createTestingModule({
      controllers: [OperacionesController],
      providers: [
        { provide: OperacionesService, useValue: servicio },
        { provide: PrismaService, useValue: { tenantModule: { findUnique: vi.fn(async () => ({ enabled: true })) } } },
        { provide: APP_GUARD, useClass: TenantModuleGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app?.close(); vi.restoreAllMocks(); });

  const get = (ruta: string, rol: string) => request(app.getHttpServer()).get(ruta).set('x-test-role', rol);
  const sinCostos = (valor: unknown) => JSON.stringify(valor);

  it.each([
    ['/operaciones/compras'],
    ['/operaciones/productos/p1/historial'],
    ['/operaciones/productos/p1/proveedores'],
    ['/operaciones/entregas'],
  ])('BODEGUERO no recibe costos en %s', async (ruta) => {
    const cuerpo = (await get(ruta, 'BODEGUERO').expect(200)).body;
    const texto = sinCostos(cuerpo);
    for (const clave of ['precio_costo', 'costo_unitario', 'ultimo_costo', '"costos"', '"costo"', 'subtotal', 'isv', 'total']) {
      if (ruta === '/operaciones/entregas' && ['subtotal', 'isv', 'total'].includes(clave)) continue;
      expect(texto).not.toContain(clave);
    }
  });

  it('BODEGUERO conserva lo necesario para recibir: cantidades, productos, factura y estado de la compra', async () => {
    const compra = (await get('/operaciones/compras', 'BODEGUERO').expect(200)).body[0];
    expect(compra).toMatchObject({ numero_factura: 'F-1', estado: 'SOLICITADA', proveedor_nombre: 'Proveedor A' });
    expect(compra.items[0]).toMatchObject({ nombre: 'Cable', cantidad: 10 });
    const historial = (await get('/operaciones/productos/p1/historial', 'BODEGUERO').expect(200)).body;
    expect(historial.movimientos[0]).toMatchObject({ tipo: 'COMPRA', cantidad: 10 });
  });

  it('ADMIN sigue viendo costos y totales de compra e historial de costos', async () => {
    const compra = (await get('/operaciones/compras', 'ADMIN').expect(200)).body[0];
    expect(compra).toMatchObject({ total: 34.5, subtotal: 30, isv: 4.5 });
    expect(compra.items[0].precio_costo).toBe(3);
    const historial = (await get('/operaciones/productos/p1/historial', 'ADMIN').expect(200)).body;
    expect(historial.costos[0]).toMatchObject({ costo: 3, proveedor_nombre: 'Proveedor A' });
  });

  it('CAJERO no llega a rutas de compras ni de costos de proveedor', async () => {
    await get('/operaciones/compras', 'CAJERO').expect(403);
    await get('/operaciones/productos/p1/historial', 'CAJERO').expect(403);
  });

  it('BODEGUERO no registra compras con costo: POST /operaciones/compras responde 403', async () => {
    await request(app.getHttpServer()).post('/operaciones/compras').set('x-test-role', 'BODEGUERO')
      .send({ solicitudId: '7a1d4c52-7d6a-4b8f-9d3e-2f1c0b9a8e11', proveedorId: 'v1', numeroFactura: 'F-2', isv: 0, items: [{ productoId: 'p1', cantidad: 1, costo: 3 }] }).expect(403);
    expect(servicio.compra).not.toHaveBeenCalled();
  });

  it('ADMIN registra la compra y recibe su respuesta completa', async () => {
    const cuerpo = (await request(app.getHttpServer()).post('/operaciones/compras').set('x-test-role', 'ADMIN')
      .send({ solicitudId: '7a1d4c52-7d6a-4b8f-9d3e-2f1c0b9a8e11', proveedorId: 'v1', numeroFactura: 'F-2', isv: 0, items: [{ productoId: 'p1', cantidad: 1, costo: 3 }] }).expect(201)).body;
    expect(cuerpo).toMatchObject({ total: 34.5, subtotal: 30 });
  });
});
