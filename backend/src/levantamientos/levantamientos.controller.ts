import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { LevantamientosService } from './levantamientos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { CreateLevantamientoDto, UpdateLevantamientoDto } from './dto/create-levantamiento.dto';
import { CreateLevantamientoItemDto, UpdateLevantamientoItemDto } from './dto/create-levantamiento-item.dto';

@Controller('levantamientos')
@RequiredModule('levantamiento')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class LevantamientosController {
  constructor(private readonly levantamientosService: LevantamientosService) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return this.levantamientosService.findAll(tenantId);
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.levantamientosService.findOne(tenantId, id);
  }

  @Post()
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateLevantamientoDto,
  ) {
    return this.levantamientosService.create(tenantId, userId, dto);
  }

  @Patch(':id')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLevantamientoDto,
  ) {
    return this.levantamientosService.update(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.levantamientosService.remove(tenantId, id);
  }

  // --- ITEMS ---

  @Get(':id/items')
  async findItems(
    @TenantId() tenantId: string,
    @Param('id') levantamientoId: string,
  ) {
    return this.levantamientosService.findItems(tenantId, levantamientoId);
  }

  @Post(':id/items')
  async createItem(
    @TenantId() tenantId: string,
    @Param('id') levantamientoId: string,
    @Body() dto: CreateLevantamientoItemDto,
  ) {
    return this.levantamientosService.createItem(tenantId, levantamientoId, dto);
  }

  @Patch(':id/items/:itemId')
  async updateItem(
    @TenantId() tenantId: string,
    @Param('id') levantamientoId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateLevantamientoItemDto,
  ) {
    return this.levantamientosService.updateItem(tenantId, levantamientoId, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  async removeItem(
    @TenantId() tenantId: string,
    @Param('id') levantamientoId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.levantamientosService.removeItem(tenantId, levantamientoId, itemId);
  }
}
