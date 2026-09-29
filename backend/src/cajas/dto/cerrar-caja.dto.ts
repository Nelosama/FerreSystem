import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CerrarCajaDto {
  @IsNumber()
  @Min(0, { message: 'El efectivo contado debe ser mayor o igual a cero' })
  montoContado: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
