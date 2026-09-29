import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateLevantamientoItemDto {
  @IsString()
  @IsNotEmpty({ message: 'La descripción del item es requerida' })
  descripcion: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número válido' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  cantidad: number;

  @IsString()
  @IsOptional()
  unidad?: string;

  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  @IsOptional()
  marca?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  notas?: string;
}

export class UpdateLevantamientoItemDto {
  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número válido' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  @IsOptional()
  cantidad?: number;

  @IsString()
  @IsOptional()
  unidad?: string;

  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  @IsOptional()
  marca?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  notas?: string;
}
