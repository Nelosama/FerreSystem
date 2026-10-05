import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested, IsUUID, IsIn, IsDateString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ProveedorDto {
 @IsUUID('4') solicitudId!:string;
 @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
 @IsOptional() @IsString() telefono?: string;
 @IsOptional() @IsString() rtn?: string;
}
export class CompraItemDto {
 @IsString() @IsNotEmpty() productoId!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) cantidad!: number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) costo!: number;
}
export class CompraDto {
 @IsUUID('4') solicitudId!: string;
 @IsString() @IsNotEmpty() proveedorId!: string;
 @IsString() @IsNotEmpty() @MaxLength(100) numeroFactura!: string;
 @IsOptional() @IsDateString() vencimiento?: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) isv!: number;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(() => CompraItemDto) items!: CompraItemDto[];
}
export class RecepcionItemDto {
 @IsString() @IsNotEmpty() detalleId!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) cantidad!: number;
}
export class RecepcionDto {
 @IsUUID('4') solicitudId!: string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(() => RecepcionItemDto) items!: RecepcionItemDto[];
}
export class PagoDto {
 @IsUUID('4') solicitudId!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) monto!: number;
 @IsIn(['EFECTIVO','TARJETA','TRANSFERENCIA']) metodo!: string;
 @IsOptional() @IsString() notas?: string;
}
export class AbrirCajaDto {
 @IsUUID('4') solicitudId!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) monto!: number;
}
export class CerrarCajaDto {
 @IsNumber({maxDecimalPlaces:2}) @Min(0) monto!: number;
 @IsOptional() @IsString() notas?: string;
}
export class AjusteDto {
 @IsUUID('4') solicitudId!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) stock!: number;
 @IsString() @IsNotEmpty() @MaxLength(500) motivo!: string;
}
export class DevolucionItemDto {
 @IsString() @IsNotEmpty() detalleId!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(.01) cantidad!:number;
 @IsIn(['INVENTARIO','DAÑADO','PROVEEDOR','NO_ENTREGADO']) destino!:string;
}
export class DevolucionDto {
 @IsUUID('4') solicitudId!:string;
 @IsString() @IsNotEmpty() @MaxLength(500) motivo!:string;
 @IsIn(['EFECTIVO','TARJETA','TRANSFERENCIA']) metodo!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>DevolucionItemDto) items!:DevolucionItemDto[];
}
