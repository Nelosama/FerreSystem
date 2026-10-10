import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CashierResponseInterceptor } from '../src/common/interceptors/cashier-response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { LevantamientosController } from '../src/levantamientos/levantamientos.controller';
import { LevantamientosService } from '../src/levantamientos/levantamientos.service';
import { VentasService } from '../src/ventas/ventas.service';

import { ProductosController } from '../src/productos/productos.controller';
import { ProductosService } from '../src/productos/productos.service';

// Dedicated disposable cluster. Never use an external DATABASE_URL or apply migrations.
describe('Precios y aprobación para venta — HTTP y PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  let directory: string, prisma: PrismaService, app: INestApplication;
  let started = false;
  let tenantId:string, otherTenantId:string, lid:string, productId:string;
  const users:Record<string,{id:string;token:string}>={};
  const call=(method:'get'|'post'|'patch'|'put'|'delete',path:string,body={},role='ADMIN')=>
    request(app.getHttpServer())[method](`/api${path}`).auth(users[role].token,{type:'bearer'}).send(body);
  const item=(overrides={})=>({solicitudId:randomUUID(),descripcion:'Cable metro',cantidad:3.5,unidad:'METRO',precioCosto:2,precioVenta:4,...overrides});
  const add=(body:any)=>call('post',`/levantamientos/${lid}/items`,body);
  const finish=()=>call('patch',`/levantamientos/${lid}`,{estado:'FINALIZADO'}).expect(200);
  const preview=()=>call('get',`/levantamientos/${lid}/preview`).expect(200);
  const conflictToken=async(id:string)=>(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body.find((g:any)=>g.items.some((i:any)=>i.id===id)).token;
  const apply=(token:string)=>call('post',`/levantamientos/${lid}/aplicar`,{token});
  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-precios-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    // Override all connection variables for child processes as well as Prisma.
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    // Disposable fixture: no crash-durability assertion, so skip initial fsync.
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${process.platform === 'win32' ? '' : ' -k ' + directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // Offline DDL generation from the current model, not the migration history.
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [LevantamientosController, ProductosController],
      providers: [LevantamientosService, ProductosService, JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 120000);
  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-precios-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });


  beforeEach(async()=>{
    tenantId=randomUUID();otherTenantId=randomUUID();
    for(const id of [tenantId,otherTenantId])await prisma.tenant.create({data:{id,nombreComercial:'Precios sintético'}});
    for(const rol of ['ADMIN','BODEGUERO','CAJERO'] as const){
      const id=randomUUID();
      await prisma.usuario.create({data:{id,tenantId,nombre:rol==='ADMIN'?'Dueña sintética':rol,email:`${id}@test.invalid`,passwordHash:'not-a-password',rol,permisosConfigurados:true,permisos:['inventario.editar','inventario.ver']}});
      users[rol]={id,token:jwt.sign({sub:id,tenantId,type:'tenant'})};
    }
    const otherId=randomUUID();
    await prisma.usuario.create({data:{id:otherId,tenantId:otherTenantId,nombre:'Ajeno',email:`${otherId}@test.invalid`,passwordHash:'not-a-password',rol:'ADMIN'}});
    users.OTHER={id:otherId,token:jwt.sign({sub:otherId,tenantId:otherTenantId,type:'tenant'})};
    // Caja abierta del administrador: la venta la exige antes de validar líneas.
    await prisma.caja.create({data:{tenantId,codigo:'C-01',usuarioId:users.ADMIN.id,montoApertura:0,estado:'ABIERTA'}});
    // Producto que ya se vendía antes de esta funcionalidad: precio aprobado, costo y precio fijados por el administrador.
    productId=(await prisma.producto.create({data:{tenantId,codigo:'CABLE',codigoBarras:'001234',nombre:'Cable metro',unidadMedida:'METRO',precioCosto:2,precioVenta:4,precioAprobado:true,precioAprobadoPor:users.ADMIN.id,precioAprobadoAt:new Date(),stockActual:8,stockReservado:0}})).id;
    lid=(await call('post','/levantamientos',{nombre:'Conteo inicial'}).expect(201)).body.id;
  });

  const priceCall=(id:string,body:any,role='ADMIN')=>call('patch',`/productos/${id}/precios`,body,role);
  const ventas=()=>new VentasService(prisma);
  const sale=(pid:string,cantidad=1)=>ventas().create(tenantId,users.ADMIN.id,{solicitudId:randomUUID(),detalles:[{productoId:pid,cantidad}]} as any);

  it('el personal no define precios: alta sin precio queda pendiente y con precio responde 403',async()=>{
    const pendiente=(await call('post','/productos',{nombre:'Clavo 2 pulgadas',stockActual:0,stockMinimo:0,solicitudId:randomUUID()},'BODEGUERO').expect(201)).body;
    expect(pendiente).toMatchObject({precioVenta:0,pendienteConfiguracion:true});
    // P1: BODEGUERO no recibe costo en la respuesta del alta.
    expect(pendiente).not.toHaveProperty('precioCosto');
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:pendiente.id}});
    expect(stored.precioAprobado).toBe(false);
    await call('post','/productos',{nombre:'Tuerca',stockActual:0,stockMinimo:0,precioVenta:5,precioCosto:1,solicitudId:randomUUID()},'BODEGUERO').expect(403);
  });

  it('el administrador fija precio en el alta y queda registrado quién lo aprobó',async()=>{
    const creado=(await call('post','/productos',{nombre:'Bisagra',stockActual:0,stockMinimo:0,precioVenta:30,precioCosto:18,solicitudId:randomUUID()}).expect(201)).body;
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:creado.id}});
    expect(stored).toMatchObject({precioAprobado:true,precioAprobadoPor:users.ADMIN.id});
    expect(Number(stored.precioVenta)).toBe(30);
  });

  it('ni el personal ni el administrador cambian precio desde la ficha; la ficha rechaza margen capturado',async()=>{
    await call('put',`/productos/${productId}`,{version:1,precioVenta:99},'BODEGUERO').expect(403);
    await call('put',`/productos/${productId}`,{version:1,precioCosto:9},'ADMIN').expect(403);
    await call('put',`/productos/${productId}`,{version:1,margen:50},'ADMIN').expect(400);
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect([Number(stored.precioCosto),Number(stored.precioVenta),stored.version]).toEqual([2,4,1]);
  });

  it('el conteo ignora precios capturados y no escribe costo, precio ni margen en productos existentes',async()=>{
    await call('post',`/levantamientos/${lid}/items`,{solicitudId:randomUUID(),descripcion:'Cable metro',cantidad:3,unidad:'METRO',codigoBarras:'001234',precioCosto:9,precioVenta:99,margen:50}).expect(201);
    await call('patch',`/levantamientos/${lid}`,{estado:'FINALIZADO'}).expect(200);
    const p=(await call('get',`/levantamientos/${lid}/preview`).expect(200)).body;
    expect(p.rows[0]).toMatchObject({productoId:productId,anterior:8,nuevo:3,precioPendiente:false,errores:[]});
    await call('post',`/levantamientos/${lid}/aplicar`,{token:p.token}).expect(201);
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect(Number(stored.stockActual)).toBe(3);
    expect([Number(stored.precioCosto),Number(stored.precioVenta),stored.margen]).toEqual([2,4,null]);
    expect(stored.precioAprobado).toBe(true);
  });

  it('aplicar un producto nuevo desde el conteo lo deja pendiente de precio, sin vender a precio cero',async()=>{
    await call('post',`/levantamientos/${lid}/items`,{solicitudId:randomUUID(),descripcion:'Lámina galvanizada',cantidad:12,unidad:'UNIDAD',categoria:'Láminas'}).expect(201);
    await call('patch',`/levantamientos/${lid}`,{estado:'FINALIZADO'}).expect(200);
    const p=(await call('get',`/levantamientos/${lid}/preview`).expect(200)).body;
    expect(p.rows[0]).toMatchObject({productoId:null,precioPendiente:true,errores:[]});
    await call('post',`/levantamientos/${lid}/aplicar`,{token:p.token}).expect(201);
    const nuevo=await prisma.producto.findFirstOrThrow({where:{tenantId,nombre:'Lámina galvanizada'}});
    expect(nuevo).toMatchObject({precioAprobado:false});
    expect(Number(nuevo.stockActual)).toBe(12);
    await expect(sale(nuevo.id)).rejects.toThrow('no tiene precio aprobado');
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:nuevo.id}})).stockReservado)).toBe(0);
    expect(await prisma.detalleVenta.count({where:{productoId:nuevo.id}})).toBe(0);
  });

  it('vender un producto sin precio aprobado falla en backend y no crea venta ni reserva',async()=>{
    await prisma.producto.update({where:{id:productId},data:{precioAprobado:false,precioAprobadoPor:null,precioAprobadoAt:null}});
    await expect(sale(productId)).rejects.toThrow('no tiene precio aprobado');
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect(Number(stored.stockReservado)).toBe(0);
    expect(await prisma.venta.count({where:{tenantId}})).toBe(0);
  });

  it('aprobar exige precio de venta mayor que cero, versión vigente y solo rol ADMIN',async()=>{
    await prisma.producto.update({where:{id:productId},data:{precioAprobado:false}});
    await priceCall(productId,{version:1,precioVenta:0,aprobar:true}).expect(400);
    await priceCall(productId,{version:1,aprobar:true},'BODEGUERO').expect(403);
    await priceCall(productId,{version:1,aprobar:true},'CAJERO').expect(403);
    await priceCall(productId,{version:0,aprobar:true}).expect(400);
    await priceCall(productId,{version:7,aprobar:true}).expect(409);
    await priceCall(productId,{version:1,aprobar:true},'OTHER').expect(404);
    expect((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).precioAprobado).toBe(false);
  });

  it('aprobación registra quién y cuándo, deja auditoría con antes y después, y habilita la venta',async()=>{
    await prisma.producto.update({where:{id:productId},data:{precioAprobado:false}});
    const r=(await priceCall(productId,{version:1,precioCosto:20,precioVenta:25,aprobar:true,motivo:'Lista de precios de octubre'}).expect(200)).body;
    expect(r).toMatchObject({precioAprobado:true,precioAprobadoPorNombre:'Dueña sintética',margenCalculado:20,version:2});
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect(stored).toMatchObject({precioAprobado:true,precioAprobadoPor:users.ADMIN.id,precioModificadoPor:users.ADMIN.id});
    const audit=await prisma.auditoriaOperacion.findFirstOrThrow({where:{tenantId,operacion:'PRECIO_APROBAR',entidadId:productId}});
    expect(audit.usuarioId).toBe(users.ADMIN.id);
    expect(audit.datos).toMatchObject({cambios:{precioCosto:{anterior:2,nuevo:20},precioVenta:{anterior:4,nuevo:25}},aprobado:true,motivo:'Lista de precios de octubre'});
    const venta=await sale(productId,2);
    expect(venta).toBeTruthy();
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).stockReservado)).toBe(2);
  });

  // Revocación (decisión del dueño, cierre KARDEX): cambiar el precio de venta de un producto aprobado exige nueva aprobación.
  // Un cambio solo de costo conserva la aprobación.
  it('un cambio solo de costo conserva la aprobación; cambiar el precio de venta la revoca y reaprobar exige aprobar',async()=>{
    const soloCosto=(await priceCall(productId,{version:1,precioCosto:3}).expect(200)).body;
    expect(soloCosto).toMatchObject({precioAprobado:true,precioCosto:3,precioVenta:4});
    const revocado=(await priceCall(productId,{version:soloCosto.version,precioVenta:5}).expect(200)).body;
    expect(revocado).toMatchObject({precioAprobado:false,precioVenta:5});
    await priceCall(productId,{version:revocado.version,precioVenta:5}).expect(400);
    const auditorias=await prisma.auditoriaOperacion.findMany({where:{tenantId,operacion:'PRECIO_MODIFICAR',entidadId:productId}});
    const revocada=auditorias.find(a=>(a.datos as any).revocada===true);
    expect(revocada?.datos).toMatchObject({cambios:{precioVenta:{anterior:4,nuevo:5}},revocada:true});
    expect((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).precioModificadoPor).toBe(users.ADMIN.id);
    const reaprobado=(await priceCall(productId,{version:revocado.version,aprobar:true}).expect(200)).body;
    expect(reaprobado).toMatchObject({precioAprobado:true,precioVenta:5});
  });

  it('un ajuste de existencias por la ficha no toca costo, precio ni margen',async()=>{
    await call('put',`/productos/${productId}`,{version:1,stockActual:15,stockAnterior:8,motivo:'Conteo físico'}).expect(200);
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect([Number(stored.stockActual),Number(stored.precioCosto),Number(stored.precioVenta),stored.margen]).toEqual([15,2,4,null]);
    expect(await prisma.movimientoInventario.count({where:{tenantId,productoId:productId,tipo:'AJUSTE'}})).toBe(1);
  });
});
