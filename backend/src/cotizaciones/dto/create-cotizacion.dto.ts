import { IsString, IsNotEmpty, IsNumber, Min, IsArray, ValidateNested, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class DetalleCotizacionItemDto {
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

export class CreateCotizacionDto {
  @IsString()
  @IsNotEmpty({ message: 'El cliente es requerido para generar la cotización' })
  clienteId: string;

  @IsDateString({}, { message: 'La fecha de validez debe ser una fecha ISO válida' })
  @IsOptional()
  fechaValidez?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  descuento?: number;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleCotizacionItemDto)
  detalles: DetalleCotizacionItemDto[];
}
