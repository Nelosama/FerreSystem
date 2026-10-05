import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsInt, MaxLength, IsUUID } from 'class-validator';
export class CreateLevantamientoItemDto {
 @IsOptional() @IsUUID('4') solicitudId?:string;
 @IsString() @IsNotEmpty() @MaxLength(500) descripcion!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) cantidad!:number;
 @IsOptional() @IsString() unidad?:string;
 @IsOptional() @IsString() codigo?:string;
 @IsOptional() @IsString() codigoBarras?:string;
 @IsOptional() @IsString() marca?:string;
 @IsOptional() @IsString() categoria?:string;
 @IsOptional() @IsString() ubicacion?:string;
 @IsOptional() @IsString() notas?:string;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) precioCosto?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) precioVenta?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?:number;
}
export class UpdateLevantamientoItemDto {
 @IsInt() @Min(1) version!:number;
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) descripcion?:string;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) cantidad?:number;
 @IsOptional() @IsString() unidad?:string;
 @IsOptional() @IsString() codigo?:string;
 @IsOptional() @IsString() codigoBarras?:string;
 @IsOptional() @IsString() marca?:string;
 @IsOptional() @IsString() categoria?:string;
 @IsOptional() @IsString() ubicacion?:string;
 @IsOptional() @IsString() notas?:string;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) precioCosto?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) precioVenta?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) margen?:number;
}
export class AplicarLevantamientoDto {
 @IsString() @IsNotEmpty() token!:string;
}
