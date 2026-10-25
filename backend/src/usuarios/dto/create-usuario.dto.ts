import { IsString, IsEmail, IsEnum, IsBoolean, IsOptional, IsArray, IsNumber, Min, Max, ArrayMaxSize, Matches, MaxLength } from 'class-validator';
import { IsAllowedPassword } from '../../common/password-policy';
import { Rol } from '../../types/prisma-enums';

export class CreateUsuarioDto {
  @IsOptional() @IsString() @MaxLength(64) @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/)
  username?: string;
  @IsString()
  nombre!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

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

