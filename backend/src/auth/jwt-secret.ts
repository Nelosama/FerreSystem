import { ConfigService } from '@nestjs/config';

// Secreto público: quien lo conozca puede firmar tokens válidos. Solo se usa en desarrollo y pruebas locales.
const SECRETO_DESARROLLO = 'ferresystem-super-secure-dev-secret-key-2026';
const SECRETO_EJEMPLO = 'cambiar-por-un-secreto-seguro-de-al-menos-32-caracteres';
const ENTORNOS_CON_SECRETO_LOCAL = ['development', 'test'];

export const getJwtSecret = (config: ConfigService): string => {
  const secret = config.get<string>('JWT_SECRET');
  // Cualquier entorno distinto (incluido NODE_ENV sin definir) exige JWT_SECRET: un despliegue que olvide la variable no arranca.
  const entorno = String(config.get('NODE_ENV') ?? '').trim().toLowerCase();
  const local = ENTORNOS_CON_SECRETO_LOCAL.includes(entorno);
  if (secret?.trim()) {
    if (!local && [SECRETO_DESARROLLO, SECRETO_EJEMPLO].includes(secret.trim())) {
      throw new Error('JWT_SECRET no puede ser un secreto público de desarrollo o de ejemplo');
    }
    // No recortar una clave válida: cambiar sus bytes invalidaría las sesiones existentes.
    return secret;
  }
  if (local) return SECRETO_DESARROLLO;
  throw new Error('JWT_SECRET es obligatorio fuera de desarrollo y pruebas');
};
