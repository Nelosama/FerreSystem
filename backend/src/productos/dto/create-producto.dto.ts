import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsEnum, IsBoolean } from 'class-validator';

import { UnidadMedida as UnidadMedidaEnum } from '@prisma/client';
export { UnidadMedidaEnum };

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty({ message: 'El código del producto es requerido' })
  codigo: string;

  @IsString()
  @IsOptional()
  codigoBarras?: string;

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

  @IsNumber({}, { message: 'El precio de venta debe ser un número' })
  @Min(0, { message: 'El precio de venta no puede ser negativo' })
  precioVenta: number;

  @IsNumber({}, { message: 'El precio de costo debe ser un número' })
  @Min(0, { message: 'El precio de costo no puede ser negativo' })
  precioCosto: number;

  @IsNumber()
  @Min(0)
  stockActual: number;

  @IsNumber()
  @Min(0)
  stockMinimo: number;

  @IsEnum(UnidadMedidaEnum, { message: 'Unidad de medida no válida' })
  @IsOptional()
  unidadMedida?: UnidadMedidaEnum;
}

export class UpdateProductoDto {
  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  @IsOptional()
  codigoBarras?: string;

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

  @IsNumber()
  @Min(0)
  @IsOptional()
  precioVenta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  precioCosto?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockActual?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockMinimo?: number;

  @IsEnum(UnidadMedidaEnum)
  @IsOptional()
  unidadMedida?: UnidadMedidaEnum;
}
