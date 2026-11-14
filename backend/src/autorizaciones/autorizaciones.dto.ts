import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const ESTADOS_SOLICITUD = ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'INVALIDADA'] as const;

/** Decisión del ADMIN. El motivo es opcional (decisión del dueño del 2026-11-12). */
export class DecisionAutorizacionDto {
  @IsString()
  @MaxLength(300)
  @IsOptional()
  motivo?: string;
}

export class ListarAutorizacionesDto {
  @IsIn([...ESTADOS_SOLICITUD])
  @IsOptional()
  estado?: (typeof ESTADOS_SOLICITUD)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  @IsOptional()
  page?: number;

  /** Filtro por tipo, separado por comas (p. ej. APERTURA_CAJA,CIERRE_CAJA). */
  @IsString()
  @Matches(/^(DESCUENTO_COTIZACION|APERTURA_CAJA|CIERRE_CAJA)(,(DESCUENTO_COTIZACION|APERTURA_CAJA|CIERRE_CAJA))*$/)
  @IsOptional()
  tipo?: string;
}
