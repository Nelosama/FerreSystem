// Configuración de autenticación. La lectura de los servicios es tolerante; la validación estricta corre al arrancar.

export interface ConfiguracionAuth {
  maxFallosCuenta: number;
  maxFallosIp: number;
  ventanaSegundos: number;
  bloqueoSegundos: number;
  /** Transición: acepta access tokens sin `sid` (anteriores a las sesiones revocables). */
  aceptarTokensSinSesion: boolean;
  /** Fin obligatorio de la transición en producción; se evalúa en cada petición, no solo al arrancar. */
  sinSesionHastaMs?: number;
}

type Lector = { get(clave: string): unknown };

/** Ventana máxima de la transición en producción: un día. */
export const MAXIMA_VENTANA_SIN_SESION_MS = 24 * 60 * 60 * 1000;

function enteroPositivo(valor: unknown, nombre: string, defecto: number): number {
  if (valor === undefined || valor === null || valor === '') return defecto;
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error(`${nombre} debe ser un entero mayor que 0`);
  return numero;
}

const normalizado = (valor: unknown) => String(valor ?? '').trim().toLowerCase();

function hastaDesde(valor: unknown): number | undefined {
  const texto = String(valor ?? '').trim();
  if (!texto) return undefined;
  const ms = Date.parse(texto);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Lectura tolerante para los servicios: un valor inválido vuelve al defecto. */
export function leerConfiguracionAuth(config: Lector): ConfiguracionAuth {
  const enteroDeConfig = (clave: string, defecto: number) => {
    const valor = config.get(clave);
    const numero = Number(valor);
    return valor !== undefined && valor !== null && valor !== '' && Number.isSafeInteger(numero) && numero >= 1 ? numero : defecto;
  };
  const produccion = normalizado(config.get('NODE_ENV')) === 'production';
  const flag = normalizado(config.get('AUTH_ACEPTAR_TOKENS_SIN_SESION'));
  const hasta = hastaDesde(config.get('AUTH_TOKENS_SIN_SESION_HASTA'));
  // En producción la transición es opt-in y necesita fecha límite; sin ella, los tokens sin sesión se rechazan.
  const aceptar = produccion ? flag === 'true' && hasta !== undefined : flag !== 'false';
  return {
    maxFallosCuenta: enteroDeConfig('AUTH_LOGIN_MAX_FALLOS_CUENTA', 5),
    maxFallosIp: enteroDeConfig('AUTH_LOGIN_MAX_FALLOS_IP', 100),
    ventanaSegundos: enteroDeConfig('AUTH_LOGIN_VENTANA_SEGUNDOS', 900),
    bloqueoSegundos: enteroDeConfig('AUTH_LOGIN_BLOQUEO_SEGUNDOS', 900),
    aceptarTokensSinSesion: aceptar,
    sinSesionHastaMs: hasta,
  };
}

/** Evaluado en cada petición: al llegar la fecha límite, los tokens sin sesión dejan de valer sin reiniciar nada. */
export function aceptaTokenSinSesion(cfg: ConfiguracionAuth, ahoraMs = Date.now()): boolean {
  if (!cfg.aceptarTokensSinSesion) return false;
  return cfg.sinSesionHastaMs === undefined || ahoraMs < cfg.sinSesionHastaMs;
}

/** Validación estricta al arrancar: un valor mal escrito o una transición sin fin impiden iniciar la API. */
export function validarConfiguracionAuth(env: Record<string, string | undefined>, ahoraMs = Date.now()): ConfiguracionAuth {
  const flag = normalizado(env.AUTH_ACEPTAR_TOKENS_SIN_SESION);
  if (flag !== '' && flag !== 'true' && flag !== 'false') {
    throw new Error('AUTH_ACEPTAR_TOKENS_SIN_SESION debe ser "true" o "false"');
  }
  const produccion = normalizado(env.NODE_ENV) === 'production';
  if (produccion && flag === 'true') {
    const hasta = hastaDesde(env.AUTH_TOKENS_SIN_SESION_HASTA);
    if (hasta === undefined) throw new Error('En producción, AUTH_ACEPTAR_TOKENS_SIN_SESION=true exige AUTH_TOKENS_SIN_SESION_HASTA (fecha ISO 8601)');
    if (hasta <= ahoraMs || hasta - ahoraMs > MAXIMA_VENTANA_SIN_SESION_MS) {
      throw new Error('AUTH_TOKENS_SIN_SESION_HASTA debe ser una fecha futura de máximo 24 horas');
    }
  }
  enteroPositivo(env.AUTH_LOGIN_MAX_FALLOS_CUENTA, 'AUTH_LOGIN_MAX_FALLOS_CUENTA', 5);
  enteroPositivo(env.AUTH_LOGIN_MAX_FALLOS_IP, 'AUTH_LOGIN_MAX_FALLOS_IP', 100);
  enteroPositivo(env.AUTH_LOGIN_VENTANA_SEGUNDOS, 'AUTH_LOGIN_VENTANA_SEGUNDOS', 900);
  enteroPositivo(env.AUTH_LOGIN_BLOQUEO_SEGUNDOS, 'AUTH_LOGIN_BLOQUEO_SEGUNDOS', 900);
  leerTrustProxy(env.TRUST_PROXY);
  return leerConfiguracionAuth({ get: (clave: string) => env[clave] });
}

/** TRUST_PROXY: número de proxies confiables delante de la API. Ausente = no confiar en X-Forwarded-For. */
export function leerTrustProxy(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error('TRUST_PROXY debe ser el número de proxies confiables (entero mayor que 0)');
  return numero;
}
