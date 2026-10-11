import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { OPERACIONES_POR_VENTANA } from '../operaciones-emitidas';

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

/**
 * H-1 (CENTINELA): las columnas total_centavos y efectivo_recibido_centavos son enteros de 32 bits. Un importe mayor no cabe en el
 * diario; se rechaza como formato inválido de esa operación, sin tumbar el lote. 2 000 000 000 centavos son 20 millones de lempiras.
 */
export const MAX_CENTAVOS = 2_000_000_000;

export class OperacionContingenciaDto {
  @IsUUID('4') operacionId: string;
  @IsUUID('4') dispositivoId: string;
  @IsUUID() ventanaId: string;
  // H-5: índice dentro de las operaciones emitidas por la ventana. Ausente en equipos anteriores (se rechaza con OPERACION_NO_EMITIDA).
  @IsOptional() @IsInt() @Min(0) @Max(OPERACIONES_POR_VENTANA - 1) indiceOperacion?: number;
  @IsInt() @Min(1) @Max(99999999) secuenciaLocal: number;
  @Matches(/^CT-\d{2,3}-\d{4,8}$/) correlativoLocal: string;
  @IsDateString() ocurridoAtLocal: string;
  @IsString() @IsNotEmpty() cajeroId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineaContingenciaDto)
  lineas: LineaContingenciaDto[];
  // CENTINELA D: sin mínimo 1; un importe 0 lo clasifica el servicio (IMPORTE_INVALIDO) sin rechazar el lote entero.
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) totalCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) subtotalCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) isvCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) efectivoRecibidoCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) cambioCentavos: number;
  @IsOptional() @IsIn(['EFECTIVO']) metodoPago?: 'EFECTIVO';
  @IsOptional() @IsString() @MaxLength(200) clienteNombre?: string;
  @IsOptional() @IsString() @MaxLength(100) clienteRtn?: string;
  @IsOptional() @IsString() @MaxLength(100) referenciaFacturaExterna?: string;
  @IsInt() @Min(1) esquemaVersion: number;
}

export class LoteOperacionesDto {
  @IsUUID('4') dispositivoId: string;
  @IsInt() @Min(0) @Max(100000) pendientesRestantes: number;
  // H3 (CENTINELA): las operaciones se validan una a una en el servicio; una inválida no rechaza el lote entero.
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  operaciones: OperacionContingenciaDto[];
}

export class ResolverOperacionDto {
  @IsIn(['REINTENTAR', 'ACEPTAR', 'CERRAR_MANUAL', 'MARCAR_REVISADA']) accion: 'REINTENTAR' | 'ACEPTAR' | 'CERRAR_MANUAL' | 'MARCAR_REVISADA';
  @IsString() @MinLength(10) @MaxLength(500) nota: string;
  /** Caja ABIERTA donde se aplica la venta al ACEPTAR. En CERRAR_MANUAL el efectivo va siempre a la caja del cajero que cobró. */
  @IsOptional() @IsString() cajaId?: string;
  /** R-02: regularización excepcional para registrar el efectivo en la caja CERRADA del cajero que cobró. Exige motivo. */
  @IsOptional() @IsBoolean() regularizarCajaCerrada?: boolean;
  // H-3 (CENTINELA): el mínimo de 20 caracteres se cuenta sobre el texto recortado; espacios en blanco no son un motivo.
  @ValidateIf((o) => o.regularizarCajaCerrada === true) @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MinLength(20) @MaxLength(500) motivoRegularizacion?: string;
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
