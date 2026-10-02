import { ConfigService } from '@nestjs/config';

export const getJwtSecret = (config: ConfigService): string => {
  const secret = config.get<string>('JWT_SECRET');
  if (secret) return secret;
  if (config.get('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
  return 'ferresystem-super-secure-dev-secret-key-2026';
};
