import { IsString, IsNotEmpty, IsNumber, Min, IsArray, ValidateNested, IsOptional, IsEnum, IsIn, IsUUID, IsBoolean, IsDateString, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';
import { EmptyToUndefined } from '../../common/empty-to-undefined';
import { Type } from 'class-transformer';
import { TipoPago } from '../../types/prisma-enums';
import { PagoElectronicoDto } from '../../common/pago-electronico.dto';

export enum MetodoPagoEnum {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  CREDITO = 'CREDITO',
  TRANSFERENCIA = 'TRANSFERENCIA',
}

export class DetalleVentaItemDto {
  @IsString()
  @IsNotEmpty()
  productoId: string;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0.01, { message: 'La cantidad debe ser mayor a cero' })
  cantidad: number;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @IsOptional()
  precioUnitario?: number;
  @IsOptional() @IsBoolean() sinInventario?: boolean;
  /** MOSTRADOR: se entrega al cobrar. BODEGA: queda reservada para entrega posterior (valor por defecto). */
  @IsOptional() @IsIn(['MOSTRADOR', 'BODEGA']) modoEntrega?: 'MOSTRADOR' | 'BODEGA';
  @IsOptional() @IsString() proveedorId?: string;
  @IsOptional() @IsString() ordenCompraId?: string;
}

export class CreateVentaDto {
  /** Obligatoria (DEF-03): sin ella un reintento por pérdida de respuesta crearía otra venta. UUID v4 generado por el cliente. */
  @IsUUID('4', { message: 'solicitudId es obligatorio y debe ser un UUID v4 generado por el cliente' })
  solicitudId!: string;

  @IsString()
  @IsOptional()
  clienteId?: string;
  @IsOptional() @IsString() @MaxLength(200) clienteNombre?: string;
  @IsOptional() @IsString() @MaxLength(100) clienteRtn?: string;
  @IsOptional() @EmptyToUndefined() @IsDateString() vencimiento?: string;

  @IsEnum(MetodoPagoEnum)
  @IsOptional()
  metodoPago?: MetodoPagoEnum;

  @IsOptional() @ValidateNested() @Type(() => PagoElectronicoDto) pagoElectronico?: PagoElectronicoDto;
  @IsEnum(TipoPago)
  @IsOptional()
  tipoPago?: TipoPago;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0)
  @IsOptional()
  descuento?: number;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaItemDto)
  detalles: DetalleVentaItemDto[];
}

