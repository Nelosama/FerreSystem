import axios from 'axios';
import { installAuthInterceptors } from './authInterceptors';

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

installAuthInterceptors(api);
