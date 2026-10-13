#!/usr/bin/env node
// CENTINELA — verificación de TRUST_PROXY en un entorno desplegado (caja negra, sin acceso a la configuración).
//
// Solo envía intentos de inicio de sesión con un correo inexistente y una contraseña inventada. No usa credenciales reales.
//
// Uso:
//   node scripts/verificar-trust-proxy.mjs --api https://staging.example/api --limite 3 --modo evasion
//   node scripts/verificar-trust-proxy.mjs --api https://staging.example/api --limite 3 --modo aislamiento
//
// --limite: valor de AUTH_LOGIN_MAX_FALLOS_IP en el entorno probado (usar un valor bajo en staging, p. ej. 3).
// --modo evasion: comprueba que cambiar X-Forwarded-For NO evade el límite por IP.
// --modo aislamiento: un solo intento sin cabeceras; ejecutarlo desde OTRA red tras un bloqueo en la primera red.
//
// Resultado esperado con TRUST_PROXY correcto (un proxy que añade la IP real al final de X-Forwarded-For):
//   evasion     -> CORRECTO: el intento N+1 responde 429 aunque cada intento envíe un X-Forwarded-For distinto.
//   aislamiento -> CORRECTO: el primer intento desde la red nueva responde 401 (no 429).
// Resultado de fallo:
//   evasion     -> EVASION: todos responden 401. El cliente controla la IP (TRUST_PROXY demasiado alto o sin proxy).
//   aislamiento -> COMPARTIDA: responde 429. Muchos clientes comparten un cubo (TRUST_PROXY demasiado bajo).

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const api = args.get('api');
const limite = Number(args.get('limite') ?? 3);
const modo = args.get('modo') ?? 'evasion';

if (!api) {
  console.error('Falta --api <URL base que termina en /api>');
  process.exit(2);
}
if (!/^https:\/\//.test(api) && !args.has('local')) {
  console.error('Por seguridad, solo se acepta HTTPS. Para pruebas locales usar --local.');
  process.exit(2);
}
if (!Number.isInteger(limite) || limite < 1 || limite > 20) {
  console.error('--limite debe ser un entero entre 1 y 20 (valor de AUTH_LOGIN_MAX_FALLOS_IP del entorno).');
  process.exit(2);
}

const correoSonda = `centinela-sonda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invalid.test`;
const intento = (cabeceras = {}) => fetch(`${api}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...cabeceras },
  body: JSON.stringify({ email: correoSonda, password: 'sonda-no-es-una-clave' }),
}).then(async (r) => ({ status: r.status, retryAfter: r.headers.get('retry-after') }));

const aleatorioIp = () => `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

async function evasion() {
  const resultados = [];
  for (let i = 0; i < limite + 1; i++) {
    resultados.push(await intento({ 'x-forwarded-for': aleatorioIp() }));
  }
  const bloqueado = resultados.at(-1).status === 429;
  const trazo = resultados.map(r => r.status).join(', ');
  if (bloqueado) {
    console.log(`CORRECTO: el intento ${limite + 1} con X-Forwarded-For distinto responde 429. Respuestas: [${trazo}]`);
    return 0;
  }
  console.log(`EVASION: ningún intento quedó bloqueado aunque cambió X-Forwarded-For. Respuestas: [${trazo}]`);
  console.log('Acción: revisar TRUST_PROXY (debe ser exactamente el número de proxies delante de la API) y que el proxy añada la IP real.');
  return 1;
}

async function aislamiento() {
  const r = await intento();
  if (r.status === 401) {
    console.log('CORRECTO: el intento desde esta red responde 401 (cubo propio).');
    return 0;
  }
  if (r.status === 429) {
    console.log('COMPARTIDA: el intento responde 429 sin haber fallado antes desde esta red. Otra red ocupa el mismo cubo.');
    console.log('Acción: si ninguna red ha bloqueado el límite, TRUST_PROXY es demasiado bajo (todos los clientes ven la IP del proxy).');
    return 1;
  }
  console.log(`INCONCLUSO: respuesta ${r.status}. Revisar el entorno.`);
  return 2;
}

const codigo = modo === 'aislamiento' ? await aislamiento() : await evasion();
process.exit(codigo);
