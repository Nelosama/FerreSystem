import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';

export enum UnidadMedidaEnum {
  UNIDAD = 'UNIDAD',
  CAJA = 'CAJA',
  METRO = 'METRO',
  KG = 'KG',
  GALON = 'GALON',
  LIBRA = 'LIBRA',
}

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
