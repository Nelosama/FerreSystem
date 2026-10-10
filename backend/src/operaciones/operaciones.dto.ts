import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested, IsUUID, IsIn, IsDateString, MaxLength, IsBoolean, IsInt } from 'class-validator';
import { EmptyToUndefined } from '../common/empty-to-undefined';
import { PagoElectronicoDto } from '../common/pago-electronico.dto';
import { Type } from 'class-transformer';

export class ProveedorDto {
 @IsUUID('4') solicitudId!:string;
 @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
 @IsOptional() @IsString() telefono?: string;
 @IsOptional() @IsString() rtn?: string;
}
export class ProductoProveedorDto {
  @IsOptional() @IsString() @MaxLength(100) codigoProveedor?: string | null;
  @IsBoolean() esPreferido!: boolean;
}
export class CompraItemDto {
 @IsString() @IsNotEmpty() productoId!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) cantidad!: number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) costo!: number;
}
// Compra al contado (D1): la factura nace ya pagada por el total, sin caja (FS-09). Solo ADMIN puede pagarla.
export class PagoContadoDto {
 @IsIn(['EFECTIVO','TARJETA','TRANSFERENCIA']) metodo!: string;
}
export class CompraDto {
 @IsUUID('4') solicitudId!: string;
 @IsString() @IsNotEmpty() proveedorId!: string;
 @IsString() @IsNotEmpty() @MaxLength(100) numeroFactura!: string;
 @IsOptional() @EmptyToUndefined() @IsDateString() vencimiento?: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) isv!: number;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(() => CompraItemDto) items!: CompraItemDto[];
 @IsOptional() @ValidateNested() @Type(() => PagoContadoDto) pagoContado?: PagoContadoDto;
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
 @IsOptional() @ValidateNested() @Type(() => PagoElectronicoDto) pagoElectronico?: PagoElectronicoDto;
}
// Conciliación del POS bancario (ADMIN): total y cantidad que muestra el cierre del banco por terminal y día.
export class ConciliacionBancariaDto {
 @IsUUID('4') solicitudId!: string;
 @IsString() @IsNotEmpty() @MaxLength(40) terminal!: string;
 @IsString() @IsNotEmpty() fecha!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) totalBanco!: number;
 @IsInt() @Min(0) cantidadBanco!: number;
 @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}
export class AbrirCajaDto {
 @IsUUID('4') solicitudId!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) monto!: number;
}
export class CerrarCajaDto {
 @IsNumber({maxDecimalPlaces:2}) @Min(0) monto!: number;
 @IsOptional() @IsString() @MaxLength(500) notas?: string;
}
export class MovimientoCajaDto {
 @IsUUID('4') solicitudId!: string;
 @IsIn(['INGRESO_MANUAL','EGRESO_MANUAL']) tipo!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) monto!: number;
 @IsString() @IsNotEmpty() @MaxLength(200) concepto!: string;
 @IsOptional() @IsString() @MaxLength(100) referencia?: string;
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
export class DecisionDevolucionDto {
 @IsIn(['AUTORIZADA','RECHAZADA']) decision!:string;
 @IsString() @IsNotEmpty() @MaxLength(500) motivo!:string;
}
