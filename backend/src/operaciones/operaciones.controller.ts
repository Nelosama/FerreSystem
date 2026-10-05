import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OperacionesService } from './operaciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AbrirCajaDto, AjusteDto, CerrarCajaDto, CompraDto, DevolucionDto, PagoDto, ProveedorDto, RecepcionDto } from './operaciones.dto';
@Controller('operaciones')
@UseGuards(JwtAuthGuard,TenantGuard,RolesGuard)
@Roles('ADMIN','CAJERO','BODEGUERO','VENDEDOR')
export class OperacionesController {
 constructor(private readonly service:OperacionesService){}
 @Get('proveedores') proveedores(@TenantId() t:string){return this.service.proveedores(t);}
 @Post('proveedores') @Roles('ADMIN') proveedor(@TenantId() t:string,@CurrentUser('sub') u:string,@Body() dto:ProveedorDto){return this.service.proveedor(t,u,dto);}
 @Get('compras') @RequiredPermission('inventario.ver') @Roles('ADMIN','BODEGUERO') compras(@TenantId() t:string){return this.service.compras(t);}
 @Post('compras') @RequiredPermission('inventario.editar') @Roles('ADMIN','BODEGUERO') compra(@TenantId() t:string,@CurrentUser('sub') u:string,@Body() dto:CompraDto){return this.service.compra(t,u,dto);}
 @Post('compras/:id/recepciones') @RequiredPermission('inventario.editar') @Roles('ADMIN','BODEGUERO') recibir(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:RecepcionDto){return this.service.recibir(t,u,id,dto);}
 @Get('cuentas') @Roles('ADMIN','CAJERO') cuentas(@TenantId() t:string,@CurrentUser('sub') u:string,@Query('tipo') tipo:string){return this.service.cuentas(t,u,tipo);}
 @Post('cuentas/:id/pagos') @Roles('ADMIN','CAJERO') pagar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:PagoDto){return this.service.pagar(t,u,id,dto);}
 @Get('caja') @Roles('ADMIN','CAJERO','VENDEDOR') caja(@TenantId() t:string,@CurrentUser('sub') u:string){return this.service.caja(t,u);}
 @Post('caja/abrir') @Roles('ADMIN','CAJERO','VENDEDOR') abrir(@TenantId() t:string,@CurrentUser('sub') u:string,@Body() dto:AbrirCajaDto){return this.service.abrir(t,u,dto);}
 @Post('caja/:id/cerrar') @Roles('ADMIN','CAJERO','VENDEDOR') cerrar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:CerrarCajaDto){return this.service.cerrar(t,u,id,dto);}
 @Get('productos/:id/historial') @RequiredPermission('inventario.ver') @Roles('ADMIN','BODEGUERO') historial(@TenantId() t:string,@Param('id') id:string){return this.service.historial(t,id);}
 @Post('productos/:id/ajuste') @RequiredPermission('inventario.editar') @Roles('ADMIN','BODEGUERO') ajustar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:AjusteDto){return this.service.ajustar(t,u,id,dto);}
 @Post('ventas/:id/entregar') @Roles('ADMIN','CAJERO','BODEGUERO') entregar(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string){return this.service.entregar(t,u,id);}
 @Get('entregas') @Roles('ADMIN','CAJERO','BODEGUERO') entregas(@TenantId() t:string){return this.service.entregas(t);}
 @Get('resumen') @RequiredPermission('reportes.ver') @Roles('ADMIN') resumen(@TenantId() t:string,@Query('desde') desde:string,@Query('hasta') hasta:string){return this.service.resumen(t,desde,hasta);}
 @Get('ventas/buscar') @Roles('ADMIN') buscarVenta(@TenantId() t:string,@Query('numero') n:string){return this.service.buscarVenta(t,n);}
 @Post('ventas/:id/devoluciones') @Roles('ADMIN') devolver(@TenantId() t:string,@CurrentUser('sub') u:string,@Param('id') id:string,@Body() dto:DevolucionDto){return this.service.devolver(t,u,id,dto);}
 @Get('auditoria') @Roles('ADMIN') auditoria(@TenantId() t:string,@Query('page') p:string){return this.service.auditoria(t,Number(p));}

}
