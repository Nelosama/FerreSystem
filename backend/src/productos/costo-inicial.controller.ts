import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CostoInicialService } from './costo-inicial.service';
import { InicializarCostoDto } from './dto/inicializar-costo.dto';

@Controller('productos')
@RequiredModule('inventario')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CostoInicialController {
  constructor(private readonly costos: CostoInicialService) {}

  @Post(':id/costo-inicial')
  @RequiredPermission('inventario.editar')
  @Roles('ADMIN')
  inicializar(@TenantId() tenantId: string, @Param('id') id: string,
    @Body() dto: InicializarCostoDto, @CurrentUser('sub') userId: string) {
    return this.costos.inicializar(tenantId, id, dto, userId);
  }
}
