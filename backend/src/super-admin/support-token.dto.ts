import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SupportTokenDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  usuarioId: string;

  /** Solo lectura por defecto; false exige `motivo` y `confirmarEscritura`. */
  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;

  /** Justificación del acceso de soporte (se conserva en la auditoría). */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo: string;

  /** Autorización explícita para el modo de escritura. */
  @IsOptional()
  @IsBoolean()
  confirmarEscritura?: boolean;
}
