import { Module } from '@nestjs/common';
import { CajasController } from './cajas.controller';
import { CajasService } from './cajas.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CajasController],
  providers: [CajasService],
  exports: [CajasService],
})
export class CajasModule {}
