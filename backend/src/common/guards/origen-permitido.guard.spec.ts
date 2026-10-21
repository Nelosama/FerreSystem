import { ForbiddenException } from '@nestjs/common';
import { OrigenPermitidoGuard } from './origen-permitido.guard';

const contexto = (headers: Record<string, string>) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as any;

describe('OrigenPermitidoGuard (H-05)', () => {
  const guard = new OrigenPermitidoGuard();
  const anterior = { FRONTEND_URL: process.env.FRONTEND_URL, FRONTEND_URLS: process.env.FRONTEND_URLS };
  beforeEach(() => { process.env.FRONTEND_URL = 'https://app.ferreteria.example'; delete process.env.FRONTEND_URLS; });
  afterAll(() => { for (const [k, v] of Object.entries(anterior)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  it('acepta el frontend configurado y los orígenes locales de desarrollo', () => {
    expect(guard.canActivate(contexto({ origin: 'https://app.ferreteria.example' }))).toBe(true);
    expect(guard.canActivate(contexto({ origin: 'http://localhost:5173' }))).toBe(true);
  });

  it('rechaza otro sitio, un subdominio parecido y el origen opaco «null»', () => {
    for (const origin of ['https://atacante.example', 'https://app.ferreteria.example.atacante.example', 'http://app.ferreteria.example', 'null']) {
      expect(() => guard.canActivate(contexto({ origin }))).toThrow(ForbiddenException);
    }
  });

  it('sin Origin: rechaza Sec-Fetch-Site cross-site y deja pasar clientes sin navegador', () => {
    expect(() => guard.canActivate(contexto({ 'sec-fetch-site': 'cross-site' }))).toThrow(ForbiddenException);
    expect(guard.canActivate(contexto({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(guard.canActivate(contexto({}))).toBe(true);
  });
});
