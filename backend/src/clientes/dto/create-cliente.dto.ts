import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, ValidateIf } from 'class-validator';
import { TipoCliente } from '../../types/prisma-enums';

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
  nombre: string;

  @IsString()
  @IsOptional()
  rtn?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsEnum(TipoCliente, { message: 'El tipo de cliente no es válido' })
  @IsOptional()
  tipo?: TipoCliente;
}

export class UpdateClienteDto {
  // Si se envía el campo (incluido null), debe ser texto no vacío: null responde 400, nunca 500.
  @ValidateIf((_, valor) => valor !== undefined)
  @IsString({ message: 'El nombre del cliente debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
  nombre?: string;

  @IsString()
  @IsOptional()
  rtn?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsEnum(TipoCliente, { message: 'El tipo de cliente no es válido' })
  @IsOptional()
  tipo?: TipoCliente;
}
