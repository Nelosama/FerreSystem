export declare enum EstadoLevantamientoEnum {
    BORRADOR = "BORRADOR",
    EN_PROGRESO = "EN_PROGRESO",
    REVISION = "REVISION",
    FINALIZADO = "FINALIZADO"
}
export declare class CreateLevantamientoDto {
    nombre: string;
    descripcion?: string;
    estado?: EstadoLevantamientoEnum;
}
export declare class UpdateLevantamientoDto {
    nombre?: string;
    descripcion?: string;
    estado?: EstadoLevantamientoEnum;
}
