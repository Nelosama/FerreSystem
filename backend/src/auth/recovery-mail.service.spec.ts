import { ServiceUnavailableException } from '@nestjs/common';
import { RecoveryMailService } from './recovery-mail.service';

// Contrato del correo de seguridad: fallo cerrado sin configuración, origen público sin ruta, token solo en el fragmento
// y ninguna clave en mensajes de error. Resend se sustituye por fetch simulado; no se envía correo real.
function servicio(valores: Record<string, string | undefined>) {
  const config = { get: (clave: string) => valores[clave] } as any;
  return new RecoveryMailService(config);
}
const completa = {
  AUTH_MAIL_RESEND_API_KEY: 're_clave_sintetica_no_real',
  AUTH_MAIL_FROM: 'Jowa <seguridad@example.test>',
  AUTH_PUBLIC_URL: 'https://app.example.test',
  NODE_ENV: 'production',
};

describe('RecoveryMailService', () => {
  let fetchSimulado: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSimulado = vi.fn(async () => new Response(JSON.stringify({ id: 'sintetico' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSimulado);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('falla cerrado sin clave, remitente o URL pública y no intenta enviar', async () => {
    for (const quitar of ['AUTH_MAIL_RESEND_API_KEY', 'AUTH_MAIL_FROM', 'AUTH_PUBLIC_URL']) {
      const valores = { ...completa, [quitar]: undefined };
      await expect(servicio(valores).send('a@example.test', 'tok', 'RESET')).rejects.toThrow(ServiceUnavailableException);
    }
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('rechaza una URL pública con ruta, credenciales, consulta o HTTP en producción', async () => {
    for (const url of ['https://app.example.test/panel', 'https://u:p@app.example.test', 'https://app.example.test?x=1', 'http://app.example.test']) {
      await expect(servicio({ ...completa, AUTH_PUBLIC_URL: url }).send('a@example.test', 'tok', 'RESET')).rejects.toThrow(ServiceUnavailableException);
    }
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('envía a Resend con la clave en cabecera y el token solo en el fragmento del enlace', async () => {
    await servicio(completa).send('a@example.test', 'tok123', 'RESET', 't-1');
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSimulado.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_clave_sintetica_no_real');
    const cuerpo = JSON.parse(String(init.body));
    expect(cuerpo.to).toEqual(['a@example.test']);
    const enlace = new URL(cuerpo.text.match(/https:\/\/\S+/)![0]);
    expect(enlace.pathname).toBe('/login');
    expect(enlace.searchParams.get('empresa')).toBe('t-1');
    expect(enlace.search).not.toContain('tok123');
    expect(new URLSearchParams(enlace.hash.slice(1)).get('token')).toBe('tok123');
  });

  it('un rechazo de Resend se convierte en 503 sin exponer la clave ni el destinatario', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response('denegado', { status: 403 }));
    const error = await servicio(completa).send('a@example.test', 'tok', 'RESET').catch(e => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(error.getResponse())).not.toContain('re_clave');
    expect(JSON.stringify(error.getResponse())).not.toContain('a@example.test');
  });
});
