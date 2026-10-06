import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantAdminDto {
  @IsString() @MinLength(1) nombre: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpdateTenantAdminDto {
  @IsOptional() @IsString() @MinLength(1) nombre?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
