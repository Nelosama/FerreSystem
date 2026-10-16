import type { Request, Response, NextFunction } from 'express';

// Toda la API contiene datos privados o de sesión. También cubre rechazos de guards.
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  next();
}
