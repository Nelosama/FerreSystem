import { aceptaTokenSinSesion, leerConfiguracionAuth, validarConfiguracionAuth } from './auth-config';

const AHORA = Date.parse('2026-10-11T12:00:00Z');
const en = (horas: number) => new Date(AHORA + horas * 3_600_000).toISOString();

describe('auth-config / transición de tokens sin sesión', () => {
  it('en producción el valor por defecto rechaza tokens sin sesión', () => {
    const cfg = leerConfiguracionAuth({ get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined) });
    expect(aceptaTokenSinSesion(cfg, AHORA)).toBe(false);
  });

  it('en producción, aceptar exige una fecha límite; sin fecha no acepta', () => {
    const cfg = leerConfiguracionAuth({ get: (k: string) => (k === 'NODE_ENV' ? 'production' : k === 'AUTH_ACEPTAR_TOKENS_SIN_SESION' ? 'true' : undefined) });
    expect(aceptaTokenSinSesion(cfg, AHORA)).toBe(false);
  });

  it('la transición se corta en la fecha límite aunque el proceso siga vivo', () => {
    const cfg = leerConfiguracionAuth({ get: (k: string) => (k === 'NODE_ENV' ? 'production' : k === 'AUTH_ACEPTAR_TOKENS_SIN_SESION' ? 'true' : k === 'AUTH_TOKENS_SIN_SESION_HASTA' ? en(2) : undefined) });
    expect(aceptaTokenSinSesion(cfg, AHORA)).toBe(true);
    expect(aceptaTokenSinSesion(cfg, AHORA + 3 * 3_600_000)).toBe(false);
  });

  it('en producción, arrancar con transición sin fecha falla', () => {
    expect(() => validarConfiguracionAuth({ NODE_ENV: 'production', AUTH_ACEPTAR_TOKENS_SIN_SESION: 'true' }, AHORA)).toThrow(/exige AUTH_TOKENS_SIN_SESION_HASTA/);
  });

  it('en producción, la fecha límite no puede estar en el pasado ni pasar de 24 horas', () => {
    expect(() => validarConfiguracionAuth({ NODE_ENV: 'production', AUTH_ACEPTAR_TOKENS_SIN_SESION: 'true', AUTH_TOKENS_SIN_SESION_HASTA: en(-1) }, AHORA)).toThrow(/futura de máximo 24 horas/);
    expect(() => validarConfiguracionAuth({ NODE_ENV: 'production', AUTH_ACEPTAR_TOKENS_SIN_SESION: 'true', AUTH_TOKENS_SIN_SESION_HASTA: en(25) }, AHORA)).toThrow(/futura de máximo 24 horas/);
  });

  it('en producción, una transición con fecha válida arranca', () => {
    expect(() => validarConfiguracionAuth({ NODE_ENV: 'production', AUTH_ACEPTAR_TOKENS_SIN_SESION: 'true', AUTH_TOKENS_SIN_SESION_HASTA: en(12) }, AHORA)).not.toThrow();
  });

  it('un valor distinto de true/false impide arrancar', () => {
    expect(() => validarConfiguracionAuth({ AUTH_ACEPTAR_TOKENS_SIN_SESION: 'si' }, AHORA)).toThrow(/"true" o "false"/);
  });

  it('fuera de producción, la transición sigue disponible para desarrollo y pruebas', () => {
    expect(aceptaTokenSinSesion(leerConfiguracionAuth({ get: () => undefined }), AHORA)).toBe(true);
    expect(aceptaTokenSinSesion(leerConfiguracionAuth({ get: (k: string) => (k === 'AUTH_ACEPTAR_TOKENS_SIN_SESION' ? 'false' : undefined) }), AHORA)).toBe(false);
  });
});
