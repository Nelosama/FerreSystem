import { Module } from '@nestjs/common';
import { ContingenciaController } from './contingencia.controller';
import { ContingenciaService } from './contingencia.service';

@Module({
  controllers: [ContingenciaController],
  providers: [ContingenciaService],
})
export class ContingenciaModule {}
