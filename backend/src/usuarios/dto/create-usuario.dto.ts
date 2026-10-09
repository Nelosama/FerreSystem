import { IsString, IsEmail, IsEnum, IsBoolean, IsOptional, MinLength, IsArray, IsNumber, Min, Max, ArrayMaxSize } from 'class-validator';
import { IsAllowedPassword } from '../../common/password-policy';
import { Rol } from '@prisma/client';

export class CreateUsuarioDto {
  @IsString()
  nombre!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @IsAllowedPassword()
  password?: string;

  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({each:true}) permisos?: string[];
  @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) descuentoMaximo?: number;
}

