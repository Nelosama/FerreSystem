import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_FILAS_IMPORTACION } from '../importacion-productos';

/**
 * Importación masiva de productos (todo o nada). Las filas se validan una a una en `importacion-productos.ts`
 * para devolver errores por número de fila; por eso `filas` no se valida con DTOs anidados.
 */
export class ImportarProductosDto {
  /** UUID v4 generado por el cliente al abrir la importación. Reintentar con el mismo archivo no duplica nada. */
  @IsUUID('4', { message: 'solicitudId debe ser un UUID v4 generado al abrir la importación' })
  solicitudId!: string;

  @IsArray({ message: 'filas debe ser una lista' })
  @ArrayMinSize(1, { message: 'El archivo no tiene filas' })
  @ArrayMaxSize(MAX_FILAS_IMPORTACION, { message: `Máximo ${MAX_FILAS_IMPORTACION} filas por importación` })
  filas!: Record<string, unknown>[];

  /** false (por defecto): los códigos que ya existen se omiten. true: se actualizan con los datos del archivo. */
  @IsOptional() @IsBoolean()
  sobrescribir?: boolean;

  /** Solo ADMIN. Aprueba los precios de venta que trae el archivo; sin esta marca quedan pendientes de aprobación. */
  @IsOptional() @IsBoolean()
  aprobarPrecios?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  motivo?: string;
}
