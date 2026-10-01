import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'build') {
    const apiUrl = env.VITE_API_URL;
    if (!apiUrl) {
      throw new Error('VITE_API_URL is required for production builds and must point to the Render API.');
    }
    const parsedApiUrl = new URL(apiUrl);
    if (parsedApiUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(parsedApiUrl.hostname)) {
      throw new Error('VITE_API_URL must be an HTTPS production backend URL, not localhost.');
    }
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
})
