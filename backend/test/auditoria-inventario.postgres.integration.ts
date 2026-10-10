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

import { ProductosController } from '../src/productos/productos.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { ProductosService } from '../src/productos/productos.service';

// Dedicated disposable cluster. Never use an external DATABASE_URL or apply migrations.
describe('Auditoría independiente / reproducciones confirmadas', () => {
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
  const apply=(token:string)=>call('post',`/levantamientos/${lid}/aplicar`,{token});
  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-lev001-'));
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-lev001-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });


  beforeEach(async()=>{
    tenantId=randomUUID();otherTenantId=randomUUID();
    for(const id of [tenantId,otherTenantId])await prisma.tenant.create({data:{id,nombreComercial:'Levantamiento sintético'}});
    for(const rol of ['ADMIN','BODEGUERO','CAJERO'] as const){
      const id=randomUUID();
      await prisma.usuario.create({data:{id,tenantId,nombre:rol,email:`${id}@test.invalid`,passwordHash:'not-a-password',rol,permisosConfigurados:true,permisos:['inventario.editar','inventario.ver']}});
      users[rol]={id,token:jwt.sign({sub:id,tenantId,type:'tenant'})};
    }
    const id=randomUUID();
    await prisma.usuario.create({data:{id,tenantId:otherTenantId,nombre:'Ajeno',email:`${id}@test.invalid`,passwordHash:'not-a-password',rol:'ADMIN'}});
    users.OTHER={id,token:jwt.sign({sub:id,tenantId:otherTenantId,type:'tenant'})};
    productId=(await prisma.producto.create({data:{tenantId,codigo:'CABLE',codigoBarras:'001234',nombre:'Cable metro',unidadMedida:'METRO',precioCosto:2,precioVenta:4,stockActual:8,stockReservado:1}})).id;
    lid=(await call('post','/levantamientos',{nombre:'Conteo inicial'}).expect(201)).body.id;
  });


  // Estas pruebas afirman el comportamiento defectuoso observado, no aceptación.
  it('QA-INV-001: aplicar no invalida versión; formulario antiguo revierte precio', async()=>{
    const old=(await call('get',`/productos/${productId}`).expect(200)).body;
    await add(item({productoId:productId,cantidad:8,precioVenta:9})).expect(201);
    await finish(); const p=(await preview()).body; await apply(p.token).expect(201);
    const applied=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect(Number(applied.precioVenta)).toBe(9);
    expect(applied.version).toBe(old.version);
    await call('put',`/productos/${productId}`,{version:old.version,precioVenta:5}).expect(200);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).precioVenta)).toBe(5);
    console.log('QA-INV-001: precio 4 -> conteo 9 -> formulario obsoleto 5, HTTP 200, versión inicial 1');
  });
  it('QA-INV-002: conciliación antigua elimina un conteo modificado sin advertir',async()=>{
    const a=(await add(item({productoId:productId,cantidad:3})).expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({productoId:productId,cantidad:4}),'BODEGUERO').expect(201)).body;
    const snapshot=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    expect(snapshot[0].items.map((i:any)=>i.cantidad).sort()).toEqual([3,4]);
    await call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,cantidad:12},'BODEGUERO').expect(200);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id}).expect(201);
    expect(await prisma.levantamientoItem.findUnique({where:{id:b.id}})).toBeNull();
    const [audit]=await prisma.$queryRawUnsafe<any[]>("SELECT datos FROM auditoria_operaciones WHERE entidad_id=$1 AND operacion='CONTEO_CONCILIAR_ELIMINAR'",b.id);
    expect(audit.datos.anterior).toBeUndefined();
    await finish(); const p=(await preview()).body; await apply(p.token).expect(201);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).stockActual)).toBe(3);
    console.log('QA-INV-002: administrador vio 4, empleado corrigió a 12, conciliación obsoleta borró 12 y aplicó 3');
  });
  it('QA-INV-003: identidad mixta separa conflictos; edición limpia ambos y bloquea conciliación',async()=>{
    const a=(await add(item({productoId:productId,codigoBarras:'001234'})).expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'001234'}),'BODEGUERO').expect(201)).body;
    const groups=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    expect(groups).toHaveLength(2); expect(groups.every((g:any)=>g.items.length===1)).toBe(true);
    await call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,cantidad:4},'BODEGUERO').expect(200);
    const rows=await prisma.levantamientoItem.findMany({where:{levantamientoId:lid}});
    expect(rows.every(r=>!r.conflicto)).toBe(true);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id}).expect(404);
    const p=(await preview()).body; expect(p.rows.some((r:any)=>r.errores.some((e:string)=>e.includes('duplicado')))).toBe(true);
    console.log('QA-INV-003: dos grupos individuales, banderas limpiadas, conciliación 404 y preview duplicado');
  });

  it('QA-INV-001B: recepción no invalida formulario de costo y deja costos inconsistentes',async()=>{
    const old=(await call('get',`/productos/${productId}`).expect(200)).body;
    const proveedor=await prisma.proveedor.create({data:{tenantId,nombre:'Proveedor QA'}});
    const ops=new OperacionesService(prisma);
    const order=await ops.compra(tenantId,users.ADMIN.id,{solicitudId:randomUUID(),proveedorId:proveedor.id,numeroFactura:'QA-1',isv:0,fecha:'2026-10-10',vencimiento:'2026-11-10',items:[{productoId:productId,cantidad:5,costo:6}]} as any);
    const [line]=await prisma.$queryRawUnsafe<{id:string}[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1',order.id);
    await ops.recibir(tenantId,users.BODEGUERO.id,order.id,{solicitudId:randomUUID(),items:[{detalleId:line.id,cantidad:5}]} as any);
    const received=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect(received.version).toBe(old.version); expect(Number(received.precioCosto)).toBe(6);
    await call('put',`/productos/${productId}`,{version:old.version,precioCosto:3}).expect(200);
    const after=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect([Number(after.precioCosto),Number(after.costoVigente),Number(after.stockActual)]).toEqual([3,6,13]);
    expect(await prisma.costoCompra.count({where:{tenantId,productoId:productId}})).toBe(1);
  });
});
