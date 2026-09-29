import { Module } from '@nestjs/common';
import { LevantamientosController } from './levantamientos.controller';
import { LevantamientosService } from './levantamientos.service';

@Module({
  controllers: [LevantamientosController],
  providers: [LevantamientosService],
  exports: [LevantamientosService],
})
export class LevantamientosModule {}
