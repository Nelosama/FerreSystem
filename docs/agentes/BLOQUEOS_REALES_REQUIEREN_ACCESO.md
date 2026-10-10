# Bloqueos reales que requieren acceso fuera del repositorio — CENTINELA

Estado: **NO-GO para producción**. Cada bloqueo indica quién debe ejecutar la verificación y cómo. CENTINELA no tiene acceso a estas plataformas en esta sesión.

## Render (backend)

| Verificación | Por qué | Quién |
|---|---|---|
| **TRUST_PROXY**: prueba en staging con `verificar-trust-proxy.mjs` (evasión y aislamiento) y registro del valor final | El número de saltos del enrutador no está documentado; no se asume | Responsable de infraestructura, con staging autorizado |
| Revisar **Pre-Deploy Command** y **Build/Start Command**: no deben ejecutar migraciones ni `db push` | Ningún control del repositorio impide cambiarlos en el panel | Dueño de Render |
| Confirmar `NODE_ENV=production`, `JWT_SECRET` real (≥ 32 bytes) y `DATABASE_URL`/`DIRECT_URL` de mínimo privilegio | Sin `NODE_ENV=production`, el secreto de desarrollo del código se usaría | Dueño de Render |
| `AUTH_ACEPTAR_TOKENS_SIN_SESION`: `false`, o `true` con `AUTH_TOKENS_SIN_SESION_HASTA` ≤ 24 h | Transición de tokens antiguos | Dueño de Render |
| `POS_OFFLINE_ENABLED` en `false` hasta la decisión fiscal D1 | Funcionalidad offline pendiente de aprobación | Dueño del producto |

## Vercel (frontend)

| Verificación | Por qué | Quién |
|---|---|---|
| Solo `VITE_API_URL` como variable pública; ningún secreto en variables `VITE_*` | Las variables `VITE_*` se incluyen en el bundle | Dueño de Vercel |
| `FRONTEND_URLS` de Render con solo los orígenes reales de Vercel | Lista de CORS exacta | Dueño de Render y Vercel |

## Supabase (base de datos)

| Verificación | Por qué | Quién |
|---|---|---|
| **Auditoría de claves demo** en cada base real: `auditar-claves-demo.mjs` en modo lectura | Cuentas creadas por el seed histórico pueden conservar claves conocidas | Responsable de base de datos (NEXUS) |
| Rotar las claves de las cuentas detectadas | Un Super Admin con clave pública controla todas las empresas | Dueño del producto |
| Consultar el tipo y el número de filas de las 10 tablas huérfanas (solo lectura) | Decisión D1 de la deriva | NEXUS |
| Confirmar que el rol de conexión de la aplicación no es superusuario y no tiene DDL | Mínimo privilegio | NEXUS |
| Confirmar que no hay tablas accesibles con la clave `anon` sin política | La API usa el rol de servicio; la clave pública no debe exponer datos de empresas | NEXUS |
| Respaldo reciente verificado con `backup:verify-restore` | Requisito previo a cualquier migración destructiva | NEXUS |

## GitHub (repositorio)

| Verificación | Por qué | Quién |
|---|---|---|
| Protección de `main` y de las ramas de integración con los checks **`validate`** y **`guard-base-datos`** como obligatorios | Sin esto, el workflow no es obligatorio para integrar | Administrador del repositorio |
| Revisión obligatoria de CODEOWNERS y descarte de aprobaciones obsoletas | `APROBACION-DESTRUCTIVA` solo es válida con esa revisión | Administrador del repositorio |
| Prueba de que el guard bloquea un PR con `DROP TABLE` sin marca | Verificación de extremo a extremo | Administrador del repositorio |

Procedimiento completo: `docs/CENTINELA_POLITICA_APROBACION_DESTRUCTIVA.md` §5.
