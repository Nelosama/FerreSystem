import type { CookieOptions } from 'express';

type Config = { get(key: string): unknown };
// Al borrar una cookie cross-site se conservan Secure/SameSite y su ruta original.
export function refreshCookieOptions(config: Config, admin = false): CookieOptions {
  const production = config.get('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : admin ? 'lax' : 'strict',
    path: admin ? '/api/admin/auth' : '/',
  };
}
