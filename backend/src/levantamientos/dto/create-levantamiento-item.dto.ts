import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsInt, MaxLength, IsUUID, IsBoolean, Matches } from 'class-validator';

export class CreateLevantamientoItemDto {
 @IsOptional() @IsUUID('4') solicitudId?:string;
 @IsString() @IsNotEmpty() @MaxLength(500) descripcion!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) cantidad!:number;
 @IsOptional() @IsString() unidad?:string;
 @IsOptional() @IsString() @MaxLength(100) codigo?:string;
 @IsOptional() @IsString() @MaxLength(100) codigoBarras?:string;
 @IsOptional() @IsString() @MaxLength(100) marca?:string;
 @IsOptional() @IsString() @MaxLength(100) categoria?:string;
 @IsOptional() @IsString() ubicacion?:string;
 @IsOptional() @IsString() notas?:string;
 @IsOptional() @IsString() productoId?:string;
}

export class UpdateLevantamientoItemDto {
 @IsInt() @Min(1) version!:number;
 @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) descripcion?:string;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) cantidad?:number;
 @IsOptional() @IsString() unidad?:string;
 @IsOptional() @IsString() @MaxLength(100) codigo?:string;
 @IsOptional() @IsString() @MaxLength(100) codigoBarras?:string;
 @IsOptional() @IsString() @MaxLength(100) marca?:string;
 @IsOptional() @IsString() @MaxLength(100) categoria?:string;
 @IsOptional() @IsString() ubicacion?:string;
 @IsOptional() @IsString() notas?:string;
}

export class AplicarLevantamientoDto {
 @IsString() @IsNotEmpty() token!:string;
}

/** Resolución explícita de conflicto de conteo — solo ADMIN */
export class ConciliarItemDto {
 /** Snapshot de todos los conteos del grupo que revisó el administrador. */
 @IsString() @Matches(/^[a-f0-9]{64}$/) token!:string;
 /** ID del ítem que se desea conservar */
 @IsUUID('4') mantenerItemId!:string;
 /** Cantidad alternativa; si se omite se usa la del ítem elegido */
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) cantidadManual?:number;
}

export class HeartbeatDto {
 @IsString() @IsNotEmpty() @MaxLength(200) nombreUsuario!:string;
}
