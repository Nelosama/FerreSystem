# Verificación web antes del merge

Fecha: 5 de octubre de 2026. Rama: `codex/recuperacion-ventas`; PR #59.

## Fallo confirmado y correcciones

El sitio `https://ferre-system.vercel.app` devuelve HTML y assets con HTTP 200, pero el navegador queda en blanco con el error de React Router: `A <Route> is only ever to be used as the child of <Routes>`. La versión de `main` coloca las rutas de devoluciones y auditoría fuera de `Routes`. La rama ya contiene esa corrección. El despliegue Ready de la vista previa no actualiza el dominio productivo.

El frontend de la rama agrega pruebas de Chromium sobre el bundle compilado: arranque desde rutas públicas/protegidas, ingreso y navegación ADMIN/CAJERO con API simulada y manejo de caché de notificaciones corrupta. Las pruebas interceptan la API y no contactan ni modifican datos de Render. La regresión de `main` se reprodujo contra el mismo test de arranque. También se corrigió el JSON de notificaciones inválido que impedía abrir el login.

Vercel instala con `npm ci`, usa Node 24 y `package-lock.json`. La vista previa requiere autenticación de Vercel. No se cambió esa protección.

## Estado del backend publicado

La URL pública incorporada en el bundle productivo es `https://ferresystem.onrender.com/api`. Se verificaron únicamente solicitudes de lectura y preflight, sin sesión ni datos de negocio:

- Desde el origen productivo, `OPTIONS /api/auth/login` devuelve 204 con el origen exacto permitido y credenciales.
- Desde `https://ferre-system-git-codex-recuperacion-ventas-nelspace.vercel.app`, el mismo preflight devuelve 404 y no autoriza CORS.
- `GET /api/health` devuelve 404: la API responde, pero no tiene registrado el controlador de salud de la rama.

El backend de la rama admite `FRONTEND_URLS` (lista de orígenes exactos separados por comas), conservando `FRONTEND_URL` y los orígenes locales. Rechaza rutas, comodines y credenciales en la configuración. Incluye el encabezado `X-Tenant-Id` usado por login y pruebas HTTP reales aisladas de los preflights.

## Pasos necesarios en Vercel y Render

1. Vercel: Root Directory `frontend`; API HTTPS real en `VITE_API_URL` para Preview/Production. Recompilar después de cambiar esa variable. La configuración actual de Vercel solo publica el frontend: `/api` corresponde a la instalación local con proxy.
2. Render: revisar commit/rama desplegados, Root Directory `backend`, comandos de build/start y estado de autodeploy. Configurar `NODE_ENV=production` y los orígenes autorizados; desplegar el backend compatible con el frontend. Ejemplo para los dominios conocidos:

```text
FRONTEND_URL=https://ferre-system.vercel.app
FRONTEND_URLS=https://ferre-system.vercel.app,https://ferre-system-git-codex-recuperacion-ventas-nelspace.vercel.app
```

Editar `.env.example` no configura Render. La API debe usar la implementación nueva para leer `FRONTEND_URLS`; cambiar solo la variable en una versión anterior no habilita esa lista.

3. Antes de actualizar la API, comprobar el historial y esquema de la base existente con el código y herramientas de la rama: `npm run migrate:inspect` es de solo lectura. Verificar que el script exista en la copia usada. No asumir que estará disponible en un despliegue antiguo de Render.
4. Si requiere baseline o está bloqueada, seguir [instalación y actualización segura](INSTALACION_Y_ACTUALIZACION_SEGURA.md), primero con respaldo y copia restaurada. Hay evidencia de numeración de clientes aplicada manualmente en Supabase; que Clientes abra no certifica el historial de Prisma. La rama añade la tabla `solicitudes_devolucion` y una migración inicial; `start:prod` protege el despliegue y puede detenerse ante un historial incompatible. No cambiar automáticamente el Start Command ni aplicar migraciones a ciegas.
5. Coordinar esquema, API y frontend. Publicar solo el frontend nuevo con API antigua deja sin funcionar recuperación POS, solicitudes de devolución y estado de respaldos. `node dist/main.js` permite arrancar código sin aplicar migraciones, pero no soluciona una tabla faltante.
6. Comprobar `GET /api/health` 200 (conexión a la base), ambos preflights autorizados, login/recarga/renovación de sesión y navegación con la API desplegada. El health no verifica todas las tablas ni sustituye el ensayo de recuperación/devoluciones en una copia de datos.

## Validaciones de la rama

Instalaciones npm limpias sin copiar `node_modules`, builds frontend/backend y validación/generación de Prisma aprobados con Node 24.

| Suite | Resultado |
| --- | --- |
| Frontend | 58/58 |
| Chromium: arranque y navegación con API simulada | 12/12 |
| Backend, incluyendo CORS HTTP | 115/115 |
| Instalación y respaldos | 7/7 |
| Integración PostgreSQL real aislado | 55/55 |
| Total | 247/247 |

Chromium usa el bundle compilado. La prueba de login falla al sustituir únicamente `App.tsx` por el de `main`, reproduciendo el error observado en producción, y pasa con la rama. Las pruebas PostgreSQL usan clústeres temporales; no la base cloud.

## Límite de esta revisión

Se pueden verificar el código y la compilación en este entorno. No hay acceso autenticado configurado a Render ni a la base cloud; no se inspeccionó ni modificó esa base, no se cambió el servicio de Render y no se hizo merge a `main`. Las pruebas simuladas de navegador no certifican el login de producción. La aceptación del despliegue completo depende de ejecutar y comprobar los pasos anteriores.
