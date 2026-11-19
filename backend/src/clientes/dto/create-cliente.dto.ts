import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { TipoCliente } from '../../types/prisma-enums';

export class CreateClienteDto {
  /** A-02: clave de reintento (UUID v4) que genera la pantalla al iniciar el alta. Opcional por compatibilidad. */
  @IsUUID('4', { message: 'La clave de solicitud debe ser un UUID v4' })
  @IsOptional()
  solicitudId?: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
  @MaxLength(200, { message: 'El nombre del cliente no puede superar 200 caracteres' })
  nombre: string;

  // Solo se limita el largo (igual que en la venta); el formato del RTN es una decisión fiscal pendiente.
  @IsString()
  @MaxLength(100, { message: 'El RTN no puede superar 100 caracteres' })
  @IsOptional()
  rtn?: string;

  @IsString()
  @MaxLength(50, { message: 'El teléfono no puede superar 50 caracteres' })
  @IsOptional()
  telefono?: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @MaxLength(500, { message: 'La dirección no puede superar 500 caracteres' })
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
  @MaxLength(200, { message: 'El nombre del cliente no puede superar 200 caracteres' })
  nombre?: string;

  @IsString()
  @MaxLength(100, { message: 'El RTN no puede superar 100 caracteres' })
  @IsOptional()
  rtn?: string;

  @IsString()
  @MaxLength(50, { message: 'El teléfono no puede superar 50 caracteres' })
  @IsOptional()
  telefono?: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @MaxLength(500, { message: 'La dirección no puede superar 500 caracteres' })
  @IsOptional()
  direccion?: string;

  @IsEnum(TipoCliente, { message: 'El tipo de cliente no es válido' })
  @IsOptional()
  tipo?: TipoCliente;
}
