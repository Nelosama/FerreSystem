import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayMaxSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class DetalleCompraDto {
  @IsString() productoId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) cantidad!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) costoUnitario!: number;
}

export class CreateCompraDto {
  @IsString() proveedorId!: string;
  @IsOptional() @IsString() @MaxLength(100) numeroFactura?: string;
  @IsDateString() fecha!: string;
  @IsOptional() @IsDateString() vencimiento?: string;
  @IsOptional() @IsString() @MaxLength(2000) notas?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => DetalleCompraDto) detalles!: DetalleCompraDto[];
}

export class CreatePagoProveedorDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monto!: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsString() @MaxLength(50) metodo?: string;
  @IsOptional() @IsString() @MaxLength(2000) notas?: string;
}
