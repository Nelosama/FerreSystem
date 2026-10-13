import { Module } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { CostoInicialService } from './costo-inicial.service';
import { CostoInicialController } from './costo-inicial.controller';

@Module({
  controllers: [ProductosController, CostoInicialController],
  providers: [ProductosService, CostoInicialService],
  exports: [ProductosService],
})
export class ProductosModule {}
