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
    // FS-06 fase 2: la captura por API rechaza el duplicado propio; la vista previa debe seguir bloqueando un duplicado que llegue por otra vía.
    await add(item({codigoBarras:'0099'})).expect(409);
    await prisma.levantamientoItem.create({data:{levantamientoId:lid,descripcion:'Cable metro',cantidad:1,unidad:'METRO',codigoBarras:'0099',contadorId:users.ADMIN.id,createdBy:users.ADMIN.id,updatedBy:users.ADMIN.id}});
    await finish();
    const p=(await preview()).body;
    expect(p.rows.flatMap((r:any)=>r.errores)).toContain('Código de barras repetido en el conteo');
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
  });

  it('aísla sesiones e items y permite el mismo barcode en otro tenant sin mezclar productos',async()=>{
    await call('get',`/levantamientos/${lid}`,{},'OTHER').expect(404);
    await call('post',`/levantamientos/${lid}/items`,item(),'OTHER').expect(404);
    const foreign=(await call('post','/productos',{codigo:'CABLE',codigoBarras:'001234',nombre:'Ajeno',precioCosto:8,precioVenta:9,stockActual:20,stockMinimo:0,unidadMedida:'METRO'},'OTHER').expect(201)).body;
    await add(item({codigoBarras:' 001234 '})).expect(201);
    await finish();await apply((await preview()).body.token).expect(201);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:foreign.id}})).stockActual)).toBe(20);
    await call('put',`/productos/${productId}`,{version:1,stockActual:99,motivo:'Ajeno'},'OTHER').expect(404);
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

  // ─── FS-06: integridad y trazabilidad ─────────────────────────────────────

  it('rechaza un productoId que pertenece a otra empresa sin guardar el conteo (FS-06)',async()=>{
    const ajeno=(await call('post','/productos',{codigo:'AJENO-1',nombre:'Ajeno',precioCosto:8,precioVenta:9,stockActual:20,stockMinimo:0,unidadMedida:'METRO'},'OTHER').expect(201)).body;
    await add(item({productoId:ajeno.id})).expect(400);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(0);
  });

  it('no registra presencia de usuarios en un levantamiento de otra empresa (FS-06)',async()=>{
    await call('post',`/levantamientos/${lid}/heartbeat`,{nombreUsuario:'Ajeno'},'OTHER').expect(404);
    expect(await prisma.levantamientoSesion.count({where:{levantamientoId:lid}})).toBe(0);
  });

  it('dos solicitudes simultáneas con el mismo solicitudId crean un solo conteo y una sola auditoría (FS-06)',async()=>{
    const body=item({codigoBarras:'555000'});
    const [a,b]=await Promise.all([add(body),add(body)]);
    expect([a.status,b.status].sort()).toEqual([201,201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(1);
    const [audit]=await prisma.$queryRawUnsafe<{n:number}[]>("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CONTEO_CREAR' AND entidad_id=$2",tenantId,a.body.id);
    expect(audit.n).toBe(1);
  });

  it('reintentar una captura con el mismo solicitudId tras perder la respuesta no duplica existencias (FS-06)',async()=>{
    const body=item({codigoBarras:'555001',cantidad:4});
    const first=(await add(body).expect(201)).body;
    const retry=(await add(body).expect(201)).body;
    expect(retry.id).toBe(first.id);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(1);
    expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:first.id}})).cantidad)).toBe(4);
  });

  it('un código heredado en minúsculas identifica el producto existente y no crea un duplicado al aplicar (FS-06)',async()=>{
    const legacy=await prisma.producto.create({data:{tenantId,codigo:'legacy-x1',nombre:'Heredado',unidadMedida:'UNIDAD',precioCosto:1,precioVenta:2,stockActual:5}});
    await add(item({codigo:'LEGACY-X1',cantidad:7,unidad:'UNIDAD',precioCosto:1,precioVenta:2})).expect(201);
    await finish();
    const p=(await preview()).body;
    expect(p.rows[0].productoId).toBe(legacy.id);
    expect(p.rows[0].errores).toEqual([]);
    await apply(p.token).expect(201);
    expect(await prisma.producto.count({where:{tenantId,codigo:{equals:'LEGACY-X1',mode:'insensitive'}}})).toBe(1);
    expect(Number((await prisma.producto.findUniqueOrThrow({where:{id:legacy.id}})).stockActual)).toBe(7);
  });

  it('editar un conteo para coincidir con el de otro usuario marca conflicto en ambos (FS-06)',async()=>{
    const a=(await call('post',`/levantamientos/${lid}/items`,item({codigo:'AAA-1',cantidad:1}),'ADMIN').expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigo:'BBB-1',cantidad:1}),'BODEGUERO').expect(201)).body;
    expect(a.conflicto).toBe(false);
    const edited=(await call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,codigo:'aaa-1'},'BODEGUERO').expect(200)).body;
    expect(edited.conflicto).toBe(true);
    expect((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:a.id}})).conflicto).toBe(true);
  });

  it('editar solo el nombre de un producto conserva código, barcode, costo, precio, existencias y unidad (FS-06)',async()=>{
    const before=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    await call('put',`/productos/${productId}`,{version:1,nombre:'Cable metro reforzado'}).expect(200);
    const after=await prisma.producto.findUniqueOrThrow({where:{id:productId}});
    expect(after.nombre).toBe('Cable metro reforzado');
    expect([after.codigo,after.codigoBarras,Number(after.precioCosto),Number(after.precioVenta),Number(after.stockActual),after.unidadMedida])
      .toEqual([before.codigo,before.codigoBarras,Number(before.precioCosto),Number(before.precioVenta),Number(before.stockActual),before.unidadMedida]);
  });

  // ─── FS-06 fase 2: persistencia, duplicados, idempotencia ─────────────────

  const crearProducto=(body:any,role='ADMIN')=>call('post','/productos',{precioCosto:2,precioVenta:4,stockActual:0,stockMinimo:0,unidadMedida:'UNIDAD',...body},role);

  it('persiste la marca al crear y editar en catálogo; una actualización parcial o vacía no la borra (FS-06 fase 2)',async()=>{
    const creado=(await crearProducto({codigo:'MARCA-1',nombre:'Taladro',marca:'  Bosch  '}).expect(201)).body;
    expect(creado.marca).toBe('Bosch');
    await call('put',`/productos/${creado.id}`,{version:1,nombre:'Taladro 500W'}).expect(200);
    await call('put',`/productos/${creado.id}`,{version:2,marca:'   '}).expect(200);
    expect((await prisma.producto.findUniqueOrThrow({where:{id:creado.id}})).marca).toBe('Bosch');
    await call('put',`/productos/${creado.id}`,{version:3,marca:'DeWalt'}).expect(200);
    expect((await prisma.producto.findUniqueOrThrow({where:{id:creado.id}})).marca).toBe('DeWalt');
  });

  it('la categoría se conserva al crear y en actualizaciones parciales (FS-06 fase 2)',async()=>{
    const creado=(await crearProducto({codigo:'CAT-1',nombre:'Tornillo',categoria:'Fijación'}).expect(201)).body;
    expect(creado.categoria?.nombre).toBe('Fijación');
    await call('put',`/productos/${creado.id}`,{version:1,nombre:'Tornillo 2"'}).expect(200);
    const after=await prisma.producto.findUniqueOrThrow({where:{id:creado.id},include:{categoria:true}});
    expect(after.categoria?.nombre).toBe('Fijación');
  });

  it('aplicar un conteo nuevo persiste marca y categoría; en un producto existente solo completa marca vacía y nunca la sobrescribe (FS-06 fase 2)',async()=>{
    await add(item({descripcion:'Llave inglesa',codigo:'LLAVE-9',marca:'Stanley',categoria:'Herramientas',unidad:'UNIDAD',cantidad:2,precioCosto:5,precioVenta:9})).expect(201);
    await add(item({descripcion:'Cable metro',codigoBarras:'001234',marca:'Truper',cantidad:5,unidad:'METRO'})).expect(201);
    await finish();
    const p=(await preview()).body;
    expect(p.rows.every((r:any)=>r.errores.length===0)).toBe(true);
    await apply(p.token).expect(201);
    const nuevo=await prisma.producto.findFirstOrThrow({where:{tenantId,codigo:'LLAVE-9'},include:{categoria:true}});
    expect([nuevo.marca,nuevo.categoria?.nombre]).toEqual(['Stanley','Herramientas']);
    expect((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).marca).toBe('Truper');
    // Segunda aplicación de otro levantamiento: la marca ya existente en catálogo no se reemplaza.
    await prisma.producto.update({where:{id:productId},data:{marca:'Makita'}});
    const lid2=(await call('post','/levantamientos',{nombre:'Segundo conteo'}).expect(201)).body.id;
    await call('post',`/levantamientos/${lid2}/items`,item({codigoBarras:'001234',marca:'Bosch',cantidad:5,unidad:'METRO'})).expect(201);
    await call('patch',`/levantamientos/${lid2}`,{estado:'FINALIZADO'}).expect(200);
    const p2=(await call('get',`/levantamientos/${lid2}/preview`).expect(200)).body;
    await call('post',`/levantamientos/${lid2}/aplicar`,{token:p2.token}).expect(201);
    expect((await prisma.producto.findUniqueOrThrow({where:{id:productId}})).marca).toBe('Makita');
  });

  it('los campos opcionales no impiden capturar ni aplicar un artículo nuevo (FS-06 fase 2)',async()=>{
    await add({descripcion:'Clavo 2 pulgadas',cantidad:10,unidad:'UNIDAD',precioCosto:0.5,precioVenta:1}).expect(201);
    await finish();
    const p=(await preview()).body;
    expect(p.rows[0].errores).toEqual([]);
    await apply(p.token).expect(201);
  });

  it('las notas del conteo quedan en el historial de auditoría y no se copian al catálogo (FS-06 fase 2)',async()=>{
    const created=(await add(item({codigo:'NOTA-1',notas:'Caja dañada, revisar en bodega'})).expect(201)).body;
    const [audit]=await prisma.$queryRawUnsafe<{datos:any}[]>("SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CONTEO_CREAR' AND entidad_id=$2",tenantId,created.id);
    expect(audit.datos.nuevo.notas).toBe('Caja dañada, revisar en bodega');
    expect(await prisma.producto.count({where:{tenantId,codigo:'NOTA-1'}})).toBe(0);
  });

  it('repetir un artículo ya contado por el mismo empleado devuelve CONTEO_DUPLICADO, sin sumar ni crear ítem (FS-06 fase 2)',async()=>{
    const first=(await add(item({codigo:'REP-1',cantidad:2})).expect(201)).body;
    const dup=(await add(item({codigo:'rep-1',cantidad:3})).expect(409)).body;
    expect(dup).toMatchObject({code:'CONTEO_DUPLICADO',itemId:first.id});
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(1);
    expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:first.id}})).cantidad)).toBe(2);
  });

  it('detecta el duplicado propio por producto y por código de barras, y al editar un conteo hacia otro existente (FS-06 fase 2)',async()=>{
    const porProducto=(await add(item({productoId:productId,cantidad:1})).expect(201)).body;
    expect((await add(item({productoId:productId,cantidad:1})).expect(409)).body.itemId).toBe(porProducto.id);
    const aEditar=(await add(item({descripcion:'Tuerca',codigo:'EDIT-A',cantidad:1})).expect(201)).body;
    const editable=(await add(item({descripcion:'Tuerca 2',codigo:'EDIT-B',cantidad:1})).expect(201)).body;
    const cambio=await call('patch',`/levantamientos/${lid}/items/${editable.id}`,{version:editable.version,codigo:'edit-a'}).expect(409);
    expect(cambio.body).toMatchObject({code:'CONTEO_DUPLICADO',itemId:aEditar.id});
    expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:editable.id}})).version)).toBe(1);
  });

  it('simultáneas: dos capturas del mismo empleado y mismo artículo con claves distintas producen un solo conteo (FS-06 fase 2)',async()=>{
    const [a,b]=await Promise.all([add(item({codigo:'DOBLE-1'})),add(item({codigo:'DOBLE-1'}))]);
    expect([a.status,b.status].sort()).toEqual([201,409]);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid}})).toBe(1);
  });

  it('entre empleados distintos el mismo artículo se registra con conflicto para conciliación (FS-06 fase 2)',async()=>{
    const admin=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'888001'}),'ADMIN').expect(201)).body;
    const bodeguero=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'888001'}),'BODEGUERO').expect(201)).body;
    expect(bodeguero.conflicto).toBe(true);
    expect((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:admin.id}})).conflicto).toBe(true);
  });

  it('reintentar la creación con la misma clave tras perder la respuesta devuelve el levantamiento original (FS-06 fase 2)',async()=>{
    const solicitudId=randomUUID();
    const body={nombre:'Conteo bodega norte',descripcion:'Pasillo 3',solicitudId};
    const first=(await call('post','/levantamientos',body).expect(201)).body;
    const retry=(await call('post','/levantamientos',body).expect(201)).body;
    expect(retry.id).toBe(first.id);
    expect(await prisma.levantamiento.count({where:{tenantId,nombre:'Conteo bodega norte'}})).toBe(1);
  });

  it('dos creaciones simultáneas con la misma clave producen un solo levantamiento (FS-06 fase 2)',async()=>{
    const solicitudId=randomUUID();
    const body={nombre:'Conteo simultáneo',solicitudId};
    const [a,b]=await Promise.all([call('post','/levantamientos',body),call('post','/levantamientos',body)]);
    expect([a.status,b.status]).toEqual([201,201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.levantamiento.count({where:{tenantId,nombre:'Conteo simultáneo'}})).toBe(1);
  });

  it('reutilizar una clave con datos distintos produce conflicto controlado y no crea nada (FS-06 fase 2)',async()=>{
    const solicitudId=randomUUID();
    await call('post','/levantamientos',{nombre:'Original',solicitudId}).expect(201);
    const conflicto=await call('post','/levantamientos',{nombre:'Otro nombre',solicitudId}).expect(409);
    expect(conflicto.body.message).toContain('clave de solicitud');
    expect(await prisma.levantamiento.count({where:{tenantId}})).toBe(2);
  });

  it('la misma clave en otra empresa crea un levantamiento independiente (aislamiento) (FS-06 fase 2)',async()=>{
    const solicitudId=randomUUID();
    const propio=(await call('post','/levantamientos',{nombre:'Propio',solicitudId}).expect(201)).body;
    const ajeno=(await call('post','/levantamientos',{nombre:'Ajeno',solicitudId},'OTHER').expect(201)).body;
    expect(ajeno.id).not.toBe(propio.id);
  });

  it('flujo completo: crear, capturar con marca, finalizar, aplicar y reintentar la aplicación sin duplicar movimientos (FS-06 fase 2)',async()=>{
    const solicitudId=randomUUID();
    const nuevo=(await call('post','/levantamientos',{nombre:'Flujo completo',solicitudId}).expect(201)).body;
    await call('post',`/levantamientos/${nuevo.id}/items`,item({codigo:'FLUJO-1',marca:'Pretul',categoria:'Pintura',unidad:'GALON',cantidad:4,precioCosto:30,precioVenta:45})).expect(201);
    await call('patch',`/levantamientos/${nuevo.id}`,{estado:'FINALIZADO'}).expect(200);
    const p=(await call('get',`/levantamientos/${nuevo.id}/preview`).expect(200)).body;
    await call('post',`/levantamientos/${nuevo.id}/aplicar`,{token:p.token}).expect(201);
    await call('post',`/levantamientos/${nuevo.id}/aplicar`,{token:p.token}).expect(201);
    const producto=await prisma.producto.findFirstOrThrow({where:{tenantId,codigo:'FLUJO-1'}});
    expect([producto.marca,Number(producto.stockActual)]).toEqual(['Pretul',4]);
    expect(await prisma.movimientoInventario.count({where:{tenantId,productoId:producto.id,documentoId:nuevo.id}})).toBe(1);
  });
  it('QA-INV-003: capturas encadenadas por ID, código de barras y código interno forman un solo conflicto conciliable',async()=>{
    const a=(await add(item({productoId:productId,codigoBarras:'001234'})).expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'001234',codigo:'cab-9'}),'BODEGUERO').expect(201)).body;
    const c=(await call('post',`/levantamientos/${lid}/items`,item({codigo:'CAB-9'}),'ADMIN').expect(201)).body;
    expect([b.conflicto,c.conflicto]).toEqual([true,true]);
    const grupos=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    expect(grupos).toHaveLength(1);
    expect(grupos[0].items.map((i:any)=>i.id).sort()).toEqual([a.id,b.id,c.id].sort());
    const otro=(await call('post',`/levantamientos/${lid}/items`,item({descripcion:'Tornillo',codigo:'TOR-1',cantidad:7}),'BODEGUERO').expect(201)).body;
    const p0=(await preview()).body;
    expect(p0.rows.filter((r:any)=>r.item.id!==otro.id).every((r:any)=>r.errores.some((e:string)=>e.includes('conflicto')))).toBe(true);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:a.id}).expect(201);
    const restantes=(await prisma.levantamientoItem.findMany({where:{levantamientoId:lid}})).map(r=>r.id).sort();
    expect(restantes).toEqual([a.id,otro.id].sort());
    expect((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:a.id}})).conflicto).toBe(false);
    const p=(await preview()).body;
    expect(p.rows.some((r:any)=>r.errores.some((e:string)=>e.includes('duplicado')||e.includes('conflicto')))).toBe(false);
  });

  it('QA-INV-003: editar solo la cantidad mantiene el conflicto en ambos y la conciliación posterior funciona',async()=>{
    const a=(await add(item({productoId:productId,codigoBarras:'001234'})).expect(201)).body;
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'001234'}),'BODEGUERO').expect(201)).body;
    await call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,cantidad:4},'BODEGUERO').expect(200);
    expect((await prisma.levantamientoItem.findMany({where:{levantamientoId:lid}})).every(r=>r.conflicto)).toBe(true);
    const grupos=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body;
    expect(grupos).toHaveLength(1);
    await call('post',`/levantamientos/${lid}/conciliar`,{mantenerItemId:b.id,cantidadManual:4}).expect(201);
    expect(await prisma.levantamientoItem.findUnique({where:{id:a.id}})).toBeNull();
    expect(Number((await prisma.levantamientoItem.findUniqueOrThrow({where:{id:b.id}})).cantidad)).toBe(4);
  });

  it('QA-INV-003: quitar la identidad compartida limpia el conflicto del par que queda',async()=>{
    await add(item({productoId:productId,codigoBarras:'001234'})).expect(201);
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'001234'}),'BODEGUERO').expect(201)).body;
    await call('patch',`/levantamientos/${lid}/items/${b.id}`,{version:b.version,codigoBarras:'999001'},'BODEGUERO').expect(200);
    expect(await prisma.levantamientoItem.count({where:{levantamientoId:lid,conflicto:true}})).toBe(0);
    expect((await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body).toEqual([]);
  });

  it('QA-INV-004: conflictos muestran el nombre del contador y conservan su id; desactivados y eliminados se identifican',async()=>{
    await prisma.usuario.update({where:{id:users.BODEGUERO.id},data:{nombre:'Ana Pérez'}});
    await add(item({productoId:productId,codigoBarras:'001234'})).expect(201);
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'001234'}),'BODEGUERO').expect(201)).body;
    const filaB=async()=>(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body[0].items.find((i:any)=>i.id===b.id);
    expect(await filaB()).toMatchObject({contadorId:users.BODEGUERO.id,contador:{id:users.BODEGUERO.id,nombre:'Ana Pérez',estado:'ACTIVO'}});
    await prisma.usuario.update({where:{id:users.BODEGUERO.id},data:{activo:false}});
    expect((await filaB()).contador).toEqual({id:users.BODEGUERO.id,nombre:'Ana Pérez',estado:'DESACTIVADO'});
    await prisma.usuario.delete({where:{id:users.BODEGUERO.id}});
    expect((await filaB()).contador).toEqual({id:users.BODEGUERO.id,nombre:null,estado:'NO_DISPONIBLE'});
    const detalle=(await call('get',`/levantamientos/${lid}`).expect(200)).body;
    expect(detalle.items.find((i:any)=>i.id===b.id).contador).toEqual({id:users.BODEGUERO.id,nombre:null,estado:'NO_DISPONIBLE'});
  });

  it('QA-INV-004: el nombre del contador solo se resuelve dentro de la empresa',async()=>{
    await add(item({productoId:productId,codigoBarras:'001234'})).expect(201);
    const b=(await call('post',`/levantamientos/${lid}/items`,item({codigoBarras:'001234'}),'BODEGUERO').expect(201)).body;
    await prisma.levantamientoItem.update({where:{id:b.id},data:{contadorId:users.OTHER.id}});
    const fila=(await call('get',`/levantamientos/${lid}/conflictos`).expect(200)).body[0].items.find((i:any)=>i.id===b.id);
    expect(fila.contador).toEqual({id:users.OTHER.id,nombre:null,estado:'NO_DISPONIBLE'});
  });
});
