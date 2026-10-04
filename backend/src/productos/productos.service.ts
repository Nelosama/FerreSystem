import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { audit, decimal, id, lockTenant, movement, query, text } from '../operaciones/ledger';
import type { CreateProductoDto, UpdateProductoDto } from './dto/create-producto.dto';

@Injectable()
export class ProductosService {
 constructor(private readonly prisma: PrismaService) {}
 private format(p:any){return {...p,precioVenta:Number(p.precioVenta),precioCosto:Number(p.precioCosto),stockActual:Number(p.stockActual),stockReservado:Number(p.stockReservado||0),stockDisponible:Number(p.stockActual)-Number(p.stockReservado||0),stockMinimo:Number(p.stockMinimo),stockBajo:Number(p.stockActual)-Number(p.stockReservado||0)<=Number(p.stockMinimo)};}
 async findAll(tenantId:string,search?:string,categoriaId?:string){
  const where:any={tenantId,activo:true,...(categoriaId?{categoriaId}:{})};
  if(search)where.OR=['nombre','descripcion','codigo','codigoBarras','codigoFabricante'].map(field=>({[field]:{contains:search,mode:'insensitive'}}));
  return (await this.prisma.producto.findMany({where,include:{categoria:{select:{id:true,nombre:true}}},orderBy:{nombre:'asc'}})).map(p=>this.format(p));
 }
 async comercial(tenantId:string){
  const rows=await this.findAll(tenantId);return rows.map(({precioCosto,margen,ultimaCompraAt,...p})=>({...p,stockFisico:p.stockActual,stockActual:p.stockDisponible}));
 }
 async findById(tenantId:string,id:string){const p=await this.prisma.producto.findFirst({where:{id,tenantId},include:{categoria:true}});if(!p)throw new NotFoundException('Producto no encontrado');return this.format(p);}
 async getLowStock(tenantId:string){return (await this.findAll(tenantId)).filter(p=>p.stockBajo);}
 private async category(tx:any,tenantId:string,dto:{categoriaId?:string;categoria?:string}){
  if(dto.categoriaId){const c=await tx.categoria.findFirst({where:{id:dto.categoriaId,tenantId}});if(!c)throw new NotFoundException('Categoría no encontrada');return c.id;}
  if(!dto.categoria?.trim())return null;
  const nombre=dto.categoria.trim();const c=await tx.categoria.upsert({where:{tenantId_nombre:{tenantId,nombre}},create:{tenantId,nombre},update:{}});return c.id;
 }
 async create(tenantId:string,dto:CreateProductoDto,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);const nombre=text(dto.nombre,'Nombre');
   let codigo=dto.codigo?.trim().toUpperCase();
   if(!codigo){
    const prefix=nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').slice(0,18).replace(/-$/,'')||'PROD';
    let n=1;do{codigo=`${prefix}-${String(n++).padStart(3,'0')}`;}while(await tx.producto.findFirst({where:{tenantId,codigo:{equals:codigo,mode:'insensitive'}}}));
   }
   if(await tx.producto.findFirst({where:{tenantId,codigo:{equals:codigo,mode:'insensitive'}}}))throw new ConflictException('Código ya registrado');
   const barcode=dto.codigoBarras?.trim()||null;
   if(barcode&&await tx.producto.findFirst({where:{tenantId,codigoBarras:barcode,activo:true}}))throw new ConflictException('Código de barras ya registrado');
   const p=await tx.producto.create({data:{tenantId,codigo,nombre,codigoBarras:barcode,codigoFabricante:dto.codigoFabricante?.trim()||null,descripcion:dto.descripcion,categoriaId:await this.category(tx,tenantId,dto),usaMedida:dto.usaMedida??false,precioVenta:decimal(dto.precioVenta,'Precio'),precioCosto:decimal(dto.precioCosto,'Costo'),margen:dto.margen,stockActual:decimal(dto.stockActual,'Stock'),stockMinimo:decimal(dto.stockMinimo,'Mínimo'),unidadMedida:dto.unidadMedida||'UNIDAD'},include:{categoria:{select:{id:true,nombre:true}}}});
   await movement(tx,tenantId,userId,p.id,'INICIAL',0,Number(p.stockActual),p.id,'Alta inicial de producto');await audit(tx,tenantId,userId,'PRODUCTO_CREAR',p.id,{codigo,stock:Number(p.stockActual)});return this.format(p);
  });
 }
 async update(tenantId:string,productId:string,dto:UpdateProductoDto,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const old=await tx.producto.findFirst({where:{id:productId,tenantId}});if(!old)throw new NotFoundException('Producto no encontrado');
   if(dto.stockActual!==undefined && dto.stockActual<Number(old.stockReservado))throw new ConflictException('El conteo no cubre las ventas pendientes de entrega');
   if(dto.stockActual!==undefined && Number(old.stockActual)!==dto.stockActual && !dto.motivo?.trim())throw new BadRequestException('Indique un motivo para cambiar existencias');
   const codigo=dto.codigo!==undefined?text(dto.codigo,'Código').toUpperCase():undefined,barcode=dto.codigoBarras?.trim()||null;
   if(codigo&&await tx.producto.findFirst({where:{tenantId,id:{not:productId},codigo:{equals:codigo,mode:'insensitive'}}}))throw new ConflictException('Código ya registrado');
   if(barcode&&await tx.producto.findFirst({where:{tenantId,id:{not:productId},codigoBarras:barcode,activo:true}}))throw new ConflictException('Código de barras ya registrado');
   const data:any={};
   for(const f of ['descripcion','usaMedida','unidadMedida','margen','codigoFabricante'] as const)if(dto[f]!==undefined)data[f]=dto[f];
   for(const f of ['precioVenta','precioCosto','stockActual','stockMinimo'] as const)if(dto[f]!==undefined)data[f]=decimal(dto[f],f);
   if(codigo)data.codigo=codigo;if(dto.nombre!==undefined)data.nombre=text(dto.nombre,'Nombre');if(dto.codigoBarras!==undefined)data.codigoBarras=barcode;
   if(dto.categoriaId!==undefined||dto.categoria!==undefined)data.categoriaId=await this.category(tx,tenantId,dto);
   const p=await tx.producto.update({where:{id:productId},data,include:{categoria:{select:{id:true,nombre:true}}}});
   if(Number(p.stockActual)!==Number(old.stockActual))await movement(tx,tenantId,userId,p.id,'AJUSTE',Number(old.stockActual),Number(p.stockActual),id(),dto.motivo!);
   await audit(tx,tenantId,userId,'PRODUCTO_EDITAR',p.id,{anterior:{costo:Number(old.precioCosto),precio:Number(old.precioVenta),stock:Number(old.stockActual)},nuevo:data,motivo:dto.motivo});return this.format(p);
  });
 }
 async delete(tenantId:string,productId:string,userId:string){return this.prisma.$transaction(async tx=>{await lockTenant(tx,tenantId);const p=await tx.producto.findFirst({where:{id:productId,tenantId}});if(!p)throw new NotFoundException('Producto no encontrado');const result=await tx.producto.update({where:{id:productId},data:{activo:false}});await audit(tx,tenantId,userId,'PRODUCTO_DESACTIVAR',productId,{});return this.format(result);});}
}
