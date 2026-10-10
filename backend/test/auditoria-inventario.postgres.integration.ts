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


  // Regresiones del contrato seguro: las solicitudes obsoletas nunca sobrescriben datos recientes.
  it('QA-INV-001: aplicar invalida el formulario antiguo y no cambia el precio vigente', async()=>{
    const old=(await call('get',`/productos/${productId}`).expect(200)).body;
    await add(item({productoId:productId,cantidad:8,precioVenta:9})).expect(201);
    await finish(); const p=(await preview()).body; await apply(p.token).expect(201);
    const applied=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    // Regla de precios: el precio contado (9) no reemplaza el vigente (4); la auditoría solo cambia existencias.
    expect(Number(applied.precioVenta)).toBe(4);
    expect(applied.version).toBe(old.version+1);
    await call('put',`/productos/${productId}`,{version:old.version,precioVenta:5}).expect(409);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).precioVenta)).toBe(4);

  });
  it('QA-INV-002: conciliación obsoleta conserva 12; tras recargar permite una decisión explícita',async()=>{
    const a=(await add(item({productoId:productId,cantidad:3})).expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({productoId:productId,cantidad:4}),'BODEGUERO').expect(201)).body;
    const snapshot=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    expect(snapshot[0].items.map((i:any)=>i.cantidad).sort()).toEqual([3,4]);
    await call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,cantidad:12},'BODEGUERO').expect(200);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token:snapshot[0].token}).expect(409);
    expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:b.id}})).cantidad)).toBe(12);
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,operacion:'CONTEO_CONCILIAR_ELIMINAR'}})).toBe(0);
    const fresh=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    expect(fresh[0].token).not.toBe(snapshot[0].token);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token:fresh[0].token}).expect(201);
    expect(await prisma.levantamientoItem.findUnique({where:{id:b.id}})).toBeNull();
    const [audit]=await prisma.$queryRawUnsafe<any[]>("SELECT datos FROM auditoria_operaciones WHERE entidad_id=$1 AND operacion='CONTEO_CONCILIAR_ELIMINAR'",b.id);
    expect(audit.datos.anterior).toMatchObject({id:b.id,cantidad:12,contadorId:users.BODEGUERO.id,version:b.version+1});
    await finish(); const p=(await preview()).body; await apply(p.token).expect(201);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).stockActual)).toBe(3);

  });
  it('QA-INV-003: identidad mixta forma un solo conflicto conciliable; edición y conciliación lo conservan',async()=>{
    const a=(await add(item({productoId:productId,codigoBarras:'001234'})).expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'001234'}),'BODEGUERO').expect(201)).body;
    const groups=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    expect(groups).toHaveLength(1); expect(groups[0].items.map((i:any)=>i.id).sort()).toEqual([a.id,b.id].sort());
    await call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,cantidad:4},'BODEGUERO').expect(200);
    const rows=await prisma.levantamientoItem.findMany({where:{levantamientoId:lid}});
    expect(rows.every(r=>r.conflicto)).toBe(true);
    const fresh=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token:fresh[0].token}).expect(201);
    expect(await prisma.levantamientoItem.findUnique({where:{id:b.id}})).toBeNull();
    const p=(await preview()).body; expect(p.rows.some((r:any)=>r.errores.some((e:string)=>e.includes('duplicado')))).toBe(false);
  });
  it('QA-INV-001B: recepción invalida el costo obsoleto y conserva costo, precio e historial',async()=>{
    const old=(await call('get',`/productos/${productId}`).expect(200)).body;
    const proveedor=await prisma.proveedor.create({data:{tenantId,nombre:'Proveedor QA'}});
    const ops=new OperacionesService(prisma);
    const order=await ops.compra(tenantId,users.ADMIN.id,{solicitudId:randomUUID(),proveedorId:proveedor.id,numeroFactura:'QA-1',isv:0,fecha:'2026-10-10',vencimiento:'2026-11-10',items:[{productoId:productId,cantidad:5,costo:6}]} as any);
    const [line]=await prisma.$queryRawUnsafe<{id:string}[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1',order.id);
    await ops.recibir(tenantId,users.BODEGUERO.id,order.id,{solicitudId:randomUUID(),items:[{detalleId:line.id,cantidad:5}]} as any);
    const received=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect(received.version).toBe(old.version+1); expect(Number(received.precioCosto)).toBe(6);
    await call('put',`/productos/${productId}`,{version:old.version,precioCosto:3}).expect(409);
    const after=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect([Number(after.precioCosto),Number(after.costoVigente),Number(after.stockActual)]).toEqual([6,6,13]);
    expect(Number(after.precioVenta)).toBe(4);
    expect(await prisma.costoCompra.count({where:{tenantId,productoId:productId}})).toBe(1);
  });
  const conflictToken=async(id:string)=>(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body.find((g:any)=>g.items.some((i:any)=>i.id===id)).token;
  const conflictPair=async()=>{
    const a=(await add(item({productoId:productId,cantidad:3})).expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({productoId:productId,cantidad:4}),'BODEGUERO').expect(201)).body;
    return {a,b,token:await conflictToken(a.id)};
  };

  it('QA-INV-002: el token cubre también el conteo conservado y permite releerlo después de editar',async()=>{
    const {a,b,token}=await conflictPair();
    await call('patch',`/levantamientos/${lid}/items/${a.id}`,{version:a.version,cantidad:12}).expect(200);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token}).expect(409);
    expect(await prisma.levantamientoItem.findUnique({where:{id:b.id}})).not.toBeNull();
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token:await conflictToken(a.id)}).expect(201);
    expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:a.id}})).cantidad)).toBe(12);
  });

  it('QA-INV-002: un nuevo integrante invalida el snapshot sin eliminar ningún conteo',async()=>{
    const {a,b,token}=await conflictPair();
    const id=randomUUID();
    await prisma.usuario.create({data:{id,tenantId,nombre:'Segundo administrador',email:`${id}@test.invalid`,passwordHash:'not-a-password',rol:'ADMIN',permisosConfigurados:true,permisos:['inventario.editar']}});
    users.SECOND={id,token:jwt.sign({sub:id,tenantId,type:'tenant'})};
    const c=(await call('post',`/levantamientos/${lid}/items`,item({productoId:productId,cantidad:5}),'SECOND').expect(201)).body;
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token}).expect(409);
    expect(await prisma.levantamientoItem.count({where:{id:{in:[a.id,b.id,c.id]}}})).toBe(3);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:c.id,token:await conflictToken(c.id),cantidadManual:7.25}).expect(201);
    expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:c.id}})).cantidad)).toBe(7.25);
  });

  it('QA-INV-002: cambiar otro producto no bloquea una decisión válida de este grupo',async()=>{
    const {a,b,token}=await conflictPair();
    const otherA=(await add(item({codigo:'OTRO',cantidad:5})).expect(201)).body;
    const otherB=(await call('post',`/levantamientos/${lid}/items`,item({codigo:'OTRO',cantidad:6}),'BODEGUERO').expect(201)).body;
    await call('patch',`/levantamientos/${lid}/items/${otherB.id}`,{version:otherB.version,cantidad:9},'BODEGUERO').expect(200);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token}).expect(201);
    expect(await prisma.levantamientoItem.findUnique({where:{id:b.id}})).toBeNull();
    expect(await prisma.levantamientoItem.count({where:{id:{in:[otherA.id,otherB.id]},conflicto:true}})).toBe(2);
  });

  it('QA-INV-002: solicitudes sin snapshot y actores sin permisos no modifican el grupo',async()=>{
    const {a,token}=await conflictPair();
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id}).expect(400);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token},'BODEGUERO').expect(403);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token},'CAJERO').expect(403);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token},'OTHER').expect(404);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid,conflicto:true}})).toBe(2);
  });

  it('QA-INV-002: dos decisiones simultáneas solo confirman una y no duplican auditorías',async()=>{
    const {a,b,token}=await conflictPair();
    const results=await Promise.all([
      call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token}),
      call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:b.id,token}),
    ]);
    expect(results.filter(r=>r.status===201)).toHaveLength(1);
    expect(results.every(r=>[201,404,409].includes(r.status))).toBe(true);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(1);
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,operacion:'CONTEO_CONCILIAR'}})).toBe(1);
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,operacion:'CONTEO_CONCILIAR_ELIMINAR'}})).toBe(1);
  });

  it('QA-INV-002: edición y decisión concurrentes conservan un orden transaccional sin perder 12',async()=>{
    const {a,b,token}=await conflictPair();
    const [edit,resolve]=await Promise.all([
      call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,cantidad:12},'BODEGUERO'),
      call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token}),
    ]);
    if(edit.status===200){
      expect(resolve.status).toBe(409);
      expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:b.id}})).cantidad)).toBe(12);
    }else{
      expect(edit.status).toBe(404); expect(resolve.status).toBe(201);
      const [audit]=await prisma.$queryRawUnsafe<any[]>("SELECT datos FROM auditoria_operaciones WHERE entidad_id=$1 AND operacion='CONTEO_CONCILIAR_ELIMINAR'",b.id);
      expect(audit.datos.anterior.cantidad).toBe(4);
    }
  });

  it('QA-INV-002: un fallo al auditar después de eliminar revierte todo y permite reintentar el snapshot',async()=>{
    const {a,b,token}=await conflictPair();
    await prisma.$executeRawUnsafe("CREATE FUNCTION fail_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operacion='CONTEO_CONCILIAR' THEN RAISE EXCEPTION 'fallo QA'; END IF; RETURN NEW; END $$");
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_reconciliation BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION fail_reconciliation()');
    try{
      await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token}).expect(500);
      expect(await prisma.levantamientoItem.count({where:{id:{in:[a.id,b.id]},conflicto:true}})).toBe(2);
      expect((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:a.id}})).version).toBe(a.version);
      expect(await prisma.auditoriaOperacion.count({where:{tenantId,operacion:'CONTEO_CONCILIAR_ELIMINAR'}})).toBe(0);
    }finally{
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_reconciliation ON auditoria_operaciones');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_reconciliation()');
    }
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id,token}).expect(201);
  });

});
