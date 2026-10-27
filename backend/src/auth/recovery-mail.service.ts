import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

// Correo de seguridad (verificación, enrolamiento MFA y contraseña temporal) por Gmail SMTP con contraseña de aplicación.
// - Cuenta Gmail DEDICADA a Jowa System, con verificación en dos pasos. Nunca la contraseña normal de la cuenta.
// - Servidor fijo smtp.gmail.com:465 con TLS implícito (mínimo TLS 1.2) y certificado verificado. Sin otro proveedor de respaldo.
// - Los errores no se reenvían ni se registran: pueden contener la respuesta del servidor. Quien llama responde de forma genérica.

export const GMAIL_SMTP_HOST = 'smtp.gmail.com';
export const GMAIL_SMTP_PORT = 465;
/** El proveedor tiene este plazo; la recuperación iguala su respuesta a 8,5 s. */
export const PLAZO_CORREO_MS = 8000;
/** Fábrica del transporte SMTP. Las pruebas inyectan un transporte simulado: nunca se envía correo real. */
export const TRANSPORTE_CORREO = 'TRANSPORTE_CORREO';

export interface MensajeCorreo { from: string; to: string; subject: string; text: string }
export interface TransporteCorreo { sendMail(mensaje: MensajeCorreo): Promise<unknown>; close?(): void }
export type FabricaTransporte = (opciones: Record<string, unknown>) => TransporteCorreo;

type Lector = { get(clave: string): unknown };
const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');
const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
/** Google muestra la contraseña de aplicación como 16 caracteres en grupos de 4; se aceptan con o sin espacios. */
const normalizarClave = (valor: unknown) => texto(valor).replace(/\s+/g, '');
const CLAVE_APLICACION = /^[A-Za-z0-9]{16}$/;
/** Nombre visible del remitente: sin caracteres que permitan inyectar cabeceras. */
const NOMBRE_SEGURO = /^[\p{L}\p{N} .,'()-]{1,64}$/u;

export interface ConfiguracionCorreo { usuario: string; clave: string; nombre: string; base: URL }

const VARIABLES = ['AUTH_MAIL_GMAIL_USER', 'AUTH_MAIL_GMAIL_APP_PASSWORD', 'AUTH_PUBLIC_URL'] as const;

function origenPublico(valor: unknown, produccionOEstricto: boolean): URL {
  let origin: URL;
  try { origin = new URL(texto(valor)); } catch { throw new Error('AUTH_PUBLIC_URL debe ser una URL válida'); }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('AUTH_PUBLIC_URL debe ser un origen sin ruta, consulta ni credenciales');
  if (produccionOEstricto && origin.protocol !== 'https:') throw new Error('AUTH_PUBLIC_URL debe usar HTTPS');
  return origin;
}

/** Lee y valida la configuración. Los mensajes nombran variables, nunca valores. */
export function leerConfiguracionCorreo(config: Lector): ConfiguracionCorreo {
  const usuario = texto(config.get('AUTH_MAIL_GMAIL_USER')).toLowerCase();
  const clave = normalizarClave(config.get('AUTH_MAIL_GMAIL_APP_PASSWORD'));
  if (!usuario || !clave || !texto(config.get('AUTH_PUBLIC_URL'))) throw new Error('Correo de seguridad no configurado');
  if (!CORREO.test(usuario)) throw new Error('AUTH_MAIL_GMAIL_USER debe ser la dirección completa de la cuenta Gmail dedicada');
  if (!CLAVE_APLICACION.test(clave)) throw new Error('AUTH_MAIL_GMAIL_APP_PASSWORD debe ser una contraseña de aplicación de Google (16 caracteres)');
  const nombre = texto(config.get('AUTH_MAIL_FROM_NAME')) || 'Jowa System';
  if (!NOMBRE_SEGURO.test(nombre)) throw new Error('AUTH_MAIL_FROM_NAME contiene caracteres no permitidos');
  const base = origenPublico(config.get('AUTH_PUBLIC_URL'), texto(config.get('NODE_ENV')).toLowerCase() !== 'test');
  return { usuario, clave, nombre, base };
}

/**
 * Validación al arrancar. Configuración parcial o mal escrita impide iniciar (no se envía con datos dudosos).
 * Sin ninguna variable, el correo queda desactivado: las solicitudes responden igual y no se emite ninguna credencial
 * que nadie pueda recibir. Devuelve avisos sin valores para que el arranque los registre.
 */
export function validarConfiguracionCorreo(env: Record<string, string | undefined>): string[] {
  const avisos: string[] = [];
  if (texto(env.AUTH_MAIL_RESEND_API_KEY)) avisos.push('AUTH_MAIL_RESEND_API_KEY ya no se usa: el correo de seguridad sale por Gmail SMTP. Retírela del entorno.');
  const presentes = VARIABLES.filter(v => texto(env[v]));
  if (presentes.length === 0) {
    if (String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production') avisos.push(`Correo de seguridad desactivado: faltan ${VARIABLES.join(', ')}. La recuperación por correo y el enrolamiento MFA inicial no enviarán mensajes.`);
    return avisos;
  }
  if (presentes.length < VARIABLES.length) throw new Error(`Configuración de correo incompleta: faltan ${VARIABLES.filter(v => !presentes.includes(v)).join(', ')}`);
  leerConfiguracionCorreo({ get: (clave: string) => env[clave] });
  return avisos;
}

@Injectable()
export class RecoveryMailService {
  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(TRANSPORTE_CORREO) private readonly fabrica?: FabricaTransporte,
  ) {}

  private configuracion(): ConfiguracionCorreo {
    try { return leerConfiguracionCorreo(this.config); }
    catch { throw new ServiceUnavailableException('Correo de seguridad no configurado'); }
  }

  private async entregar(cfg: ConfiguracionCorreo, to: string, subject: string, text: string) {
    const opciones = {
      host: GMAIL_SMTP_HOST, port: GMAIL_SMTP_PORT, secure: true,
      auth: { user: cfg.usuario, pass: cfg.clave },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: GMAIL_SMTP_HOST },
      connectionTimeout: PLAZO_CORREO_MS, greetingTimeout: PLAZO_CORREO_MS, socketTimeout: PLAZO_CORREO_MS,
      // Sin registros del transporte (incluirían la conversación SMTP) ni acceso a archivos o URL desde el mensaje.
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    };
    const transporte = (this.fabrica ?? (createTransport as unknown as FabricaTransporte))(opciones);
    let plazo: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        transporte.sendMail({ from: `"${cfg.nombre}" <${cfg.usuario}>`, to, subject, text }),
        new Promise((_, rechazar) => { plazo = setTimeout(() => rechazar(new Error('plazo')), PLAZO_CORREO_MS); }),
      ]);
    } catch {
      // Nunca se propaga el error original: puede incluir la respuesta del servidor o datos de la cuenta.
      throw new ServiceUnavailableException('Correo de seguridad temporalmente no disponible');
    } finally {
      clearTimeout(plazo);
      try { transporte.close?.(); } catch { /* el cierre no cambia el resultado */ }
    }
  }

  async send(to: string, token: string, purpose: string, tenantId?: string) {
    const cfg = this.configuracion();
    const url = new URL('/login', cfg.base);
    // El enlace de empresa acota el login a ese negocio sin mostrar ningún campo (cuentas heredadas con identificador repetido).
    if (tenantId) url.searchParams.set('empresa', tenantId);
    // Fragment avoids tokens in proxy/server logs and Referer headers.
    url.hash = new URLSearchParams({ token, action: purpose }).toString();
    await this.entregar(cfg, to, 'Jowa System — Seguridad / Security',
      `Solicitud de seguridad / Security request\n${url.href}\nExpira en 10 minutos / Expires in 10 minutes.\nSi no la solicitó, ignore este mensaje / Ignore if you did not request this.`);
  }

  /** Contraseña temporal de recuperación. Solo viaja en este correo al titular verificado; no se registra en ningún otro lugar. */
  async sendTemporaryPassword(to: string, password: string) {
    const cfg = this.configuracion();
    const url = new URL('/login', cfg.base);
    await this.entregar(cfg, to, 'Jowa System — Contraseña temporal / Temporary password',
      `Contraseña temporal / Temporary password: ${password}\n\nIngrese en ${url.href} con su usuario y esta contraseña. Es de un solo uso y expira en 10 minutos; el sistema le pedirá definir una contraseña nueva.\nUse it once at ${url.href}; it expires in 10 minutes and you will be asked to set a new password.\nSi no la solicitó, ignore este mensaje / Ignore if you did not request this.`);
  }
}
