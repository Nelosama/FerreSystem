import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { actor, audit, fingerprint, lockTenant, movement, query, text } from '../operaciones/ledger';
import { CreateLevantamientoDto, UpdateLevantamientoDto } from './dto/create-levantamiento.dto';
import { CreateLevantamientoItemDto, UpdateLevantamientoItemDto } from './dto/create-levantamiento-item.dto';

@Injectable()
export class LevantamientosService {
 constructor(private readonly prisma:PrismaService){}
 private item(i:any){return {...i,cantidad:Number(i.cantidad),precioCosto:i.precioCosto==null?null:Number(i.precioCosto),precioVenta:i.precioVenta==null?null:Number(i.precioVenta),margen:i.margen==null?null:Number(i.margen)};}
 private async session(tx:any,tenantId:string,id:string){const l=await tx.levantamiento.findFirst({where:{tenantId,id},include:{items:{orderBy:{id:'asc'}}}});if(!l)throw new NotFoundException('Levantamiento no encontrado');return l;}
 async findAll(tenantId:string){return (await this.prisma.levantamiento.findMany({where:{tenantId},include:{_count:{select:{items:true}}},orderBy:{createdAt:'desc'}})).map(l=>({...l,totalItems:l._count.items}));}
 async findOne(tenantId:string,id:string){const l=await this.session(this.prisma,tenantId,id);return {...l,items:l.items.map(i=>this.item(i))};}
 async create(tenantId:string,userId:string,dto:CreateLevantamientoDto){return this.prisma.levantamiento.create({data:{tenantId,nombre:text(dto.nombre,'Nombre'),descripcion:dto.descripcion,estado:'BORRADOR',createdBy:userId}});}
 async update(tenantId:string,id:string,dto:UpdateLevantamientoDto,userId:string){return this.prisma.$transaction(async tx=>{
  await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,id);
  if(l.aplicadoAt)throw new ConflictException('El levantamiento aplicado conserva su historia');
  if(l.estado==='FINALIZADO'){
   const user=await actor(tx,tenantId,userId);if(user.rol!=='ADMIN'||dto.estado!=='REVISION')throw new ConflictException('Solo el administrador puede reabrir a revisión');
  }
  const result=await tx.levantamiento.update({where:{id},data:{...(dto.nombre!==undefined?{nombre:text(dto.nombre,'Nombre')} :{}),...(dto.descripcion!==undefined?{descripcion:dto.descripcion}:{}),...(dto.estado?{estado:dto.estado}:{})}});
  await audit(tx,tenantId,userId,'LEVANTAMIENTO_ESTADO',id,{anterior:l.estado,nuevo:result.estado});return result;
 });}
 async remove(tenantId:string,id:string,userId:string){return this.prisma.$transaction(async tx=>{await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,id);if(l.aplicadoAt||l.estado==='FINALIZADO')throw new ConflictException('No se elimina un levantamiento cerrado o aplicado');await audit(tx,tenantId,userId,'LEVANTAMIENTO_ELIMINAR',id,{sesion:l});await tx.levantamiento.delete({where:{id}});return {success:true};});}
 async findItems(tenantId:string,id:string){return (await this.findOne(tenantId,id)).items;}
 private editable(l:any){if(l.estado==='FINALIZADO'||l.aplicadoAt)throw new ConflictException('El levantamiento está cerrado');}
 async createItem(tenantId:string,lid:string,dto:CreateLevantamientoItemDto,userId:string){return this.prisma.$transaction(async tx=>{
  await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,lid);this.editable(l);
  const item=await tx.levantamientoItem.create({data:{...dto,descripcion:text(dto.descripcion,'Descripción'),codigo:dto.codigo?.trim().toUpperCase()||null,levantamientoId:lid,createdBy:userId,updatedBy:userId}});
  if(l.estado==='BORRADOR')await tx.levantamiento.update({where:{id:lid},data:{estado:'EN_PROGRESO'}});
  await audit(tx,tenantId,userId,'CONTEO_CREAR',item.id,{nuevo:this.item(item)});return this.item(item);
 });}
 async updateItem(tenantId:string,lid:string,itemId:string,dto:UpdateLevantamientoItemDto,userId:string){return this.prisma.$transaction(async tx=>{
  await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,lid);this.editable(l);const previous=l.items.find(i=>i.id===itemId);if(!previous)throw new NotFoundException('Item no encontrado');
  if(dto.version!==previous.version)throw new ConflictException('Otro usuario modificó el conteo; recargue y concilie');
  const {version,...data}=dto;
  const item=await tx.levantamientoItem.update({where:{id:itemId},data:{...data,...(dto.codigo!==undefined?{codigo:dto.codigo?.trim().toUpperCase()||null}:{}),...(dto.descripcion!==undefined?{descripcion:text(dto.descripcion,'Descripción')}:{}),version:{increment:1},updatedBy:userId}});
  await audit(tx,tenantId,userId,'CONTEO_EDITAR',item.id,{anterior:this.item(previous),nuevo:this.item(item)});return this.item(item);
 });}
 async removeItem(tenantId:string,lid:string,itemId:string,userId:string,version:number){return this.prisma.$transaction(async tx=>{await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,lid);this.editable(l);const item=l.items.find(i=>i.id===itemId);if(!item)throw new NotFoundException('Item no encontrado');if(item.version!==version)throw new ConflictException('El conteo cambió; recargue antes de eliminar');await audit(tx,tenantId,userId,'CONTEO_ELIMINAR',itemId,{anterior:this.item(item)});await tx.levantamientoItem.delete({where:{id:itemId}});return {success:true};});}
 private async preview(tx:any,tenantId:string,lid:string){
  const l=await this.session(tx,tenantId,lid);const rows:any[]=[],seen=new Set<string>();
  for(const item of l.items){
   const conditions:any[]=[];if(item.productoId)conditions.push({id:item.productoId});if(item.codigo)conditions.push({codigo:{equals:item.codigo,mode:'insensitive'}});if(item.codigoBarras)conditions.push({codigoBarras:item.codigoBarras});
   const products=conditions.length?await tx.producto.findMany({where:{tenantId,OR:conditions}}):[];
   const p=products.length===1?products[0]:null;
   const internal=item.codigo||`${item.descripcion.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').slice(0,18)}-${item.id.slice(0,8).toUpperCase()}`;
   const key=p?.id||internal;
   const errors:string[]=[];
   if(products.length>1)errors.push('Código/barcode identifica productos diferentes');
   if(p&&!p.activo)errors.push('Producto inactivo');
   if(seen.has(key))errors.push('Conteo duplicado: concilie antes de aplicar');seen.add(key);
   if(!p&&(item.precioCosto==null||item.precioVenta==null))errors.push('Producto nuevo requiere costo y precio');
   rows.push({item:this.item(item),productoId:p?.id||null,codigo:p?.codigo||internal,nombre:p?.nombre||item.descripcion,anterior:p?Number(p.stockActual):0,nuevo:Number(item.cantidad),precioCosto:item.precioCosto==null?(p?Number(p.precioCosto):null):Number(item.precioCosto),precioVenta:item.precioVenta==null?(p?Number(p.precioVenta):null):Number(item.precioVenta),unidad:p?.unidadMedida||String(item.unidad).toUpperCase(),errores:errors});
  }
  return {estado:l.estado,aplicadoAt:l.aplicadoAt,rows,token:fingerprint(rows)};
 }
 async previsualizar(tenantId:string,lid:string){return this.prisma.$transaction(async tx=>{await lockTenant(tx,tenantId);return this.preview(tx,tenantId,lid);});}
 async aplicar(tenantId:string,userId:string,lid:string,token:string){return this.prisma.$transaction(async tx=>{
  await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,lid);
  if(l.aplicadoAt)return {aplicadoAt:l.aplicadoAt,aplicadoPor:l.aplicadoPor};
  if(l.estado!=='FINALIZADO')throw new ConflictException('Finalice el conteo antes de aplicar');
  const preview=await this.preview(tx,tenantId,lid);
  if(preview.token!==token)throw new ConflictException('El inventario o conteo cambió; revise nuevamente la vista previa');
  if(!preview.rows.length||preview.rows.some(r=>r.errores.length))throw new BadRequestException('Resuelva los conflictos antes de aplicar');
  const units=['UNIDAD','PIE','METRO','METRO_CUADRADO','METRO_CUBICO','LIBRA','KG','GALON','LITRO','CAJA','PAQUETE','OTRO'];
  for(const r of preview.rows){
   if(!units.includes(r.unidad))throw new BadRequestException(`Unidad inválida para ${r.nombre}`);
   let pid=r.productoId;
   if(!pid){
    let categoriaId:string|null=null;if(r.item.categoria?.trim()){const nombre=r.item.categoria.trim();categoriaId=(await tx.categoria.upsert({where:{tenantId_nombre:{tenantId,nombre}},create:{tenantId,nombre},update:{}})).id;}
    const p=await tx.producto.create({data:{tenantId,codigo:r.codigo,codigoBarras:r.item.codigoBarras||null,nombre:r.nombre,descripcion:r.item.descripcion,categoriaId,stockActual:r.nuevo,stockMinimo:0,precioCosto:r.precioCosto,precioVenta:r.precioVenta,margen:r.item.margen,unidadMedida:r.unidad as any}});pid=p.id;
   }else await tx.producto.update({where:{id:pid},data:{stockActual:r.nuevo,precioCosto:r.precioCosto!,precioVenta:r.precioVenta!,...(r.item.margen!=null?{margen:r.item.margen}:{})}});
   await tx.levantamientoItem.update({where:{id:r.item.id},data:{productoId:pid}});
   await movement(tx,tenantId,userId,pid!,'LEVANTAMIENTO',r.anterior,r.nuevo,lid,'Conteo revisado y aplicado');
  }
  const result=await tx.levantamiento.update({where:{id:lid},data:{aplicadoAt:new Date(),aplicadoPor:userId}});await audit(tx,tenantId,userId,'LEVANTAMIENTO_APLICAR',lid,{rows:preview.rows});return result;
 },{timeout:30000});}
}
