import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

@Controller('usuarios')
@RequiredPermission('usuarios.gestionar')
@RequiredModule('usuarios')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return this.usuariosService.findAll(tenantId);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.usuariosService.findById(tenantId, id);
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateUsuarioDto,
    @CurrentUser('sub') actorId:string,
  ) {
    return this.usuariosService.create(tenantId, dto,actorId);
  }

  @Put(':id')
  @Roles('ADMIN')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser('sub') actorId:string,
  ) {
    return this.usuariosService.update(tenantId, id, dto,actorId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(@TenantId() tenantId: string, @Param('id') id: string,@CurrentUser('sub') actorId:string) {
    return this.usuariosService.remove(tenantId, id,actorId);
  }
}

