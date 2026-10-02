export declare enum UnidadMedidaEnum {
    UNIDAD = "UNIDAD",
    CAJA = "CAJA",
    METRO = "METRO",
    KG = "KG",
    GALON = "GALON",
    LIBRA = "LIBRA"
}
export declare class CreateProductoDto {
    codigo: string;
    codigoBarras?: string;
    nombre: string;
    descripcion?: string;
    categoriaId?: string;
    precioVenta: number;
    precioCosto: number;
    stockActual: number;
    stockMinimo: number;
    unidadMedida?: UnidadMedidaEnum;
}
export declare class UpdateProductoDto {
    codigo?: string;
    codigoBarras?: string;
    nombre?: string;
    descripcion?: string;
    categoriaId?: string;
    precioVenta?: number;
    precioCosto?: number;
    stockActual?: number;
    stockMinimo?: number;
    unidadMedida?: UnidadMedidaEnum;
}
