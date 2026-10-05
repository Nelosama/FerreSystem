import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('clientes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  async findAll(@TenantId() tenantId: string, @Query('search') search?: string, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit);
    const take = limit && Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : undefined;
    return this.clientesService.findAll(tenantId, search, take);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.clientesService.findById(tenantId, id);
  }

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateClienteDto,
  ) {
    return this.clientesService.create(tenantId, dto);
  }

  @Put(':id')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clientesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.clientesService.delete(tenantId, id);
  }
}

