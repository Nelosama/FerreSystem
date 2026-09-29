import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TipoMovimientoCaja, MetodoPago } from '@prisma/client';

export class CrearMovimientoDto {
  @IsEnum(TipoMovimientoCaja, { message: 'El tipo debe ser INGRESO o EGRESO' })
  tipo: TipoMovimientoCaja;

  @IsString()
  concepto: string;

  @IsNumber()
  @Min(0.01, { message: 'El monto del movimiento debe ser mayor a cero' })
  monto: number;

  @IsOptional()
  @IsEnum(MetodoPago)
  metodoPago?: MetodoPago;

  @IsOptional()
  @IsString()
  observacion?: string;
}
