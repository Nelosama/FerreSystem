import { IsOptional, IsString, MaxLength } from 'class-validator';

// Autorización bancaria que el cajero registra tras la aprobación del POS físico (sin integración bancaria).
export class PagoElectronicoDto {
  @IsOptional() @IsString() @MaxLength(40) referencia?: string;
  @IsOptional() @IsString() @MaxLength(40) terminal?: string;
}
