import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RecoveryMailService {
  constructor(private readonly config: ConfigService) {}
  async send(to: string, token: string, purpose: string, tenantId?: string) {
    const apiKey = this.config.get<string>('AUTH_MAIL_RESEND_API_KEY');
    const from = this.config.get<string>('AUTH_MAIL_FROM');
    const base = this.config.get<string>('AUTH_PUBLIC_URL');
    if (!apiKey || !from || !base) throw new ServiceUnavailableException('Correo de seguridad no configurado');
    let origin: URL;
    try { origin = new URL(base); } catch { throw new ServiceUnavailableException('URL de seguridad inválida'); }
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new ServiceUnavailableException('URL de seguridad inválida');
    const url = new URL('/login', origin);
    // El enlace de empresa acota el login a ese negocio sin mostrar ningún campo (cuentas heredadas con identificador repetido).
    if (tenantId) url.searchParams.set('empresa', tenantId);
    if (url.protocol !== 'https:' && this.config.get('NODE_ENV') !== 'test') throw new ServiceUnavailableException('URL de seguridad inválida');
    // Fragment avoids tokens in proxy/server logs and Referer headers.
    url.hash = new URLSearchParams({ token, action: purpose }).toString();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'Jowa System — Seguridad / Security',
        text: `Solicitud de seguridad / Security request\n${url.href}\nExpira en 10 minutos / Expires in 10 minutes.\nSi no la solicitó, ignore este mensaje / Ignore if you did not request this.` }),
    });
    if (!response.ok) throw new ServiceUnavailableException('Correo de seguridad temporalmente no disponible');
  }

  /** Contraseña temporal de recuperación. Solo viaja en este correo al titular verificado; no se registra en ningún otro lugar. */
  async sendTemporaryPassword(to: string, password: string) {
    const apiKey = this.config.get<string>('AUTH_MAIL_RESEND_API_KEY');
    const from = this.config.get<string>('AUTH_MAIL_FROM');
    const base = this.config.get<string>('AUTH_PUBLIC_URL');
    if (!apiKey || !from || !base) throw new ServiceUnavailableException('Correo de seguridad no configurado');
    let origin: URL;
    try { origin = new URL(base); } catch { throw new ServiceUnavailableException('URL de seguridad inválida'); }
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new ServiceUnavailableException('URL de seguridad inválida');
    if (origin.protocol !== 'https:' && this.config.get('NODE_ENV') !== 'test') throw new ServiceUnavailableException('URL de seguridad inválida');
    const url = new URL('/login', origin);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'Jowa System — Contraseña temporal / Temporary password',
        text: `Contraseña temporal / Temporary password: ${password}\n\nIngrese en ${url.href} con su usuario y esta contraseña. Es de un solo uso y expira en 10 minutos; el sistema le pedirá definir una contraseña nueva.\nUse it once at ${url.href}; it expires in 10 minutes and you will be asked to set a new password.\nSi no la solicitó, ignore este mensaje / Ignore if you did not request this.` }),
    });
    if (!response.ok) throw new ServiceUnavailableException('Correo de seguridad temporalmente no disponible');
  }
}
