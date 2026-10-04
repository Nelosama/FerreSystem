import { Module } from '@nestjs/common';
import { OperacionesService } from './operaciones.service';
import { OperacionesController } from './operaciones.controller';
@Module({providers:[OperacionesService],controllers:[OperacionesController]})
export class OperacionesModule {}
