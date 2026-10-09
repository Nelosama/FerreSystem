import { IsString, IsNotEmpty, ValidateIf, IsUUID, IsNumber, IsInt, Min, Max, IsEnum, IsBoolean, IsUrl, MaxLength } from 'class-validator';

import { UnidadMedida as UnidadMedidaEnum } from '@prisma/client';
export { UnidadMedidaEnum };

export class CreateProductoDto {
  /** Clave persistida por el cliente para reintentar el alta sin duplicar existencias. */
  @ValidateIf((_object, value) => value !== undefined) @IsUUID("4")
  solicitudId?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  codigo?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  @MaxLength(100)
  codigoBarras?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() codigoFabricante?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) marca?: string;
  @ValidateIf((_object, value) => value !== undefined && value !== null) @IsUrl({protocols:['https'],require_protocol:true}) @MaxLength(2048) imagenUrl?:string;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?: number;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es requerido' })
  nombre: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  descripcion?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  categoriaId?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  categoria?: string;

  @IsBoolean()
  @ValidateIf((_object, value) => value !== undefined)
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
  @ValidateIf((_object, value) => value !== undefined)
  unidadMedida?: UnidadMedidaEnum;
}

export class UpdateProductoDto {
  /** Cantidad física leída antes del ajuste: las recepciones y entregas no cambian version. */
  @ValidateIf((_object, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0)
  stockAnterior?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() motivo?: string;
  /** FS-07: versión leída por el cliente. Si otro usuario la cambió después, la edición se rechaza sin sobrescribir. */
  @IsInt({ message: 'Falta la versión del producto; recargue la pantalla' }) @Min(1)
  version!: number;
  /** FS-07: estado del producto. Solo el administrador puede cambiarlo. */
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() activo?: boolean;
  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  codigo?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  @MaxLength(100)
  codigoBarras?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() codigoFabricante?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) marca?: string;
  @ValidateIf((_object, value) => value !== undefined && value !== null) @IsUrl({protocols:['https'],require_protocol:true}) @MaxLength(2048) imagenUrl?:string;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?: number;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  nombre?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  descripcion?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  categoriaId?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  categoria?: string;

  @IsBoolean()
  @ValidateIf((_object, value) => value !== undefined)
  usaMedida?: boolean;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @ValidateIf((_object, value) => value !== undefined)
  precioVenta?: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @ValidateIf((_object, value) => value !== undefined)
  precioCosto?: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @ValidateIf((_object, value) => value !== undefined)
  stockActual?: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @ValidateIf((_object, value) => value !== undefined)
  stockMinimo?: number;

  @IsEnum(UnidadMedidaEnum)
  @ValidateIf((_object, value) => value !== undefined)
  unidadMedida?: UnidadMedidaEnum;
}

