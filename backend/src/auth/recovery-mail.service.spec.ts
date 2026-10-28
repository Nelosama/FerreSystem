import { ServiceUnavailableException } from '@nestjs/common';
import { GMAIL_SMTP_HOST, GMAIL_SMTP_PORT, PLAZO_CORREO_MS, RecoveryMailService, validarConfiguracionCorreo } from './recovery-mail.service';

// Transporte SMTP simulado: ninguna prueba abre conexiones ni envía correo real. Valores sintéticos, nunca credenciales reales.
const CLAVE = 'abcdwxyzabcdwxyz';
const entorno = (extra: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'production', AUTH_MAIL_GMAIL_USER: 'seguridad.jowa@example.test', AUTH_MAIL_GMAIL_APP_PASSWORD: 'abcd wxyz abcd wxyz',
  AUTH_PUBLIC_URL: 'https://jowa.example.test', ...extra,
});
function montar(extra: Record<string, string | undefined> = {}, sendMail = vi.fn().mockResolvedValue({ messageId: 'sintetico' })) {
  const valores = entorno(extra);
  const config: any = { get: (clave: string) => (valores as any)[clave] };
  const close = vi.fn();
  const fabrica = vi.fn(() => ({ sendMail, close }));
  return { servicio: new RecoveryMailService(config, fabrica), fabrica, sendMail, close };
}

describe('RecoveryMailService (Gmail SMTP con contraseña de aplicación)', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('usa smtp.gmail.com:465 con TLS implícito verificado, la contraseña de aplicación sin espacios y el remitente de la cuenta dedicada', async () => {
    const fetchEspia = vi.spyOn(globalThis, 'fetch');
    const { servicio, fabrica, sendMail, close } = montar();
    await servicio.sendTemporaryPassword('admin@negocio.test', 'AbCd-EfGh-JkMn-PqRs');
    expect(fabrica).toHaveBeenCalledWith(expect.objectContaining({
      host: GMAIL_SMTP_HOST, port: GMAIL_SMTP_PORT, secure: true,
      auth: { user: 'seguridad.jowa@example.test', pass: CLAVE },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: 'smtp.gmail.com' },
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
      connectionTimeout: PLAZO_CORREO_MS, greetingTimeout: PLAZO_CORREO_MS, socketTimeout: PLAZO_CORREO_MS,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Jowa System" <seguridad.jowa@example.test>', to: 'admin@negocio.test' }));
    expect(sendMail.mock.calls[0][0].text).toContain('AbCd-EfGh-JkMn-PqRs');
    expect(sendMail.mock.calls[0][0].text).toContain('https://jowa.example.test/login');
    expect(close).toHaveBeenCalled();
    // Ningún otro proveedor: no hay llamadas HTTP (Resend ni ningún otro).
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('los enlaces llevan el token en el fragmento (no en la consulta) y el negocio como ?empresa=', async () => {
    const { servicio, sendMail } = montar();
    await servicio.send('admin@negocio.test', 'token-sintetico', 'VERIFY_EMAIL', 'tenant-1');
    const enlace = String(sendMail.mock.calls[0][0].text).split('\n')[1];
    const url = new URL(enlace);
    expect(url.origin + url.pathname).toBe('https://jowa.example.test/login');
    expect(url.searchParams.get('empresa')).toBe('tenant-1');
    expect(url.searchParams.get('token')).toBeNull();
    expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe('token-sintetico');
  });

  it('un fallo del servidor SMTP responde 503 genérico, sin reenviar la respuesta del servidor ni la contraseña', async () => {
    const fallo = Object.assign(new Error(`535-5.7.8 Username and Password not accepted for seguridad.jowa@example.test ${CLAVE}`), { response: `535 ${CLAVE}` });
    const { servicio, close } = montar({}, vi.fn().mockRejectedValue(fallo));
    const error: any = await servicio.sendTemporaryPassword('admin@negocio.test', 'AbCd-EfGh-JkMn-PqRs').catch(e => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe('Correo de seguridad temporalmente no disponible');
    expect(JSON.stringify(error.getResponse())).not.toMatch(new RegExp(`${CLAVE}|535|seguridad\\.jowa|AbCd-EfGh`));
    expect(error.cause).toBeUndefined();
    expect(close).toHaveBeenCalled();
  });

  it('un servidor que no responde se corta a los 8 s con el mismo error genérico', async () => {
    vi.useFakeTimers();
    const { servicio } = montar({}, vi.fn(() => new Promise(() => undefined)));
    const promesa = servicio.send('admin@negocio.test', 'token-sintetico', 'VERIFY_EMAIL').catch(e => e);
    await vi.advanceTimersByTimeAsync(PLAZO_CORREO_MS);
    expect(await promesa).toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    ['sin usuario', { AUTH_MAIL_GMAIL_USER: undefined }],
    ['sin contraseña de aplicación', { AUTH_MAIL_GMAIL_APP_PASSWORD: undefined }],
    ['contraseña que no es de aplicación', { AUTH_MAIL_GMAIL_APP_PASSWORD: 'mi-clave-normal' }],
    ['usuario que no es una dirección', { AUTH_MAIL_GMAIL_USER: 'seguridad' }],
    ['origen público sin HTTPS', { AUTH_PUBLIC_URL: 'http://jowa.example.test' }],
    ['nombre con salto de línea (inyección de cabeceras)', { AUTH_MAIL_FROM_NAME: 'Jowa\r\nBcc: x@y.z' }],
  ])('%s: no intenta enviar y responde «no configurado»', async (_n, extra) => {
    const { servicio, fabrica } = montar(extra);
    await expect(servicio.send('a@b.test', 't', 'VERIFY_EMAIL')).rejects.toMatchObject({ message: 'Correo de seguridad no configurado' });
    expect(fabrica).not.toHaveBeenCalled();
  });
});

describe('validarConfiguracionCorreo (arranque)', () => {
  it('configuración completa: correcta y sin avisos', () => {
    expect(validarConfiguracionCorreo(entorno())).toEqual([]);
  });
  it('sin ninguna variable en producción: el correo queda desactivado con un aviso que no incluye valores', () => {
    const avisos = validarConfiguracionCorreo({ NODE_ENV: 'production' });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/desactivado/);
  });
  it('configuración parcial o mal escrita impide arrancar; el error nombra variables, nunca valores', () => {
    expect(() => validarConfiguracionCorreo(entorno({ AUTH_MAIL_GMAIL_APP_PASSWORD: undefined }))).toThrow('AUTH_MAIL_GMAIL_APP_PASSWORD');
    let mensaje = '';
    try { validarConfiguracionCorreo(entorno({ AUTH_MAIL_GMAIL_APP_PASSWORD: 'contraseña-normal-123' })); } catch (e: any) { mensaje = e.message; }
    expect(mensaje).toMatch(/contraseña de aplicación/);
    expect(mensaje).not.toContain('contraseña-normal-123');
    expect(() => validarConfiguracionCorreo(entorno({ AUTH_PUBLIC_URL: 'https://jowa.example.test/ruta' }))).toThrow('AUTH_PUBLIC_URL');
  });
  it('una clave de Resend heredada se ignora con aviso: no hay proveedor de respaldo', () => {
    expect(validarConfiguracionCorreo(entorno({ AUTH_MAIL_RESEND_API_KEY: 're_sintetica' })).join(' ')).toMatch(/AUTH_MAIL_RESEND_API_KEY ya no se usa/);
  });
});
