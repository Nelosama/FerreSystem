import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AbrirCajaDto {
  @IsNumber()
  @Min(0, { message: 'El monto inicial debe ser igual o mayor a cero' })
  montoInicial: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
