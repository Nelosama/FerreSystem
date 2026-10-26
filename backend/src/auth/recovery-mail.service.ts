import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RecoveryMailService {
  constructor(private readonly config: ConfigService) {}
  async send(to: string, token: string, purpose: string, tenantId?: string) {
    const url = this.loginUrl(tenantId);
    // Fragment avoids tokens in proxy/server logs and Referer headers.
    url.hash = new URLSearchParams({ token, action: purpose }).toString();
    await this.deliver(to, `Solicitud de seguridad / Security request\n${url.href}\nExpira en 10 minutos / Expires in 10 minutes.\nSi no la solicitó, ignore este mensaje / Ignore if you did not request this.`);
  }
  // La clave viaja en el cuerpo del correo, nunca en la URL. El remitente no la registra ni la devuelve.
  async sendTemporaryPassword(to: string, temporaryPassword: string) {
    const url = this.loginUrl();
    await this.deliver(to, [
      'Contraseña temporal de Jowa System',
      '',
      `Contraseña temporal: ${temporaryPassword}`,
      '',
      'Funciona una sola vez durante 10 minutos. Al ingresar deberá crear una contraseña nueva antes de usar el sistema; se cerrarán sus sesiones anteriores.',
      `Ingrese en: ${url.href}`,
      '',
      'Si no la solicitó, ignore este mensaje: su contraseña actual sigue funcionando. Avise al responsable del sistema si recibe solicitudes que no hizo.',
    ].join('\n'));
  }
  private loginUrl(tenantId?: string) {
    const base = this.config.get<string>('AUTH_PUBLIC_URL');
    if (!base) throw new ServiceUnavailableException('Correo de seguridad no configurado');
    let origin: URL;
    try { origin = new URL(base); } catch { throw new ServiceUnavailableException('URL de seguridad inválida'); }
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new ServiceUnavailableException('URL de seguridad inválida');
    const url = new URL('/login', origin);
    if (tenantId) url.searchParams.set('empresa', tenantId);
    if (url.protocol !== 'https:' && this.config.get('NODE_ENV') !== 'test') throw new ServiceUnavailableException('URL de seguridad inválida');
    return url;
  }
  private async deliver(to: string, text: string) {
    const apiKey = this.config.get<string>('AUTH_MAIL_RESEND_API_KEY');
    const from = this.config.get<string>('AUTH_MAIL_FROM');
    if (!apiKey || !from) throw new ServiceUnavailableException('Correo de seguridad no configurado');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'Jowa System — Seguridad / Security', text }),
    });
    if (!response.ok) throw new ServiceUnavailableException('Correo de seguridad temporalmente no disponible');
  }
}
