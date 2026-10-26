import { opaqueToken } from '../auth/mfa';
import { Injectable,NotFoundException,BadRequestException,ConflictException,ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { authorizedActor,audit,lockTenant } from '../operaciones/ledger';
import * as bcrypt from 'bcrypt';
import { revocarSesionesDeSujeto } from '../auth/sesiones-auth';
import { identificadorEnUso } from '../auth/identidad-login';
const select={id:true,tenantId:true,nombre:true,email:true,username:true,rol:true,activo:true,bloqueadoAt:true,permisos:true,permisosConfigurados:true,descuentoMaximo:true,createdAt:true,updatedAt:true} as const;
@Injectable()
export class UsuariosService {
 constructor(private readonly prisma:PrismaService){}
 private async authorize(tx:any,tenantId:string,actorId:string,plataforma:boolean){
  if(!plataforma)return authorizedActor(tx,tenantId,actorId,['ADMIN'],'usuarios.gestionar');
  if(!await tx.superAdmin.findFirst({where:{id:actorId,activo:true}}))throw new ForbiddenException('Super Admin no disponible');
  if(!await tx.tenant.findUnique({where:{id:tenantId}}))throw new NotFoundException('Negocio no encontrado');
 }

 findAll(tenantId:string){return this.prisma.usuario.findMany({where:{tenantId},select,orderBy:{createdAt:'desc'}});}
 async findById(tenantId:string,id:string){const user=await this.prisma.usuario.findFirst({where:{tenantId,id},select});if(!user)throw new NotFoundException('Usuario no encontrado');return user;}
 async create(tenantId:string,dto:CreateUsuarioDto,actorId:string,plataforma=false){
  if(dto.password)throw new BadRequestException('El usuario establece su contraseña mediante el enlace privado');
  if(!dto.email && !dto.username)throw new BadRequestException('Defina un usuario, código o correo');
  if(dto.rol==='ADMIN'&&!dto.email)throw new BadRequestException('Un administrador requiere correo para configurar su recuperación');
  const passwordHash=await bcrypt.hash(opaqueToken(),12),email=dto.email?.toLowerCase().trim() || null,username=dto.username?.toLowerCase().trim() || null;
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await this.authorize(tx,tenantId,actorId,plataforma);
   if(email && await tx.usuario.findFirst({where:{tenantId,email}}))throw new ConflictException('Ya existe un usuario con este correo electrónico');
   if(username && await tx.usuario.findFirst({where:{tenantId,username}}))throw new ConflictException('Identificador ya registrado');
   // El inicio de sesión no pide empresa: usuario, código y correo deben ser únicos en toda la plataforma.
   if(await identificadorEnUso(tx,{email,username}))throw new ConflictException('Identificador ya registrado');
   const user=await tx.usuario.create({data:{tenantId,nombre:dto.nombre.trim(),email,username,passwordHash,rol:dto.rol||'CAJERO',permisos:dto.permisos||[],permisosConfigurados:dto.permisos!==undefined,descuentoMaximo:dto.descuentoMaximo??0,activo:dto.activo??true},select});
   await audit(tx,tenantId,actorId,'USUARIO_CREAR',user.id,{usuario:user});return user;
  });
 }
 async update(tenantId:string,id:string,dto:UpdateUsuarioDto,actorId:string,plataforma=false){
  if(dto.password)throw new BadRequestException('Use el enlace privado de restablecimiento o cambio de contraseña');
  const passwordHash=undefined;
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await this.authorize(tx,tenantId,actorId,plataforma);
   const old=await tx.usuario.findFirst({where:{tenantId,id},select});if(!old)throw new NotFoundException('Usuario no encontrado');
   if(dto.rol==='ADMIN'&&!dto.email&&!old.email)throw new BadRequestException('Un administrador requiere correo para configurar su recuperación');
   // Nadie se deja fuera de su propia empresa: la desactivación de la cuenta propia se rechaza.
   if(dto.activo===false&&id===actorId)throw new ConflictException('No puede desactivar su propia cuenta');
   if(old.rol==='ADMIN'&&old.activo&&(dto.activo===false||dto.rol!==undefined&&dto.rol!=='ADMIN')){
    if(await tx.usuario.count({where:{tenantId,rol:'ADMIN',activo:true}})<=1)throw new ConflictException('Conserve al menos un administrador activo');
   }
   const email=dto.email?.toLowerCase().trim();if(email&&await tx.usuario.findFirst({where:{tenantId,email,id:{not:id}}}))throw new ConflictException('Correo electrónico ya registrado');
   if(email&&email!==old.email&&await identificadorEnUso(tx,{email,exceptoUsuarioId:id}))throw new ConflictException('Correo electrónico ya registrado');
   const data:any={};
   if(dto.username!==undefined){if(typeof dto.username!=='string')throw new BadRequestException('Identificador inválido');const username=dto.username.toLowerCase().trim();if(await tx.usuario.findFirst({where:{tenantId,username,id:{not:id}}}))throw new ConflictException('Identificador ya registrado');if(username!==old.username&&await identificadorEnUso(tx,{username,exceptoUsuarioId:id}))throw new ConflictException('Identificador ya registrado');data.username=username;}
   if(email!==undefined && email!==old.email)data.emailVerifiedAt=null;
   if(dto.nombre!==undefined)data.nombre=dto.nombre.trim();if(email!==undefined)data.email=email;if(passwordHash)data.passwordHash=passwordHash;
   if(dto.rol!==undefined)data.rol=dto.rol;if(dto.activo!==undefined)data.activo=dto.activo;
   if(dto.permisos!==undefined){data.permisos=dto.permisos;data.permisosConfigurados=true;}
   if(dto.descuentoMaximo!==undefined)data.descuentoMaximo=dto.descuentoMaximo;
   const user=await tx.usuario.update({where:{id},data,select});
   // Cambio de contraseña o desactivación: se cierran todas las sesiones abiertas del usuario.
   if(passwordHash||dto.activo===false)await revocarSesionesDeSujeto(tx,id,passwordHash?'CAMBIO_CONTRASEÑA':'USUARIO_DESACTIVADO');
   // Operación explícita para desactivar/reactivar: queda en la auditoría con quién lo hizo y el estado anterior.
   const operacion=dto.activo===false&&old.activo?'USUARIO_DESACTIVAR':dto.activo===true&&!old.activo?'USUARIO_REACTIVAR':'USUARIO_EDITAR';
   await audit(tx,tenantId,actorId,operacion,id,{anterior:old,nuevo:user,cambioPassword:!!passwordHash});return user;
  });
 }
 /** Eliminación lógica: no se borra ninguna fila (el historial de ventas, caja y auditoría la referencia). Desactiva y revoca sesiones. */
 async remove(tenantId:string,id:string,actorId:string,plataforma=false){
  const actual=await this.prisma.usuario.findFirst({where:{tenantId,id},select});
  if(!actual)throw new NotFoundException('Usuario no encontrado');
  // Ya desactivado: no hay nada que cambiar ni que auditar.
  if(!actual.activo)return actual;
  return this.update(tenantId,id,{activo:false},actorId,plataforma);
 }
}
