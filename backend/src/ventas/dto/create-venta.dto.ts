import { IsString, IsNotEmpty, IsNumber, Min, IsArray, ValidateNested, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum MetodoPagoEnum {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  CREDITO = 'CREDITO',
}

export class DetalleVentaItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber()
  @Min(0.01, { message: 'La cantidad debe ser mayor a cero' })
  cantidad: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  precioUnitario?: number;
}

export class CreateVentaDto {
  @IsString()
  @IsOptional()
  clienteId?: string;

  @IsEnum(MetodoPagoEnum)
  @IsOptional()
  metodoPago?: MetodoPagoEnum;

  @IsNumber()
  @Min(0)
  @IsOptional()
  descuento?: number;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaItemDto)
  detalles: DetalleVentaItemDto[];
}
