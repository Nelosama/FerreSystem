import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsEnum, IsBoolean, IsUrl, MaxLength } from 'class-validator';

import { UnidadMedida as UnidadMedidaEnum } from '@prisma/client';
export { UnidadMedidaEnum };

export class CreateProductoDto {
  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  codigoBarras?: string;
  @IsOptional() @IsString() codigoFabricante?: string;
  @IsOptional() @IsString() @MaxLength(100) marca?: string;
  @IsOptional() @IsUrl({protocols:['https'],require_protocol:true}) @MaxLength(2048) imagenUrl?:string;
  @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?: number;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es requerido' })
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  categoriaId?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsBoolean()
  @IsOptional()
  usaMedida?: boolean;

  @IsNumber({maxDecimalPlaces:2}, { message: 'El precio de venta debe ser un número' })
  @Min(0, { message: 'El precio de venta no puede ser negativo' })
  precioVenta: number;

  @IsNumber({maxDecimalPlaces:2}, { message: 'El precio de costo debe ser un número' })
  @Min(0, { message: 'El precio de costo no puede ser negativo' })
  precioCosto: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  stockActual: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  stockMinimo: number;

  @IsEnum(UnidadMedidaEnum, { message: 'Unidad de medida no válida' })
  @IsOptional()
  unidadMedida?: UnidadMedidaEnum;
}

export class UpdateProductoDto {
  @IsOptional() @IsString() motivo?: string;
  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  codigoBarras?: string;
  @IsOptional() @IsString() codigoFabricante?: string;
  @IsOptional() @IsString() @MaxLength(100) marca?: string;
  @IsOptional() @IsUrl({protocols:['https'],require_protocol:true}) @MaxLength(2048) imagenUrl?:string;
  @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?: number;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  categoriaId?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsBoolean()
  @IsOptional()
  usaMedida?: boolean;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @IsOptional()
  precioVenta?: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @IsOptional()
  precioCosto?: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @IsOptional()
  stockActual?: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @IsOptional()
  stockMinimo?: number;

  @IsEnum(UnidadMedidaEnum)
  @IsOptional()
  unidadMedida?: UnidadMedidaEnum;
}

