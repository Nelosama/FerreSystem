import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsAllowedPassword } from '../../common/password-policy';

export class AsignarPasswordDto {
  @IsAllowedPassword()
  password!: string;

  /** Contraseña del Super Admin que hace el cambio (reautenticación). */
  @IsString() @IsNotEmpty() @MaxLength(128)
  currentPassword!: string;
}
