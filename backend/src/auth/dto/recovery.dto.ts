import { IsString, IsOptional, MaxLength, IsNotEmpty, ValidateIf } from 'class-validator';
import { IsAllowedPassword } from '../../common/password-policy';

/** Recuperación de Admin/Super Admin: solo el identificador (usuario, código o correo). No hay selector de rol ni de empresa. */
export class RecoveryRequestDto {
  @ValidateIf((o) => o.email === undefined)
  @IsString() @IsNotEmpty() @MaxLength(254) usuario?: string;
  /** Alias de clientes anteriores. */
  @IsOptional() @IsString() @MaxLength(254) email?: string;
  /** Solo desde un enlace privado de empresa; acota la búsqueda a ese negocio. */
  @IsOptional() @IsString() @MaxLength(100) tenantId?: string;
}
/** `mfaCode` se conserva solo por compatibilidad con clientes anteriores: el MFA está retirado y el servidor lo ignora. */
export class ActionDto {
  @IsString() @IsNotEmpty() @MaxLength(100) token: string;
  @IsOptional() @IsString() @MaxLength(64) mfaCode?: string;
}
export class ResetDto extends ActionDto {
  @IsAllowedPassword() password: string;
}
/** Contraseña nueva obligatoria tras entrar con la temporal. */
export class ForcedChangeDto extends ActionDto {
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
export class UnlockDto {
  @IsString() @IsNotEmpty() @MaxLength(100) usuarioId: string;
  @IsOptional() @IsString() @MaxLength(100) tenantId?: string;
}
