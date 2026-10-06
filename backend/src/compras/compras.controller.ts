import { RequiredModule } from '../common/decorators/required-module.decorator';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateCompraDto, CreatePagoProveedorDto } from './dto/compra.dto';
import { ComprasService } from './compras.service';

@Controller()
@RequiredModule('ordenes_compra')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class ComprasController {
  constructor(private readonly service: ComprasService) {}

  @RequiredModule('ordenes_compra', 'inventario')
  @Post('compras') create(@TenantId() tenantId: string, @Body() dto: CreateCompraDto) { return this.service.create(tenantId, dto); }
  @Get('compras') findAll(@TenantId() tenantId: string) { return this.service.findAll(tenantId); }
  @Get('compras/:id') findById(@TenantId() tenantId: string, @Param('id') id: string) { return this.service.findById(tenantId, id); }
  @Post('compras/:id/pagos') addPayment(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: CreatePagoProveedorDto) { return this.service.addPayment(tenantId, id, dto); }
  @Get('productos/:id/historial-compras') productHistory(@TenantId() tenantId: string, @Param('id') id: string) { return this.service.productHistory(tenantId, id); }
}
