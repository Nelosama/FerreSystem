import { IsString, IsEmail, IsEnum, IsBoolean, IsOptional, MinLength } from 'class-validator';
import { Rol } from '@prisma/client';

export class CreateUsuarioDto {
  @IsString()
  nombre!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
