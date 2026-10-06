import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateAbonoClienteDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) monto!: number;
  @IsOptional() @IsString() ventaId?: string;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsString() @MaxLength(50) metodo?: string;
  @IsOptional() @IsString() @MaxLength(2000) notas?: string;
}
