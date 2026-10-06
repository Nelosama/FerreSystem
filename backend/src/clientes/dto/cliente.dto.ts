import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateCreditoClienteDto {
  @IsBoolean()
  creditoHabilitado: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limiteCredito?: number | null;
}
