import { IsNotEmpty, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(254)
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantId?: string;

  @IsOptional() @IsString() @MaxLength(64)
  mfaCode?: string;
}
