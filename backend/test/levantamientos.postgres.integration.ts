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
import { ProductosService } from '../src/productos/productos.service';

// Dedicated disposable cluster. Never use an external DATABASE_URL or apply migrations.
describe('LEV-001 / HTTP and isolated PostgreSQL', () => {
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

  it('reconcilia barcode con espacios sin crear otro producto; persiste cantidades y auditoría una sola vez',async()=>{
    const command=item({codigoBarras:' 001234 ',ubicacion:'Pasillo 1',marca:'Marca'});
    const responses=await Promise.all([add(command),add(command)]);
    expect(responses.map(r=>r.status)).toEqual([201,201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(responses[0].body.codigoBarras).toBe('001234');
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(1);
    await finish();
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).stockActual)).toBe(8);
    const p=(await preview()).body;
    expect(p.rows[0]).toMatchObject({productoId:productId,anterior:8,nuevo:3.5,errores:[]});
    const applied=await Promise.all([apply(p.token),apply(p.token)]);
    expect(applied.map(r=>r.status)).toEqual([201,201]);
    await apply(p.token).expect(201);
    expect(await prisma.producto.count({where:{tenantId}})).toBe(1);
    const stored=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect([Number(stored.stockActual),Number(stored.stockReservado)]).toEqual([3.5,1]);
    const movements=await prisma.movimientoInventario.findMany({where:{tenantId,documentoId:lid}});
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({usuarioId:users.ADMIN.id,tipo:'LEVANTAMIENTO'});
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,operacion:'LEVANTAMIENTO_APLICAR',usuarioId:users.ADMIN.id}})).toBe(1);
    expect(await prisma.compraProveedor.count({where:{tenantId}})).toBe(0);
    expect((await call('get',`/levantamientos/${lid}`).expect(200)).body.items[0]).toMatchObject({createdBy:users.ADMIN.id,ubicacion:'Pasillo 1',marca:'Marca',cantidad:3.5});
  });

  it('captura anterior con espacios también identifica el producto durante preview',async()=>{
    const created=(await add(item()).expect(201)).body;
    await prisma.levantamientoItem.update({where:{id:created.id},data:{codigoBarras:' 001234 '}});
    const p=(await preview()).body;
    expect(p.rows[0].productoId).toBe(productId);
  });

  it('bloquea dos barcodes equivalentes sin afectar existencias',async()=>{
    await add(item({codigoBarras:' 0099 '})).expect(201);
    await add(item({codigoBarras:'0099'})).expect(201);
    await finish();
    const p=(await preview()).body;
    expect(p.rows[1].errores).toContain('Código de barras repetido en el conteo');
    await apply(p.token).expect(400);
    expect(await prisma.producto.count({where:{tenantId}})).toBe(1);
    expect(await prisma.movimientoInventario.count({where:{tenantId}})).toBe(0);
  });

  it('edición normaliza barcode, conserva versión y no sobreescribe cambios concurrentes',async()=>{
    const created=(await add(item()).expect(201)).body;
    const path=`/levantamientos/${lid}/items/${created.id}`;
    const changed=await call('patch',path,{version:1,codigoBarras:' 001234 '}).expect(200);
    expect(changed.body).toMatchObject({codigoBarras:'001234',version:2,updatedBy:users.ADMIN.id});
    await call('patch',path,{version:1,cantidad:99}).expect(409);
    expect((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:created.id}})).codigoBarras).toBe('001234');
  });

  it('catálogo permite alta cero/decimal, busca por código/nombre/categoría y rechaza duplicados',async()=>{
    const dto={codigo:'VAR-1',codigoBarras:' 00999 ',nombre:'Varilla 3/8',categoria:'Acero',unidadMedida:'UNIDAD',stockActual:0,stockMinimo:0,precioCosto:25,precioVenta:35};
    const created=(await call('post','/productos',dto).expect(201)).body;
    await call('post','/productos',{...dto,codigo:' var-1 '}).expect(409);
    await call('post','/productos',{...dto,codigo:'VAR-2'}).expect(409);
    const fractional=(await call('post','/productos',{...dto,codigo:'CABLE-2',codigoBarras:'00888',nombre:'Cable 2',unidadMedida:'METRO',stockActual:2.75}).expect(201)).body;
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:fractional.id}})).stockActual)).toBe(2.75);
    for(const query of ['search=var-1','search=Varilla',`categoriaId=${created.categoriaId}`]){
      expect((await call('get',`/productos?${query}`).expect(200)).body.some((p:any)=>p.id===created.id)).toBe(true);
    }
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:created.id}})).stockActual)).toBe(0);
  });

  it('crea productos nuevos desde conteo en cero, metros y piezas sin simular compras',async()=>{
    for(const [descripcion,unidad,cantidad] of [['Lámina 10 pies','UNIDAD',2],['Canaleta 6 metros','UNIDAD',0],['Varilla 3/8','UNIDAD',5],['Cable rollo','METRO',2.75]] as const){
      await add(item({descripcion,unidad,cantidad})).expect(201);
    }
    await finish();const p=(await preview()).body;
    expect(p.rows.every((r:any)=>r.errores.length===0)).toBe(true);
    await apply(p.token).expect(201);
    expect(await prisma.producto.count({where:{tenantId}})).toBe(5);
    expect(await prisma.movimientoInventario.count({where:{tenantId,tipo:'LEVANTAMIENTO'}})).toBe(4);
    expect(await prisma.compraProveedor.count({where:{tenantId}})).toBe(0);
    const zero=await prisma.producto.findFirstOrThrow({where:{tenantId,nombre:'Canaleta 6 metros'}});
    expect([Number(zero.stockActual),Number(zero.precioCosto),Number(zero.precioVenta)]).toEqual([0,2,4]);
    expect(Number(zero.costoVigente)).toBe(2);
  });

  it('aísla sesiones e items y permite el mismo barcode en otro tenant sin mezclar productos',async()=>{
    await call('get',`/levantamientos/${lid}`,{},'OTHER').expect(404);
    await call('post',`/levantamientos/${lid}/items`,item(),'OTHER').expect(404);
    const foreign=(await call('post','/productos',{codigo:'CABLE',codigoBarras:'001234',nombre:'Ajeno',precioCosto:8,precioVenta:9,stockActual:20,stockMinimo:0,unidadMedida:'METRO'},'OTHER').expect(201)).body;
    await add(item({codigoBarras:' 001234 '})).expect(201);
    await finish();await apply((await preview()).body.token).expect(201);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:foreign.id}})).stockActual)).toBe(20);
    await call('put',`/productos/${productId}`,{stockActual:99,motivo:'Ajeno'},'OTHER').expect(404);
  });

  it('rechaza cajero, permiso revocado y aplicación por bodeguero',async()=>{
    for(const path of ['/levantamientos','/productos'])await call('post',path,{nombre:'No autorizado'},'CAJERO').expect(403);
    await call('post',`/levantamientos/${lid}/items`,item(),'CAJERO').expect(403);
    await call('post',`/levantamientos/${lid}/aplicar`,{token:'x'},'BODEGUERO').expect(403);
    await prisma.usuario.update({where:{id:users.BODEGUERO.id},data:{permisos:[]}});
    await call('post',`/levantamientos/${lid}/items`,item(),'BODEGUERO').expect(403);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(0);
  });

  it('rechaza cantidades inválidas, cambios bajo reserva y previews obsoletos',async()=>{
    for(const cantidad of [-1,1.234])await add(item({cantidad})).expect(400);
    const created=(await add(item({codigoBarras:'001234',cantidad:0})).expect(201)).body;
    expect((await preview()).body.rows[0].errores.join(' ')).toContain('pendiente de entrega');
    await call('patch',`/levantamientos/${lid}/items/${created.id}`,{version:1,cantidad:3.5}).expect(200);
    await finish();const p=(await preview()).body;
    await prisma.producto.update({where:{id:productId},data:{stockActual:7}});
    await apply(p.token).expect(409);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).stockActual)).toBe(7);
  });

  it('alta sin SKU recupera el mismo resultado concurrente sin duplicar stock y detecta reutilización', async()=>{
    const dto={solicitudId:randomUUID(),nombre:'Tornillo negro 1/2',precioCosto:2,precioVenta:4,stockActual:12,stockMinimo:0};
    const results=await Promise.all([call('post','/productos',dto),call('post','/productos',dto)]);
    expect(results.map(r=>r.status)).toEqual([201,201]);
    expect(results[0].body.id).toBe(results[1].body.id);
    const pid=results[0].body.id;
    await call('post','/productos',{...dto,stockActual:13}).expect(409);
    await call('post','/productos',dto,'BODEGUERO').expect(409);
    await call('put',`/productos/${pid}`,{stockActual:10,motivo:'Corrección posterior'}).expect(200);
    expect((await call('post','/productos',dto).expect(201)).body.stockActual).toBe(10);
    expect(await prisma.movimientoInventario.count({where:{tenantId,productoId:pid,tipo:'INICIAL'}})).toBe(1);
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,entidadId:pid,operacion:'PRODUCTO_CREAR'}})).toBe(1);
    const other=await call('post','/productos',dto,'OTHER').expect(201);
    expect(other.body.id).not.toBe(pid);
    const distinct=await call('post','/productos',{...dto,solicitudId:randomUUID()}).expect(201);
    expect(distinct.body.id).not.toBe(pid);
  });

  it('concilia fabricante, detecta ambigüedad y evita crear productos duplicados',async()=>{
    await call('put',`/productos/${productId}`,{codigoFabricante:' Fab-001 '}).expect(200);
    await add(item({codigo:' fab-001 '})).expect(201);
    const p=(await preview()).body;
    expect(p.rows[0]).toMatchObject({productoId:productId,errores:[]});
    const conflicting=await prisma.producto.create({data:{tenantId,codigo:'FAB-001',nombre:'Otra variante',unidadMedida:'METRO',precioCosto:1,precioVenta:2}});
    const ambiguous=(await preview()).body;
    expect(ambiguous.rows[0].errores.length).toBeGreaterThan(0);
    await finish();await apply(ambiguous.token).expect(400);
    await prisma.producto.delete({where:{id:conflicting.id}});
    await apply((await preview()).body.token).expect(201);
    expect(await prisma.producto.count({where:{tenantId}})).toBe(1);
  });

  it('rechaza unidades, nulos y desbordamientos al capturar y corregir, antes de finalizar',async()=>{
    for(const values of [{unidad:'DOCENA'},{unidad:null},{cantidad:1e10},{precioCosto:1e10},{precioVenta:1e10}]){
      await add(item(values)).expect(400);
    }
    const created=(await add(item({unidad:' metro '})).expect(201)).body;
    expect(created.unidad).toBe('METRO');
    for(const values of [{unidad:'DOCENA'},{cantidad:null},{cantidad:1e10},{precioCosto:null}]){
      await call('patch',`/levantamientos/${lid}/items/${created.id}`,{version:1,...values}).expect(400);
    }
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(1);
  });

  it('un reintento tardío no resucita un conteo eliminado y conserva la auditoría original',async()=>{
    const dto=item();const created=(await add(dto).expect(201)).body;
    await call('delete',`/levantamientos/${lid}/items/${created.id}?version=1`).expect(200);
    await add(dto).expect(409);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(0);
    expect(await prisma.auditoriaOperacion.count({where:{tenantId,entidadId:created.id,operacion:'CONTEO_CREAR'}})).toBe(1);
  });

  it('alta revocada no permite recuperar ni crear y un fallo del movimiento revierte producto y solicitud',async()=>{
    const dto={solicitudId:randomUUID(),nombre:'Alta recuperable',precioCosto:2,precioVenta:4,stockActual:12,stockMinimo:0};
    const first=(await call('post','/productos',dto,'BODEGUERO').expect(201)).body;
    await prisma.usuario.update({where:{id:users.BODEGUERO.id},data:{permisos:[]}});
    await call('post','/productos',dto,'BODEGUERO').expect(403);
    await prisma.usuario.update({where:{id:users.BODEGUERO.id},data:{permisos:['inventario.editar','inventario.ver']}});
    expect((await call('post','/productos',dto,'BODEGUERO').expect(201)).body.id).toBe(first.id);
    // Deliberate failure in the isolated database after the product insert.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_initial_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tipo='INICIAL' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_initial_test BEFORE INSERT ON movimientos_inventario FOR EACH ROW EXECUTE FUNCTION reject_initial_test()`);
    const retry={...dto,solicitudId:randomUUID(),nombre:'Rollback sintético'};
    try {
      await call('post','/productos',retry).expect(500);
      expect(await prisma.producto.count({where:{tenantId,nombre:retry.nombre}})).toBe(0);
      expect(await prisma.auditoriaOperacion.count({where:{tenantId,entidadId:retry.solicitudId}})).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_initial_test ON movimientos_inventario');
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_initial_test()');
    }
    const recovered=(await call('post','/productos',retry).expect(201)).body;
    expect((await call('post','/productos',retry).expect(201)).body.id).toBe(recovered.id);
    expect(await prisma.movimientoInventario.count({where:{tenantId,productoId:recovered.id}})).toBe(1);
  });

  it('mantiene costo vigente en alta/edición/conteo, rechaza nulos y no reutiliza barcode de un inactivo',async()=>{
    const dto={codigoBarras:'UNICO',nombre:'Artículo',precioCosto:2,precioVenta:4,stockActual:12,stockMinimo:0};
    const p=(await call('post','/productos',dto).expect(201)).body;
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:p.id}})).costoVigente)).toBe(2);
    await call('put',`/productos/${p.id}`,{precioCosto:3}).expect(200);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:p.id}})).costoVigente)).toBe(3);
    for(const values of [{stockActual:null},{precioCosto:null},{stockMinimo:1e10}])await call('put',`/productos/${p.id}`,values).expect(400);
    await add(item({codigoBarras:'UNICO',unidad:'UNIDAD',precioCosto:5})).expect(201);
    await finish();await apply((await preview()).body.token).expect(201);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:p.id}})).costoVigente)).toBe(5);
    await call('delete',`/productos/${p.id}`).expect(200);
    await call('post','/productos',dto).expect(409);
    await call('put',`/productos/${productId}`,{codigoBarras:'UNICO'}).expect(409);
  });
});
