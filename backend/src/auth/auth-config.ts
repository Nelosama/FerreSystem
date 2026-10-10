// Configuración de autenticación fase 3. Valores inválidos fallan al arrancar: no hay defecto silencioso.

export interface ConfiguracionAuth {
  maxFallosCuenta: number;
  maxFallosIp: number;
  ventanaSegundos: number;
  bloqueoSegundos: number;
  aceptarTokensSinSesion: boolean;
}

type Lector = { get(clave: string): unknown };

function enteroPositivo(valor: unknown, nombre: string, defecto: number): number {
  if (valor === undefined || valor === null || valor === '') return defecto;
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error(`${nombre} debe ser un entero mayor que 0`);
  return numero;
}

/** Lectura tolerante para los servicios: un valor inválido vuelve al defecto. La validación estricta es validarConfiguracionAuth (arranque). */
export function leerConfiguracionAuth(config: Lector): ConfiguracionAuth {
  const enteroDeConfig = (clave: string, defecto: number) => {
    const valor = config.get(clave);
    const numero = Number(valor);
    return valor !== undefined && valor !== null && valor !== '' && Number.isSafeInteger(numero) && numero >= 1 ? numero : defecto;
  };
  return {
    maxFallosCuenta: enteroDeConfig('AUTH_LOGIN_MAX_FALLOS_CUENTA', 5),
    maxFallosIp: enteroDeConfig('AUTH_LOGIN_MAX_FALLOS_IP', 100),
    ventanaSegundos: enteroDeConfig('AUTH_LOGIN_VENTANA_SEGUNDOS', 900),
    bloqueoSegundos: enteroDeConfig('AUTH_LOGIN_BLOQUEO_SEGUNDOS', 900),
    // Transición: los access tokens sin `sid` (emitidos antes de esta versión) se aceptan hasta que se fije en "false".
    aceptarTokensSinSesion: String(config.get('AUTH_ACEPTAR_TOKENS_SIN_SESION') ?? '').trim().toLowerCase() !== 'false',
  };
}

/** Validación estricta al arrancar: un valor mal escrito impide iniciar la API en vez de cambiar la seguridad en silencio. */
export function validarConfiguracionAuth(env: Record<string, string | undefined>): ConfiguracionAuth {
  const sinSesion = (env.AUTH_ACEPTAR_TOKENS_SIN_SESION ?? '').trim().toLowerCase();
  if (sinSesion !== '' && sinSesion !== 'true' && sinSesion !== 'false') {
    throw new Error('AUTH_ACEPTAR_TOKENS_SIN_SESION debe ser "true" o "false"');
  }
  enteroPositivo(env.AUTH_LOGIN_MAX_FALLOS_CUENTA, 'AUTH_LOGIN_MAX_FALLOS_CUENTA', 5);
  enteroPositivo(env.AUTH_LOGIN_MAX_FALLOS_IP, 'AUTH_LOGIN_MAX_FALLOS_IP', 100);
  enteroPositivo(env.AUTH_LOGIN_VENTANA_SEGUNDOS, 'AUTH_LOGIN_VENTANA_SEGUNDOS', 900);
  enteroPositivo(env.AUTH_LOGIN_BLOQUEO_SEGUNDOS, 'AUTH_LOGIN_BLOQUEO_SEGUNDOS', 900);
  leerTrustProxy(env.TRUST_PROXY);
  return leerConfiguracionAuth({ get: (clave: string) => env[clave] });
}

/** TRUST_PROXY: número de proxies confiables delante de la API (Render = 1). Ausente = no confiar en X-Forwarded-For. */
export function leerTrustProxy(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error('TRUST_PROXY debe ser el número de proxies confiables (entero mayor que 0)');
  return numero;
}
