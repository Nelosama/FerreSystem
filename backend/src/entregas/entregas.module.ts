import { Module } from '@nestjs/common';
import { EntregasController } from './entregas.controller';
import { EntregasService } from './entregas.service';

@Module({ providers: [EntregasService], controllers: [EntregasController] })
export class EntregasModule {}
