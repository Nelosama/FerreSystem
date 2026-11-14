import { Module } from '@nestjs/common';
import { OperacionesService } from './operaciones.service';
import { OperacionesController } from './operaciones.controller';
import { ReembolsosController, ReembolsosService } from './reembolsos';
@Module({providers:[OperacionesService,ReembolsosService],controllers:[OperacionesController,ReembolsosController]})
export class OperacionesModule {}
