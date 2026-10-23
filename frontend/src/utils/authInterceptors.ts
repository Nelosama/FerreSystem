import type { AxiosInstance } from 'axios';

export const SESSION_TIMEOUT_MS = 10_000; // Límite de red; la vigencia sigue siendo la emitida por el servidor.
export const SESSION_EXPIRED_MESSAGE = 'Tu sesión ha expirado. Inicia sesión nuevamente para continuar.';
const authEndpoint = (url: string) => /\/auth\/(login|refresh|logout)(\?|$)|\/auth\/security(?:\/|$)/.test(url);

export function tokenClaims(token: string | null): any {
  try { return JSON.parse(atob((token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return null; } // Un formato desconocido se valida en el servidor, nunca se acepta por su formato.
}
const issuedDeadlines = new Map<string, number>();
export function tokenExpiresAt(token: string | null): number | undefined {
  if (token && issuedDeadlines.has(token)) return issuedDeadlines.get(token);
  const exp = tokenClaims(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : undefined;
}

export function clearSessionStorage() {
  for (const key of ['ferre_token', 'ferre_user', 'ferre_tenant', 'ferre_original_superadmin_token', 'ferre_original_superadmin_user', 'ferre_original_superadmin_tenant', 'ferre_support_target', 'ferre_is_read_only', 'ferre_active_support_session_id']) localStorage.removeItem(key);
  // El diario offline tiene su propio aislamiento y conciliación: no se borra una venta pendiente.
}

export function sessionIdentity(): string {
  try { return `${JSON.parse(localStorage.getItem('ferre_user') || 'null')?.id}:${JSON.parse(localStorage.getItem('ferre_tenant') || 'null')?.id}`; }
  catch { return ''; }
}

let sessionExpiredNotice = false;
export const hasSessionExpiredNotice = () => sessionExpiredNotice;
export function clearSessionExpiredNotice() {
  sessionExpiredNotice = false;
  sessionStorage.removeItem('ferre_session_expired');
}

function expired() {
  sessionExpiredNotice = true;
  clearSessionStorage();
  sessionStorage.setItem('ferre_session_expired', '1');
  window.dispatchEvent(new Event('ferre:session-expired'));
}

export function installAuthInterceptors(api: AxiosInstance) {
  const pending = new Map<string, Promise<string>>();
  // Solo enlaces entre tokens de la misma renovación. Nunca reutilizar credenciales de un login distinto.
  const renewed = new Map<string, string>();
  const sameSession = (before: string, after: string) => {
    const a = tokenClaims(before), b = tokenClaims(after);
    return !!a?.sid && a.sid === b?.sid && a.sub === b.sub && a.type === b.type && a.tenantId === b.tenantId;
  };
  const wasRenewed = (slot: string, before: string, current: string) => {
    for (let steps = 0; steps < 32; steps++) {
      const next = renewed.get(`${slot}:${before}`);
      if (!next) return false;
      if (next === current) return true;
      before = next;
    }
    return false;
  };
  const slotFor = (sent: string) => localStorage.getItem('ferre_original_superadmin_token') === sent ? 'ferre_original_superadmin_token' : 'ferre_token';
  const renew = (slot: string, sentToken: string): Promise<string> => {
    const key = `${slot}:${sentToken}`;
    const active = pending.get(key);
    if (active) return active;
    const promise = (async () => {
      const support = slot === 'ferre_token' && localStorage.getItem('ferre_support_target');
      const admin = slot === 'ferre_original_superadmin_token' || tokenClaims(sentToken)?.type === 'super_admin'
        || (!support && JSON.parse(localStorage.getItem('ferre_user') || 'null')?.rol === 'SUPERADMIN');
      try {
        const response = support
          ? await api.post('/admin/support/token', JSON.parse(support), { headers: { Authorization: `Bearer ${localStorage.getItem('ferre_original_superadmin_token')}` }, timeout: SESSION_TIMEOUT_MS })
          : await api.post(admin ? '/admin/auth/refresh' : '/auth/refresh', undefined, { timeout: SESSION_TIMEOUT_MS });
        const next = response.data?.accessToken;
        if (typeof next !== 'string' || !next) throw new Error('La API no devolvió un token de sesión');
        const before = tokenClaims(sentToken), after = tokenClaims(next);
        if (before && after && (before.sub !== after.sub || before.type !== after.type || before.tenantId !== after.tenantId)) {
          if (localStorage.getItem(slot) === sentToken) expired();
          throw new Error('La renovación corresponde a otra identidad');
        }
        if (localStorage.getItem(slot) !== sentToken) throw new Error('La sesión cambió durante la renovación');
        if (typeof after?.iat === 'number' && typeof after?.exp === 'number' && after.exp > after.iat) {
          if (issuedDeadlines.size >= 32) issuedDeadlines.delete(issuedDeadlines.keys().next().value!);
          // iat/exp provienen del token recién emitido: tolerar reloj local adelantado sin renovar en bucle.
          issuedDeadlines.set(next, Date.now() + (after.exp - after.iat) * 1000);
        }
        localStorage.setItem(slot, next);
        // Acotado a las renovaciones recientes, suficiente para respuestas tardías en vuelo.
        if (renewed.size >= 32) renewed.delete(renewed.keys().next().value!);
        renewed.set(key, next);
        return next;
      } catch (error: any) {
        if (error.response?.status === 401 && localStorage.getItem(slot) === sentToken) expired();
        throw error; // Red, timeout, 403 y 5xx conservan la sesión.
      }
    })();
    pending.set(key, promise);
    void promise.finally(() => { if (pending.get(key) === promise) pending.delete(key); }).catch(() => {});
    return promise;
  };

  api.interceptors.request.use(async (config) => {
    const token = localStorage.getItem('ferre_token');
    if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
    if (authEndpoint(config.url || '')) return config;
    (config as any)._sessionIdentity ??= sessionIdentity();
    const sent = String(config.headers.Authorization || '').replace(/^Bearer /, '');
    const deadline = tokenExpiresAt(sent);
    (config as any)._authSlot ??= slotFor(sent);
    if (sent && deadline !== undefined && deadline <= Date.now() && localStorage.getItem(slotFor(sent)) === sent) {
      const next = await renew(slotFor(sent), sent);
      config.headers.Authorization = `Bearer ${next}`;
    }
    return config;
  });
  api.interceptors.response.use(response => {
    const config = response.config as any;
    // Una respuesta del usuario anterior no puede poblar una pantalla de la identidad nueva.
    if (config._sessionIdentity && config._sessionIdentity !== sessionIdentity()) throw new Error('La sesión cambió durante la solicitud');
    return response;
  }, async error => {
    const request = error.config;
    const url = request?.url || '';
    if (!request || error.response?.status !== 401 || authEndpoint(url)) return Promise.reject(error);
    const sent = String(request.headers?.Authorization || '').replace(/^Bearer /, '');
    if (!sent) return Promise.reject(error);
    const slot = request._authSlot || slotFor(sent);
    const current = localStorage.getItem(slot);
    if (request._retry) {
      if (current === sent) expired();
      return Promise.reject(error);
    }
    request._retry = true;
    let next: string;
    if (current !== sent) {
      if (!current || (!wasRenewed(slot, sent, current) && !sameSession(sent, current))) return Promise.reject(error);
      next = current;
    } else next = await renew(slot, sent);
    if (localStorage.getItem(slot) !== next) return Promise.reject(error);
    request.headers.Authorization = `Bearer ${next}`;
    return api(request);
  });
}
