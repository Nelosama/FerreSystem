// Solo para E2E REAL: sirve el build del frontend y reenvía /api a la API temporal de la prueba.
// No sustituye la configuración de producción (vite.config.ts), que conserva su guard.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.E2E_API_TARGET;
if (!target) throw new Error('E2E_API_TARGET es obligatorio para la vista previa E2E');

export default defineConfig({
  plugins: [react()],
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    // El piloto es del mismo origen (/api usa proxy): no crear variantes CORS
    // artificiales en los recursos estáticos precargados antes de abrir la página.
    cors: false,
    proxy: { '/api': { target, changeOrigin: true } },
  },
});
