import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min, ValidateBy, ValidateIf, ValidateNested,
} from 'class-validator';
import { OPERACIONES_POR_VENTANA } from '../operaciones-emitidas';

/**
 * Texto que PostgreSQL y JSON aceptan (H-A y H-F de CENTINELA): sin el carácter nulo (22021/22P05) y sin pares sustitutos sueltos
 * (un \ud800 aislado rompe Prisma: «lone leading surrogate»). Antes la operación se reintentaba sin fin como error temporal.
 */
const SUSTITUTO_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export const esTextoSeguro = (valor: unknown) => typeof valor !== 'string' || (!valor.includes('\u0000') && !SUSTITUTO_SUELTO.test(valor));
/** Quita el carácter nulo y los pares sustitutos sueltos (para guardar evidencia sin perderla). */
export const sanearTexto = (valor: string) => valor.replace(/\u0000/g, '').replace(new RegExp(SUSTITUTO_SUELTO.source, 'g'), '');
const TextoSeguro = () => ValidateBy({
  name: 'textoSeguro',
  validator: { validate: esTextoSeguro, defaultMessage: () => '$property no admite caracteres nulos ni pares sustitutos incompletos' },
});

/**
 * H-C y H-G (CENTINELA): una nota o un motivo vacío en la práctica no puede contar como texto. Los invisibles se descartan por categoría
 * Unicode, no por lista: formato (Cf: ancho cero, marcas direccionales, guion blando, etiquetas), control (Cc), separadores (Zs, Zl, Zp),
 * selectores de variación y los rellenos que no pertenecen a esas categorías (hangul, braille en blanco, mongol, combinación de gracia).
 */
const INVISIBLES = /[\p{Cf}\p{Cc}\p{Zs}\p{Zl}\p{Zp}\u3164\u2800\u115F\u1160\uFFA0\u180E\u034F\uFE00-\uFE0F\p{M}\p{Default_Ignorable_Code_Point}]/gu;
export const longitudSignificativa = (valor: unknown) => (typeof valor === 'string' ? [...valor.replace(INVISIBLES, '')].length : 0);
/** Texto libre normalizado para guardar: sin invisibles de formato ni relleno en los extremos. */
export const limpiarTexto = (valor: unknown) => (typeof valor === 'string' ? valor.replace(/[\p{Cf}\u3164\u2800\u115F\u1160\uFFA0\u180E\u034F]/gu, '').trim() : valor);
const TextoLimpio = () => Transform(({ value }) => limpiarTexto(value));
/** H-M (CENTINELA): solo ISO con fecha de calendario (AAAA-MM-DD…); rechaza las formas semanal y ordinal que `new Date()` no entiende. */
export const esFechaHoraIso = (valor: unknown) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(valor)) return false;
  const [a, m, d] = valor.slice(0, 10).split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  if (dia.getUTCFullYear() !== a || dia.getUTCMonth() !== m - 1 || dia.getUTCDate() !== d) return false;
  const t = new Date(valor).getTime();
  return Number.isFinite(t) && t >= Date.UTC(1970, 0, 1) && t <= Date.UTC(2100, 0, 1);
};
const FechaHoraIso = () => ValidateBy({
  name: 'fechaHoraIso', validator: { validate: esFechaHoraIso, defaultMessage: () => '$property debe ser una fecha ISO 8601 válida (AAAA-MM-DDThh:mm:ssZ)' },
});
const MinimoSignificativo = (minimo: number) => ValidateBy({
  name: 'minimoSignificativo', constraints: [minimo],
  validator: { validate: (valor, args) => longitudSignificativa(valor) >= (args?.constraints?.[0] ?? 0), defaultMessage: (args) => `$property debe tener al menos ${args?.constraints?.[0]} caracteres visibles` },
});

export class RegistrarDispositivoDto {
  @IsUUID('4') dispositivoId: string;
  @TextoSeguro() @IsString() @IsNotEmpty() @MaxLength(80) nombre: string;
}

export class SolicitarVentanaDto {
  @IsUUID('4') dispositivoId: string;
  /** Hash de la instantánea que el dispositivo ya tiene; si coincide no se reenvía el catálogo. */
  @IsOptional() @TextoSeguro() @IsString() @MaxLength(100) catalogoHashActual?: string;
  /** Hora local del dispositivo (ISO) para estimar el desfase de reloj. */
  @IsOptional() @FechaHoraIso() relojLocal?: string;
}

export class LineaContingenciaDto {
  @IsString() @IsNotEmpty() @MaxLength(100) @TextoSeguro() productoId: string;
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
  @FechaHoraIso() ocurridoAtLocal: string;
  @IsString() @IsNotEmpty() @TextoSeguro() cajeroId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineaContingenciaDto)
  lineas: LineaContingenciaDto[];
  // CENTINELA D: sin mínimo 1; un importe 0 lo clasifica el servicio (IMPORTE_INVALIDO) sin rechazar el lote entero.
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) totalCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) subtotalCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) isvCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) efectivoRecibidoCentavos: number;
  @IsInt() @Min(0) @Max(MAX_CENTAVOS) cambioCentavos: number;
  @IsOptional() @IsIn(['EFECTIVO']) metodoPago?: 'EFECTIVO';
  @IsOptional() @IsString() @MaxLength(200) @TextoSeguro() clienteNombre?: string;
  @IsOptional() @IsString() @MaxLength(100) @TextoSeguro() clienteRtn?: string;
  @IsOptional() @IsString() @MaxLength(100) @TextoSeguro() referenciaFacturaExterna?: string;
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
  @TextoLimpio() @TextoSeguro() @IsString() @MinimoSignificativo(10) @MaxLength(500) nota: string;
  /** Caja ABIERTA donde se aplica la venta al ACEPTAR. En CERRAR_MANUAL el efectivo va siempre a la caja del cajero que cobró. */
  @IsOptional() @IsString() @TextoSeguro() cajaId?: string;
  /** R-02: regularización excepcional para registrar el efectivo en la caja CERRADA del cajero que cobró. Exige motivo. */
  @IsOptional() @IsBoolean() regularizarCajaCerrada?: boolean;
  // H-3 (CENTINELA): el mínimo de 20 caracteres se cuenta sobre el texto recortado; espacios en blanco no son un motivo.
  @ValidateIf((o) => o.regularizarCajaCerrada === true) @TextoLimpio() @TextoSeguro() @IsString() @MinimoSignificativo(20) @MaxLength(500) motivoRegularizacion?: string;
  @IsOptional() @TextoLimpio() @TextoSeguro() @IsString() @MaxLength(100) referenciaFacturaExterna?: string;
}

export class ActualizarReferenciaDto {
  @TextoLimpio() @TextoSeguro() @IsString() @MaxLength(100) referenciaFacturaExterna: string;
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
