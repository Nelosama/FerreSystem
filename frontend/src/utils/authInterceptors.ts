import type { AxiosInstance } from 'axios';

export function installAuthInterceptors(api: AxiosInstance) {
  const pending = new Map<string, Promise<string>>();
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('ferre_token');
    if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  api.interceptors.response.use((response) => response, async (error) => {
    const request = error.config;
    const url = request?.url || '';
    if (!request || error.response?.status !== 401 || request._retry || /\/auth\/(login|refresh|logout)(\?|$)/.test(url)) {
      return Promise.reject(error);
    }
    const admin = url.startsWith('/admin/');
    const sentToken = String(request.headers?.Authorization || '').replace(/^Bearer /, '');
    const slot = admin && localStorage.getItem('ferre_original_superadmin_token') === sentToken
      ? 'ferre_original_superadmin_token' : 'ferre_token';
    if (localStorage.getItem(slot) !== sentToken) return Promise.reject(error);
    request._retry = true;
    const key = `${slot}:${sentToken}`;
    let refresh = pending.get(key);
    if (!refresh) {
      refresh = (async () => {
        const support = !admin && localStorage.getItem('ferre_support_target');
        const response = support
          ? await api.post('/admin/support/token', JSON.parse(support), {
            headers: { Authorization: `Bearer ${localStorage.getItem('ferre_original_superadmin_token')}` },
          })
          : await api.post(admin ? '/admin/auth/refresh' : '/auth/refresh');
        if (!response.data?.accessToken) throw new Error('La API no devolvió un token de sesión');
        // Una respuesta antigua no puede reemplazar un login o un cambio de usuario reciente.
        if (localStorage.getItem(slot) !== sentToken) throw new Error('La sesión cambió durante la renovación');
        localStorage.setItem(slot, response.data.accessToken);
        return response.data.accessToken as string;
      })();
      pending.set(key, refresh);
    }
    try {
      const token = await refresh;
      if (localStorage.getItem(slot) !== token) return Promise.reject(error);
      request.headers.Authorization = `Bearer ${token}`;
      return api(request);
    } catch (refreshError: any) {
      // Sin respuesta de la API (red caída) no sabemos si la sesión venció: se conserva para reintentar al volver la conexión.
      if (!refreshError?.response && !(refreshError instanceof Error && /sesión cambió/.test(refreshError.message))) return Promise.reject(error);
      if (localStorage.getItem(slot) === sentToken) {
        localStorage.removeItem(slot);
        const loginPath = admin || localStorage.getItem('ferre_support_target') ? '/admin/login' : '/login';
        if (window.location.pathname !== loginPath) window.location.href = loginPath;
      }
      return Promise.reject(refreshError);
    } finally {
      if (pending.get(key) === refresh) pending.delete(key);
    }
  });
}
