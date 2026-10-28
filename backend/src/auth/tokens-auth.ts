import { createHash, randomBytes } from 'node:crypto';

/** Hash SHA-256 de tokens y contraseñas temporales: en la base solo se guarda el hash, nunca el valor. */
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
/** Token opaco de un solo uso (enlaces privados, cambio obligatorio). */
export const opaqueToken = () => randomBytes(32).toString('base64url');
