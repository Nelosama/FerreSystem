import axios from 'axios';

const getBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api';
  const cleanUrl = envUrl.replace(/\/+$/, '');
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

    const savedTenant = localStorage.getItem('ferre_tenant');
    if (savedTenant) {
      try {
        const parsed = JSON.parse(savedTenant);
        if (parsed?.id) {
          config.headers['x-tenant-id'] = parsed.id;
        }
      } catch {}
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

    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/login')) {
      originalRequest._retry = true;
      try {
        const refreshResponse = await api.post('/auth/refresh');
        if (refreshResponse.data?.accessToken) {
          localStorage.setItem('ferre_token', refreshResponse.data.accessToken);
        }
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('ferre_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
