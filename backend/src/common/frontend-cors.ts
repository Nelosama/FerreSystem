import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

type FrontendEnvironment = { FRONTEND_URL?: string; FRONTEND_URLS?: string };

const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];

function frontendOrigin(value: string, variable: string): string {
  const candidate = value.trim();
  const invalid = () => new Error(`${variable} debe contener orígenes HTTP(S) exactos, sin rutas, comodines, credenciales, consultas ni fragmentos.`);
  // Comprobar la forma original: URL normaliza rutas como /path/.. y barras
  // invertidas, que no deben convertir una configuración inválida en un origen.
  if (!/^https?:\/\/[^/\\?#\s]+\/?$/i.test(candidate) || /[*@]/.test(candidate)) throw invalid();
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || parsed.hostname.includes('*')) throw invalid();
  return parsed.origin;
}

export function getAllowedFrontendOrigins(environment: FrontendEnvironment = process.env): string[] {
  const origins = new Set(localOrigins);
  if (environment.FRONTEND_URL?.trim()) origins.add(frontendOrigin(environment.FRONTEND_URL, 'FRONTEND_URL'));
  for (const value of (environment.FRONTEND_URLS || '').split(',')) {
    if (value.trim()) origins.add(frontendOrigin(value, 'FRONTEND_URLS'));
  }
  return [...origins];
}

export function createFrontendCorsOptions(environment: FrontendEnvironment = process.env): CorsOptions {
  const origins = new Set(getAllowedFrontendOrigins(environment));
  return {
    origin: (origin, callback) => callback(null, !origin || origins.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  };
}
