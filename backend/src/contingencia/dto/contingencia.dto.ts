import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class RegistrarDispositivoDto {
  @IsUUID('4') dispositivoId: string;
  @IsString() @IsNotEmpty() @MaxLength(80) nombre: string;
}

export class SolicitarVentanaDto {
  @IsUUID('4') dispositivoId: string;
  /** Hash de la instantánea que el dispositivo ya tiene; si coincide no se reenvía el catálogo. */
  @IsOptional() @IsString() @MaxLength(100) catalogoHashActual?: string;
  /** Hora local del dispositivo (ISO) para estimar el desfase de reloj. */
  @IsOptional() @IsDateString() relojLocal?: string;
}

export class LineaContingenciaDto {
  @IsString() @IsNotEmpty() @MaxLength(100) productoId: string;
  @IsInt() @Min(1) @Max(99999999) cantidadCentesimas: number;
  @IsInt() @Min(0) @Max(9999999999) precioCentavos: number;
}

export class OperacionContingenciaDto {
  @IsUUID('4') operacionId: string;
  @IsUUID('4') dispositivoId: string;
  @IsUUID() ventanaId: string;
  @IsInt() @Min(1) @Max(99999999) secuenciaLocal: number;
  @Matches(/^CT-\d{2,3}-\d{4,8}$/) correlativoLocal: string;
  @IsDateString() ocurridoAtLocal: string;
  @IsString() @IsNotEmpty() cajeroId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineaContingenciaDto)
  lineas: LineaContingenciaDto[];
  @IsInt() @Min(1) @Max(99999999999) totalCentavos: number;
  @IsInt() @Min(0) @Max(99999999999) subtotalCentavos: number;
  @IsInt() @Min(0) @Max(99999999999) isvCentavos: number;
  @IsInt() @Min(1) @Max(99999999999) efectivoRecibidoCentavos: number;
  @IsInt() @Min(0) @Max(99999999999) cambioCentavos: number;
  @IsOptional() @IsIn(['EFECTIVO']) metodoPago?: 'EFECTIVO';
  @IsOptional() @IsString() @MaxLength(200) clienteNombre?: string;
  @IsOptional() @IsString() @MaxLength(100) clienteRtn?: string;
  @IsOptional() @IsString() @MaxLength(100) referenciaFacturaExterna?: string;
  @IsInt() @Min(1) esquemaVersion: number;
}

export class LoteOperacionesDto {
  @IsUUID('4') dispositivoId: string;
  @IsInt() @Min(0) @Max(100000) pendientesRestantes: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => OperacionContingenciaDto)
  operaciones: OperacionContingenciaDto[];
}

export class ResolverOperacionDto {
  @IsIn(['REINTENTAR', 'ACEPTAR', 'CERRAR_MANUAL', 'MARCAR_REVISADA']) accion: 'REINTENTAR' | 'ACEPTAR' | 'CERRAR_MANUAL' | 'MARCAR_REVISADA';
  @IsString() @MinLength(10) @MaxLength(500) nota: string;
  /** Caja ABIERTA que recibirá el efectivo si la caja original ya cerró. */
  @IsOptional() @IsString() cajaId?: string;
  @IsOptional() @IsString() @MaxLength(100) referenciaFacturaExterna?: string;
}

export class ActualizarReferenciaDto {
  @IsString() @MaxLength(100) referenciaFacturaExterna: string;
}

export class ConfigContingenciaDto {
  @IsOptional() @IsBoolean() habilitada?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) cupoPorcentaje?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) margenUnidades?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) montoMaxVentaCentavos?: number;
  @IsOptional() @IsInt() @Min(1) @Max(999999999) montoMaxAcumuladoCentavos?: number;
  @IsOptional() @IsInt() @Min(1) @Max(72) vigenciaHoras?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) dispositivosMax?: number;
}
