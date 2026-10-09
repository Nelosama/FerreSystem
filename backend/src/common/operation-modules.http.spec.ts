import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantModuleGuard } from './guards/tenant-module.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OperacionesController } from '../operaciones/operaciones.controller';
import { OperacionesService } from '../operaciones/operaciones.service';
import { ProveedoresController } from '../proveedores/proveedores.controller';
import { ProveedoresService } from '../proveedores/proveedores.service';
import { CotizacionesController } from '../cotizaciones/cotizaciones.controller';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';

const cases: [string, string, string[]][] = [
['post','/operaciones/proveedores',['ordenes_compra']],
  ['get','/operaciones/compras',['ordenes_compra']], ['post','/operaciones/compras',['ordenes_compra']],
  ['post','/operaciones/compras/id/recepciones',['ordenes_compra','inventario']],
  ['get','/operaciones/productos/id/historial',['inventario']], ['post','/operaciones/productos/id/ajuste',['inventario']],
  ['get','/operaciones/entregas',['pos']], ['post','/operaciones/ventas/id/entregar',['pos']],
  ['get','/operaciones/resumen',['reportes']], ['get','/operaciones/ventas/buscar',['pos']],
  ['post','/operaciones/ventas/id/devoluciones',['pos']], ['post','/operaciones/ventas/id/solicitudes-devolucion',['pos']],
  ['get','/operaciones/solicitudes-devolucion',['pos']], ['get','/operaciones/solicitudes-devolucion/id',['pos']],
  ['post','/operaciones/solicitudes-devolucion/id/decision',['pos']], ['post','/operaciones/solicitudes-devolucion/id/ejecutar',['pos']],
  ['get','/operaciones/devoluciones/id',['pos']],
  ['get','/proveedores',['ordenes_compra']], ['get','/proveedores/id',['ordenes_compra']],
  ['post','/proveedores',['ordenes_compra']], ['patch','/proveedores/id',['ordenes_compra']], ['delete','/proveedores/id',['ordenes_compra']],
  ['post','/cotizaciones/id/convertir',['cotizaciones','pos']],
];
describe('Module restrictions through HTTP (mock services/database)', () => {
  let app: INestApplication;
  const disabled = new Set<string>();
  const invoked = vi.fn((tenantId: string) => ({ tenantId }));
  const services = Object.fromEntries(['proveedores','proveedor','compras','compra','recibir','historial','ajustar','entregas','entregar','resumen','buscarVenta','devolver','solicitarDevolucion','solicitudesDevolucion','consultarDevolucion','decidirDevolucion','ejecutarAutorizada','consultarDevolucionDirecta','create','findAll','findById','addPayment','productHistory','update','deactivate','convertirAVenta','caja','cuentas','auditoria'].map(key => [key, invoked]));
  const findUnique = vi.fn(async ({ where }) => ({ enabled: !disabled.has(`${where.tenantId_moduleKey.tenantId}:${where.tenantId_moduleKey.moduleKey}`) }));
  beforeAll(async () => {
    vi.spyOn(JwtAuthGuard.prototype, 'canActivate').mockImplementation(async (context) => {
      const req = context.switchToHttp().getRequest();
      req.user = { sub:'u', tenantId: req.headers['x-test-tenant'] ?? 'A', rol:req.headers['x-test-role'] ?? 'ADMIN', type:'tenant', permisosConfigurados:true, permisos:[] };
      return true;
    });
    const module = await Test.createTestingModule({
      controllers:[OperacionesController, ProveedoresController, CotizacionesController],
      providers:[...([OperacionesService, ProveedoresService, CotizacionesService].map(provide => ({ provide, useValue:services }))),
        { provide:PrismaService, useValue:{ tenantModule:{ findUnique } } }, { provide:APP_GUARD, useClass:TenantModuleGuard }],
    }).compile();
    app=module.createNestApplication(); await app.init();
  });
  beforeEach(() => { disabled.clear(); invoked.mockClear(); findUnique.mockClear(); });
  afterAll(async () => { await app?.close(); vi.restoreAllMocks(); });
  it.each(cases)('%s %s requires each dependency %j and scopes the enabled request', async (method, path, modules) => {
    for (const key of modules) {
      disabled.add(`A:${key}`);
      await (request(app.getHttpServer()) as any)[method](path).send({}).expect(403);
      expect(invoked).not.toHaveBeenCalled(); disabled.clear();
    }
    disabled.add(`B:${modules[0]}`);
    const response=await (request(app.getHttpServer()) as any)[method](path).set('x-tenant-id','B').send({}).expect(method==='post'?201:200);
    expect(response.body.tenantId).toBe('A');
    expect(invoked.mock.calls[0][0]).toBe('A');
  });
  it('shared supplier lookup works for POS or purchasing, and rejects when both are disabled', async () => {
    disabled.add('A:ordenes_compra'); disabled.add('A:pos');
    await request(app.getHttpServer()).get('/operaciones/proveedores').expect(403);
    expect(invoked).not.toHaveBeenCalled();
    for (const enabled of ['pos','ordenes_compra']) {
      disabled.delete(`A:${enabled}`);
      await request(app.getHttpServer()).get('/operaciones/proveedores').set('x-test-role','VENDEDOR').expect(200);
      expect(invoked.mock.calls.at(-1)?.[0]).toBe('A');
      disabled.add(`A:${enabled}`);
    }
  });
  it('retains role and permission denials when modules are enabled', async () => {
    await request(app.getHttpServer()).post('/operaciones/compras').set('x-test-role','CAJERO').send({}).expect(403);
    await request(app.getHttpServer()).post('/operaciones/productos/id/ajuste').set('x-test-role','BODEGUERO').send({}).expect(403);
    expect(invoked).not.toHaveBeenCalled();
  });
  it('base cash, existing accounts and trace remain readable with optional modules disabled', async () => {
    for(const key of ['pos','ordenes_compra','inventario','reportes'])disabled.add(`A:${key}`);
    for(const path of ['caja','cuentas','auditoria'])await request(app.getHttpServer()).get(`/operaciones/${path}`).expect(200);
  });
});
