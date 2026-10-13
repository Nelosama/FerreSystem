import { IsInt, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Inicialización explícita; nunca equivale a recibir una compra ni aprobar un precio. */
export class InicializarCostoDto {
  @IsUUID('4')
  solicitudId!: string;

  @IsInt() @Min(1)
  version!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99)
  costo!: number;

  @IsString() @MinLength(1) @MaxLength(500)
  motivo!: string;
}
