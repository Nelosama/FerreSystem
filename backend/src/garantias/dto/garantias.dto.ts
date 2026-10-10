import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Límite técnico de días (10 años). Coincide con el CHECK de la migración. */
export const DIAS_GARANTIA_MAX = 3650;

export class CrearCoberturaDto {
  @IsString()
  @MaxLength(64)
  ventaId!: string;

  @IsString()
  @MaxLength(64)
  detalleVentaId!: string;

  @IsInt()
  @Min(1)
  @Max(DIAS_GARANTIA_MAX)
  diasGarantia!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  numeroSerie?: string;

  /** Clave de solicitud (UUID v4) para reintentos seguros. */
  @IsUUID('4')
  solicitudId!: string;
}

export class ActualizarCoberturaDto {
  @IsInt()
  @Min(1)
  @Max(DIAS_GARANTIA_MAX)
  diasGarantia!: number;
}
