import { SetMetadata } from '@nestjs/common';

export const PERMITE_SOPORTE_SOLO_LECTURA = 'permiteSoporteSoloLectura';

/**
 * Marca una ruta que una sesión de soporte de solo lectura puede llamar aunque sea de escritura.
 * Úsese solo para acciones que reducen privilegio (p. ej. finalizar el soporte) y que se auditan en el propio handler.
 */
export const PermiteSoporteSoloLectura = () => SetMetadata(PERMITE_SOPORTE_SOLO_LECTURA, true);
