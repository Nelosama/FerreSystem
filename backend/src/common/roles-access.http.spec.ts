import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CashierResponseInterceptor } from './interceptors/cashier-response.interceptor';
import { ProductosController } from '../productos/productos.controller';
import { ProductosService } from '../productos/productos.service';
import { TenantsController } from '../tenants/tenants.controller';
import { TenantsService } from '../tenants/tenants.service';
import { UsuariosController } from '../usuarios/usuarios.controller';
import { UsuariosService } from '../usuarios/usuarios.service';
import { VentasController } from '../ventas/ventas.controller';
import { VentasService } from '../ventas/ventas.service';
import { CotizacionesController } from '../cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';

describe('Roles and cashier HTTP access', () => {
  let app: INestApplication;
  const product = { id: 'p', nombre: 'Cable', precioVenta: 10, precioCosto: 4, margen: 60 };
  const products = { findAll: vi.fn().mockResolvedValue([product]), findById: vi.fn().mockResolvedValue(product), delete: vi.fn().mockResolvedValue(product), create: vi.fn(), update: vi.fn() };
  const sales = { findAll: vi.fn().mockResolvedValue([]), findById: vi.fn().mockResolvedValue({ detalles: [{ costoUnitario: 4, producto: product }] }), create: vi.fn().mockResolvedValue({ id: 'v' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductosController, TenantsController, UsuariosController, VentasController, CotizacionesController],
      providers: [
        { provide: ProductosService, useValue: products },
        { provide: TenantsService, useValue: { getTenantSettings: () => ({}), updateTenantBranding: () => ({}) } },
        { provide: UsuariosService, useValue: { findAll: () => [] } },
        { provide: VentasService, useValue: sales },
        { provide: CotizacionesService, useValue: { create: () => ({ id: 'c' }) } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      req.user = { rol: req.headers['x-test-role'], sub: 'cashier-1', tenantId: 'tenant-1', type: 'tenant' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it.each([['delete', '/productos/p'], ['post', '/productos'], ['put', '/productos/p'], ['get', '/tenant/settings'], ['put', '/tenant/settings'], ['get', '/usuarios']])('denies cashier %s %s', async (method, path) => {
    await (request(app.getHttpServer()) as any)[method](path).set('x-test-role', 'CAJERO').send({}).expect(403);
  });
  it('allows admin deletion and retains costs', async () => {
    const response = await request(app.getHttpServer()).delete('/productos/p').set('x-test-role', 'ADMIN').expect(200);
    expect(response.body.precioCosto).toBe(4);
  });
  it('allows product reads without costs, including nested responses', async () => {
    const response = await request(app.getHttpServer()).get('/productos').set('x-test-role', 'CAJERO').expect(200);
    expect(response.body).toEqual([{ id: 'p', nombre: 'Cable', precioVenta: 10 }]);
    const sale = await request(app.getHttpServer()).get('/ventas/v').set('x-test-role', 'CAJERO').expect(200);
    expect(sale.body.detalles[0]).toEqual({ producto: { id: 'p', nombre: 'Cable', precioVenta: 10 } });
    expect(sales.findById).toHaveBeenLastCalledWith('tenant-1', 'v', 'cashier-1');
  });
  it('scopes history to cashier and leaves admin history unrestricted', async () => {
    await request(app.getHttpServer()).get('/ventas').set('x-test-role', 'CAJERO').expect(200);
    expect(sales.findAll).toHaveBeenLastCalledWith('tenant-1', 50, 0, 'cashier-1');
    await request(app.getHttpServer()).get('/ventas').set('x-test-role', 'ADMIN').expect(200);
    expect(sales.findAll).toHaveBeenLastCalledWith('tenant-1', 50, 0, undefined);
  });
  it.each(['/ventas', '/cotizaciones'])('allows cashier creation at %s', async path => {
    await request(app.getHttpServer()).post(path).set('x-test-role', 'CAJERO').send({}).expect(201);
  });
});
