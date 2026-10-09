import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID } from 'class-validator';

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

  /** FS-06 fase 2: clave de solicitud para reintentos seguros (la genera el cliente una vez por creación). */
  @IsUUID('4', { message: 'La clave de solicitud debe ser un UUID v4' })
  @IsOptional()
  solicitudId?: string;

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
