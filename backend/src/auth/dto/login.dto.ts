import { IsNotEmpty, IsOptional, IsString, MinLength, MaxLength, ValidateIf } from 'class-validator';

/**
 * Inicio de sesión con dos campos: «Usuario» (usuario, código o correo) y «Contraseña».
 * La empresa y el rol los determina el servidor a partir de la cuenta; ya no se envían.
 */
export class LoginDto {
  @ValidateIf((o) => o.email === undefined)
  @IsString()
  @MaxLength(254)
  @IsNotEmpty({ message: 'El usuario es requerido' })
  usuario?: string;

  /** Alias retirado del contrato público: clientes anteriores que aún envían `email` siguen funcionando. */
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(128)
  password: string;
}
