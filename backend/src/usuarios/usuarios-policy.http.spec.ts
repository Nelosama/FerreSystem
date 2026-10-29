import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { SuperAdminController } from '../super-admin/super-admin.controller';
import { SuperAdminService } from '../super-admin/super-admin.service';

const SECRET = 'policy-usuarios-test-0123456789abcdef0123456789';

describe('Política de usuarios HTTP · JWT, guards y servicios reales', () => {
  let app: INestApplication;
  let users: any[];
  let events: any[];
  let prisma: any;
  const jwt = new JwtService({secret:SECRET});
  const token = (id='admin', platform=false) => jwt.sign({sub:id,tenantId:platform?undefined:'t1',type:platform?'super_admin':'tenant',sid:`s-${id}`});
  const http = () => request(app.getHttpServer());
  const auth = (platform=false) => `Bearer ${token(platform?'sa':'admin',platform)}`;
  beforeEach(async () => {
    users=['admin','admin2','cajero'].map(id=>({id,tenantId:'t1',nombre:id,email:`${id}@t.hn`,rol:id==='cajero'?'CAJERO':'ADMIN',activo:true,bloqueadoAt:null,permisos:[],permisosConfigurados:false,descuentoMaximo:0}));
    events=[];
    const matches=(u:any,w:any)=>Object.entries(w).every(([key,value]:any)=>key==='id'&&typeof value==='object'?u.id!==value.not:u[key]===value);
    prisma={
      usuario:{
        findFirst:vi.fn(async ({where}:any)=>{const u=users.find(u=>matches(u,where));return u?{...u,tenant:{estado:'ACTIVO'}}:null;}),
        count:vi.fn(async ({where}:any)=>users.filter(u=>matches(u,where)).length),
        create:vi.fn(async ({data}:any)=>{const u={id:'new',...data};users.push(u);return {...u};}),
        update:vi.fn(async ({where,data}:any)=>{const u=users.find(u=>u.id===where.id);Object.assign(u,data);return {...u};}),
      },
      superAdmin:{findFirst:vi.fn(async ({where}:any)=>where.id==='sa'?{id:'sa',activo:true}:null),findUnique:vi.fn(async ({where}:any)=>where.id==='sa'?{id:'sa',activo:true}:null)},
      tenant:{findUnique:vi.fn(async ()=>({id:'t1'}))},
      sesionAuth:{findUnique:vi.fn(async ({where}:any)=>({sujetoId:where.id.slice(2),revokedAt:null,expiresAt:new Date(Date.now()+600000)})),updateMany:vi.fn(async ()=>({count:1}))},
      $queryRaw:vi.fn(async ()=>[]),
      $queryRawUnsafe:vi.fn(async (sql:string,...args:any[])=>{
        if(sql.includes('SELECT u.rol')){
          const u=users.find(u=>u.id===args[0]&&u.tenantId===args[1]&&u.activo);
          return u?[{...u,permisos_configurados:u.permisosConfigurados}]:[];
        }
        if(sql.includes('INSERT INTO auditoria_operaciones'))events.push({actor:args[2],operacion:args[3],beneficiario:args[4],datos:JSON.parse(args[5])});
        return [];
      }),
    };
    prisma.$transaction=async (fn:any)=>fn(prisma);
    const service=new UsuariosService(prisma);
    const platform=new SuperAdminService(prisma,jwt,{} as any,{} as any,{} as any);
    const module=await Test.createTestingModule({controllers:[UsuariosController,SuperAdminController],providers:[JwtStrategy,{provide:PrismaService,useValue:prisma},{provide:ConfigService,useValue:{get:(k:string)=>k==='JWT_SECRET'?SECRET:undefined}},{provide:UsuariosService,useValue:service},{provide:SuperAdminService,useValue:platform}]}).compile();
    app=module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
    await app.init();
  });
  afterEach(async ()=>{await app?.close();});

  it('ADMIN no crea ADMIN, promueve empleados ni modifica/desactiva ADMIN o su propia cuenta', async ()=>{
    await http().post('/usuarios').set('Authorization',auth()).send({nombre:'Nuevo',email:'new@t.hn',rol:'ADMIN'}).expect(403);
    for(const id of ['admin','admin2']){
      for(const body of [{nombre:'Cambio'},{activo:false},{rol:'CAJERO'},{permisos:['pos.excepcion_precio']},{descuentoMaximo:100}]){
        await http().put(`/usuarios/${id}`).set('Authorization',auth()).send(body).expect(403);
      }
      await http().delete(`/usuarios/${id}`).set('Authorization',auth()).expect(403);
    }
    await http().put('/usuarios/cajero').set('Authorization',auth()).send({rol:'ADMIN'}).expect(403);
    expect(prisma.usuario.update).not.toHaveBeenCalled();
    expect(prisma.usuario.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('ADMIN gestiona empleados, con auditoría de concesión y revocación',async ()=>{
    await http().put('/usuarios/cajero').set('Authorization',auth()).send({permisos:['pos.vender']}).expect(200);
    await http().put('/usuarios/cajero').set('Authorization',auth()).send({permisos:[]}).expect(200);
    expect(events.filter(e=>e.operacion.startsWith('USUARIO_PERMISO_')).map(e=>[e.actor,e.beneficiario,e.datos.permiso,e.datos.accion])).toEqual([['admin','cajero','pos.vender','CONCEDER'],['admin','cajero','pos.vender','REVOCAR']]);
    await http().delete('/usuarios/cajero').set('Authorization',auth()).expect(200);
  });

  it('SUPERADMIN crea, edita permisos y desactiva ADMIN por su ruta exclusiva', async ()=>{
    await http().post('/admin/tenants/t1/usuarios').set('Authorization',auth(true)).send({nombre:'Nuevo',email:'new@t.hn',rol:'ADMIN',permisos:['pos.excepcion_precio']}).expect(201);
    await http().patch('/admin/tenants/t1/usuarios/admin2').set('Authorization',auth(true)).send({nombre:'Editado',permisos:['pos.excepcion_precio']}).expect(200);
    await http().patch('/admin/tenants/t1/usuarios/admin2').set('Authorization',auth(true)).send({permisos:[]}).expect(200);
    await http().delete('/admin/tenants/t1/usuarios/admin2').set('Authorization',auth(true)).expect(200);
    expect(users.find(u=>u.id==='admin2')).toMatchObject({nombre:'Editado',activo:false});
    expect(events).toContainEqual(expect.objectContaining({actor:'sa',beneficiario:'admin2',operacion:'USUARIO_PERMISO_REVOCAR',datos:expect.objectContaining({permiso:'pos.excepcion_precio',accion:'REVOCAR'})}));
  });

  it('el cambio de rol revoca la excepción incluso si llega en la misma petición', async ()=>{
    users[1].permisos=['pos.excepcion_precio'];
    const res=await http().patch('/admin/tenants/t1/usuarios/admin2').set('Authorization',auth(true)).send({rol:'VENDEDOR',permisos:['pos.excepcion_precio','pos.vender']}).expect(200);
    expect(res.body.permisos).toEqual(['pos.vender']);
    expect(events).toContainEqual(expect.objectContaining({operacion:'USUARIO_PERMISO_REVOCAR',datos:expect.objectContaining({permiso:'pos.excepcion_precio'})}));
  });

  it('la ruta exclusiva rechaza ADMIN y los DTO rechazan permisos desconocidos',async ()=>{
    await http().post('/admin/tenants/t1/usuarios').set('Authorization',auth()).send({nombre:'Nuevo',rol:'ADMIN',email:'new@t.hn'}).expect(403);
    await http().patch('/admin/tenants/t1/usuarios/admin2').set('Authorization',auth()).send({permisos:['pos.excepcion_precio']}).expect(403);
    await http().delete('/admin/tenants/t1/usuarios/admin2').set('Authorization',auth()).expect(403);
    await http().post('/usuarios').set('Authorization',auth()).send({nombre:'Nuevo',email:'new@t.hn',permisos:['*']}).expect(400);
    await http().patch('/admin/tenants/t1/usuarios/admin2').set('Authorization',auth(true)).send({permisos:['inventado']}).expect(400);
  });
});
