import { IsString, IsNotEmpty, IsNumber, Min, IsArray, ValidateNested, IsOptional, IsDateString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

import { IsBoolean } from 'class-validator';

export class DetalleCotizacionItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'La cantidad debe ser mayor a cero' })
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  medida?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  precioUnitario?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  descuento?: number;

  @IsIn(['PORCENTAJE', 'MONTO'])
  @IsOptional()
  tipoDescuento?: 'PORCENTAJE' | 'MONTO';

  @IsBoolean()
  @IsOptional()
  exento?: boolean;
}

export class CreateCotizacionDto {
  @IsString()
  @IsOptional()
  clienteId?: string;

  @IsString()
  @IsOptional()
  clienteNombre?: string;

  @IsString()
  @IsOptional()
  clienteRtn?: string;

  @IsString()
  @IsOptional()
  clienteTelefono?: string;

  @IsString()
  @IsOptional()
  clienteEmail?: string;

  @IsString()
  @IsOptional()
  clienteDireccion?: string;

  @IsDateString({}, { message: 'La fecha de validez debe ser una fecha ISO válida' })
  @IsOptional()
  fechaValidez?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  diasValidez?: number;

  @IsString()
  @IsOptional()
  condicionesPago?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  descuentoGeneral?: number;

  @IsIn(['PORCENTAJE', 'MONTO'])
  @IsOptional()
  tipoDescuentoGeneral?: 'PORCENTAJE' | 'MONTO';

  @IsNumber()
  @Min(0)
  @IsOptional()
  porcentajeIsv?: number;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleCotizacionItemDto)
  detalles: DetalleCotizacionItemDto[];
}
