import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProveedorDto {
  @IsString() @MaxLength(200) nombre!: string;
  @IsOptional() @IsString() @MaxLength(200) contacto?: string;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
}

export class UpdateProveedorDto {
  @IsOptional() @IsString() @MaxLength(200) nombre?: string;
  @IsOptional() @IsString() @MaxLength(200) contacto?: string;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
}
