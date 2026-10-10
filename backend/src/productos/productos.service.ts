import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { authorizedActor, audit, fingerprint, decimal, id, lockTenant, movement, query, text } from '../operaciones/ledger';
import type { CreateProductoDto, UpdateProductoDto } from './dto/create-producto.dto';
import { publicProduct } from './producto-response';

@Injectable()
export class ProductosService {
 constructor(private readonly prisma: PrismaService) {}
 private format(p:any){return {...p,precioVenta:Number(p.precioVenta),precioCosto:Number(p.precioCosto),stockActual:Number(p.stockActual),stockReservado:Number(p.stockReservado||0),stockDisponible:Number(p.stockActual)-Number(p.stockReservado||0),stockMinimo:Number(p.stockMinimo),stockBajo:Number(p.stockActual)-Number(p.stockReservado||0)<=Number(p.stockMinimo)};}
 async findAll(tenantId:string,search?:string,categoriaId?:string,incluirInactivos=false){
  const where:any={tenantId,...(incluirInactivos?{}:{activo:true}),...(categoriaId?{categoriaId}:{})};
  const term=search?.trim();
  if(term)where.OR=[...['nombre','descripcion','codigo','codigoBarras','codigoFabricante'].map(field=>({[field]:{contains:term,mode:'insensitive'}})),{categoria:{nombre:{contains:term,mode:'insensitive'}}}];
  return (await this.prisma.producto.findMany({where,include:{categoria:{select:{id:true,nombre:true}}},orderBy:{nombre:'asc'}})).map(p=>this.format(p));
 }
 async comercial(tenantId:string){
  const rows=await this.findAll(tenantId);return rows.map(p=>publicProduct({...p,stockFisico:p.stockActual,stockActual:p.stockDisponible}));
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
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN','BODEGUERO'],'inventario.editar');
   // Auditoría y alta comparten transacción y lock de empresa; no requiere otra tabla.
   const solicitudHash=dto.solicitudId?fingerprint(Object.fromEntries(Object.entries(dto).filter(([key,value])=>key!=='solicitudId'&&value!==undefined).sort(([a],[b])=>a.localeCompare(b)))):null;
   if(dto.solicitudId){
    const [previous]=await query(tx, "SELECT entidad_id,usuario_id,datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='PRODUCTO_CREAR' AND datos->>'solicitudId'=$2",tenantId,dto.solicitudId);
    if(previous){
     if(previous.usuario_id!==userId||previous.datos.solicitudHash!==solicitudHash)throw new ConflictException('La solicitud de alta ya se utilizó con otros datos');
     const saved=await tx.producto.findFirst({where:{id:previous.entidad_id,tenantId},include:{categoria:{select:{id:true,nombre:true}}}});
     if(!saved)throw new ConflictException('El producto de esta solicitud ya no está disponible');
     return this.format(saved);
    }
   }
   const nombre=text(dto.nombre,'Nombre');
   let codigo=dto.codigo?.trim().toUpperCase();
   if(!codigo){
    const prefix=nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').slice(0,18).replace(/-$/,'')||'PROD';
    let n=1;do{codigo=`${prefix}-${String(n++).padStart(3,'0')}`;}while(await tx.producto.findFirst({where:{tenantId,codigo:{equals:codigo,mode:'insensitive'}}}));
   }
   if(await tx.producto.findFirst({where:{tenantId,codigo:{equals:codigo,mode:'insensitive'}}}))throw new ConflictException('Código ya registrado');
   const barcode=dto.codigoBarras?.trim()||null;
   if(barcode&&await tx.producto.findFirst({where:{tenantId,codigoBarras:barcode}}))throw new ConflictException('Código de barras ya registrado');
   const p=await tx.producto.create({data:{tenantId,codigo,nombre,codigoBarras:barcode,codigoFabricante:dto.codigoFabricante?.trim()||null,marca:dto.marca?.trim()||null,imagenUrl:dto.imagenUrl||null,descripcion:dto.descripcion,categoriaId:await this.category(tx,tenantId,dto),usaMedida:dto.usaMedida??false,precioVenta:decimal(dto.precioVenta,'Precio'),precioCosto:decimal(dto.precioCosto,'Costo'),margen:dto.margen,stockActual:decimal(dto.stockActual,'Stock'),stockMinimo:decimal(dto.stockMinimo,'Mínimo'),unidadMedida:dto.unidadMedida||'UNIDAD'},include:{categoria:{select:{id:true,nombre:true}}}});
   await movement(tx,tenantId,userId,p.id,'INICIAL',0,Number(p.stockActual),p.id,'Alta inicial de producto');await audit(tx,tenantId,userId,'PRODUCTO_CREAR',p.id,{codigo,stock:Number(p.stockActual),...(dto.solicitudId?{solicitudId:dto.solicitudId,solicitudHash}:{})});return this.format(p);
  });
 }
 async update(tenantId:string,productId:string,dto:UpdateProductoDto,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const usuario=await authorizedActor(tx,tenantId,userId,['ADMIN','BODEGUERO'],'inventario.editar');
   const old=await tx.producto.findFirst({where:{id:productId,tenantId}});if(!old)throw new NotFoundException('Producto no encontrado');
   // FS-07: concurrencia optimista. Una versión obsoleta se rechaza antes de aplicar cualquier cambio.
   if(dto.version!==old.version)throw new ConflictException({message:'El producto fue modificado por otro usuario. Recargue la información antes de guardar.',code:'PRODUCTO_VERSION',versionActual:old.version});
   const reactivando=dto.activo===true&&!old.activo;
   const desactivando=dto.activo===false&&old.activo;
   if((reactivando||desactivando)&&usuario.rol!=='ADMIN')throw new ForbiddenException('Solo el administrador puede activar o desactivar productos');
   if(dto.stockActual!==undefined&&dto.stockActual<Number(old.stockReservado))throw new ConflictException('El conteo no cubre las ventas pendientes de entrega');
   const cambiaStock=dto.stockActual!==undefined&&Number(old.stockActual)!==dto.stockActual;
   if(cambiaStock&&dto.stockAnterior===undefined)throw new BadRequestException('Recargue el producto antes de ajustar existencias: falta la cantidad anterior');
   if(dto.stockActual!==undefined&&dto.stockAnterior!==undefined&&dto.stockAnterior!==Number(old.stockActual))throw new ConflictException({message:'Las existencias cambiaron después de abrir el formulario. Recargue el producto antes de ajustar.',code:'PRODUCTO_STOCK'});
   if(cambiaStock&&!dto.motivo?.trim())throw new BadRequestException('Indique un motivo para cambiar existencias');
   // La unidad interpreta las cantidades históricas: no puede cambiar si hay existencias o movimientos.
   if(dto.unidadMedida!==undefined&&dto.unidadMedida!==old.unidadMedida){
    // El alta inicial (INICIAL) no es historial de existencias; cualquier otro movimiento sí lo es.
    const movimientos=await tx.movimientoInventario.count({where:{tenantId,productoId:productId,tipo:{not:'INICIAL'}}});
    if(movimientos>0||Number(old.stockActual)!==0||Number(old.stockReservado)!==0)throw new ConflictException('La unidad de medida no puede cambiar si el producto tiene existencias o movimientos. Cree un producto nuevo para esa unidad.');
   }
   const codigo=dto.codigo!==undefined?text(dto.codigo,'Código').toUpperCase():undefined;
   if(codigo&&await tx.producto.findFirst({where:{tenantId,id:{not:productId},codigo:{equals:codigo,mode:'insensitive'}}}))throw new ConflictException('Código ya registrado');
   const barcodeNuevo=dto.codigoBarras!==undefined?(dto.codigoBarras.trim()||null):undefined;
   const barcodeFinal=barcodeNuevo!==undefined?barcodeNuevo:old.codigoBarras;
   // FS-07: un código de barras no se repite entre productos de la empresa, activos o inactivos.
   if(barcodeFinal&&((barcodeNuevo!==undefined&&barcodeNuevo!==old.codigoBarras)||reactivando)&&await tx.producto.findFirst({where:{tenantId,id:{not:productId},codigoBarras:barcodeFinal}}))throw new ConflictException('Código de barras ya registrado');

   // Solo se escriben los campos enviados: una actualización parcial conserva el resto.
   const data:any={};
   if(dto.descripcion!==undefined)data.descripcion=dto.descripcion.trim()||null;
   if(dto.codigoFabricante!==undefined)data.codigoFabricante=dto.codigoFabricante.trim()||null;
   if(dto.usaMedida!==undefined)data.usaMedida=dto.usaMedida;
   if(dto.unidadMedida!==undefined)data.unidadMedida=dto.unidadMedida;
   if(dto.margen!==undefined)data.margen=dto.margen;
   if(dto.imagenUrl!==undefined)data.imagenUrl=dto.imagenUrl||null;
   for(const f of ['precioVenta','precioCosto','stockMinimo'] as const)if(dto[f]!==undefined)data[f]=decimal(dto[f],f);
   if(cambiaStock)data.stockActual=decimal(dto.stockActual,'stockActual');
   if(codigo)data.codigo=codigo;
   if(dto.nombre!==undefined)data.nombre=text(dto.nombre,'Nombre');
   if(barcodeNuevo!==undefined)data.codigoBarras=barcodeNuevo;
   // Marca y categoría vacías no borran el dato existente en una actualización parcial.
   const marca=dto.marca?.trim();if(marca)data.marca=marca;
   if(dto.categoriaId?.trim()||dto.categoria?.trim())data.categoriaId=await this.category(tx,tenantId,{categoriaId:dto.categoriaId?.trim()||undefined,categoria:dto.categoria});
   if(dto.activo!==undefined)data.activo=dto.activo;

   const p=await tx.producto.update({where:{id:productId},data:{...data,version:{increment:1}},include:{categoria:{select:{id:true,nombre:true}}}});
   if(cambiaStock)await movement(tx,tenantId,userId,p.id,'AJUSTE',Number(old.stockActual),Number(p.stockActual),id(),dto.motivo!);
   // FS-07: la auditoría registra quién cambió qué, con valor anterior y nuevo de cada campo modificado.
   await audit(tx,tenantId,userId,'PRODUCTO_EDITAR',p.id,{cambios:this.cambiosProducto(old,p),motivo:dto.motivo?.trim()||null,version:{anterior:old.version,nueva:p.version}});
   return this.format(p);
  });
 }

 /** Campo por campo, solo los que realmente cambiaron. Decimal se compara como número. */
 private cambiosProducto(antes:any,despues:any){
  const campos=['codigo','codigoBarras','codigoFabricante','marca','nombre','descripcion','categoriaId','precioVenta','precioCosto','stockActual','stockMinimo','margen','unidadMedida','usaMedida','imagenUrl','activo'] as const;
  const norm=(v:any)=>v==null?null:(typeof v==='object'?Number(v.toString()):v);
  const cambios:Record<string,{anterior:any;nuevo:any}>={};
  for(const c of campos){const a=norm(antes[c]),n=norm(despues[c]);if(a!==n)cambios[c]={anterior:a,nuevo:n};}
  return cambios;
 }

 async delete(tenantId:string,productId:string,userId:string){return this.prisma.$transaction(async tx=>{await lockTenant(tx,tenantId);await authorizedActor(tx,tenantId,userId,['ADMIN'],'inventario.editar');const p=await tx.producto.findFirst({where:{id:productId,tenantId}});if(!p)throw new NotFoundException('Producto no encontrado');const result=await tx.producto.update({where:{id:productId},data:{activo:false,version:{increment:1}}});await audit(tx,tenantId,userId,'PRODUCTO_DESACTIVAR',productId,{});return this.format(result);});}
}
