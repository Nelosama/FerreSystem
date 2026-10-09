import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { IsAllowedPassword } from '../common/password-policy';

export class CreateTenantAdminDto {
  @IsString() @MinLength(1) nombre: string;
  @IsEmail() email: string;
  @IsString() @IsAllowedPassword() password: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpdateTenantAdminDto {
  @IsOptional() @IsString() @MinLength(1) nombre?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @IsAllowedPassword() password?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
