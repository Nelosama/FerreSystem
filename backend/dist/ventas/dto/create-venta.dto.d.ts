export declare enum MetodoPagoEnum {
    EFECTIVO = "EFECTIVO",
    TARJETA = "TARJETA",
    CREDITO = "CREDITO"
}
export declare class DetalleVentaItemDto {
    productoId: string;
    cantidad: number;
    precioUnitario?: number;
}
export declare class CreateVentaDto {
    clienteId?: string;
    metodoPago?: MetodoPagoEnum;
    descuento?: number;
    notas?: string;
    detalles: DetalleVentaItemDto[];
}
