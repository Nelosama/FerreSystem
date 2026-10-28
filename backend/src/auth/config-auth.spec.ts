import { validarConfiguracionAuth } from './config-auth';

// Valores sintéticos: no son cuentas ni dominios reales.
const completa: Record<string, string> = {
  NODE_ENV: 'production',
  AUTH_MAIL_GMAIL_USER: 'seguridad@example.test',
  AUTH_MAIL_GMAIL_APP_PASSWORD: 'abcdabcdabcdabcd',
  AUTH_PUBLIC_URL: 'https://app.example.test',
};
const cfg = (valores: Record<string, string | undefined>) => ({ get: (k: string) => valores[k] }) as any;
const error = (valores: Record<string, string | undefined>) => { try { validarConfiguracionAuth(cfg(valores)); return ''; } catch (e) { return (e as Error).message; } };

describe('validarConfiguracionAuth (correo de seguridad por Gmail)', () => {
  it('acepta Gmail completo sin MFA ni Resend', () => {
    expect(error(completa)).toBe('');
    expect(error({ ...completa, AUTH_MFA_ENCRYPTION_KEY: undefined, AUTH_MAIL_RESEND_API_KEY: undefined })).toBe('');
  });

  it('no exige nada fuera de producción', () => {
    expect(error({ NODE_ENV: 'development' })).toBe('');
    expect(error({})).toBe('');
  });

  it('nombra cada variable que falta o es inválida, sin revelar valores', () => {
    const casos: [string, Record<string, string | undefined>][] = [
      ['AUTH_MAIL_GMAIL_USER', { ...completa, AUTH_MAIL_GMAIL_USER: undefined }],
      ['AUTH_MAIL_GMAIL_APP_PASSWORD', { ...completa, AUTH_MAIL_GMAIL_APP_PASSWORD: '  ' }],
      ['AUTH_MAIL_GMAIL_APP_PASSWORD', { ...completa, AUTH_MAIL_GMAIL_APP_PASSWORD: 'corta' }],
      ['AUTH_MAIL_GMAIL_USER', { ...completa, AUTH_MAIL_GMAIL_USER: 'sin-arroba' }],
      ['AUTH_PUBLIC_URL', { ...completa, AUTH_PUBLIC_URL: 'http://app.example.test' }],
      ['AUTH_PUBLIC_URL', { ...completa, AUTH_PUBLIC_URL: 'https://app.example.test/panel' }],
    ];
    for (const [variable, valores] of casos) {
      const mensaje = error(valores);
      expect(mensaje).toContain(variable);
      expect(mensaje).not.toContain('abcdabcdabcdabcd');
      expect(mensaje).not.toContain('corta');
    }
  });
});
