import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EntregasService } from './entregas.service';
import { EntregarLineasDto, LiberarLineasDto, PrepararLineasDto } from './dto/entregas.dto';

@Controller('entregas')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR')
export class EntregasController {
  constructor(private readonly service: EntregasService) {}

  @RequiredModule('pos')
  @Get('pendientes') pendientes(@TenantId() t: string, @CurrentUser('sub') u: string) { return this.service.pendientes(t, u); }

  @RequiredModule('pos')
  @Get('ventas/:id') detalle(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string) { return this.service.detalle(t, u, id); }

  @RequiredModule('pos')
  @Post('ventas/:id/entregas') @Roles('ADMIN', 'BODEGUERO')
  entregar(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: EntregarLineasDto) { return this.service.entregar(t, u, id, dto); }

  @RequiredModule('pos')
  @Post('ventas/:id/preparacion') @Roles('ADMIN', 'BODEGUERO')
  preparar(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: PrepararLineasDto) { return this.service.preparar(t, u, id, dto); }

  @RequiredModule('pos')
  @Post('ventas/:id/liberaciones') @Roles('ADMIN')
  liberar(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: LiberarLineasDto) { return this.service.liberar(t, u, id, dto); }
}
