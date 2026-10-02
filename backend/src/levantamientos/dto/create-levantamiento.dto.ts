import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export enum EstadoLevantamientoEnum {
  BORRADOR = 'BORRADOR',
  EN_PROGRESO = 'EN_PROGRESO',
  REVISION = 'REVISION',
  FINALIZADO = 'FINALIZADO',
}

export class CreateLevantamientoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del levantamiento es requerido' })
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsEnum(EstadoLevantamientoEnum, { message: 'Estado de levantamiento no válido' })
  @IsOptional()
  estado?: EstadoLevantamientoEnum;
}

export class UpdateLevantamientoDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsEnum(EstadoLevantamientoEnum, { message: 'Estado de levantamiento no válido' })
  @IsOptional()
  estado?: EstadoLevantamientoEnum;
}
