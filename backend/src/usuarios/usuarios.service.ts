import { validarPermisos } from './permisos';
import { PERMISO_EXCEPCION_PRECIO } from '../ventas/politica-precio';
import { opaqueToken } from '../auth/tokens-auth';
import { Injectable,NotFoundException,BadRequestException,ConflictException,ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { authorizedActor,audit,lockTenant } from '../operaciones/ledger';
import * as bcrypt from 'bcrypt';
import { revocarSesionesDeSujeto } from '../auth/sesiones-auth';
import { exigirIdentificadorUnico } from '../auth/identidad-login';
/** Un CONTADOR nuevo solo consulta hasta que el administrador le concede más (mínimo privilegio). */
export function permisosIniciales(rol: string | undefined, permisos: string[] | undefined) {
  if (permisos !== undefined) return { permisos, permisosConfigurados: true };
  if (rol === 'CONTADOR') return { permisos: ['contabilidad.ver'], permisosConfigurados: true };
  return { permisos: [], permisosConfigurados: false };
}
const select={id:true,tenantId:true,nombre:true,email:true,username:true,rol:true,activo:true,bloqueadoAt:true,intentosFallidos:true,permisos:true,permisosConfigurados:true,descuentoMaximo:true,createdAt:true,updatedAt:true} as const;
@Injectable()
export class UsuariosService {
 constructor(private readonly prisma:PrismaService){}
 private async authorize(tx:any,tenantId:string,actorId:string,plataforma:boolean){
  if(!plataforma)return authorizedActor(tx,tenantId,actorId,['ADMIN'],'usuarios.gestionar');
  if(!await tx.superAdmin.findFirst({where:{id:actorId,activo:true}}))throw new ForbiddenException('Super Admin no disponible');
  if(!await tx.tenant.findUnique({where:{id:tenantId}}))throw new NotFoundException('Negocio no encontrado');
 }

 private protegerAdmin(plataforma:boolean,actorId:string,id?:string,rolAnterior?:string,rolNuevo?:string){
  if(!plataforma&&(id===actorId||rolAnterior==='ADMIN'||rolNuevo==='ADMIN'))throw new ForbiddenException('Solo el SUPERADMIN de plataforma puede gestionar cuentas ADMIN');
 }
 private async auditarPermisos(tx:any,tenantId:string,actorId:string,id:string,anteriores:string[],nuevos:string[],plataforma:boolean){
  const antes=new Set(anteriores),despues=new Set(nuevos);
  for(const permiso of new Set([...antes,...despues])){
   if(antes.has(permiso)===despues.has(permiso))continue;
   const accion=despues.has(permiso)?'CONCEDER':'REVOCAR';
   await audit(tx,tenantId,actorId,`USUARIO_PERMISO_${accion}`,id,{actorId,beneficiarioId:id,permiso,accion,tipoActor:plataforma?'SUPERADMIN':'TENANT'});
  }
 }
 findAll(tenantId:string){return this.prisma.usuario.findMany({where:{tenantId},select,orderBy:{createdAt:'desc'}});}
 async findById(tenantId:string,id:string){const user=await this.prisma.usuario.findFirst({where:{tenantId,id},select});if(!user)throw new NotFoundException('Usuario no encontrado');return user;}
 async create(tenantId:string,dto:CreateUsuarioDto,actorId:string,plataforma=false){
  validarPermisos(dto.permisos);
  if(dto.password)throw new BadRequestException('El usuario establece su contraseña mediante el enlace privado');
  if(!dto.email && !dto.username)throw new BadRequestException('Defina un usuario, código o correo');
  if(dto.rol==='ADMIN'&&!dto.email)throw new BadRequestException('Un administrador requiere correo para configurar su recuperación');
  const passwordHash=await bcrypt.hash(opaqueToken(),12),email=dto.email?.toLowerCase().trim() || null,username=dto.username?.toLowerCase().trim() || null;
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await this.authorize(tx,tenantId,actorId,plataforma);
   this.protegerAdmin(plataforma,actorId,undefined,undefined,dto.rol);
   if(email && await tx.usuario.findFirst({where:{tenantId,email}}))throw new ConflictException('Ya existe un usuario con este correo electrónico');
   if(username && await tx.usuario.findFirst({where:{tenantId,username}}))throw new ConflictException('Identificador ya registrado');
   // El inicio de sesión no pide empresa: usuario, código y correo deben ser únicos en toda la plataforma.
   await exigirIdentificadorUnico(tx,{email,username});
   const user=await tx.usuario.create({data:{tenantId,nombre:dto.nombre.trim(),email,username,passwordHash,rol:dto.rol||'CAJERO',...permisosIniciales(dto.rol,dto.permisos),descuentoMaximo:dto.descuentoMaximo??0,activo:dto.activo??true},select});
   await this.auditarPermisos(tx,tenantId,actorId,user.id,[],user.permisos,plataforma);
   await audit(tx,tenantId,actorId,'USUARIO_CREAR',user.id,{usuario:user});return user;
  });
 }
 async update(tenantId:string,id:string,dto:UpdateUsuarioDto,actorId:string,plataforma=false,soloDesactivar=false){
  validarPermisos(dto.permisos);
  if(dto.password)throw new BadRequestException('Use el enlace privado de restablecimiento o cambio de contraseña');
  const passwordHash=undefined;
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await this.authorize(tx,tenantId,actorId,plataforma);
   const old=await tx.usuario.findFirst({where:{tenantId,id},select});if(!old)throw new NotFoundException('Usuario no encontrado');
   this.protegerAdmin(plataforma,actorId,id,old.rol,dto.rol);
   if(id===actorId&&dto.permisos?.includes(PERMISO_EXCEPCION_PRECIO)&&!old.permisos.includes(PERMISO_EXCEPCION_PRECIO))throw new ForbiddenException('No puede concederse pos.excepcion_precio');
   if(soloDesactivar&&!old.activo)return old;
   if(dto.rol==='ADMIN'&&!dto.email&&!old.email)throw new BadRequestException('Un administrador requiere correo para configurar su recuperación');
   // Nadie se deja fuera de su propia empresa: la desactivación de la cuenta propia se rechaza.
   if(dto.activo===false&&id===actorId)throw new ConflictException('No puede desactivar su propia cuenta');
   if(old.rol==='ADMIN'&&old.activo&&(dto.activo===false||dto.rol!==undefined&&dto.rol!=='ADMIN')){
    if(await tx.usuario.count({where:{tenantId,rol:'ADMIN',activo:true}})<=1)throw new ConflictException('Conserve al menos un administrador activo');
   }
   const email=dto.email?.toLowerCase().trim();if(email&&await tx.usuario.findFirst({where:{tenantId,email,id:{not:id}}}))throw new ConflictException('Correo electrónico ya registrado');
   if(email&&email!==old.email)await exigirIdentificadorUnico(tx,{email,excluirId:id});
   const data:any={};
   if(dto.username!==undefined){if(typeof dto.username!=='string')throw new BadRequestException('Identificador inválido');const username=dto.username.toLowerCase().trim();if(await tx.usuario.findFirst({where:{tenantId,username,id:{not:id}}}))throw new ConflictException('Identificador ya registrado');if(username!==old.username)await exigirIdentificadorUnico(tx,{username,excluirId:id});data.username=username;}
   if(email!==undefined && email!==old.email)data.emailVerifiedAt=null;
   if(dto.nombre!==undefined)data.nombre=dto.nombre.trim();if(email!==undefined)data.email=email;if(passwordHash)data.passwordHash=passwordHash;
   if(dto.rol!==undefined)data.rol=dto.rol;if(dto.activo!==undefined)data.activo=dto.activo;
   if(dto.permisos!==undefined){data.permisos=dto.permisos;data.permisosConfigurados=true;}
   else if(dto.rol==='CONTADOR'&&old.rol!=='CONTADOR'){data.permisos=['contabilidad.ver'];data.permisosConfigurados=true;}
   if(dto.rol!==undefined&&dto.rol!==old.rol){data.permisos=(data.permisos??old.permisos).filter((p:string)=>p!==PERMISO_EXCEPCION_PRECIO);}
   if(dto.descuentoMaximo!==undefined)data.descuentoMaximo=dto.descuentoMaximo;
   const user=await tx.usuario.update({where:{id},data,select});
   await this.auditarPermisos(tx,tenantId,actorId,id,old.permisos,user.permisos,plataforma);
   // Cambio de contraseña o desactivación: se cierran todas las sesiones abiertas del usuario.
   if(passwordHash||dto.activo===false)await revocarSesionesDeSujeto(tx,id,passwordHash?'CAMBIO_CONTRASEÑA':'USUARIO_DESACTIVADO');
   // Operación explícita para desactivar/reactivar: queda en la auditoría con quién lo hizo y el estado anterior.
   const operacion=dto.activo===false&&old.activo?'USUARIO_DESACTIVAR':dto.activo===true&&!old.activo?'USUARIO_REACTIVAR':'USUARIO_EDITAR';
   await audit(tx,tenantId,actorId,operacion,id,{anterior:old,nuevo:user,cambioPassword:!!passwordHash});return user;
  });
 }
 /** Eliminación lógica: no se borra ninguna fila (el historial de ventas, caja y auditoría la referencia). Desactiva y revoca sesiones. */
 async remove(tenantId:string,id:string,actorId:string,plataforma=false){
  return this.update(tenantId,id,{activo:false},actorId,plataforma,true);
 }
}
