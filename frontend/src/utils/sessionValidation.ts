import { SESSION_TIMEOUT_MS, tokenExpiresAt } from './authInterceptors';
let profileFlight: { token: string | null; promise: Promise<any> } | undefined;
export function sessionProfile(read: () => Promise<any>): Promise<any> {
  const token = localStorage.getItem('ferre_token');
  if (profileFlight?.token === token) return profileFlight.promise;
  const entry = { token, promise: read() };
  profileFlight = entry;
  void entry.promise.finally(() => { if (profileFlight === entry) profileFlight = undefined; }).catch(() => {});
  return entry.promise;
}
export type SessionStatus = 'checking' | 'ready' | 'error' | 'denied' | 'offline';

/**
 * Identidad (usuario:empresa) confirmada por el servidor en este navegador desde el último inicio de sesión.
 * Se borra con la sesión (clearSessionStorage). Es requisito para abrir la contingencia ante un 502/503.
 */
export const IDENTIDAD_VALIDADA_KEY = 'ferre_identidad_validada';
const identidad = (userId: string, tenantId: string) => `${userId}:${tenantId}`;

/**
 * Por qué un fallo del perfil podría abrir la contingencia (P1-2 de AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104):
 * - 'sin-respuesta': red caída o tiempo agotado (comportamiento previo).
 * - 'servidor-no-disponible': 502 o 503 (borde de Render, Supabase inaccesible → 503 de JwtStrategy).
 * Cualquier otra respuesta, incluidos 401 y 403, nunca habilita la contingencia.
 */
export function motivoContingencia(error: any): 'sin-respuesta' | 'servidor-no-disponible' | null {
  if (!error?.response) return 'sin-respuesta';
  const estado = error.response.status;
  return estado === 502 || estado === 503 ? 'servidor-no-disponible' : null;
}

// Una sola validación en vuelo. La navegación nunca autoriza mediante el usuario guardado.
export function startSessionValidation(options: {
  profile: () => Promise<any>;
  userId: string;
  tenantId: string;
  superAdmin: boolean;
  onStatus: (status: SessionStatus) => void;
  onProfile: (profile: any) => void;
  onChanged: () => void;
}) {
  let lastStatus: SessionStatus = 'checking';
  const status = (next: SessionStatus) => {
    lastStatus = next;
    // Sin esperar un render: el navegador puede congelar la página al recibir pagehide.
    if (next === 'ready' || next === 'offline') delete document.documentElement.dataset.sessionPending;
    else document.documentElement.dataset.sessionPending = 'true';
    options.onStatus(next);
  };
  let disposed = false, flight: Promise<void> | undefined, timer: ReturnType<typeof setTimeout>;
  const matches = () => {
    try {
      return JSON.parse(localStorage.getItem('ferre_user') || 'null')?.id === options.userId
        && JSON.parse(localStorage.getItem('ferre_tenant') || 'null')?.id === options.tenantId
        && !!localStorage.getItem('ferre_token');
    } catch { return false; }
  };
  // Solo la identidad que el servidor ya confirmó en este navegador puede usar la contingencia ante un 502/503.
  const previouslyValidated = () => {
    try { return localStorage.getItem(IDENTIDAD_VALIDADA_KEY) === identidad(options.userId, options.tenantId); } catch { return false; }
  };
  const contingency = async () => {
    if (window.location.pathname !== '/pos-contingencia') return false;
    const { leerVentana, ventanaVigente } = await import('../offline/ventana');
    const windowOffline = await leerVentana();
    if (disposed || !matches() || windowOffline?.tenantId !== options.tenantId || windowOffline.cajeroId !== options.userId || !ventanaVigente(windowOffline)) return false;
    status('offline');
    return true;
  };
  const validate = (blocking = true): Promise<void> => {
    if (disposed) return Promise.resolve();
    const deadline = tokenExpiresAt(localStorage.getItem('ferre_token'));
    blocking ||= deadline !== undefined && deadline <= Date.now();
    if (!matches()) { options.onChanged(); return Promise.resolve(); }
    if (flight) return flight;
    if (blocking) status('checking');
    flight = (async () => {
      try {
        // Solo la ventana previamente autorizada habilita el POS de contingencia.
        if (!navigator.onLine && await contingency()) return;
        const response = await sessionProfile(options.profile);
        if (disposed) return;
        if (!matches()) { options.onChanged(); return; }
        const profile = response.data?.user;
        if (profile?.sub !== options.userId || (options.superAdmin ? profile.type !== 'super_admin' : profile.tenantId !== options.tenantId)) {
          options.onChanged(); return;
        }
        options.onProfile(profile);
        if (!options.superAdmin) { try { localStorage.setItem(IDENTIDAD_VALIDADA_KEY, identidad(options.userId, options.tenantId)); } catch { /* almacenamiento bloqueado */ } }
        status('ready');
        clearTimeout(timer);
        const deadline = tokenExpiresAt(localStorage.getItem('ferre_token'));
        if (deadline !== undefined && deadline > Date.now()) timer = setTimeout(() => void validate(), Math.min(2_147_483_647, deadline - Date.now()));
      } catch (error: any) {
        // Una interfaz de red conectada no garantiza internet (PWA, Wi-Fi sin salida o timeout).
        // Ningún 401/403 del servidor admite esta recuperación local.
        // 502/503 exigen además identidad confirmada antes por el servidor; 401/403 y demás nunca llegan aquí.
        const motivo = motivoContingencia(error);
        if (motivo && !disposed && matches() && (motivo === 'sin-respuesta' || previouslyValidated())) {
          try { if (await contingency()) return; } catch { /* almacén no disponible */ }
        }
        if (!disposed && matches() && (blocking || lastStatus === 'checking')) status(error.response?.status === 403 ? 'denied' : 'error');
      }
    })().finally(() => { flight = undefined; });
    return flight;
  };
  const notify = () => { if (document.visibilityState !== 'hidden') void validate(); };
  const visibility = () => {
    // Oculta datos antes de suspender una pestaña/PWA o guardar una página en BFCache.
    if (document.visibilityState === 'hidden') status('checking');
    else notify();
  };
  const hide = () => status('checking');
  const storage = (event: StorageEvent) => {
    if (!matches()) { options.onChanged(); return; }
    if (event.key === null || ['ferre_user', 'ferre_tenant', 'ferre_token'].includes(event.key)) notify();
  };
  window.addEventListener('focus', notify);
  window.addEventListener('pageshow', notify);
  window.addEventListener('pagehide', hide);
  window.addEventListener('online', notify);
  window.addEventListener('storage', storage);
  window.addEventListener('ferre:session-retry', notify);
  document.addEventListener('visibilitychange', visibility);
  const poll = setInterval(() => { if (lastStatus === 'ready' && document.visibilityState !== 'hidden') void validate(false); }, 30_000);
  void validate();
  return () => {
    disposed = true; clearTimeout(timer); clearInterval(poll);
    window.removeEventListener('focus', notify);
    window.removeEventListener('pageshow', notify);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('online', notify);
    window.removeEventListener('storage', storage);
    window.removeEventListener('ferre:session-retry', notify);
    document.removeEventListener('visibilitychange', visibility);
  };
}
export const profileRequestConfig = { timeout: SESSION_TIMEOUT_MS };
