import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Tx } from './ledger';
import { PrismaService } from '../prisma/prisma.service';
import { ZONA_HORARIA_NEGOCIO, diaCalendario, rangoDiasEnZona, sumarDias } from '../common/zona-horaria';
import { account, actor, authorizedActor, audit, cashMovement, decimal, fingerprint, id, lockTenant, money, movement, openCash, paymentMethod, query, text } from './ledger';
import type { AbrirCajaDto, AjusteDto, CerrarCajaDto, CompraDto, DevolucionDto, MovimientoCajaDto, PagoDto, ProveedorDto, RecepcionDto, DecisionDevolucionDto } from './operaciones.dto';

@Injectable()
export class OperacionesService {
 constructor(private readonly prisma: PrismaService) {}
 async proveedores(tenantId: string) {
  return query(this.prisma, 'SELECT id,nombre,telefono,rtn FROM proveedores WHERE tenant_id=$1 ORDER BY nombre', tenantId);
 }
 async proveedor(tenantId: string, userId: string, dto: ProveedorDto) {
  return this.prisma.$transaction(async tx => {
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN']);
   const hash=fingerprint({userId,dto});
   const [old]=await query(tx,"SELECT p.*,a.datos FROM proveedores p JOIN auditoria_operaciones a ON a.entidad_id=p.id AND a.operacion='PROVEEDOR_CREAR' WHERE p.id=$1 AND p.tenant_id=$2",dto.solicitudId,tenantId);
   if(old){if(old.datos.hash!==hash)throw new ConflictException('Solicitud utilizada para otro proveedor');return old;}
   const [p] = await query(tx, 'INSERT INTO proveedores (id,tenant_id,nombre,telefono,rtn,updated_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *', dto.solicitudId, tenantId, text(dto.nombre,'Proveedor'), dto.telefono || null, dto.rtn || null);
   await audit(tx,tenantId,userId,'PROVEEDOR_CREAR',p.id,{nombre:p.nombre,hash});return p;
  });
 }
 async compras(tenantId: string) {
  const orders = await query(this.prisma, 'SELECT o.*, p.nombre AS proveedor_nombre FROM ordenes_compra o JOIN proveedores p ON p.id=o.proveedor_id WHERE o.tenant_id=$1 ORDER BY o.created_at DESC', tenantId);
  for(const o of orders) o.items = await query(this.prisma, 'SELECT d.*, p.nombre, p.codigo FROM detalles_orden_compra d JOIN productos p ON p.id=d.producto_id WHERE d.orden_id=$1 ORDER BY p.nombre',o.id);
  return orders;
 }
 async compra(tenantId: string,userId: string,dto: CompraDto) {
  return this.prisma.$transaction(async tx => {
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN','BODEGUERO'],'inventario.editar');
   const hash=fingerprint({userId,dto});
   const [previous] = await query(tx, 'SELECT o.*, a.datos FROM ordenes_compra o JOIN auditoria_operaciones a ON a.entidad_id=o.id AND a.operacion=\'COMPRA_CREAR\' WHERE o.id=$1 AND o.tenant_id=$2',dto.solicitudId,tenantId);
   if(previous){if(previous.datos.hash!==hash)throw new ConflictException('Solicitud utilizada para otra compra');return previous;}
   const [p]=await query(tx,'SELECT id FROM proveedores WHERE id=$1 AND tenant_id=$2',dto.proveedorId,tenantId);if(!p)throw new NotFoundException('Proveedor no encontrado');
   if(!dto.items?.length)throw new BadRequestException('Agregue productos');
   if(new Set(dto.items.map(x=>x.productoId)).size!==dto.items.length)throw new BadRequestException('Agrupe las líneas del mismo producto');
   const numeroFactura=text(dto.numeroFactura,'Factura');
   const [duplicate]=await query(tx,'SELECT id FROM ordenes_compra WHERE tenant_id=$1 AND proveedor_id=$2 AND UPPER(TRIM(numero_factura))=UPPER(TRIM($3))',tenantId,p.id,numeroFactura);
   if(duplicate)throw new ConflictException('Esta factura de proveedor ya está registrada');
   let subtotal=0;
   for(const item of dto.items){
    const prod=await tx.producto.findFirst({where:{id:item.productoId,tenantId,activo:true}});if(!prod)throw new NotFoundException('Producto no encontrado');
    subtotal=money(subtotal+money(decimal(item.cantidad,'Cantidad',true)*decimal(item.costo,'Costo')));
   }
   const tax=decimal(dto.isv,'Impuesto'), total=decimal(money(subtotal+tax),'Total');
   const [order]=await query(tx,'INSERT INTO ordenes_compra (id,tenant_id,codigo,proveedor_id,usuario_id,subtotal,isv,total,estado,numero_factura,vencimiento,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,\'SOLICITADA\',$9,$10::timestamp,NOW()) RETURNING *',dto.solicitudId,tenantId,`COMP-${dto.solicitudId}`,p.id,userId,subtotal,tax,total,numeroFactura,dto.vencimiento || null);
   for(const item of dto.items)await query(tx,'INSERT INTO detalles_orden_compra (id,orden_id,producto_id,cantidad,precio_costo,subtotal) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',id(),order.id,item.productoId,item.cantidad,item.costo,money(item.cantidad*item.costo));
   await account(tx,tenantId,userId,'CXP',order.id,p.id,total,dto.vencimiento);
   await audit(tx,tenantId,userId,'COMPRA_CREAR',order.id,{hash,total,numeroFactura});return order;
  },{timeout:60000});
 }
 async recibir(tenantId:string,userId:string,orderId:string,dto:RecepcionDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN','BODEGUERO'],'inventario.editar');
   const hash=fingerprint({orderId,userId,dto});
   const [old]=await query(tx,'SELECT * FROM recepciones_compra WHERE tenant_id=$1 AND solicitud_id=$2',tenantId,dto.solicitudId);
   if(old){if(old.solicitud_hash!==hash)throw new ConflictException('Solicitud utilizada para otra recepción');return old;}
   const [order]=await query(tx,'SELECT * FROM ordenes_compra WHERE id=$1 AND tenant_id=$2 FOR UPDATE',orderId,tenantId);
   if(!order)throw new NotFoundException('Compra no encontrada');
   if(!['SOLICITADA','APROBADA'].includes(order.estado))throw new ConflictException('Compra no admite recepción');
   if(!dto.items?.length || new Set(dto.items.map(x=>x.detalleId)).size!==dto.items.length)throw new BadRequestException('Recepción vacía o líneas repetidas');
   const receptionId=id();
   const [reception]=await query(tx,'INSERT INTO recepciones_compra (id,tenant_id,orden_id,solicitud_id,solicitud_hash,usuario_id,fecha) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()) RETURNING *',receptionId,tenantId,order.id,dto.solicitudId,hash,userId);
   for(const item of dto.items){
    const quantity=decimal(item.cantidad,'Cantidad',true);
    const [line]=await query(tx,'SELECT * FROM detalles_orden_compra WHERE id=$1 AND orden_id=$2 FOR UPDATE',item.detalleId,order.id);
    if(!line)throw new NotFoundException('Línea no encontrada');
    if(quantity>money(Number(line.cantidad)-Number(line.cantidad_recibida)))throw new BadRequestException('Cantidad supera el pendiente de recepción');
    const [prod]=await query(tx,'SELECT * FROM productos WHERE id=$1 AND tenant_id=$2 AND activo=true FOR UPDATE',line.producto_id,tenantId);
    if(!prod)throw new NotFoundException('Producto no disponible');
    // La fecha de recepción es la fecha comercial de actualización. Un costo menor también reemplaza el anterior.
    // QA-INV-001B: incrementar versión para invalidar formularios antiguos de edición
    await query(tx,'UPDATE productos SET stock_actual=stock_actual+$1,precio_costo=$2,costo_vigente=$2,ultima_compra_at=$3,version=version+1,updated_at=NOW() WHERE id=$4 AND tenant_id=$5 RETURNING id',quantity,line.precio_costo,reception.fecha,prod.id,tenantId);
    await query(tx,'UPDATE detalles_orden_compra SET cantidad_recibida=cantidad_recibida+$1 WHERE id=$2 RETURNING id',quantity,line.id);
    await query(tx,'INSERT INTO costos_compra (id,tenant_id,producto_id,proveedor_id,orden_id,recepcion_id,cantidad,costo,fecha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',id(),tenantId,prod.id,order.proveedor_id,order.id,receptionId,quantity,line.precio_costo,reception.fecha);
    await movement(tx,tenantId,userId,prod.id,'COMPRA',Number(prod.stock_actual),money(Number(prod.stock_actual)+quantity),receptionId,`Factura ${order.numero_factura}`);
   }
   const [pending]=await query(tx,'SELECT COUNT(*)::int AS cantidad FROM detalles_orden_compra WHERE orden_id=$1 AND cantidad_recibida<cantidad',order.id);
   if(pending.cantidad===0)await query(tx,'UPDATE ordenes_compra SET estado=\'RECIBIDA\',fecha_entrega=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id',order.id);
   await audit(tx,tenantId,userId,'COMPRA_RECIBIR',receptionId,{orderId,items:dto.items});return reception;
  },{timeout:60000});
 }
 async cuentas(tenantId:string,userId:string,tipo:string,ahora=new Date()){
  if(!['CXC','CXP'].includes(tipo))throw new BadRequestException('Tipo inválido');
  const user=await actor(this.prisma,tenantId,userId);if(tipo==='CXP'&&user.rol!=='ADMIN')throw new ForbiddenException('Cuentas por pagar requieren administrador');
  const accounts=await query(this.prisma,'SELECT c.*, COALESCE(cl.nombre,p.nombre) AS nombre, COALESCE(o.numero_factura, v.numero_venta::text) AS documento, c.saldo>0 AND c.vencimiento::date < ($4::timestamptz AT TIME ZONE $3)::date AS vencida FROM cuentas_operativas c LEFT JOIN clientes cl ON cl.id=c.cliente_id LEFT JOIN proveedores p ON p.id=c.proveedor_id LEFT JOIN ordenes_compra o ON o.id=c.documento_id LEFT JOIN ventas v ON v.id=c.documento_id WHERE c.tenant_id=$1 AND c.tipo=$2 ORDER BY c.created_at DESC',tenantId,tipo,ZONA_HORARIA_NEGOCIO,ahora.toISOString());
  for(const c of accounts)c.pagos=await query(this.prisma,'SELECT * FROM pagos_cuenta WHERE cuenta_id=$1 AND tenant_id=$2 ORDER BY created_at DESC',c.id,tenantId);
  return accounts;
 }
 async pagar(tenantId:string,userId:string,cuentaId:string,dto:PagoDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const user=await authorizedActor(tx,tenantId,userId,['ADMIN','CAJERO']);
   const hash=fingerprint({userId,cuentaId,dto});
   const [previous]=await query(tx,'SELECT * FROM pagos_cuenta WHERE tenant_id=$1 AND solicitud_id=$2',tenantId,dto.solicitudId);
   if(previous){if(previous.solicitud_hash!==hash)throw new ConflictException('Solicitud utilizada para otro pago');return previous;}
   const [c]=await query(tx,'SELECT * FROM cuentas_operativas WHERE id=$1 AND tenant_id=$2 FOR UPDATE',cuentaId,tenantId);if(!c)throw new NotFoundException('Cuenta no encontrada');
   if(c.tipo==='CXP'&&user.rol!=='ADMIN')throw new ForbiddenException('Pago a proveedor requiere administrador');
   const monto=decimal(dto.monto,'Pago',true),metodo=paymentMethod(dto.metodo);if(monto>Number(c.saldo))throw new BadRequestException('Pago mayor al saldo');
   // FS-09 (regla del propietario): los pagos a proveedor (CXP) son independientes de la caja registradora.
   // Ningún método —EFECTIVO incluido— exige caja abierta ni genera movimientos_caja: un pago a proveedor es una
   // salida de fondos administrativos, no del cajón del cajero. Solo los abonos de clientes (CXC) afectan el arqueo.
   const afectaCaja=c.tipo==='CXC';
   const caja=afectaCaja?await openCash(tx,tenantId,userId):null;
   const [p]=await query(tx,'INSERT INTO pagos_cuenta (id,tenant_id,cuenta_id,solicitud_id,solicitud_hash,monto,metodo,usuario_id,caja_id,notas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',id(),tenantId,c.id,dto.solicitudId,hash,monto,metodo,userId,caja?.id ?? null,dto.notas || null);
   await query(tx,'UPDATE cuentas_operativas SET saldo=saldo-$1 WHERE id=$2 RETURNING id',monto,c.id);
   if(c.tipo==='CXC'&&c.cliente_id){
    const [client]=await query(tx,'UPDATE clientes SET saldo_pendiente=saldo_pendiente-$1 WHERE id=$2 AND tenant_id=$3 AND saldo_pendiente >= $1 RETURNING id',monto,c.cliente_id,tenantId);
    if(!client)throw new ConflictException('El saldo del cliente no coincide con la cuenta por cobrar');
    await query(tx,'UPDATE ventas SET saldo_credito=GREATEST(COALESCE(saldo_credito,total)-$1,0) WHERE id=$2 AND tenant_id=$3 AND tipo_pago=\'CREDITO\' RETURNING id',monto,c.documento_id,tenantId);
   }
   if(caja)await cashMovement(tx,caja.id,userId,'ABONO_CXC',monto,metodo,p.id,'Abono de cliente');
   await audit(tx,tenantId,userId,'CUENTA_PAGAR',p.id,{cuentaId,tipo:c.tipo,monto,metodo,afectaCaja,cajaId:caja?.id??null,proveedorId:c.proveedor_id??null,clienteId:c.cliente_id??null,documentoId:c.documento_id??null});return p;
  });
 }
 // Caja: el efectivo esperado solo suma movimientos EFECTIVO. Tarjeta, transferencia y crédito son totales informativos.
 private resumenCaja(c:any,movements:any[]){
  const efectivo=movements.filter(m=>m.metodo==='EFECTIVO').map(m=>Number(m.monto));
  const ingresosEfectivo=money(efectivo.filter(n=>n>0).reduce((s,n)=>s+n,0));
  const egresosEfectivo=money(-efectivo.filter(n=>n<0).reduce((s,n)=>s+n,0));
  const resumen:any={fondoInicial:money(Number(c.monto_apertura)),ingresosEfectivo,egresosEfectivo,efectivoEsperado:money(Number(c.monto_apertura)+ingresosEfectivo-egresosEfectivo),totalesPorMetodo:Object.fromEntries(['EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO'].map(method=>[method,money(movements.filter(m=>m.metodo===method).reduce((s,m)=>s+Number(m.monto),0))]))};
  if(c.estado==='CERRADA'){resumen.efectivoContado=Number(c.monto_cierre_fisico);resumen.diferencia=Number(c.diferencia);}
  return resumen;
 }
 async caja(tenantId:string,userId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const cajas=await query(tx,'SELECT * FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 ORDER BY fecha_apertura DESC LIMIT 30',tenantId,userId);
   for(const c of cajas){
    const movements=await query(tx,'SELECT * FROM movimientos_caja WHERE caja_id=$1 ORDER BY created_at,id',c.id);c.movimientos=movements;
    c.resumen=this.resumenCaja(c,movements);c.efectivoEsperado=c.resumen.efectivoEsperado;c.totales=c.resumen.totalesPorMetodo;
   }return cajas;
  });
 }
 async cajaDetalle(tenantId:string,userId:string,cajaId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const user=await authorizedActor(tx,tenantId,userId,['ADMIN','CAJERO','VENDEDOR']);
   const [c]=await query(tx,'SELECT c.*,u.nombre AS usuario_nombre FROM cajas c LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE c.id=$1 AND c.tenant_id=$2',cajaId,tenantId);
   if(!c||(user.rol!=='ADMIN'&&c.usuario_id!==userId))throw new NotFoundException('Caja no encontrada');
   const movimientos=await query(tx,'SELECT * FROM movimientos_caja WHERE caja_id=$1 ORDER BY created_at,id',c.id);
   return {...c,movimientos,resumen:this.resumenCaja(c,movimientos)};
  });
 }
 // Solo ADMIN: consulta de cierres de todos los cajeros de la empresa.
 async cierresCaja(tenantId:string,userId:string,filtros:{estado?:string;usuarioId?:string;desde?:string;hasta?:string}){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN']);
   const where=['c.tenant_id=$1'],args:any[]=[tenantId];
   if(filtros.estado){if(!['ABIERTA','CERRADA'].includes(filtros.estado))throw new BadRequestException('Estado de caja inválido');args.push(filtros.estado);where.push(`c.estado=$${args.length}::"EstadoCaja"`);}
   if(filtros.usuarioId){args.push(filtros.usuarioId);where.push(`c.usuario_id=$${args.length}`);}
   for(const [campo,operador] of [['desde','>='],['hasta','<']] as const){const valor=filtros[campo];if(!valor)continue;const fecha=new Date(valor);if(Number.isNaN(fecha.getTime()))throw new BadRequestException('Fecha de consulta inválida');args.push(fecha.toISOString());where.push(`c.fecha_apertura ${operador} $${args.length}::timestamptz`);}
   return query(tx,`SELECT c.id,c.codigo,c.usuario_id,u.nombre AS usuario_nombre,c.estado,c.fecha_apertura,c.fecha_cierre,c.monto_apertura,c.monto_cierre_fisico,c.monto_esperado,c.diferencia,c.notas,COALESCE((SELECT SUM(m.monto) FROM movimientos_caja m WHERE m.caja_id=c.id AND m.metodo='EFECTIVO'),0) AS efectivo_neto FROM cajas c LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE ${where.join(' AND ')} ORDER BY c.fecha_apertura DESC,c.id DESC LIMIT 100`,...args);
  });
 }
 async abrir(tenantId:string,userId:string,dto:AbrirCajaDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN','CAJERO','VENDEDOR']);
   const monto=decimal(dto.monto,'Apertura');
   const [prev]=await query(tx,'SELECT * FROM cajas WHERE id=$1 AND tenant_id=$2 AND usuario_id=$3',dto.solicitudId,tenantId,userId);
   if(prev){if(Number(prev.monto_apertura)!==monto)throw new ConflictException('Solicitud utilizada para otra apertura');return prev;}
   const [open]=await query(tx,'SELECT id FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado=\'ABIERTA\'',tenantId,userId);if(open)throw new ConflictException('Ya tiene una caja abierta');
   const [c]=await query(tx,'INSERT INTO cajas (id,tenant_id,codigo,usuario_id,monto_apertura) VALUES ($1,$2,$3,$4,$5) RETURNING *',dto.solicitudId,tenantId,`CAJA-${dto.solicitudId}`,userId,monto);await audit(tx,tenantId,userId,'CAJA_ABRIR',c.id,{monto});return c;
  });
 }
 async cerrar(tenantId:string,userId:string,cajaId:string,dto:CerrarCajaDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN','CAJERO','VENDEDOR']);
   const monto=decimal(dto.monto,'Efectivo contado');
   const notas=dto.notas?.trim()||null;
   const [c]=await query(tx,'SELECT * FROM cajas WHERE id=$1 AND tenant_id=$2 AND usuario_id=$3 FOR UPDATE',cajaId,tenantId,userId);if(!c)throw new NotFoundException('Caja no encontrada');
   // Repetir el mismo cierre responde igual; un segundo cierre distinto se rechaza sin tocar el resultado confirmado.
   if(c.estado==='CERRADA'){if(Number(c.monto_cierre_fisico)!==monto||(c.notas??null)!==notas)throw new ConflictException('La caja ya está cerrada');return c;}
   const movements=await query(tx,'SELECT * FROM movimientos_caja WHERE caja_id=$1',c.id);
   const esperado=this.resumenCaja(c,movements).efectivoEsperado;
   const diferencia=money(monto-esperado);
   if(diferencia!==0&&!notas)throw new BadRequestException('Explique la diferencia de caja antes de cerrar');
   const [closed]=await query(tx,'UPDATE cajas SET monto_cierre_fisico=$1,monto_esperado=$2,diferencia=$3,estado=\'CERRADA\',fecha_cierre=NOW(),notas=$4 WHERE id=$5 RETURNING *',monto,esperado,diferencia,notas,c.id);
   await audit(tx,tenantId,userId,'CAJA_CERRAR',c.id,{monto,esperado,diferencia,notas});
   return {...closed,resumen:this.resumenCaja(closed,movements)};
  });
 }
 // Entradas y salidas de efectivo: el cajero solo puede registrarlas con el permiso caja.movimientos_manuales; ADMIN siempre puede.
 async movimientoCaja(tenantId:string,userId:string,cajaId:string,dto:MovimientoCajaDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const user=await authorizedActor(tx,tenantId,userId,['ADMIN','CAJERO','VENDEDOR']);
   if(user.rol!=='ADMIN'&&!user.permisos?.includes('caja.movimientos_manuales'))throw new ForbiddenException('No tiene el permiso requerido para registrar entradas o salidas de caja');
   const monto=decimal(dto.monto,'Monto',true);
   const concepto=text(dto.concepto,'Concepto');
   const referencia=dto.referencia?.trim()||null;
   // Idempotencia: el identificador de solicitud es el identificador del movimiento.
   const signed=dto.tipo==='EGRESO_MANUAL'?-monto:monto;
   const [previo]=await query(tx,'SELECT m.*,c.tenant_id AS caja_tenant_id FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE m.id=$1',dto.solicitudId);
   if(previo){if(previo.caja_tenant_id!==tenantId||previo.caja_id!==cajaId||previo.tipo!==dto.tipo||Number(previo.monto)!==signed||previo.concepto!==concepto)throw new ConflictException('Solicitud utilizada para otro movimiento');return previo;}
   const [c]=await query(tx,'SELECT * FROM cajas WHERE id=$1 AND tenant_id=$2 AND usuario_id=$3 FOR UPDATE',cajaId,tenantId,userId);if(!c)throw new NotFoundException('Caja no encontrada');
   if(c.estado!=='ABIERTA')throw new ConflictException('La caja está cerrada');
   const movements=await query(tx,'SELECT * FROM movimientos_caja WHERE caja_id=$1',c.id);
   if(dto.tipo==='EGRESO_MANUAL'&&monto>this.resumenCaja(c,movements).efectivoEsperado)throw new ConflictException('Efectivo insuficiente para esta salida');
   const [movimiento]=await query(tx,'INSERT INTO movimientos_caja (id,caja_id,usuario_id,tipo,monto,metodo,referencia,concepto) VALUES ($1,$2,$3,$4::"TipoMovimientoCaja",$5,\'EFECTIVO\',$6,$7) RETURNING *',dto.solicitudId,c.id,userId,dto.tipo,signed,referencia,concepto);
   await audit(tx,tenantId,userId,'CAJA_MOVIMIENTO_MANUAL',movimiento.id,{cajaId:c.id,tipo:dto.tipo,monto,concepto,referencia,autorizacion:user.rol==='ADMIN'?'ROL_ADMIN':'PERMISO_CAJA'});
   return movimiento;
  });
 }
 async historial(tenantId:string,productoId:string){
  return {movimientos:await query(this.prisma,'SELECT m.*,u.nombre AS usuario_nombre FROM movimientos_inventario m JOIN usuarios u ON u.id=m.usuario_id WHERE m.tenant_id=$1 AND m.producto_id=$2 ORDER BY m.created_at DESC',tenantId,productoId),costos:await query(this.prisma,'SELECT c.*,p.nombre AS proveedor_nombre,o.numero_factura FROM costos_compra c JOIN proveedores p ON p.id=c.proveedor_id JOIN ordenes_compra o ON o.id=c.orden_id WHERE c.tenant_id=$1 AND c.producto_id=$2 ORDER BY c.fecha DESC',tenantId,productoId)};
 }
 async ajustar(tenantId:string,userId:string,productoId:string,dto:AjusteDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN','BODEGUERO'],'inventario.editar');
   const stock=decimal(dto.stock,'Stock'),motivo=text(dto.motivo,'Motivo'),hash=fingerprint({userId,productoId,dto});
   const [prev]=await query(tx,'SELECT datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion=\'STOCK_AJUSTAR\' AND entidad_id=$2',tenantId,dto.solicitudId);
   if(prev){if(prev.datos.hash!==hash)throw new ConflictException('Solicitud utilizada para otro ajuste');return prev.datos;}
   const [prod]=await query(tx,'SELECT * FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE',productoId,tenantId);if(!prod)throw new NotFoundException('Producto no encontrado');
   if(stock<Number(prod.stock_reservado))throw new ConflictException('El conteo no cubre las ventas pendientes de entrega');
   await query(tx,'UPDATE productos SET stock_actual=$1,updated_at=NOW() WHERE id=$2 RETURNING id',stock,prod.id);
   await movement(tx,tenantId,userId,prod.id,'AJUSTE',Number(prod.stock_actual),stock,dto.solicitudId,motivo);
   const result={hash,stock,anterior:Number(prod.stock_actual),motivo};await audit(tx,tenantId,userId,'STOCK_AJUSTAR',dto.solicitudId,result);return result;
  });
 }
 async entregar(tenantId:string,userId:string,ventaId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   await authorizedActor(tx,tenantId,userId,['ADMIN','CAJERO','BODEGUERO']);
   const [v]=await query(tx,'SELECT * FROM ventas WHERE id=$1 AND tenant_id=$2 AND estado=\'COMPLETADA\' FOR UPDATE',ventaId,tenantId);if(!v)throw new NotFoundException('Venta registrada no encontrada');
   if(v.entregado_at)return v;
   if(v.reserva_pendiente){
    const details=await query(tx,'SELECT d.*,COALESCE((SELECT SUM(dd.cantidad) FROM detalles_devolucion dd WHERE dd.detalle_venta_id=d.id),0) AS devuelto FROM detalles_venta d WHERE venta_id=$1 AND sin_inventario=false',v.id);
    for(const d of details){
     const [p]=await query(tx,'SELECT * FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE',d.producto_id,tenantId);
     const quantity=money(Number(d.cantidad)-Number(d.devuelto));if(quantity===0)continue;
     if(!p||Number(p.stock_actual)<quantity||Number(p.stock_reservado)<quantity)throw new ConflictException('Existencias reservadas inconsistentes; revise inventario');
     await query(tx,'UPDATE productos SET stock_actual=stock_actual-$1,stock_reservado=stock_reservado-$1,updated_at=NOW() WHERE id=$2 RETURNING id',quantity,p.id);
     await movement(tx,tenantId,userId,p.id,'ENTREGA',Number(p.stock_actual),money(Number(p.stock_actual)-quantity),v.id,'Entrega de venta registrada');
    }
   }
   const [delivered]=await query(tx,'UPDATE ventas SET reserva_pendiente=false,entregado_at=NOW(),entregado_por=$1 WHERE id=$2 RETURNING *',userId,v.id);await audit(tx,tenantId,userId,'VENTA_ENTREGAR',v.id,{fecha:delivered.entregado_at});return delivered;
  });
 }
 async entregas(tenantId:string){
  const ventas=await query(this.prisma,"SELECT v.*,COALESCE(c.nombre,v.cliente_nombre) AS cliente_nombre FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id WHERE v.tenant_id=$1 AND v.estado='COMPLETADA' AND v.entregado_at IS NULL ORDER BY v.created_at",tenantId);
  for(const v of ventas)v.items=await query(this.prisma,'SELECT d.*,p.nombre,d.cantidad-COALESCE((SELECT SUM(dd.cantidad) FROM detalles_devolucion dd WHERE dd.detalle_venta_id=d.id),0) AS cantidad FROM detalles_venta d JOIN productos p ON p.id=d.producto_id WHERE d.venta_id=$1 AND d.cantidad>COALESCE((SELECT SUM(dd.cantidad) FROM detalles_devolucion dd WHERE dd.detalle_venta_id=d.id),0)',v.id);
  return ventas.filter(v=>v.items.length>0);
 }
 async resumen(tenantId:string,desde:string,hasta:string,zona=ZONA_HORARIA_NEGOCIO,ahora=new Date()){
  if(![desde,hasta].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)||desde>hasta)throw new BadRequestException('Rango de fechas inválido');
  // created_at se guarda en UTC (TIMESTAMP sin zona): el día se calcula en la zona del negocio y se compara en UTC.
  const {inicio,fin}=rangoDiasEnZona(desde,hasta,zona);
  return {
   devoluciones:await query(this.prisma,"SELECT COUNT(*)::int AS cantidad,COALESCE(SUM(monto),0) AS monto FROM devoluciones WHERE tenant_id=$1 AND created_at>=($2::timestamptz AT TIME ZONE 'UTC') AND created_at<($3::timestamptz AT TIME ZONE 'UTC')",tenantId,inicio.toISOString(),fin.toISOString()),
   metodos:await query(this.prisma,'SELECT metodo_pago,COUNT(*)::int AS cantidad,SUM(total) AS total FROM ventas WHERE tenant_id=$1 AND estado=\'COMPLETADA\' AND created_at>=($2::timestamptz AT TIME ZONE \'UTC\') AND created_at<($3::timestamptz AT TIME ZONE \'UTC\') GROUP BY metodo_pago',tenantId,inicio.toISOString(),fin.toISOString()),
   rotacion:await query(this.prisma,'SELECT p.id,p.codigo,p.nombre,SUM(d.cantidad) AS cantidad FROM detalles_venta d JOIN ventas v ON v.id=d.venta_id JOIN productos p ON p.id=d.producto_id WHERE v.tenant_id=$1 AND v.estado=\'COMPLETADA\' AND d.sin_inventario=false AND v.created_at>=($2::timestamptz AT TIME ZONE \'UTC\') AND v.created_at<($3::timestamptz AT TIME ZONE \'UTC\') GROUP BY p.id ORDER BY cantidad DESC LIMIT 30',tenantId,inicio.toISOString(),fin.toISOString()),
   // Alerta de 7 días por fecha calendario en la zona del negocio (día de hoy + 7 inclusive), no por instante.
   alertas:await query(this.prisma,'SELECT tipo,COUNT(*)::int AS cantidad,SUM(saldo) AS saldo FROM cuentas_operativas WHERE tenant_id=$1 AND saldo>0 AND vencimiento::date <= $2::date GROUP BY tipo',tenantId,sumarDias(diaCalendario(ahora,zona),7)),
  };
 } async buscarVenta(tenantId:string,numero:string){
  const n=Number(numero);if(!Number.isSafeInteger(n)||n<1)throw new BadRequestException('Número de venta inválido');
  const [v]=await query(this.prisma,'SELECT * FROM ventas WHERE tenant_id=$1 AND numero_venta=$2',tenantId,n);if(!v)throw new NotFoundException('Venta no encontrada');
  v.items=await query(this.prisma,'SELECT d.*,p.nombre,p.codigo,COALESCE((SELECT SUM(dd.cantidad) FROM detalles_devolucion dd WHERE dd.detalle_venta_id=d.id),0) AS devuelto FROM detalles_venta d JOIN productos p ON p.id=d.producto_id WHERE d.venta_id=$1',v.id);
  v.devoluciones=await query(this.prisma,'SELECT * FROM devoluciones WHERE venta_id=$1 AND tenant_id=$2 ORDER BY created_at',v.id,tenantId);return v;
 }
 private async planDevolucion(tx:Tx,tenantId:string,ventaId:string,dto:DevolucionDto){
   const [v]=await query(tx,"SELECT * FROM ventas WHERE id=$1 AND tenant_id=$2 AND estado='COMPLETADA' FOR UPDATE",ventaId,tenantId);if(!v)throw new NotFoundException('Venta no encontrada');
   if(!dto.items?.length||new Set(dto.items.map(i=>i.detalleId)).size!==dto.items.length)throw new BadRequestException('Seleccione líneas distintas');
   const details=await query(tx,'SELECT d.*,COALESCE((SELECT SUM(dd.cantidad) FROM detalles_devolucion dd WHERE dd.detalle_venta_id=d.id),0) AS devuelto FROM detalles_venta d WHERE d.venta_id=$1',v.id);
   let gross=0,before=0,added=0;
   for(const d of details){gross+=Number(d.cantidad)*Number(d.precio_unitario);before+=Number(d.devuelto)*Number(d.precio_unitario);}
   for(const item of dto.items){
    const d=details.find(d=>d.id===item.detalleId),quantity=decimal(item.cantidad,'Cantidad',true);if(!d)throw new NotFoundException('Línea de venta no encontrada');
    if(quantity>money(Number(d.cantidad)-Number(d.devuelto)))throw new BadRequestException('Cantidad supera lo vendido pendiente de devolver');
    if(v.reserva_pendiente&&!d.sin_inventario&&item.destino!=='NO_ENTREGADO')throw new BadRequestException('La mercancía reservada debe cancelarse como no entregada');
    if(!v.reserva_pendiente&&!d.sin_inventario&&item.destino==='NO_ENTREGADO')throw new BadRequestException('La mercancía ya entregada requiere un destino físico');
    if(d.sin_inventario&&item.destino==='INVENTARIO')throw new BadRequestException('Mercancía sin inventario requiere recepción física separada');
    added+=quantity*Number(d.precio_unitario);
   }
   const [old]=await query(tx,'SELECT COALESCE(SUM(monto),0) AS monto FROM devoluciones WHERE venta_id=$1',v.id);
   const monto=money(Math.max(0,(gross>0?money(Number(v.total)*(before+added)/gross):0)-Number(old.monto)));
   return {v,details,monto};
 }
 async devolver(tenantId:string,userId:string,ventaId:string,dto:DevolucionDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const user=await actor(tx,tenantId,userId);
   if(user.rol!=='ADMIN')throw new ForbiddenException('Solo un administrador puede registrar una devolución directa');
   const [request]=await query(tx,'SELECT id FROM solicitudes_devolucion WHERE id=$1',dto.solicitudId);
   if(request)throw new ConflictException('Este identificador pertenece a una solicitud; ejecútela desde su autorización');
   return this.ejecutarDevolucion(tx,tenantId,userId,ventaId,dto);
  },{timeout:60000});
 }
 async solicitarDevolucion(tenantId:string,userId:string,ventaId:string,dto:DevolucionDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const user=await actor(tx,tenantId,userId);
   if(!['ADMIN','CAJERO','VENDEDOR'].includes(user.rol))throw new ForbiddenException('No puede solicitar devoluciones');
   const hash=fingerprint({userId,ventaId,dto});
   const [previous]=await query(tx,'SELECT * FROM solicitudes_devolucion WHERE id=$1',dto.solicitudId);
   if(previous){if(previous.tenant_id!==tenantId||previous.solicitante_id!==userId||previous.solicitud_hash!==hash)throw new ConflictException('Solicitud utilizada para otra devolución');return previous;}
   const [used]=await query(tx,'SELECT id FROM devoluciones WHERE id=$1',dto.solicitudId);
   if(used)throw new ConflictException('Identificador ya utilizado');
   const {monto}=await this.planDevolucion(tx,tenantId,ventaId,dto);
   text(dto.motivo,'Motivo');paymentMethod(dto.metodo);
   const [result]=await query(tx,'INSERT INTO solicitudes_devolucion(id,tenant_id,venta_id,solicitante_id,solicitud_hash,comando,monto_estimado) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *',dto.solicitudId,tenantId,ventaId,userId,hash,JSON.stringify(dto),monto);
   await audit(tx,tenantId,userId,'DEVOLUCION_SOLICITAR',result.id,{ventaId,items:dto.items,motivo:dto.motivo});return result;
  },{timeout:60000});
 }
 async solicitudesDevolucion(tenantId:string,userId:string,page=0){
  const user=await actor(this.prisma,tenantId,userId);
  if(!['ADMIN','CAJERO','VENDEDOR'].includes(user.rol))throw new ForbiddenException('No puede consultar solicitudes');
  return query(this.prisma,`SELECT s.*,v.numero_venta,v.total AS total_venta,v.metodo_pago,
    (SELECT jsonb_agg(jsonb_build_object('nombre',p.nombre,'codigo',p.codigo,'cantidad',i.value->>'cantidad','destino',i.value->>'destino'))
      FROM jsonb_array_elements(s.comando->'items') i JOIN detalles_venta d ON d.id=i.value->>'detalleId' AND d.venta_id=s.venta_id JOIN productos p ON p.id=d.producto_id) AS items,
    u.nombre AS solicitante_nombre,a.nombre AS administrador_nombre
    FROM solicitudes_devolucion s JOIN ventas v ON v.id=s.venta_id AND v.tenant_id=s.tenant_id
    JOIN usuarios u ON u.id=s.solicitante_id LEFT JOIN usuarios a ON a.id=s.administrador_id
    WHERE s.tenant_id=$1 AND ($2::boolean OR s.solicitante_id=$3)
    ORDER BY (s.estado='PENDIENTE') DESC,s.created_at DESC,s.id DESC LIMIT 50 OFFSET $4`,tenantId,user.rol==='ADMIN',userId,Math.max(0,Math.floor(Number.isFinite(page)?page:0))*50);
 }
 async consultarDevolucionDirecta(tenantId:string,userId:string,requestId:string){
  await actor(this.prisma,tenantId,userId);
  const [result]=await query(this.prisma,'SELECT * FROM devoluciones WHERE id=$1 AND tenant_id=$2 AND usuario_id=$3',requestId,tenantId,userId);
  if(!result)throw new NotFoundException('Devolución no encontrada');return result;
 }
 async consultarDevolucion(tenantId:string,userId:string,requestId:string){
  const user=await actor(this.prisma,tenantId,userId);
  const [request]=await query(this.prisma,'SELECT * FROM solicitudes_devolucion WHERE id=$1 AND tenant_id=$2',requestId,tenantId);
  if(!request||(user.rol!=='ADMIN'&&request.solicitante_id!==userId))throw new NotFoundException('Solicitud no encontrada');
  const [result]=await query(this.prisma,'SELECT * FROM devoluciones WHERE id=$1 AND tenant_id=$2',requestId,tenantId);
  return {...request,resultado:result||null};
 }
 async decidirDevolucion(tenantId:string,userId:string,requestId:string,dto:DecisionDevolucionDto){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const user=await actor(tx,tenantId,userId);
   if(user.rol!=='ADMIN')throw new ForbiddenException('La autorización requiere administrador');
   const motivo=text(dto.motivo,'Motivo de la decisión');
   if(!['AUTORIZADA','RECHAZADA'].includes(dto.decision))throw new BadRequestException('Decisión inválida');
   const [request]=await query(tx,'SELECT * FROM solicitudes_devolucion WHERE id=$1 AND tenant_id=$2 FOR UPDATE',requestId,tenantId);
   if(!request)throw new NotFoundException('Solicitud no encontrada');
   if(request.estado!=='PENDIENTE'){
    if(request.administrador_id===userId&&request.motivo_decision===motivo&&(request.estado===dto.decision||(request.estado==='EJECUTADA'&&dto.decision==='AUTORIZADA')))return request;
    throw new ConflictException('La solicitud ya tiene una decisión');
   }
   if(dto.decision==='AUTORIZADA')await this.planDevolucion(tx,tenantId,request.venta_id,request.comando);
   const [result]=await query(tx,'UPDATE solicitudes_devolucion SET estado=$1,administrador_id=$2,motivo_decision=$3,decidida_at=NOW() WHERE id=$4 RETURNING *',dto.decision,userId,motivo,requestId);
   await audit(tx,tenantId,userId,'DEVOLUCION_DECIDIR',requestId,{decision:dto.decision,motivo,solicitanteId:request.solicitante_id});return result;
  },{timeout:60000});
 }
 async ejecutarAutorizada(tenantId:string,userId:string,requestId:string){
  return this.prisma.$transaction(async tx=>{
   await lockTenant(tx,tenantId);
   const executor=await actor(tx,tenantId,userId);
   if(!['ADMIN','CAJERO','VENDEDOR'].includes(executor.rol))throw new ForbiddenException('No puede ejecutar devoluciones');
   const [request]=await query(tx,'SELECT * FROM solicitudes_devolucion WHERE id=$1 AND tenant_id=$2 AND solicitante_id=$3 FOR UPDATE',requestId,tenantId,userId);
   if(!request)throw new NotFoundException('Solicitud no encontrada');
   if(!['AUTORIZADA','EJECUTADA'].includes(request.estado))throw new ForbiddenException('La solicitud debe estar autorizada antes de ejecutar');
   if(request.estado!=='EJECUTADA'){
    const admin=await actor(tx,tenantId,request.administrador_id);
    if(admin.rol!=='ADMIN')throw new ForbiddenException('El autorizador ya no es administrador');
   }
   const result=await this.ejecutarDevolucion(tx,tenantId,userId,request.venta_id,request.comando);
   if(request.estado!=='EJECUTADA'){
    await query(tx,"UPDATE solicitudes_devolucion SET estado='EJECUTADA' WHERE id=$1 RETURNING id",requestId);
    await audit(tx,tenantId,userId,'DEVOLUCION_EJECUTAR_AUTORIZADA',requestId,{administradorId:request.administrador_id,ventaId:request.venta_id});
   }
   return result;
  },{timeout:60000});
 }
 private async ejecutarDevolucion(tx:Tx,tenantId:string,userId:string,ventaId:string,dto:DevolucionDto){
   const hash=fingerprint({userId,ventaId,dto});
   const [previous]=await query(tx,'SELECT * FROM devoluciones WHERE id=$1',dto.solicitudId);
   if(previous){if(previous.tenant_id!==tenantId||previous.solicitud_hash!==hash)throw new ConflictException('Solicitud utilizada para otra devolución');return previous;}
   const {v,details,monto}=await this.planDevolucion(tx,tenantId,ventaId,dto);
   let credito=0;
   if(v.metodo_pago==='CREDITO'){
    const [c]=await query(tx,"SELECT * FROM cuentas_operativas WHERE tenant_id=$1 AND tipo='CXC' AND documento_id=$2 FOR UPDATE",tenantId,v.id);
    if(!c)throw new ConflictException('Concilie la cuenta histórica antes de devolver una venta a crédito');
    // Regla vigente (CONTEXTO_MAESTRO, devoluciones): primero se cancela el crédito pendiente; el excedente pagado es reembolso.
    credito=Math.min(monto,Number(c.saldo));await query(tx,'UPDATE cuentas_operativas SET saldo=saldo-$1 WHERE id=$2 RETURNING id',credito,c.id);
    if(credito>0){
     // La deuda del cliente y de la venta se cancelan junto con la CxC para no dejar deuda ficticia.
     if(!c.cliente_id)throw new ConflictException('La cuenta por cobrar no tiene cliente asociado');
     const [cliente]=await query(tx,'UPDATE clientes SET saldo_pendiente=saldo_pendiente-$1 WHERE id=$2 AND tenant_id=$3 AND saldo_pendiente>=$1 RETURNING id',credito,c.cliente_id,tenantId);
     if(!cliente)throw new ConflictException('El saldo del cliente no coincide con la cuenta por cobrar');
     await query(tx,"UPDATE ventas SET saldo_credito=GREATEST(COALESCE(saldo_credito,total)-$1,0) WHERE id=$2 AND tenant_id=$3 AND tipo_pago='CREDITO' RETURNING id",credito,v.id,tenantId);
    }
   }
   const refund=money(monto-credito),metodo=paymentMethod(dto.metodo);let caja:any=null;
   if(refund>0){caja=await openCash(tx,tenantId,userId);if(metodo==='EFECTIVO'){
    const [cash]=await query(tx,"SELECT COALESCE(SUM(monto),0) AS monto FROM movimientos_caja WHERE caja_id=$1 AND metodo='EFECTIVO'",caja.id);
    if(refund>money(Number(caja.monto_apertura)+Number(cash.monto)))throw new ConflictException('Efectivo insuficiente para reembolsar');
   }}
   const [result]=await query(tx,'INSERT INTO devoluciones(id,tenant_id,venta_id,usuario_id,solicitud_hash,motivo,monto,credito_cancelado,reembolso,metodo,caja_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',dto.solicitudId,tenantId,v.id,userId,hash,text(dto.motivo,'Motivo'),monto,credito,refund,metodo,caja?.id||null);
   for(const item of dto.items){
    const d=details.find(d=>d.id===item.detalleId);
    await query(tx,'INSERT INTO detalles_devolucion(id,devolucion_id,detalle_venta_id,cantidad,destino) VALUES($1,$2,$3,$4,$5) RETURNING id',id(),result.id,d.id,item.cantidad,item.destino);
    if(!d.sin_inventario){
     const [p]=await query(tx,'SELECT * FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE',d.producto_id,tenantId);
     if(v.reserva_pendiente)await query(tx,'UPDATE productos SET stock_reservado=stock_reservado-$1,updated_at=NOW() WHERE id=$2 RETURNING id',item.cantidad,p.id);
     else if(item.destino==='INVENTARIO'){
      await query(tx,'UPDATE productos SET stock_actual=stock_actual+$1,updated_at=NOW() WHERE id=$2 RETURNING id',item.cantidad,p.id);
      await movement(tx,tenantId,userId,p.id,'DEVOLUCION',Number(p.stock_actual),money(Number(p.stock_actual)+item.cantidad),result.id,dto.motivo);
     }
    }
   }
   if(caja)await cashMovement(tx,caja.id,userId,'DEVOLUCION',-refund,metodo,result.id,`Devolución de venta ${v.numero_venta}`);
   await audit(tx,tenantId,userId,'VENTA_DEVOLVER',result.id,{ventaId,monto,credito,refund,metodo,items:dto.items});return result;
 }

 async auditoria(tenantId:string,page:number){return query(this.prisma,'SELECT a.*,u.nombre AS usuario_nombre FROM auditoria_operaciones a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.tenant_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100 OFFSET $2',tenantId,Math.max(0,Math.floor(Number.isFinite(page)?page:0))*100);}

}
