import { RequiredModule } from '../common/decorators/required-module.decorator';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor.dto';
import { ProveedoresService } from './proveedores.service';

@Controller('proveedores')
@RequiredModule('ordenes_compra')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class ProveedoresController {
  constructor(private readonly service: ProveedoresService) {}

  @Post() create(@TenantId() tenantId: string, @Body() dto: CreateProveedorDto) { return this.service.create(tenantId, dto); }
  @Get() findAll(@TenantId() tenantId: string) { return this.service.findAll(tenantId); }
  @Get(':id') findById(@TenantId() tenantId: string, @Param('id') id: string) { return this.service.findById(tenantId, id); }
  @Patch(':id') update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateProveedorDto) { return this.service.update(tenantId, id, dto); }
  @Delete(':id') deactivate(@TenantId() tenantId: string, @Param('id') id: string) { return this.service.deactivate(tenantId, id); }
}
