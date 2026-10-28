#!/usr/bin/env node
// Prueba de entrega REAL por Gmail SMTP, solo para staging y solo con autorización explícita.
// Uso (credenciales desde el gestor de secretos del entorno de staging, nunca en el repositorio):
//   AUTH_MAIL_GMAIL_USER=... AUTH_MAIL_GMAIL_APP_PASSWORD=... AUTH_PUBLIC_URL=https://staging... \
//   SMTP_STAGING_DESTINO=buzon-de-prueba@... SMTP_STAGING_CONFIRMAR=ENVIAR node scripts/smtp-staging-check.mjs
// Sin SMTP_STAGING_CONFIRMAR=ENVIAR solo valida la configuración y no abre ninguna conexión.
// Envía un único mensaje con una contraseña temporal sintética (no corresponde a ninguna cuenta). Nunca imprime credenciales.
import 'reflect-metadata';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { leerConfiguracionCorreo, RecoveryMailService } = require('../dist/auth/recovery-mail.service.js');

const env = process.env;
if ((env.NODE_ENV ?? '').toLowerCase() === 'production') { console.error('Rechazado: este script no se ejecuta con NODE_ENV=production.'); process.exit(2); }
const lector = { get: clave => env[clave] };
try { leerConfiguracionCorreo(lector); } catch (e) { console.error(`Configuración inválida: ${e.message}`); process.exit(1); }
console.log('Configuración de correo válida (valores no mostrados).');
if (env.SMTP_STAGING_CONFIRMAR !== 'ENVIAR') { console.log('Modo simulación: defina SMTP_STAGING_CONFIRMAR=ENVIAR y SMTP_STAGING_DESTINO para enviar.'); process.exit(0); }
const destino = (env.SMTP_STAGING_DESTINO ?? '').trim();
if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(destino)) { console.error('SMTP_STAGING_DESTINO inválido.'); process.exit(1); }
const servicio = new RecoveryMailService({ get: clave => env[clave] });
const inicio = Date.now();
try { await servicio.sendTemporaryPassword(destino, 'PRUEBA-STAGING-sin-uso'); }
catch (e) { console.error(`Envío fallido (${e.constructor.name}) tras ${Date.now() - inicio} ms. Revise cuenta dedicada, verificación en dos pasos y contraseña de aplicación.`); process.exit(1); }
console.log(`Mensaje aceptado por smtp.gmail.com en ${Date.now() - inicio} ms. Confirme la recepción en ${destino.replace(/^(.).*(@.*)$/, '$1***$2')} y revise que el enlace y el texto sean correctos.`);
