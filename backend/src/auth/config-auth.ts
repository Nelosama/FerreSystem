import { ConfigService } from '@nestjs/config';
import { leerConfiguracionCorreo } from './recovery-mail.service';

// Configuración del correo de seguridad en producción. Sin MFA (decisión del propietario), la recuperación de acceso
// depende solo del correo: el arranque falla si el correo por Gmail SMTP no está completo y válido, en lugar de
// arrancar con una recuperación que no puede entregar nada. Los mensajes nombran variables, nunca valores.
// Resend ya no se usa: su ausencia no impide arrancar (recovery-mail.service solo avisa si sigue definida).
export const AUTH_CONFIG_CHECK = 'AUTH_CONFIG_CHECK';

const VARIABLES_CORREO = ['AUTH_MAIL_GMAIL_USER', 'AUTH_MAIL_GMAIL_APP_PASSWORD', 'AUTH_PUBLIC_URL'] as const;

export function validarConfiguracionAuth(config: ConfigService): void {
  if (String(config.get('NODE_ENV') ?? '').trim().toLowerCase() !== 'production') return;
  const faltan = VARIABLES_CORREO.filter(v => !String(config.get<string>(v) ?? '').trim());
  if (faltan.length) throw new Error(`Configuración de seguridad incompleta en producción: ${faltan.join(', ')}`);
  try {
    leerConfiguracionCorreo({ get: (clave: string) => config.get(clave) });
  } catch (e) {
    throw new Error(`Configuración de seguridad inválida en producción: ${(e as Error).message}`);
  }
}
