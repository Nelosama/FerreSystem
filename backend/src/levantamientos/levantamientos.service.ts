import { Injectable, BadRequestException, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { actor, authorizedActor, audit, candidatosSolicitud, fingerprint, idSolicitud, lockTenant, movement, query, text } from '../operaciones/ledger';
import { CreateLevantamientoDto, UpdateLevantamientoDto } from './dto/create-levantamiento.dto';
import { CreateLevantamientoItemDto, UpdateLevantamientoItemDto, ConciliarItemDto } from './dto/create-levantamiento-item.dto';

type Identidad={productoId:string|null;codigo:string|null;codigoBarras:string|null};

/** Sesión considerada activa si el heartbeat no supera este umbral (ms) */
const SESION_TTL_MS = 5 * 60 * 1000; // 5 minutos

@Injectable()
export class LevantamientosService {
 constructor(private readonly prisma:PrismaService){}

 /** El conteo no expone ni guarda precios: los fija el administrador en Precios y aprobación. */
 private item(i:any){const {precioCosto:_precioCosto,precioVenta:_precioVenta,margen:_margen,...resto}=i;return {...resto,cantidad:Number(i.cantidad)};}
 private async session(tx:any,tenantId:string,id:string){const l=await tx.levantamiento.findFirst({where:{tenantId,id},include:{items:{orderBy:{id:'asc'}}}});if(!l)throw new NotFoundException('Levantamiento no encontrado');return l;}
 private editable(l:any){if(l.estado==='FINALIZADO'||l.aplicadoAt)throw new ConflictException('El levantamiento está cerrado');}

 /** Identidad canónica de un ítem: producto, código interno (mayúsculas) y código de barras (sin espacios). */
 private identidad(i:{productoId?:string|null;codigo?:string|null;codigoBarras?:string|null}){
  return {productoId:i.productoId||null,codigo:i.codigo?.trim().toUpperCase()||null,codigoBarras:i.codigoBarras?.trim()||null};
 }

 /** Dos ítems son el mismo artículo si comparten producto, código interno o código de barras. */
 private coinciden(a:Identidad,b:Identidad){
  return (!!a.productoId&&a.productoId===b.productoId)||(!!a.codigo&&a.codigo===b.codigo)||(!!a.codigoBarras&&a.codigoBarras===b.codigoBarras);
 }

 /** Ítems del conteo que coinciden por producto, código o código de barras con la identidad indicada (FS-06 fase 2). */
 private coincidencias(items:any[],identidad:{productoId?:string|null;codigo?:string|null;codigoBarras?:string|null},excluirId?:string){
  const ref=this.identidad(identidad);
  return items.filter(i=>i.id!==excluirId&&this.coinciden(ref,this.identidad(i)));
 }

 /**
  * Agrupa por componentes conectados: A(producto) y B(código de barras) forman grupo aunque A y C solo compartan código con B.
  * Detección, agrupación, conciliación y limpieza usan esta misma regla; así ningún conflicto queda sin su par.
  */
 private grupos(items:any[]):any[][]{
  const restantes=[...items],grupos:any[][]=[];
  while(restantes.length){
   const grupo=[restantes.shift()];
   for(let k=0;k<grupo.length;k++){
    const ref=this.identidad(grupo[k]);
    for(let j=0;j<restantes.length;){
     if(this.coinciden(ref,this.identidad(restantes[j])))grupo.push(...restantes.splice(j,1));
     else j++;
    }
   }
   grupos.push(grupo);
  }
  return grupos;
 }

 private claveGrupo(grupo:any[]){
  const ids=grupo.map(i=>this.identidad(i));
  return ids.find(i=>i.productoId)?.productoId??ids.find(i=>i.codigo)?.codigo??ids.find(i=>i.codigoBarras)?.codigoBarras??grupo[0].descripcion;
 }

 /** Añade el nombre del contador dentro de la misma empresa; `contadorId` se conserva para trazabilidad. */
 private async conContador(tenantId:string,items:any[]){
  const ids=[...new Set(items.map(i=>i.contadorId).filter(Boolean))] as string[];
  if(!ids.length)return items.map(i=>({...i,contador:null}));
  const usuarios=await this.prisma.usuario.findMany({where:{tenantId,id:{in:ids}},select:{id:true,nombre:true,activo:true}});
  const porId=new Map(usuarios.map((u:{id:string;nombre:string;activo:boolean})=>[u.id,u]));
  return items.map(i=>{
   if(!i.contadorId)return {...i,contador:null};
   const u=porId.get(i.contadorId) as {id:string;nombre:string;activo:boolean}|undefined;
   // Ausente o de otra empresa: no se revela el nombre ni se distingue eliminado de ajeno.
   return {...i,contador:{id:i.contadorId,nombre:u?.nombre??null,estado:!u?'NO_DISPONIBLE':u.activo?'ACTIVO':'DESACTIVADO'}};
  });
 }

 /** Un empleado no puede contar dos veces el mismo artículo: debe editar su conteo anterior. Nunca se suman cantidades. */
 private rechazarDuplicadoPropio(coincidentes:any[],userId:string){
  const propio=coincidentes.find(i=>i.contadorId===userId);
  if(propio)throw new ConflictException({message:'Este artículo ya está contado en este levantamiento. Edite el conteo anterior en lugar de capturarlo de nuevo.',code:'CONTEO_DUPLICADO',itemId:propio.id});
 }

 // ─── LEVANTAMIENTO CRUD ───────────────────────────────────────────────────

 async findAll(tenantId:string){
  return (await this.prisma.levantamiento.findMany({where:{tenantId},include:{_count:{select:{items:true}}},orderBy:{createdAt:'desc'}})).map(l=>({...l,totalItems:l._count.items}));
 }

 async findOne(tenantId:string,id:string){
  const l=await this.session(this.prisma,tenantId,id);
  return {...l,items:await this.conContador(tenantId,l.items.map(i=>this.item(i)))};
 }

 async create(tenantId:string,userId:string,dto:CreateLevantamientoDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const nombre=text(dto.nombre,'Nombre');
   // FS-06 fase 2: un reintento con la misma clave devuelve el levantamiento original; la misma clave con otros datos es conflicto.
   const hash=fingerprint({nombre,descripcion:dto.descripcion??null});
   if(dto.solicitudId){
    const previo=await tx.levantamiento.findFirst({where:{tenantId,solicitudId:dto.solicitudId}});
    if(previo){
     if(previo.solicitudHash!==hash)throw new ConflictException('La clave de solicitud ya se usó para otro levantamiento');
     return previo;
    }
   }
   const l=await tx.levantamiento.create({data:{tenantId,nombre,descripcion:dto.descripcion,estado:'BORRADOR',createdBy:userId,solicitudId:dto.solicitudId??null,solicitudHash:dto.solicitudId?hash:null}});
   await audit(tx,tenantId,userId,'LEVANTAMIENTO_CREAR',l.id,{nombre,descripcion:dto.descripcion??null});
   return l;
  });
 }

 async update(tenantId:string,id:string,dto:UpdateLevantamientoDto,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,id);
   if(l.aplicadoAt)throw new ConflictException('El levantamiento aplicado conserva su historia');
   if(l.estado==='FINALIZADO'){
    const user=await actor(tx,tenantId,userId);if(user.rol!=='ADMIN'||dto.estado!=='REVISION')throw new ConflictException('Solo el administrador puede reabrir a revisión');
   }
   const result=await tx.levantamiento.update({where:{id},data:{...(dto.nombre!==undefined?{nombre:text(dto.nombre,'Nombre')}:{}),...(dto.descripcion!==undefined?{descripcion:dto.descripcion}:{}),...(dto.estado?{estado:dto.estado}:{})}});
   await audit(tx,tenantId,userId,'LEVANTAMIENTO_ESTADO',id,{anterior:l.estado,nuevo:result.estado});
   return result;
  });
 }

 async remove(tenantId:string,id:string,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,id);
   if(l.aplicadoAt||l.estado==='FINALIZADO')throw new ConflictException('No se elimina un levantamiento cerrado o aplicado');
   await audit(tx,tenantId,userId,'LEVANTAMIENTO_ELIMINAR',id,{sesion:l});
   await tx.levantamiento.delete({where:{id}});
   return {success:true};
  });
 }

 // ─── ITEMS ────────────────────────────────────────────────────────────────

 async findItems(tenantId:string,id:string){return (await this.findOne(tenantId,id)).items;}

 async createItem(tenantId:string,lid:string,dto:CreateLevantamientoItemDto,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,lid);
   const {solicitudId,...data}=dto;
   const hash=fingerprint({lid,userId,data});
   // Idempotencia: si ya existe un ítem con este solicitudId, devolver el existente
   if(solicitudId){
    // Solo cuentan los conteos de esta empresa: el identificador de otra empresa se trata como libre.
    const candidato=await tx.levantamientoItem.findFirst({where:{id:{in:candidatosSolicitud(tenantId,solicitudId)}}});
    const previous=candidato&&await tx.levantamiento.findFirst({where:{id:candidato.levantamientoId,tenantId},select:{id:true}})?candidato:null;
    if(previous){
     const [record]=await query(tx,"SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND entidad_id=$2 AND operacion='CONTEO_CREAR'",tenantId,previous.id);
     if(previous.levantamientoId!==lid||record?.datos?.hash!==hash)throw new ConflictException('Solicitud utilizada para otro conteo');
     return this.item(previous);
    }
   }
   this.editable(l);

   // FS-06: el producto de referencia debe pertenecer a esta empresa; un id ajeno no se guarda.
   if(dto.productoId&&!(await tx.producto.findFirst({where:{id:dto.productoId,tenantId},select:{id:true}})))throw new BadRequestException('El producto indicado no pertenece a esta empresa');

   // Detectar conflicto: ¿ya existe un ítem del mismo producto/código capturado por OTRO usuario?
   const codeNorm=dto.codigo?.trim().toUpperCase()||null;
   const barcode=dto.codigoBarras?.trim()||null;
   const conflicting=this.coincidencias(l.items,{productoId:dto.productoId,codigo:dto.codigo,codigoBarras:dto.codigoBarras});
   this.rechazarDuplicadoPropio(conflicting,userId);
   const hayConflicto=conflicting.length>0;

   // Si hay conflicto, marcar los ítems existentes también como conflicto
   if(hayConflicto){
    for(const c of conflicting){
     if(!c.conflicto)await tx.levantamientoItem.update({where:{id:c.id},data:{conflicto:true}});
    }
   }

   const item=await tx.levantamientoItem.create({
    data:{
     ...data,
     ...(solicitudId?{id:idSolicitud(tenantId,solicitudId)}:{}),
     descripcion:text(dto.descripcion,'Descripción'),
     codigo:codeNorm,
     codigoBarras:barcode,
     levantamientoId:lid,
     createdBy:userId,
     updatedBy:userId,
     contadorId:userId,
     conflicto:hayConflicto,
    }
   });
   if(l.estado==='BORRADOR')await tx.levantamiento.update({where:{id:lid},data:{estado:'EN_PROGRESO'}});
   await audit(tx,tenantId,userId,'CONTEO_CREAR',item.id,{hash,nuevo:this.item(item),conflicto:hayConflicto});
   return this.item(item);
  });
 }

 async updateItem(tenantId:string,lid:string,itemId:string,dto:UpdateLevantamientoItemDto,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,lid);
   this.editable(l);
   const previous=l.items.find(i=>i.id===itemId);
   if(!previous)throw new NotFoundException('Item no encontrado');
   if(dto.version!==previous.version)throw new ConflictException('Otro usuario modificó el conteo; recargue y concilie');
   const {version,...data}=dto;
   // FS-06: la identidad resultante se evalúa con la misma regla del alta; si coincide con otro usuario, ambos quedan en conflicto.
   const codigo=dto.codigo!==undefined?(dto.codigo?.trim().toUpperCase()||null):previous.codigo;
   const codigoBarras=dto.codigoBarras!==undefined?(dto.codigoBarras?.trim()||null):previous.codigoBarras;
   const conflicting=this.coincidencias(l.items,{productoId:previous.productoId,codigo,codigoBarras},itemId);
   this.rechazarDuplicadoPropio(conflicting,userId);
   for(const c of conflicting){if(!c.conflicto)await tx.levantamientoItem.update({where:{id:c.id},data:{conflicto:true}});}
   const item=await tx.levantamientoItem.update({
    where:{id:itemId},
    data:{
     ...data,
     codigo,
     codigoBarras,
     ...(dto.descripcion!==undefined?{descripcion:text(dto.descripcion,'Descripción')}:{}),
     conflicto:conflicting.length>0,
     version:{increment:1},
     updatedBy:userId,
    }
   });
   await this.limpiarConflictosHuerfanos(tx,lid);
   await audit(tx,tenantId,userId,'CONTEO_EDITAR',item.id,{anterior:this.item(previous),nuevo:this.item(item)});
   return this.item(item);
  });
 }

 async removeItem(tenantId:string,lid:string,itemId:string,userId:string,version:number){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);const l=await this.session(tx,tenantId,lid);
   this.editable(l);
   const item=l.items.find(i=>i.id===itemId);
   if(!item)throw new NotFoundException('Item no encontrado');
   if(item.version!==version)throw new ConflictException('El conteo cambió; recargue antes de eliminar');
   await audit(tx,tenantId,userId,'CONTEO_ELIMINAR',itemId,{anterior:this.item(item)});
   await tx.levantamientoItem.delete({where:{id:itemId}});
   // Si era uno de dos conflictivos, limpiar el conflicto del que queda
   await this.limpiarConflictosHuerfanos(tx,lid);
   return {success:true};
  });
 }

 // ─── CONFLICTOS ──────────────────────────────────────────────────────────

 /** Lista todos los ítems marcados con conflicto=true, agrupados por producto */
 async findConflictos(tenantId:string,lid:string){
  const l=await this.session(this.prisma,tenantId,lid);
  const conflictivos=await this.conContador(tenantId,l.items.filter((i:any)=>i.conflicto).map((i:any)=>this.item(i)));
  return this.grupos(conflictivos).map(items=>({key:this.claveGrupo(items),token:this.tokenConflicto(tenantId,lid,items),items}));
 }

 /** Snapshot del grupo revisado, ligado a empresa y levantamiento; los nombres no afectan la decisión. */
 private tokenConflicto(tenantId:string,lid:string,items:any[]){
  return fingerprint({tenantId,lid,items:items.map(i=>({
   id:i.id,version:i.version,cantidad:Number(i.cantidad),...this.identidad(i),
   descripcion:i.descripcion,unidad:i.unidad,ubicacion:i.ubicacion,contadorId:i.contadorId,
   conflicto:i.conflicto,
  })).sort((a,b)=>a.id.localeCompare(b.id))});
 }

 /**
  * Conciliar conflicto: ADMIN elige qué ítem conservar (o una cantidad manual).
  * Regla explícita: nunca suma ni elige automáticamente.
  * dto.mantener = id del ítem que queda | dto.cantidadManual = cantidad a usar
  */
 async conciliarConflicto(tenantId:string,lid:string,dto:ConciliarItemDto,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN'],'inventario.editar');
   const l=await this.session(tx,tenantId,lid);
   if(l.aplicadoAt)throw new ConflictException('El levantamiento ya fue aplicado');

   const itemMantener=l.items.find((i:any)=>i.id===dto.mantenerItemId);
   if(!itemMantener||!itemMantener.conflicto)throw new NotFoundException('Ítem en conflicto no encontrado');

   // Hermanos: los demás conflictos del mismo grupo que muestra la pantalla (misma regla que detección y limpieza)
   const grupo=this.grupos(l.items.filter((i:any)=>i.conflicto)).find(g=>g.some(i=>i.id===dto.mantenerItemId))??[];
   if(dto.token!==this.tokenConflicto(tenantId,lid,grupo))throw new ConflictException({code:'CONTEO_CONFLICTO_VERSION',message:'Los conteos del conflicto cambiaron; recargue y revise las cantidades antes de conciliar'});
   const hermanos=grupo.filter(i=>i.id!==dto.mantenerItemId);

   if(!hermanos.length)throw new BadRequestException('No hay ítems en conflicto para conciliar con este');

   // Eliminar los hermanos
   for(const h of hermanos){
    await audit(tx,tenantId,userId,'CONTEO_CONCILIAR_ELIMINAR',h.id,{motivo:'Conciliación por administrador',mantener:dto.mantenerItemId,anterior:this.item(h),token:dto.token});
    await tx.levantamientoItem.delete({where:{id:h.id}});
   }

   // Actualizar el ítem elegido: limpiar conflicto, aplicar cantidad manual si la hay
   const updateData:any={conflicto:false,updatedBy:userId,version:{increment:1}};
   if(dto.cantidadManual!=null){
    if(dto.cantidadManual<0)throw new BadRequestException('La cantidad no puede ser negativa');
    updateData.cantidad=dto.cantidadManual;
   }
   const resultado=await tx.levantamientoItem.update({where:{id:dto.mantenerItemId},data:updateData});
   await audit(tx,tenantId,userId,'CONTEO_CONCILIAR',dto.mantenerItemId,{anterior:this.item(itemMantener),token:dto.token,hermanos:hermanos.map(h=>h.id),cantidadElegida:dto.cantidadManual??Number(itemMantener.cantidad)});

   // Limpiar otros conflictos huérfanos
   await this.limpiarConflictosHuerfanos(tx,lid);
   return this.item(resultado);
  });
 }

 /** Quita la bandera conflicto de ítems que quedaron sin "par" conflictivo */
 private async limpiarConflictosHuerfanos(tx:any,lid:string){
  const items=await tx.levantamientoItem.findMany({where:{levantamientoId:lid,conflicto:true}});
  // Un grupo de un solo ítem ya no es conflicto; se agrupa con la misma regla que la detección
  for(const grupo of this.grupos(items)){
   if(grupo.length===1)await tx.levantamientoItem.update({where:{id:grupo[0].id},data:{conflicto:false}});
  }
 }

 // ─── SESIONES ACTIVAS (heartbeat multiusuario) ───────────────────────────

 /** El cliente llama cada 60 s para registrar presencia */
 async heartbeat(tenantId:string,lid:string,userId:string,nombreUsuario:string){
  // FS-06: solo se registra presencia en levantamientos de la empresa del usuario.
  if(!(await this.prisma.levantamiento.findFirst({where:{tenantId,id:lid},select:{id:true}})))throw new NotFoundException('Levantamiento no encontrado');
  await this.prisma.levantamientoSesion.upsert({
   where:{levantamientoId_usuarioId:{levantamientoId:lid,usuarioId:userId}},
   create:{tenantId,levantamientoId:lid,usuarioId:userId,nombreUsuario,ultimoHeartbeat:new Date()},
   update:{nombreUsuario,ultimoHeartbeat:new Date()},
  });
  return {ok:true};
 }

 /** Lista usuarios activos en el levantamiento (heartbeat < 5 min) */
 async findParticipantes(tenantId:string,lid:string){
  const umbral=new Date(Date.now()-SESION_TTL_MS);
  return this.prisma.levantamientoSesion.findMany({
   where:{tenantId,levantamientoId:lid,ultimoHeartbeat:{gte:umbral}},
   select:{usuarioId:true,nombreUsuario:true,ultimoHeartbeat:true},
   orderBy:{ultimoHeartbeat:'desc'},
  });
 }

 /** Limpiar sesión al salir */
 async salirSesion(tenantId:string,lid:string,userId:string){
  await this.prisma.levantamientoSesion.deleteMany({where:{tenantId,levantamientoId:lid,usuarioId:userId}});
  return {ok:true};
 }

 // ─── PREVIEW Y APLICAR ────────────────────────────────────────────────────

 private async preview(tx:any,tenantId:string,lid:string){
  const l=await this.session(tx,tenantId,lid);
  const rows:any[]=[],seen=new Set<string>(),barcodes=new Set<string>();
  const items=l.items.map((i:any)=>({...i,codigo:i.codigo?.trim().toUpperCase()||null,codigoBarras:i.codigoBarras?.trim()||null}));
  // FS-06: el código se compara sin distinguir mayúsculas; productos heredados pueden estar en minúsculas.
  const candidates=await tx.producto.findMany({where:{tenantId,OR:[
   {id:{in:items.map((i:any)=>i.productoId).filter(Boolean)}},
   ...items.map((i:any)=>i.codigo).filter(Boolean).map((codigo:string)=>({codigo:{equals:codigo,mode:'insensitive'}})),
   {codigoBarras:{in:items.map((i:any)=>i.codigoBarras).filter(Boolean)}}
  ]}});
  for(const item of items){
   const products=candidates.filter((p:any)=>p.id===item.productoId||item.codigo&&p.codigo.toUpperCase()===item.codigo.toUpperCase()||item.codigoBarras&&p.codigoBarras===item.codigoBarras);
   const p=products.length===1?products[0]:null;
   const internal=item.codigo||`${item.descripcion.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').slice(0,18)}-${item.id.slice(0,8).toUpperCase()}`;
   const key=p?.id||internal;
   const errors:string[]=[];
   if(item.conflicto)errors.push('Conteo en conflicto: conciliar antes de aplicar');
   if(products.length>1)errors.push('Código/barcode identifica productos diferentes');
   if(p&&!p.activo)errors.push('Producto inactivo');
   if(p&&String(item.unidad||'UNIDAD').toUpperCase()!==p.unidadMedida)errors.push('La unidad contada no coincide con la del producto; concilie sin convertir cantidades automáticamente');
   if(p&&Number(item.cantidad)<Number(p.stockReservado||0))errors.push('Conteo menor a mercancía pendiente de entrega');
   if(p&&item.codigoBarras&&p.codigoBarras&&p.codigoBarras!==item.codigoBarras)errors.push(`Código de barras del conteo (${item.codigoBarras}) difiere del catálogo (${p.codigoBarras}); verifique que sea el mismo producto`);
   if(item.codigoBarras){if(barcodes.has(item.codigoBarras))errors.push('Código de barras repetido en el conteo');barcodes.add(item.codigoBarras);}
   if(seen.has(key))errors.push('Conteo duplicado: concilie antes de aplicar');seen.add(key);
   rows.push({
    item:this.item(item),
    productoId:p?.id||null,
    codigo:p?.codigo||internal,
    nombre:p?.nombre||item.descripcion,
    contadorId:item.contadorId,
    conflicto:item.conflicto,
    matchedByBarcode:!!(p&&item.codigoBarras&&p.codigoBarras===item.codigoBarras),
    catalogBarcode:p?.codigoBarras||null,
    catalogMarca:p?.marca||null,
    reservado:p?Number(p.stockReservado||0):0,
    anterior:p?Number(p.stockActual):0,
    nuevo:Number(item.cantidad),
    // Pendiente de precio: producto nuevo, o existente que aún no tiene precio aprobado para venta.
    precioPendiente:!p||!p.precioAprobado,
    datosCompletos:!!(item.descripcion?.trim()&&(item.categoria?.trim()||p?.categoriaId)),
    unidad:p?.unidadMedida||String(item.unidad).toUpperCase(),
    errores:errors,
   });
  }
  return {estado:l.estado,aplicadoAt:l.aplicadoAt,rows,token:fingerprint(rows)};
 }

 async previsualizar(tenantId:string,lid:string){
  return this.prisma.$transaction(async tx=>{await lockTenant(tx,tenantId);return this.preview(tx,tenantId,lid);},{timeout:30000});
 }

 async aplicar(tenantId:string,userId:string,lid:string,token:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN'],'inventario.editar');
   const l=await this.session(tx,tenantId,lid);
   if(l.aplicadoAt)return {aplicadoAt:l.aplicadoAt,aplicadoPor:l.aplicadoPor};
   if(l.estado!=='FINALIZADO')throw new ConflictException('Finalice el conteo antes de aplicar');

   // Bloquear si hay conflictos sin resolver
   const conflictCount=l.items.filter((i:any)=>i.conflicto).length;
   if(conflictCount>0)throw new ConflictException(`Hay ${conflictCount} conteo(s) en conflicto. Concílialos antes de aplicar.`);

   const preview=await this.preview(tx,tenantId,lid);
   if(preview.token!==token)throw new ConflictException('El inventario o conteo cambió; revise nuevamente la vista previa');
   if(!preview.rows.length||preview.rows.some((r:any)=>r.errores.length))throw new BadRequestException('Resuelva los conflictos antes de aplicar');

   const units=['UNIDAD','PIE','METRO','METRO_CUADRADO','METRO_CUBICO','LIBRA','KG','GALON','LITRO','CAJA','PAQUETE','OTRO'];
   for(const r of preview.rows){
    if(!units.includes(r.unidad))throw new BadRequestException(`Unidad inválida para ${r.nombre}`);
    let pid=r.productoId;
    if(!pid){
     let categoriaId:string|null=null;
     if(r.item.categoria?.trim()){const nombre=r.item.categoria.trim();categoriaId=(await tx.categoria.upsert({where:{tenantId_nombre:{tenantId,nombre}},create:{tenantId,nombre},update:{}})).id;}
     // Alta desde el conteo: sin precio y sin aprobar. No se vende hasta que el administrador fije y apruebe el precio.
     const p=await tx.producto.create({data:{tenantId,codigo:r.codigo,codigoBarras:r.item.codigoBarras||null,marca:r.item.marca?.trim()||null,nombre:r.nombre,descripcion:r.item.descripcion,categoriaId,stockActual:r.nuevo,stockMinimo:0,precioCosto:0,precioVenta:0,precioAprobado:false,unidadMedida:r.unidad as any}});
     pid=p.id;
    }else{
     // Ajuste de cantidades: nunca toca costo, precio de venta ni margen del catálogo.
     await tx.producto.update({where:{id:pid},data:{stockActual:r.nuevo,version:{increment:1},...(r.item.marca?.trim()&&!r.catalogMarca?{marca:r.item.marca.trim()}:{}),...(r.item.codigoBarras&&r.matchedByBarcode?{codigoBarras:r.item.codigoBarras}:r.item.codigoBarras&&!r.catalogBarcode?{codigoBarras:r.item.codigoBarras}:{})}});
    }
    await tx.levantamientoItem.update({where:{id:r.item.id},data:{productoId:pid}});
    await movement(tx,tenantId,userId,pid!,'LEVANTAMIENTO',r.anterior,r.nuevo,lid,'Conteo revisado y aplicado');
   }
   const result=await tx.levantamiento.update({where:{id:lid},data:{aplicadoAt:new Date(),aplicadoPor:userId}});
   await audit(tx,tenantId,userId,'LEVANTAMIENTO_APLICAR',lid,{rows:preview.rows});
   return result;
  },{timeout:120000});
 }
}
