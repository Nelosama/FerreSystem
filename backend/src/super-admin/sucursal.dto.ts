import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
export class EditarSucursalDto {
  @IsOptional() @IsString() @Length(1, 100) @Matches(/\S/, { message: 'Indique el nombre de la sucursal' }) nombre?: string;
  @IsOptional() @IsString() @MaxLength(500) direccion?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsBoolean() activa?: boolean;
}
export class SucursalDto extends EditarSucursalDto {
  @IsString() @Length(1, 100) @Matches(/\S/, { message: 'Indique el nombre de la sucursal' }) declare nombre: string;
}
