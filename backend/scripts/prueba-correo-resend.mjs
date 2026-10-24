#!/usr/bin/env node
// Prueba manual de entrega por Resend para el correo de seguridad. NO se ejecuta en CI ni en el arranque.
// Envía UN mensaje de configuración (sin enlaces ni tokens) solo si se confirma el destinatario exacto:
//   AUTH_MAIL_RESEND_API_KEY=... AUTH_MAIL_FROM='Jowa <seguridad@dominio-verificado>' \
//   AUTH_PUBLIC_URL=https://app.ejemplo \
//   CONFIRM_ENVIO_REAL=<correo-destino-exacto> node scripts/prueba-correo-resend.mjs
// Nunca imprime la clave ni el destinatario; solo el estado HTTP y el identificador devuelto por Resend.
const env = process.env;
const destino = env.CONFIRM_ENVIO_REAL?.trim();
const faltan = ['AUTH_MAIL_RESEND_API_KEY', 'AUTH_MAIL_FROM', 'AUTH_PUBLIC_URL'].filter((k) => !env[k]?.trim());
if (!destino) { console.error('Rechazado: falta CONFIRM_ENVIO_REAL con el correo de destino exacto.'); process.exit(2); }
if (faltan.length) { console.error(`Rechazado: faltan variables: ${faltan.join(', ')}.`); process.exit(2); }
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) { console.error('Rechazado: CONFIRM_ENVIO_REAL no es un correo válido.'); process.exit(2); }
let origen;
try { origen = new URL(env.AUTH_PUBLIC_URL); } catch { origen = null; }
if (!origen || origen.protocol !== 'https:' || origen.pathname !== '/' || origen.search || origen.hash || origen.username) {
  console.error('Rechazado: AUTH_PUBLIC_URL debe ser un origen HTTPS sin ruta, consulta ni credenciales.'); process.exit(2);
}
const respuesta = await fetch('https://api.resend.com/emails', {
  method: 'POST', signal: AbortSignal.timeout(15000),
  headers: { Authorization: `Bearer ${env.AUTH_MAIL_RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: env.AUTH_MAIL_FROM, to: [destino],
    subject: 'Jowa System — prueba de configuración de correo / mail configuration test',
    text: 'Prueba de configuración. No es una solicitud de cambio de credenciales. / Configuration test. This is not a credential request.',
  }),
});
const cuerpo = await respuesta.json().catch(() => ({}));
console.log(JSON.stringify({ estado: respuesta.status, ok: respuesta.ok, id: cuerpo.id ?? null }));
process.exit(respuesta.ok ? 0 : 1);
