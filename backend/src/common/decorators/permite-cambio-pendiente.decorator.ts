import { SetMetadata } from '@nestjs/common';

export const PERMITE_CAMBIO_PENDIENTE = 'permiteCambioPendiente';
/** La ruta sigue disponible mientras la cuenta debe establecer una contraseña nueva (perfil y cambio de contraseña). */
export const PermiteCambioPendiente = () => SetMetadata(PERMITE_CAMBIO_PENDIENTE, true);
