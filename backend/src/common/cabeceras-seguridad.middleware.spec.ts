import express from 'express';
import request from 'supertest';
import { crearCabecerasSeguridad } from './cabeceras-seguridad.middleware';

const app = (produccion: boolean) => {
  const a = express();
  a.disable('x-powered-by');
  a.use(crearCabecerasSeguridad(produccion));
  a.get('/api/x', (_req, res) => res.json({ ok: true }));
  return a;
};

describe('cabeceras de seguridad de la API', () => {
  it('toda respuesta lleva nosniff, sin incrustación, sin referer y una CSP que no permite nada', async () => {
    const res = await request(app(false)).get('/api/x').expect(200);
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('también en rutas inexistentes, y HSTS solo en producción', async () => {
    const res = await request(app(true)).get('/api/no-existe').expect(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBe('max-age=63072000');
  });
});
