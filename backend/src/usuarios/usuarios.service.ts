import { Injectable,NotFoundException,BadRequestException,ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { authorizedActor,audit,lockTenant } from '../operaciones/ledger';
import * as bcrypt from 'bcrypt';
import { revocarSesionesDeSujeto } from '../auth/sesiones-auth';
const select={id:true,tenantId:true,nombre:true,email:true,rol:true,activo:true,permisos:true,permisosConfigurados:true,descuentoMaximo:true,createdAt:true,updatedAt:true} as const;
@Injectable()
export class UsuariosService {
 constructor(private readonly prisma:PrismaService){}
 findAll(tenantId:string){return this.prisma.usuario.findMany({where:{tenantId},select,orderBy:{createdAt:'desc'}});}
 async findById(tenantId:string,id:string){const user=await this.prisma.usuario.findFirst({where:{tenantId,id},select});if(!user)throw new NotFoundException('Usuario no encontrado');return user;}
 async create(tenantId:string,dto:CreateUsuarioDto,actorId:string){
  if(!dto.password)throw new BadRequestException('Defina una contraseña para el nuevo usuario');
  const passwordHash=await bcrypt.hash(dto.password,10),email=dto.email.toLowerCase().trim();
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,actorId,['ADMIN'],'usuarios.gestionar');
   if(await tx.usuario.findFirst({where:{tenantId,email}}))throw new ConflictException('Ya existe un usuario con este correo electrónico');
   const user=await tx.usuario.create({data:{tenantId,nombre:dto.nombre.trim(),email,passwordHash,rol:dto.rol||'CAJERO',permisos:dto.permisos||[],permisosConfigurados:dto.permisos!==undefined,descuentoMaximo:dto.descuentoMaximo??0,activo:dto.activo??true},select});
   await audit(tx,tenantId,actorId,'USUARIO_CREAR',user.id,{usuario:user});return user;
  });
 }
 async update(tenantId:string,id:string,dto:UpdateUsuarioDto,actorId:string){
  const passwordHash=dto.password?await bcrypt.hash(dto.password,10):undefined;
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,actorId,['ADMIN'],'usuarios.gestionar');
   const old=await tx.usuario.findFirst({where:{tenantId,id},select});if(!old)throw new NotFoundException('Usuario no encontrado');
   if(old.rol==='ADMIN'&&old.activo&&(dto.activo===false||dto.rol!==undefined&&dto.rol!=='ADMIN')){
    if(await tx.usuario.count({where:{tenantId,rol:'ADMIN',activo:true}})<=1)throw new ConflictException('Conserve al menos un administrador activo');
   }
   const email=dto.email?.toLowerCase().trim();if(email&&await tx.usuario.findFirst({where:{tenantId,email,id:{not:id}}}))throw new ConflictException('Correo electrónico ya registrado');
   const data:any={};
   if(dto.nombre!==undefined)data.nombre=dto.nombre.trim();if(email!==undefined)data.email=email;if(passwordHash)data.passwordHash=passwordHash;
   if(dto.rol!==undefined)data.rol=dto.rol;if(dto.activo!==undefined)data.activo=dto.activo;
   if(dto.permisos!==undefined){data.permisos=dto.permisos;data.permisosConfigurados=true;}
   if(dto.descuentoMaximo!==undefined)data.descuentoMaximo=dto.descuentoMaximo;
   const user=await tx.usuario.update({where:{id},data,select});
   // Cambio de contraseña o desactivación: se cierran todas las sesiones abiertas del usuario.
   if(passwordHash||dto.activo===false)await revocarSesionesDeSujeto(tx,id,passwordHash?'CAMBIO_CONTRASEÑA':'USUARIO_DESACTIVADO');
   await audit(tx,tenantId,actorId,'USUARIO_EDITAR',id,{anterior:old,nuevo:user,cambioPassword:!!passwordHash});return user;
  });
 }
 remove(tenantId:string,id:string,actorId:string){return this.update(tenantId,id,{activo:false},actorId);}
}
