import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateCreditoClienteDto {
  @IsBoolean()
  creditoHabilitado: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limiteCredito?: number | null;

  // Plazo de crédito en días. Las facturas nuevas vencen según este plazo; null lo quita.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  plazoCreditoDias?: number | null;
}
