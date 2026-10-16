import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateProveedorDto {
  @IsString() @MaxLength(200) nombre!: string;
  @IsOptional() @IsString() @MaxLength(30) rtn?: string;
  @IsOptional() @IsString() @MaxLength(200) contacto?: string;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
}

/** Edición parcial: un campo ausente no cambia; una cadena vacía borra los datos opcionales. */
export class UpdateProveedorDto {
  @IsOptional() @IsString() @MaxLength(200) nombre?: string;
  @IsOptional() @IsString() @MaxLength(30) rtn?: string;
  @IsOptional() @IsString() @MaxLength(200) contacto?: string;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
  /** true reactiva un proveedor desactivado; la desactivación se hace con DELETE. */
  @IsOptional() @IsBoolean() activo?: boolean;
}
