import { IsBoolean, IsString, IsNotEmpty } from 'class-validator';

export class SupportTokenDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  usuarioId: string;

  @IsBoolean()
  readOnly: boolean;
}
