import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAbonoClienteDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  ventaId?: string;

  @IsOptional()
  @IsString()
  metodo?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
