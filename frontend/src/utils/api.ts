import axios from 'axios';

const getBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) {
    if (import.meta.env.PROD) {
      throw new Error('VITE_API_URL must be configured for the production frontend.');
    }
    return '/api';
  }

  const cleanUrl = envUrl.replace(/\/+$/, '');
  if (import.meta.env.PROD) {
    const backendUrl = new URL(cleanUrl);
    if (backendUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(backendUrl.hostname)) {
      throw new Error('VITE_API_URL must use the HTTPS production backend URL.');
    }
  }

  return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor for attaching JWT Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ferre_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response Interceptor for handling token refresh on 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const requestUrl = originalRequest?.url || '';
    const isSuperAdminRequest = requestUrl.startsWith('/admin/');
    const isAuthRequest = /\/auth\/(login|refresh|logout)(\?|$)/.test(requestUrl);

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;
      try {
        const refreshPath = isSuperAdminRequest ? '/admin/auth/refresh' : '/auth/refresh';
        const refreshResponse = await api.post(refreshPath);
        if (refreshResponse.data?.accessToken) {
          localStorage.setItem('ferre_token', refreshResponse.data.accessToken);
        }
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('ferre_token');
        const loginPath = isSuperAdminRequest ? '/admin/login' : '/login';
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath;
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
