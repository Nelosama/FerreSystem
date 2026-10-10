import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Query, UseInterceptors } from '@nestjs/common';
import { LevantamientoResponseInterceptor } from './levantamiento-response.interceptor';
import { Roles } from '../common/decorators/roles.decorator';
import { AplicarLevantamientoDto, ConciliarItemDto, HeartbeatDto } from './dto/create-levantamiento-item.dto';
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
@UseInterceptors(LevantamientoResponseInterceptor)
@RequiredPermission('inventario.editar')
@RequiredModule('levantamiento')
@Roles('ADMIN','BODEGUERO')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class LevantamientosController {
  constructor(private readonly levantamientosService: LevantamientosService) {}

  // ─── LEVANTAMIENTO ───────────────────────────────────────────────────────

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
    @CurrentUser('sub') userId:string,
  ) {
    return this.levantamientosService.update(tenantId, id, dto, userId);
  }

  @Delete(':id')
  async remove(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser('sub') userId:string) {
    return this.levantamientosService.remove(tenantId, id, userId);
  }

  @Get(':id/preview')
  preview(@TenantId() tenantId:string, @Param('id') id:string) {
    return this.levantamientosService.previsualizar(tenantId, id);
  }

  @Post(':id/aplicar')
  @Roles('ADMIN')
  aplicar(
    @TenantId() tenantId:string,
    @CurrentUser('sub') userId:string,
    @Param('id') id:string,
    @Body() dto:AplicarLevantamientoDto,
  ) {
    return this.levantamientosService.aplicar(tenantId, userId, id, dto.token);
  }

  // ─── SESIONES ACTIVAS (multiusuario) ─────────────────────────────────────

  /** Lista los usuarios que están activos en este levantamiento (heartbeat < 5 min) */
  @Get(':id/participantes')
  findParticipantes(@TenantId() tenantId:string, @Param('id') id:string) {
    return this.levantamientosService.findParticipantes(tenantId, id);
  }

  /** Heartbeat: el cliente llama cada 60 s para registrar presencia */
  @Post(':id/heartbeat')
  heartbeat(
    @TenantId() tenantId:string,
    @Param('id') id:string,
    @CurrentUser('sub') userId:string,
    @Body() dto:HeartbeatDto,
  ) {
    return this.levantamientosService.heartbeat(tenantId, id, userId, dto.nombreUsuario);
  }

  /** El cliente llama al salir de la página para limpiar su sesión */
  @Delete(':id/heartbeat')
  salirSesion(
    @TenantId() tenantId:string,
    @Param('id') id:string,
    @CurrentUser('sub') userId:string,
  ) {
    return this.levantamientosService.salirSesion(tenantId, id, userId);
  }

  // ─── CONFLICTOS ────────────────────────────────────────────────────────────

  /** Lista ítems en conflicto (mismo producto contado por dos usuarios) */
  @Get(':id/conflictos')
  @Roles('ADMIN')
  findConflictos(@TenantId() tenantId:string, @Param('id') id:string) {
    return this.levantamientosService.findConflictos(tenantId, id);
  }

  /** ADMIN elige qué conteo conservar (o una cantidad manual) */
  @Post(':id/conciliar')
  @Roles('ADMIN')
  conciliar(
    @TenantId() tenantId:string,
    @Param('id') id:string,
    @Body() dto:ConciliarItemDto,
    @CurrentUser('sub') userId:string,
  ) {
    return this.levantamientosService.conciliarConflicto(tenantId, id, dto, userId);
  }

  // ─── ITEMS ────────────────────────────────────────────────────────────────

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
    @CurrentUser('sub') userId:string,
  ) {
    return this.levantamientosService.createItem(tenantId, levantamientoId, dto, userId);
  }

  @Patch(':id/items/:itemId')
  async updateItem(
    @TenantId() tenantId: string,
    @Param('id') levantamientoId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateLevantamientoItemDto,
    @CurrentUser('sub') userId:string,
  ) {
    return this.levantamientosService.updateItem(tenantId, levantamientoId, itemId, dto, userId);
  }

  @Delete(':id/items/:itemId')
  async removeItem(
    @TenantId() tenantId: string,
    @Param('id') levantamientoId: string,
    @Param('itemId') itemId: string,
    @CurrentUser('sub') userId:string,
    @Query('version') version:string,
  ) {
    return this.levantamientosService.removeItem(tenantId, levantamientoId, itemId, userId, Number(version));
  }
}
