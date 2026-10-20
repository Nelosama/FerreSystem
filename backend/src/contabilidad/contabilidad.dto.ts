import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const importe = () => IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false });

export class ConfiguracionFiscalDto {
  @IsOptional() @IsString() @Length(0, 20) rtn?: string | null;
  @IsString() @Length(1, 200) razonSocial!: string;
  @IsOptional() @IsString() @Length(0, 200) nombreComercial?: string;
  @IsBoolean() agenteRetencion!: boolean;
  @IsOptional() @IsString() @Length(0, 1000) notas?: string;
  @IsString() @Length(3, 500) motivo!: string;
}

export class TasaDto {
  @IsIn(['GENERAL', 'ESPECIAL']) categoria!: 'GENERAL' | 'ESPECIAL';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99.99) porcentaje!: number;
  @Matches(FECHA) vigenteDesde!: string;
  @IsOptional() @Matches(FECHA) vigenteHasta?: string;
  @IsString() @Length(3, 500) baseLegal!: string;
}

export class CerrarVigenciaDto {
  @Matches(FECHA) vigenteHasta!: string;
  @IsString() @Length(3, 500) motivo!: string;
}

export class ReglaRetencionDto {
  @Matches(/^[A-Z0-9_-]{2,30}$/) codigo!: string;
  @IsIn(['ISV', 'ISR']) impuesto!: 'ISV' | 'ISR';
  @IsString() @Length(3, 300) descripcion!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) porcentaje!: number;
  @IsIn(['IMPUESTO', 'BASE_GRAVABLE', 'TOTAL']) baseCalculo!: 'IMPUESTO' | 'BASE_GRAVABLE' | 'TOTAL';
  @Matches(FECHA) vigenteDesde!: string;
  @IsOptional() @Matches(FECHA) vigenteHasta?: string;
  @IsString() @Length(3, 500) baseLegal!: string;
}

export class CaiDto {
  @IsString() @Length(6, 60) cai!: string;
  @Matches(/^\d{2}$/) tipoDocumento!: string;
  @Matches(/^\d{3}$/) establecimiento!: string;
  @Matches(/^\d{3}$/) puntoEmision!: string;
  @IsInt() @Min(1) @Max(99999999) rangoInicial!: number;
  @IsInt() @Min(1) @Max(99999999) rangoFinal!: number;
  @Matches(FECHA) fechaLimiteEmision!: string;
}

export class MotivoDto {
  @IsString() @Length(3, 500) motivo!: string;
}

export class ImportesDto {
  @IsOptional() @importe() @Min(0) importeExento?: number;
  @IsOptional() @importe() @Min(0) importeExonerado?: number;
  @IsOptional() @importe() @Min(0) importeGravadoGeneral?: number;
  @IsOptional() @importe() @Min(0) importeGravadoEspecial?: number;
  @IsOptional() @importe() @Min(0) isvGeneral?: number;
  @IsOptional() @importe() @Min(0) isvEspecial?: number;
}

export class DocumentoFiscalDto extends ImportesDto {
  @IsIn(['EMITIDO', 'RECIBIDO']) direccion!: 'EMITIDO' | 'RECIBIDO';
  @Matches(/^\d{2}$/) tipoDocumento!: string;
  @IsString() @Length(19, 19) numero!: string;
  @IsOptional() @IsString() @Length(6, 60) cai?: string;
  @Matches(FECHA) fechaEmision!: string;
  @IsOptional() @IsString() @Length(0, 20) rtnContraparte?: string;
  @IsOptional() @IsString() @Length(0, 200) nombreContraparte?: string;
  @IsOptional() @IsString() @Length(1, 64) ventaId?: string;
  @IsOptional() @IsString() @Length(1, 64) ordenCompraId?: string;
  @IsOptional() @IsString() @Length(1, 64) documentoReferenciaId?: string;
  /** Con ventaId u ordenCompraId y sin importes, se toman de la operación registrada. */
  @IsOptional() @IsBoolean() importesDeOperacion?: boolean;
}

export class CorreccionDocumentoDto extends ImportesDto {
  @IsOptional() @IsString() @Length(0, 20) rtnContraparte?: string;
  @IsOptional() @IsString() @Length(1, 200) nombreContraparte?: string;
  @IsOptional() @IsString() @Length(6, 60) cai?: string;
  @IsOptional() @Matches(FECHA) fechaEmision?: string;
  @IsString() @Length(3, 500) motivo!: string;
}

export class RetencionDto {
  @IsString() @Length(1, 64) reglaId!: string;
  @IsIn(['EFECTUADA', 'SUFRIDA']) tipo!: 'EFECTUADA' | 'SUFRIDA';
  @Matches(FECHA) fecha!: string;
  @IsOptional() @Matches(/^\d{3}-\d{3}-\d{2}-\d{8}$/) comprobanteNumero?: string;
}

export class CuentaDto {
  @Matches(/^[0-9]{1,6}(\.[0-9]{1,6}){0,6}$/) codigo!: string;
  @IsString() @Length(2, 150) nombre!: string;
  @IsIn(['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'COSTO', 'GASTO']) tipo!: string;
  @IsIn(['DEUDORA', 'ACREEDORA']) naturaleza!: string;
  @IsOptional() @IsString() @Length(1, 64) padreId?: string;
  @IsOptional() @IsBoolean() aceptaMovimientos?: boolean;
}

export class LineaAsientoDto {
  @IsString() @Length(1, 64) cuentaId!: string;
  @IsOptional() @importe() @Min(0) debe?: number;
  @IsOptional() @importe() @Min(0) haber?: number;
  @IsOptional() @IsString() @Length(0, 200) descripcion?: string;
}

export class AsientoDto {
  @Matches(FECHA) fecha!: string;
  @IsString() @Length(3, 300) concepto!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineaAsientoDto) lineas!: LineaAsientoDto[];
}

export class ReversionDto {
  @Matches(FECHA) fecha!: string;
  @IsString() @Length(3, 500) motivo!: string;
}
