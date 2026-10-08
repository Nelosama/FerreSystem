import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { CashierResponseInterceptor } from '../common/interceptors/cashier-response.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';

describe('SEC-005 product HTTP responses (real JWT, guards, service; mocked persistence)', () => {
  let app: INestApplication;
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  const users = new Map<string, any>();
  const product = {
    id: 'product-a', tenantId: 'tenant-a', codigo: 'CABLE', nombre: 'Cable',
    codigoBarras: '123', codigoFabricante: 'CAB', descripcion: 'Por metro',
    precioVenta: new Prisma.Decimal(10), precioCosto: new Prisma.Decimal(4),
    costoVigente: new Prisma.Decimal(5), margen: new Prisma.Decimal(60),
    ultimaCompraAt: new Date(), stockActual: new Prisma.Decimal(8),
    stockReservado: new Prisma.Decimal(2), stockMinimo: new Prisma.Decimal(7),
    unidadMedida: 'METRO', usaMedida: true, activo: true, imagenUrl: null,
    categoriaId: 'category-a', categoria: { id: 'category-a', nombre: 'Electricidad', interno: 'private' },
    futuroCampoInterno: 123,
  };
  const rows = [product, { ...product, id: 'product-b', tenantId: 'tenant-b', codigo: 'OTRO' }];
  const matches = (p: any, where: any) => p.tenantId === where.tenantId &&
    (!where.id || p.id === where.id) && (!where.categoriaId || p.categoriaId === where.categoriaId) &&
    (!where.OR || where.OR.some((condition: any) => Object.entries(condition).some(
      ([field, filter]: [string, any]) => p[field]?.toLowerCase().includes(filter.contains.toLowerCase()),
    )));
  const prisma = {
    usuario: { findFirst: vi.fn(async ({ where }: any) => {
      const user = users.get(where.id);
      return user?.tenantId === where.tenantId && user.activo ? user : null;
    }) },
    producto: {
      findMany: vi.fn(async ({ where }: any) => rows.filter(p => matches(p, where))),
      findFirst: vi.fn(async ({ where }: any) => rows.find(p => matches(p, where)) ?? null),
    },
  };
  const token = (rol: string, permisos: string[] = [], configured = true, tenantId = 'tenant-a') => {
    const sub = `${rol}-${users.size}`;
    users.set(sub, { rol, permisos, permisosConfigurados: configured, tenantId, activo: true, tenant: { estado: 'ACTIVO' } });
    return { sub, value: jwt.sign({ sub, tenantId, type: 'tenant', rol: 'ADMIN', permisos: ['inventario.ver'] }) };
  };
  const get = (path: string, value: string) => request(app.getHttpServer()).get(path).auth(value, { type: 'bearer' });
  const paths = ['/productos', '/productos?search=cAb&categoriaId=category-a', '/productos/product-a', '/productos/alertas/stock-bajo'];
  const unwrap = (body: any) => Array.isArray(body) ? body[0] : body;
  function expectPublic(p: any) {
    expect(p).toMatchObject({ id: 'product-a', codigo: 'CABLE', precioVenta: 10, stockReservado: 2,
      stockDisponible: 6, unidadMedida: 'METRO', usaMedida: true, categoria: { id: 'category-a', nombre: 'Electricidad' } });
    for (const key of ['precioCosto', 'costoVigente', 'margen', 'ultimaCompraAt', 'tenantId', 'futuroCampoInterno']) {
      expect(p).not.toHaveProperty(key);
    }
    expect(p.categoria).not.toHaveProperty('interno');
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductosController],
      providers: [ProductosService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it.each(paths)('ADMIN retains financial data at %s', async path => {
    const response = await get(path, token('ADMIN').value).expect(200);
    expect(unwrap(response.body)).toMatchObject({ precioCosto: 4, costoVigente: '5', margen: '60' });
    expect(unwrap(response.body)).toHaveProperty('ultimaCompraAt');
  });
  it.each(['CAJERO', 'VENDEDOR', 'BODEGUERO'])('%s without permission receives only operational fields on every read', async role => {
    const auth = token(role, ['pos.vender']);
    for (const path of paths) {
      const response = await get(path, auth.value).expect(200);
      expectPublic(unwrap(response.body));
      expect(unwrap(response.body).stockActual).toBe(8);
    }
  });
  it.each([true, false])('BODEGUERO preserves effective inventory permission (configured=%s)', async configured => {
    const auth = token('BODEGUERO', configured ? ['inventario.ver'] : [], configured);
    for (const path of paths) {
      const response = await get(path, auth.value).expect(200);
      expect(unwrap(response.body)).toHaveProperty('costoVigente', '5');
    }
  });
  it.each(['CAJERO', 'VENDEDOR'])('legacy %s and arbitrary inventory permission do not grant a financial role', async role => {
    for (const configured of [false, true]) {
      const response = await get('/productos', token(role, ['inventario.ver'], configured).value).expect(200);
      expectPublic(response.body[0]);
    }
  });
  it('ignores forged permissions, tenant, select and include query parameters', async () => {
    const auth = token('VENDEDOR');
    const response = await get('/productos?tenantId=tenant-b&rol=ADMIN&permisos=inventario.ver&includeCosts=true&select[precioCosto]=true&include[costosCompra]=true', auth.value).expect(200);
    expect(response.body).toHaveLength(1);
    expectPublic(response.body[0]);
  });
  it.each(['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'])('%s cannot read another tenant product', async role => {
    const auth = token(role, ['inventario.ver', 'pos.vender']);
    await get('/productos/product-b?tenantId=tenant-b', auth.value).expect(404);
    const own = await get('/productos', token(role, ['inventario.ver'], true, 'tenant-b').value).expect(200);
    expect(own.body.map((p: any) => p.id)).toEqual(['product-b']);
  });
  it.each(['ADMIN', 'CAJERO', 'VENDEDOR'])('POS catalog for %s preserves sale price and available stock without costs', async role => {
    const response = await get('/productos/comercial?includeCosts=true', token(role, ['pos.vender']).value).expect(200);
    expectPublic(response.body[0]);
    expect(response.body[0]).toMatchObject({ stockActual: 6, stockFisico: 8, stockBajo: true });
  });
  it('reloads revoked permission and role with the same JWT', async () => {
    const auth = token('BODEGUERO', ['inventario.ver']);
    expect((await get('/productos/product-a', auth.value)).body).toHaveProperty('precioCosto');
    users.get(auth.sub).permisos = [];
    expectPublic((await get('/productos/product-a', auth.value)).body);
    users.get(auth.sub).rol = 'VENDEDOR';
    users.get(auth.sub).permisos = ['inventario.ver'];
    expectPublic((await get('/productos/product-a', auth.value)).body);
    users.get(auth.sub).activo = false;
    await get('/productos', auth.value).expect(401);
  });
  it('rejects missing authentication, forged tenant membership and platform identity', async () => {
    await request(app.getHttpServer()).get('/productos').expect(401);
    const auth = token('ADMIN');
    await get('/productos', jwt.sign({ sub: auth.sub, type: 'tenant', tenantId: 'tenant-b' })).expect(401);
    await get('/productos', jwt.sign({ sub: 'platform', type: 'super_admin' })).expect(403);
    users.get(auth.sub).tenant.estado = 'SUSPENDIDO';
    await get('/productos', auth.value).expect(401);
  });
  it('preserves POS permission and inventory mutation role guards', async () => {
    await get('/productos/comercial', token('VENDEDOR').value).expect(403);
    for (const role of ['CAJERO', 'VENDEDOR']) {
      const auth = token(role, ['inventario.editar']);
      for (const method of ['post', 'put', 'delete'] as const) {
        await request(app.getHttpServer())[method](method === 'post' ? '/productos' : '/productos/product-a')
          .auth(auth.value, { type: 'bearer' }).send({ precioCosto: 1 }).expect(403);
      }
    }
  });
  it('filters mutation responses when BODEGUERO can edit but cannot read financials', async () => {
    const service = app.get(ProductosService);
    const create = vi.spyOn(service, 'create').mockResolvedValue(product);
    const update = vi.spyOn(service, 'update').mockResolvedValue(product);
    try {
      const auth = token('BODEGUERO', ['inventario.editar']);
      for (const method of ['post', 'put'] as const) {
        const response = await request(app.getHttpServer())[method](method === 'post' ? '/productos' : '/productos/product-a')
          .auth(auth.value, { type: 'bearer' }).send({ nombre: 'Cable' }).expect(method === 'post' ? 201 : 200);
        expect(response.body).not.toHaveProperty('precioCosto');
        expect(response.body).not.toHaveProperty('costoVigente');
        expect(response.body).not.toHaveProperty('margen');
      }
    } finally {
      create.mockRestore();
      update.mockRestore();
    }
  });
});
