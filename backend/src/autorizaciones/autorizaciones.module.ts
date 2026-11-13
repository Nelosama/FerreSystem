import { Module } from '@nestjs/common';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module';
import { AutorizacionesController } from './autorizaciones.controller';
import { AutorizacionesService } from './autorizaciones.service';

@Module({
  imports: [CotizacionesModule],
  controllers: [AutorizacionesController],
  providers: [AutorizacionesService],
})
export class AutorizacionesModule {}
