import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class LineaEntregaDto {
  @IsString() @IsNotEmpty() detalleId!: string;
  /** Unidades, con hasta dos decimales. */
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) cantidad!: number;
}

export class EntregarLineasDto {
  /** Se genera al abrir el formulario y se conserva en los reintentos. */
  @IsUUID('4') solicitudId!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) receptorNombre!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineaEntregaDto) lineas!: LineaEntregaDto[];
}

export class PrepararLineasDto {
  @IsUUID('4') solicitudId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineaEntregaDto) lineas!: LineaEntregaDto[];
}

export class LiberarLineasDto {
  @IsUUID('4') solicitudId!: string;
  @IsString() @MinLength(10) @MaxLength(500) motivo!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineaEntregaDto) lineas!: LineaEntregaDto[];
}
