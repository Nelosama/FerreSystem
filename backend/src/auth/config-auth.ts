import { ConfigService } from '@nestjs/config';

// Configuración de recuperación y MFA. En producción el arranque falla si falta algo: sin esto no hay MFA del Super Admin
// ni correo de seguridad, y ambos son obligatorios antes de liberar. Los mensajes nombran variables, nunca valores.
export const AUTH_CONFIG_CHECK = 'AUTH_CONFIG_CHECK';

export function validarConfiguracionAuth(config: ConfigService): void {
  if (String(config.get('NODE_ENV') ?? '').trim().toLowerCase() !== 'production') return;
  const faltan: string[] = [];
  if (!/^[a-fA-F0-9]{64}$/.test(config.get<string>('AUTH_MFA_ENCRYPTION_KEY') ?? '')) faltan.push('AUTH_MFA_ENCRYPTION_KEY (64 caracteres hexadecimales)');
  if (!config.get<string>('AUTH_MAIL_RESEND_API_KEY')?.trim()) faltan.push('AUTH_MAIL_RESEND_API_KEY');
  if (!config.get<string>('AUTH_MAIL_FROM')?.trim()) faltan.push('AUTH_MAIL_FROM');
  let origen: URL | null = null;
  try { origen = new URL(config.get<string>('AUTH_PUBLIC_URL') ?? ''); } catch { origen = null; }
  const valido = origen && origen.protocol === 'https:' && !origen.username && !origen.password && !origen.search && !origen.hash && origen.pathname === '/';
  if (!valido) faltan.push('AUTH_PUBLIC_URL (origen HTTPS sin ruta, consulta ni credenciales)');
  if (faltan.length) throw new Error(`Configuración de seguridad incompleta en producción: ${faltan.join(', ')}`);
}
