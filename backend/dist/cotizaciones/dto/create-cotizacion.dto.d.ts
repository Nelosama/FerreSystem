export declare class DetalleCotizacionItemDto {
    productoId: string;
    cantidad: number;
    medida?: number;
    precioUnitario?: number;
    descuento?: number;
    tipoDescuento?: 'PORCENTAJE' | 'MONTO';
    exento?: boolean;
}
export declare class CreateCotizacionDto {
    clienteId?: string;
    clienteNombre?: string;
    clienteRtn?: string;
    clienteTelefono?: string;
    clienteEmail?: string;
    clienteDireccion?: string;
    fechaValidez?: string;
    diasValidez?: number;
    condicionesPago?: string;
    descuentoGeneral?: number;
    tipoDescuentoGeneral?: 'PORCENTAJE' | 'MONTO';
    porcentajeIsv?: number;
    notas?: string;
    detalles: DetalleCotizacionItemDto[];
}
