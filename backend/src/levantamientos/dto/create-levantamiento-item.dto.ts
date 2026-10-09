import { Transform } from 'class-transformer';
import { UnidadMedida } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsInt, MaxLength, IsUUID, IsEnum, ValidateIf } from 'class-validator';
export class CreateLevantamientoItemDto {
 @IsOptional() @IsUUID('4') solicitudId?:string;
 @IsString() @IsNotEmpty() @MaxLength(500) descripcion!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) cantidad!:number;
 @ValidateIf((_o, value) => value !== undefined) @Transform(({value}) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsEnum(UnidadMedida, {message:'Unidad de medida no válida'}) unidad?:string;
 @IsOptional() @IsString() codigo?:string;
 @IsOptional() @IsString() codigoBarras?:string;
 @IsOptional() @IsString() marca?:string;
 @IsOptional() @IsString() categoria?:string;
 @IsOptional() @IsString() ubicacion?:string;
 @IsOptional() @IsString() notas?:string;
 @ValidateIf((_o, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) precioCosto?:number;
 @ValidateIf((_o, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) precioVenta?:number;
 @ValidateIf((_o, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?:number;
}
export class UpdateLevantamientoItemDto {
 @IsInt() @Min(1) version!:number;
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) descripcion?:string;
 @ValidateIf((_o, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) cantidad?:number;
 @ValidateIf((_o, value) => value !== undefined) @Transform(({value}) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsEnum(UnidadMedida, {message:'Unidad de medida no válida'}) unidad?:string;
 @IsOptional() @IsString() codigo?:string;
 @IsOptional() @IsString() codigoBarras?:string;
 @IsOptional() @IsString() marca?:string;
 @IsOptional() @IsString() categoria?:string;
 @IsOptional() @IsString() ubicacion?:string;
 @IsOptional() @IsString() notas?:string;
 @ValidateIf((_o, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) precioCosto?:number;
 @ValidateIf((_o, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) precioVenta?:number;
 @ValidateIf((_o, value) => value !== undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?:number;
}
export class AplicarLevantamientoDto {
 @IsString() @IsNotEmpty() token!:string;
}
