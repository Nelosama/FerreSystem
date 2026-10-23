import { IsString, IsOptional, MaxLength, IsIn, IsNotEmpty } from 'class-validator';
import { IsAllowedPassword } from '../../common/password-policy';

export class RecoveryRequestDto {
  @IsString() @IsNotEmpty() @MaxLength(254) email: string;
  @IsOptional() @IsString() @MaxLength(100) tenantId?: string;
  @IsIn(['tenant', 'super_admin']) scope: 'tenant' | 'super_admin';
}
export class ActionDto {
  @IsString() @IsNotEmpty() @MaxLength(100) token: string;
  @IsOptional() @IsString() @MaxLength(64) mfaCode?: string;
}
export class ResetDto extends ActionDto {
  @IsAllowedPassword() password: string;
}
export class ChangePasswordDto {
  @IsString() @IsNotEmpty() @MaxLength(128) currentPassword: string;
  @IsAllowedPassword() password: string;
  @IsOptional() @IsString() @MaxLength(64) mfaCode?: string;
}
export class AdminResetDto {
  @IsString() @IsNotEmpty() @MaxLength(100) usuarioId: string;
  @IsOptional() @IsString() @MaxLength(100) tenantId?: string;
  @IsString() @IsNotEmpty() @MaxLength(128) currentPassword: string;
  @IsOptional() @IsString() @MaxLength(64) mfaCode?: string;
}
export class EnrollMfaDto {
  @IsString() @IsNotEmpty() @MaxLength(128) currentPassword: string;
}
export class ConfirmMfaDto extends ActionDto {
  @IsString() @MaxLength(128) secret: string;
}
export class BootstrapMfaDto extends ActionDto {
  @IsString() @IsNotEmpty() @MaxLength(128) currentPassword: string;
}
