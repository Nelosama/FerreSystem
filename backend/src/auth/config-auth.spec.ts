import { validarConfiguracionAuth } from './config-auth';

// Valores sintéticos: no son claves ni dominios reales.
const completa: Record<string, string> = {
  NODE_ENV: 'production',
  AUTH_MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
  AUTH_MAIL_RESEND_API_KEY: 're_sintetica',
  AUTH_MAIL_FROM: 'Jowa <seguridad@example.test>',
  AUTH_PUBLIC_URL: 'https://app.example.test',
};
const cfg = (valores: Record<string, string | undefined>) => ({ get: (k: string) => valores[k] }) as any;

describe('validarConfiguracionAuth', () => {
  it('acepta una configuración de producción completa', () => {
    expect(() => validarConfiguracionAuth(cfg(completa))).not.toThrow();
  });

  it('no exige nada fuera de producción', () => {
    expect(() => validarConfiguracionAuth(cfg({ NODE_ENV: 'development' }))).not.toThrow();
    expect(() => validarConfiguracionAuth(cfg({}))).not.toThrow();
  });

  it('nombra cada variable que falta o es inválida, sin revelar valores', () => {
    const casos: [string, Record<string, string | undefined>][] = [
      ['AUTH_MFA_ENCRYPTION_KEY', { ...completa, AUTH_MFA_ENCRYPTION_KEY: 'corta-secreta' }],
      ['AUTH_MAIL_RESEND_API_KEY', { ...completa, AUTH_MAIL_RESEND_API_KEY: undefined }],
      ['AUTH_MAIL_FROM', { ...completa, AUTH_MAIL_FROM: '  ' }],
      ['AUTH_PUBLIC_URL', { ...completa, AUTH_PUBLIC_URL: 'http://app.example.test' }],
      ['AUTH_PUBLIC_URL', { ...completa, AUTH_PUBLIC_URL: 'https://app.example.test/panel' }],
      ['AUTH_PUBLIC_URL', { ...completa, AUTH_PUBLIC_URL: 'https://u:p@app.example.test' }],
    ];
    for (const [variable, valores] of casos) {
      const mensaje = (() => { try { validarConfiguracionAuth(cfg(valores)); return ''; } catch (e) { return (e as Error).message; } })();
      expect(mensaje).toContain(variable);
      expect(mensaje).not.toContain('corta-secreta');
      expect(mensaje).not.toContain('re_sintetica');
    }
  });
});
