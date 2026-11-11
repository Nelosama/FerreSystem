import { IsString, IsNotEmpty, IsNumber, IsInt, Min, Max, MaxLength, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested, IsOptional, IsDateString, IsIn, ValidateIf } from 'class-validator';
import { PagoElectronicoDto } from '../../common/pago-electronico.dto';
import { ExcepcionPrecioDto } from '../../ventas/dto/create-venta.dto';
import { Type } from 'class-transformer';

import { IsBoolean } from 'class-validator';
import { TASAS_ISV_AUTORIZADAS, mensajeTasaNoAutorizada } from '../../common/politica-isv';

// Límites de entrada: los mismos topes que las columnas DECIMAL(12,2) y que la venta directa. Un valor fuera de rango
// responde 400 en la validación en vez de llegar a la base y devolver 500.
const MAXIMO_IMPORTE = 9999999999.99;
const MAXIMO_CANTIDAD = 99999999.99;
/** Una cotización puede ser más larga que una venta de mostrador (listas de obra), pero no ilimitada. */
export const MAXIMO_LINEAS_COTIZACION = 300;
export const METODOS_PAGO_CONVERSION = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CREDITO'] as const;
export const ESTADOS_COTIZACION_EDITABLES = ['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA'] as const;

export class DetalleCotizacionItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  productoId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'La cantidad debe ser mayor a cero' })
  @Max(MAXIMO_CANTIDAD)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAXIMO_CANTIDAD)
  @IsOptional()
  medida?: number;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAXIMO_IMPORTE)
  @IsOptional()
  precioUnitario?: number;

  // Sin tope de decimales: al editar, la pantalla recalcula el porcentaje y puede traer más de dos (p. ej. 11.1111).
  // El servicio lo redondea si es porcentaje y rechaza con 400 un monto con más de dos decimales.
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAXIMO_IMPORTE)
  @IsOptional()
  descuento?: number;

  @IsIn(['PORCENTAJE', 'MONTO'])
  @IsOptional()
  tipoDescuento?: 'PORCENTAJE' | 'MONTO';

  @IsBoolean()
  @IsOptional()
  exento?: boolean;
}

export class CreateCotizacionDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  clienteId?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  clienteNombre?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  clienteRtn?: string;

  @IsString()
  @MaxLength(60)
  @IsOptional()
  clienteTelefono?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  clienteEmail?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  clienteDireccion?: string;

  @IsDateString({}, { message: 'La fecha de validez debe ser una fecha ISO válida' })
  @IsOptional()
  fechaValidez?: string;

  @IsInt({ message: 'Los días de vigencia deben ser un número entero' })
  @Min(1)
  @Max(365, { message: 'La vigencia máxima de una cotización es de 365 días' })
  @IsOptional()
  diasValidez?: number;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  condicionesPago?: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAXIMO_IMPORTE)
  @IsOptional()
  descuentoGeneral?: number;

  @IsIn(['PORCENTAJE', 'MONTO'])
  @IsOptional()
  tipoDescuentoGeneral?: 'PORCENTAJE' | 'MONTO';

  // Solo tasas autorizadas (common/politica-isv.ts); el servicio vuelve a validarla. Antes se aceptaba cualquier valor ≥ 0, p. ej. 500.
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @IsIn([...TASAS_ISV_AUTORIZADAS], { message: mensajeTasaNoAutorizada })
  @ValidateIf((o) => o.porcentajeIsv !== undefined) // a diferencia de @IsOptional, null no se acepta como «sin tasa»
  porcentajeIsv?: number;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notas?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La cotización debe tener al menos un ítem' })
  @ArrayMaxSize(MAXIMO_LINEAS_COTIZACION, { message: `Una cotización admite hasta ${MAXIMO_LINEAS_COTIZACION} líneas` })
  @ValidateNested({ each: true })
  @Type(() => DetalleCotizacionItemDto)
  detalles: DetalleCotizacionItemDto[];
}

/** P3: regularización explícita de una cotización con tasa no autorizada (crea una nueva; la original no cambia). */
export class RegularizarIsvDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @IsIn([...TASAS_ISV_AUTORIZADAS], { message: mensajeTasaNoAutorizada })
  @ValidateIf((o) => o.porcentajeIsv !== undefined)
  porcentajeIsv?: number;
}

/** Cambio de estado: solo los estados que el usuario puede fijar; «CONVERTIDA» solo la produce la conversión a venta. */
export class EstadoCotizacionDto {
  @IsIn([...ESTADOS_COTIZACION_EDITABLES], { message: 'Estado de cotización no permitido; use convertir para generar una venta' })
  estado: (typeof ESTADOS_COTIZACION_EDITABLES)[number];
}

/** Conversión a venta: cuerpo validado (antes llegaba sin DTO y un valor de otro tipo terminaba en error 500). */
export class ConvertirCotizacionDto {
  @IsIn([...METODOS_PAGO_CONVERSION], { message: 'Método de pago inválido' })
  @IsOptional()
  metodoPago?: (typeof METODOS_PAGO_CONVERSION)[number];

  @IsOptional() @ValidateNested() @Type(() => PagoElectronicoDto) pagoElectronico?: PagoElectronicoDto;

  @IsOptional() @ValidateNested() @Type(() => ExcepcionPrecioDto) excepcionPrecio?: ExcepcionPrecioDto;
}
