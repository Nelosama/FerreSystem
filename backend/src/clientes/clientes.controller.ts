import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { Rol } from '../types/prisma-enums';
import { ClientesService } from './clientes.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { UpdateCreditoClienteDto } from './dto/cliente.dto';
import { CreateAbonoClienteDto } from './dto/abono.dto';

@Controller('clientes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  async findAll(@TenantId() tenantId: string, @Query('search') search?: string, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit);
    const take = limit && Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : undefined;
    return this.clientesService.findAll(tenantId, search, take);
  }

  @Get('buscar')
  @Roles(Rol.ADMIN, Rol.CAJERO)
  search(@TenantId() tenantId: string, @Query('q') query: string) {
    return this.clientesService.search(tenantId, query);
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
  async updateLegacy(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(tenantId, id, dto);
  }

  @Patch(':id')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(tenantId, id, dto);
  }

  @Patch(':id/credito')
  async updateCredit(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateCreditoClienteDto) {
    return this.clientesService.updateCredit(tenantId, id, dto);
  }

  @Post(':id/abonos')
  async addPayment(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: CreateAbonoClienteDto) {
    return this.clientesService.addPayment(tenantId, id, dto);
  }

  @Delete(':id')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.clientesService.delete(tenantId, id);
  }
}

