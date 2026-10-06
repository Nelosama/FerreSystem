import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateCreditoClienteDto {
  @IsBoolean() creditoHabilitado!: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) limiteCredito?: number | null;
}
