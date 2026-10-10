import { RequiredAnyModule, RequiredModule } from '../common/decorators/required-module.decorator';
import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { OperacionesService } from './operaciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SinCostosParaBodeguero } from '../common/interceptors/sin-costos-bodeguero.interceptor';
import { AbrirCajaDto, AjusteDto, CerrarCajaDto, CompraDto, ConciliacionBancariaDto, DevolucionDto, MovimientoCajaDto, PagoDto, ProveedorDto, ProductoProveedorDto, RecepcionDto, DecisionDevolucionDto } from './operaciones.dto';
@Controller('operaciones')
@UseGuards(JwtAuthGuard,TenantGuard,RolesGuard)
@Roles('ADMIN','CAJERO','BODEGUERO','VENDEDOR')
export class OperacionesController {
 constructor(private readonly service:OperacionesService){}
 @RequiredAnyModule('ordenes_compra', 'pos')
 @Get('proveedores') proveedores(@TenantId() t:string){return this.service.proveedores(t);}
 @RequiredModule('ordenes_compra')
 @Post('proveedores') @Roles('ADMIN') proveedor(@TenantId() t:string,@CurrentUser('sub') u:string,@Body() dto:ProveedorDto){return this.service.proveedor(t,u,dto);}
 @RequiredModule('ordenes_compra')
 @Get('compras') @UseInterceptors(SinCostosParaBodeguero(['subtotal','isv','total'])) @RequiredPermission('inventario.ver') @Roles('ADMIN','BODEGUERO') compras(@TenantId() t:string){return this.service.compras(t);}
 @RequiredModule('ordenes_compra')
 @Post('compras') @UseInterceptors(SinCostosParaBodeguero(['subtotal','isv','total'])) @RequiredPermission('inventario.editar') @Roles('ADMIN') compra(@TenantId() t:string,@CurrentUser('sub') u:string,@Body() dto:CompraDto){return this.service.compra(t,u,dto);}
 @RequiredModule('ordenes_compra', 'inventario')
 @Post('compras/:id/recepciones') @RequiredPermission('inventario.editar') @Roles('ADMIN','BODEGUERO') recibir(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:RecepcionDto){return this.service.recibir(t,u,id,dto);}
 @Get('cuentas') @Roles('ADMIN','CAJERO') cuentas(@TenantId() t:string,@CurrentUser('sub') u:string,@Query('tipo') tipo:string,@Query('clienteId') clienteId?:string,@Query('proveedorId') proveedorId?:string,@Query('estado') estado?:string,@Query('desde') desde?:string,@Query('hasta') hasta?:string){return this.service.cuentas(t,u,tipo,undefined,{clienteId,proveedorId,estado,desde,hasta});}
 @Post('cuentas/:id/pagos') @Roles('ADMIN','CAJERO') pagar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:PagoDto){return this.service.pagar(t,u,id,dto);}
 @Get('caja') @Roles('ADMIN','CAJERO','VENDEDOR') caja(@TenantId() t:string,@CurrentUser('sub') u:string){return this.service.caja(t,u);}
 @Get('caja/cierres') @Roles('ADMIN') cierresCaja(@TenantId() t:string,@CurrentUser('sub') u:string,@Query('estado') estado?:string,@Query('usuarioId') usuarioId?:string,@Query('desde') desde?:string,@Query('hasta') hasta?:string){return this.service.cierresCaja(t,u,{estado,usuarioId,desde,hasta});}
 @Get('caja/:id') @Roles('ADMIN','CAJERO','VENDEDOR') cajaDetalle(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.cajaDetalle(t,u,id);}
 @Post('caja/:id/movimientos') @Roles('ADMIN','CAJERO','VENDEDOR') movimientoCaja(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:MovimientoCajaDto){return this.service.movimientoCaja(t,u,id,dto);}
 @Post('caja/abrir') @Roles('ADMIN','CAJERO','VENDEDOR') abrir(@TenantId() t:string,@CurrentUser('sub') u:string,@Body() dto:AbrirCajaDto){return this.service.abrir(t,u,dto);}
 @Post('caja/:id/cerrar') @Roles('ADMIN','CAJERO','VENDEDOR') cerrar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:CerrarCajaDto){return this.service.cerrar(t,u,id,dto);}
 @RequiredModule('inventario')
 @Post('conciliaciones-bancarias') @Roles('ADMIN') registrarConciliacionBancaria(@TenantId() t:string,@CurrentUser('sub') u:string,@Body() dto:ConciliacionBancariaDto){return this.service.registrarConciliacionBancaria(t,u,dto);}
 @Get('conciliaciones-bancarias') @Roles('ADMIN') conciliacionesBancarias(@TenantId() t:string,@CurrentUser('sub') u:string,@Query('fecha') fecha?:string){return this.service.conciliacionesBancarias(t,u,fecha);}
 @Get('clientes/:id/estado-cuenta') @Roles('ADMIN','CAJERO') estadoCuentaCliente(@TenantId() t:string,@CurrentUser('rol') rol:string,@Param('id') id:string){return this.service.estadoCuentaCliente(t,id,rol);}
 @Get('productos/:id/proveedores') @UseInterceptors(SinCostosParaBodeguero()) @RequiredPermission('inventario.ver') @Roles('ADMIN','BODEGUERO') proveedoresProducto(@TenantId() t:string,@Param('id') id:string){return this.service.proveedoresProducto(t,id);}
 @RequiredModule('inventario')
 @Put('productos/:id/proveedores/:proveedorId') @RequiredPermission('inventario.editar') @Roles('ADMIN','BODEGUERO') guardarProveedorProducto(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Param('proveedorId') proveedorId:string,@Body() dto:ProductoProveedorDto){return this.service.guardarProveedorProducto(t,u,id,proveedorId,dto);}
 @RequiredModule('inventario')
 @Delete('productos/:id/proveedores/:proveedorId') @RequiredPermission('inventario.editar') @Roles('ADMIN','BODEGUERO') eliminarProveedorProducto(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Param('proveedorId') proveedorId:string){return this.service.eliminarProveedorProducto(t,u,id,proveedorId);}
 @RequiredModule('inventario')
 @Get('productos/:id/historial') @UseInterceptors(SinCostosParaBodeguero()) @RequiredPermission('inventario.ver') @Roles('ADMIN','BODEGUERO') historial(@TenantId() t:string,@Param('id') id:string){return this.service.historial(t,id);}
 @RequiredModule('inventario')
 @Post('productos/:id/ajuste') @RequiredPermission('inventario.editar') @Roles('ADMIN','BODEGUERO') ajustar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:AjusteDto){return this.service.ajustar(t,u,id,dto);}
 @RequiredModule('pos')
 @Post('ventas/:id/entregar') @Roles('ADMIN','BODEGUERO') entregar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.entregar(t,u,id);}
 @RequiredModule('pos')
 @Get('entregas') @UseInterceptors(SinCostosParaBodeguero()) @Roles('ADMIN','CAJERO','BODEGUERO') entregas(@TenantId() t:string,@CurrentUser('sub') u:string){return this.service.entregas(t,u);}
 @RequiredModule('reportes')
 @Get('resumen') @RequiredPermission('reportes.ver') @Roles('ADMIN') resumen(@TenantId() t:string,@Query('desde') desde:string,@Query('hasta') hasta:string){return this.service.resumen(t,desde,hasta);}
 @RequiredModule('pos')
 @Get('ventas/buscar') @Roles('ADMIN','CAJERO','VENDEDOR') buscarVenta(@TenantId() t:string,@CurrentUser('rol') rol:string,@Query('numero') n:string){return this.service.buscarVenta(t,n,rol);}
 @RequiredModule('pos')
 @Post('ventas/:id/devoluciones') @Roles('ADMIN') devolver(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:DevolucionDto){return this.service.devolver(t,u,id,dto);}
 @RequiredModule('pos')
 @Post('ventas/:id/solicitudes-devolucion') @Roles('ADMIN','CAJERO','VENDEDOR') solicitarDevolucion(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:DevolucionDto){return this.service.solicitarDevolucion(t,u,id,dto);}
 @RequiredModule('pos')
 @Get('solicitudes-devolucion') @Roles('ADMIN','CAJERO','VENDEDOR') solicitudesDevolucion(@TenantId() t:string,@CurrentUser('sub') u:string,@Query('page') page:string){return this.service.solicitudesDevolucion(t,u,Number(page));}
 @RequiredModule('pos')
 @Get('solicitudes-devolucion/:id') @Roles('ADMIN','CAJERO','VENDEDOR') consultarDevolucion(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.consultarDevolucion(t,u,id);}
 @RequiredModule('pos')
 @Post('solicitudes-devolucion/:id/decision') @Roles('ADMIN') decidirDevolucion(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:DecisionDevolucionDto){return this.service.decidirDevolucion(t,u,id,dto);}
 @RequiredModule('pos')
 @Post('solicitudes-devolucion/:id/ejecutar') @Roles('ADMIN','CAJERO','VENDEDOR') ejecutarAutorizada(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.ejecutarAutorizada(t,u,id);}
 @RequiredModule('pos')
 @Get('devoluciones/:id') @Roles('ADMIN','CAJERO','VENDEDOR') consultarDevolucionDirecta(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.consultarDevolucionDirecta(t,u,id);}
 @Get('auditoria') @Roles('ADMIN') auditoria(@TenantId() t:string,@Query('page') p:string){return this.service.auditoria(t,Number(p));}

}
