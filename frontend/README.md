# FerreSystem: frontend

El frontend usa React, TypeScript y Vite. Usa Node.js 24 y npm; `package-lock.json` fija las versiones instaladas tanto en CI como en Docker y Vercel.

## Desarrollo

```sh
npm ci
npm run dev
```

El servidor de desarrollo redirige `/api` al backend en `http://localhost:3000`. Para compilar, configura `VITE_API_URL` según el entorno y ejecuta `npm run build`. Las pruebas se ejecutan con `npm test`. Después de compilar, instala Chromium con `npx playwright install chromium` y ejecuta `npm run test:browser` para verificar el arranque y la navegación del bundle en un navegador real.

## Despliegue en Vercel

Configura el proyecto con:

| Ajuste | Valor |
| --- | --- |
| Root Directory | `frontend` |
| Node.js | `24.x` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Los comandos y la carpeta de salida están definidos en `vercel.json`. El único archivo de bloqueo del frontend es `package-lock.json`; los cambios de dependencias deben actualizarlo y validarse con una instalación limpia mediante `npm ci`.

En las variables de **Preview** y **Production**, configura `VITE_API_URL` con la URL HTTPS del backend real, incluyendo `/api`; por ejemplo, `https://api.ejemplo.com/api`. Esta variable se incorpora durante la compilación: después de modificarla, vuelve a desplegar. El backend debe permitir el origen del frontend en su configuración `FRONTEND_URL`, también para probar una vista previa.

El valor `/api` se usa en la instalación local con Caddy, que redirige las llamadas al backend. En Vercel, esta configuración publica únicamente el frontend y sus rutas SPA; para este despliegue usa la URL HTTPS del backend externo.

Si aparece `ERR_PNPM_OUTDATED_LOCKFILE`, verifica que Vercel tenga `frontend` como Root Directory y esté usando el Install Command definido aquí. Vercel debe instalar las dependencias con `npm ci`.

Antes de coordinar el despliegue con Render, revisar la [verificación web previa al merge](../docs/VERIFICACION_WEB_ANTES_DEL_MERGE_20261005.md). Una vista previa Ready confirma la publicación del frontend; el login y las funciones nuevas necesitan una API y base de datos compatibles.
