import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { TipoCliente } from '@prisma/client';

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
  @IsString()
  @IsOptional()
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
