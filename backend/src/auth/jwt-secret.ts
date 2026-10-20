import { ConfigService } from '@nestjs/config';

// Secreto público: quien lo conozca puede firmar tokens válidos. Solo se usa en desarrollo y pruebas locales.
const SECRETO_DESARROLLO = 'ferresystem-super-secure-dev-secret-key-2026';
const ENTORNOS_CON_SECRETO_LOCAL = ['development', 'test'];

export const getJwtSecret = (config: ConfigService): string => {
  const secret = config.get<string>('JWT_SECRET');
  if (secret) return secret;
  // Cualquier entorno distinto (incluido NODE_ENV sin definir) exige JWT_SECRET: un despliegue que olvide la variable no arranca.
  const entorno = String(config.get('NODE_ENV') ?? '').trim().toLowerCase();
  if (ENTORNOS_CON_SECRETO_LOCAL.includes(entorno)) return SECRETO_DESARROLLO;
  throw new Error('JWT_SECRET es obligatorio fuera de desarrollo y pruebas');
};
