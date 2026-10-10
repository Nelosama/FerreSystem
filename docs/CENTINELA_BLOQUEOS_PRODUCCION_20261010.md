# CENTINELA — bloqueos para producción (2026-10-10)

**Veredicto:** GO para integrar en la rama de integración (PR #137). **NO-GO para producción** hasta cerrar los tres bloqueos. Este informe distingue ambos veredictos y no declara ningún componente seguro solo porque sus pruebas pasan.

## Bloqueo 1 — `TRUST_PROXY` en Render

**Estado: no verificado. Bloqueo externo.** No hay acceso a la configuración de Render desde esta sesión (la búsqueda de herramientas no devolvió ningún conector de Render) y el repositorio no documenta el número de saltos del enrutador de Render.

**Lo que sí está verificado (evidencia reproducible):** `backend/scripts/validar-trust-proxy-local.sh` levanta la API real con PostgreSQL temporal y un proxy que añade la IP real a `X-Forwarded-For`. Salida guardada en `docs/evidencias/centinela-trust-proxy-local-20261010.txt`:

| Configuración | Resultado | Lectura |
|---|---|---|
| A. Sin proxy, `TRUST_PROXY=1` | **EVASION**: 401, 401, 401, 401 | El cliente controla su IP con `X-Forwarded-For`. Riesgo real si Render no añade cabecera o no hay proxy. |
| B. Proxy de 1 salto, `TRUST_PROXY=1` | **CORRECTO**: 429 en el intento 4; `127.0.0.2` entra con 401 | Configuración esperada. |
| C. Proxy de 1 salto, `TRUST_PROXY=2` | **EVASION** | Más saltos de los reales: el cliente vuelve a controlar la IP. |
| D. Proxy de 1 salto, sin `TRUST_PROXY` | Sin evasión, pero **cubo compartido**: `127.0.0.2` recibe 429 | Todos los usuarios detrás del proxy comparten un cubo: un usuario bloquea a toda la tienda. |

**Conclusión:** `TRUST_PROXY=1` solo es correcto si Render añade exactamente un salto con la IP real al final de `X-Forwarded-For`. Ese hecho debe comprobarse en el servicio desplegado, no suponerse.

**Procedimiento de cierre (requiere acceso a staging en Render, autorizado por el dueño):**
1. Desplegar en staging con `AUTH_LOGIN_MAX_FALLOS_IP=3` y `TRUST_PROXY=1`.
2. Desde una red: `node backend/scripts/verificar-trust-proxy.mjs --api https://<staging>/api --limite 3 --modo evasion` → debe imprimir `CORRECTO`.
3. Desde otra red, sin haber fallado antes: `node backend/scripts/verificar-trust-proxy.mjs --api https://<staging>/api --limite 3 --modo aislamiento` → debe imprimir `CORRECTO` (401).
4. Si `evasion` imprime `EVASION`, probar `TRUST_PROXY` a 0 o a 2 en staging y repetir. Si `aislamiento` imprime `COMPARTIDA`, el número es demasiado bajo.
5. Registrar el resultado y el valor final en el PR de despliegue. No dejar `AUTH_LOGIN_MAX_FALLOS_IP=3` en producción.

## Bloqueo 2 — deriva de esquema y migraciones de #129

**Corrección de un error anterior:** en la validación final escribí que las tablas de apartados y comisiones estaban en `schema.prisma` sin migración. **Era al revés.** La deriva se mide con `prisma migrate diff --from-url <base migrada> --to-schema-datamodel`: las líneas `DROP TABLE` indican tablas que existen en las migraciones y no en el esquema.

**Qué aporta #129 y qué ya existía en `main`** (medido sobre base migrada limpia):

| Origen | Líneas de deriva | Naturaleza |
|---|---|---|
| `main` (ya existente) | 219 | Tablas huérfanas creadas por `20260930000000_alter_stock_decimal_and_operational_models` y no modeladas: `apartados`, `abonos_apartado`, `listas_precio`, `pedidos_especiales`, `transferencias`, `detalles_transferencia`, `garantias`, `historial_garantias`, `cierres_comisiones`, `auditoria_soporte`; 4 enums; columna `clientes.lista_precio_id`. También `ON UPDATE` distinto en ~20 FK (base `NO ACTION`, Prisma `CASCADE`; el `ON DELETE` coincide) y 9 defaults de `id` eliminados. |
| #129 (antes de esta corrección) | +36 | Nombres de 8 FK y 1 índice de las tablas de contingencia, y 3 FK de `productos_proveedores` (tenant, creado_por, actualizado_por) que el esquema no declaraba. |
| #129 después de la corrección de CENTINELA | **0 adicionales** | La deriva de la rama es idéntica a la de `main` (219 líneas). |

**Corrección aplicada en la rama `claude/centinela-validacion-produccion`:** `schema.prisma` declara los nombres reales de esas 8 FK y el índice (`map:`), y las relaciones de `productos_proveedores` con `Tenant` y `Usuario`. **No cambia la base de datos.** Verificado: `prisma validate` y `prisma generate` correctos; build de producción sin errores; 38 archivos unitarios (357/357); integración PostgreSQL completa (25 archivos, 418 aprobadas, 1 omitida, la misma que antes).

**Riesgos de las 219 líneas de `main` (no resueltos, requieren decisión del dueño y DBA):**
- **Riesgo destructivo:** cualquier `prisma migrate dev` o `prisma db push` contra una base real generaría `DROP TABLE` sobre `apartados`, `garantias`, `transferencias`, etc. y perdería datos. El script `start:prod` solo ejecuta `migrate deploy` (con `migration-safe.mjs`, que valida historial y checksums, pero no bloquea operaciones destructivas), así que el riesgo está en el uso manual.
- Las tablas huérfanas tienen código que las referencia (`garantias.controller.ts`, páginas de apartados y transferencias del frontend con marcador pendiente). Antes de eliminarlas hay que decidir: modelarlas en el esquema (sin cambio de base) o retirarlas con una migración planificada, con respaldo verificado. Ninguna de las dos se ejecutó.
- El `ON UPDATE` distinto no afecta la integridad práctica (las claves primarias son UUID y no se actualizan), pero queda como deuda de esquema.

**Verificación requerida antes de producción:** en la base de staging, comparar `_prisma_migrations` con las migraciones del repositorio, confirmar que las tablas de #129 existen y que las 219 líneas no contienen cambios en filas. Lo ejecuta un DBA con autorización; no se ejecutó nada productivo.

## Bloqueo 3 — configuración y secretos de producción

**Estado: pendiente de verificación en las plataformas.** En el repositorio no hay secretos versionados: el escaneo de archivos rastreados solo encontró placeholders en `.env.example` y lecturas desde `/run/secrets` en `container-entry.mjs` y `provision-local.mjs`.

| Variable / secreto | Plataforma | Requisito | Verificación |
|---|---|---|---|
| `NODE_ENV` | Render | `production` | Pendiente |
| `JWT_SECRET` | Render | Secreto real, ≥ 32 bytes aleatorios; sin él la API no arranca en producción | Pendiente |
| `DATABASE_URL`, `DIRECT_URL` | Render | Conexión a Supabase con usuario de mínimo privilegio; nunca a la base de pruebas | Pendiente |
| `TRUST_PROXY` | Render | Ver bloqueo 1 | Pendiente |
| `AUTH_ACEPTAR_TOKENS_SIN_SESION` | Render | `false` recomendado; si `true`, `AUTH_TOKENS_SIN_SESION_HASTA` ≤ 24 h | Pendiente |
| `FRONTEND_URL` / `FRONTEND_URLS` | Render | Solo orígenes exactos de Vercel | Pendiente |
| `POS_OFFLINE_ENABLED` | Render | `false` hasta la decisión fiscal D1 (ver PR #129) | Pendiente |
| Supabase | Supabase | RLS no sustituye al `tenantId` de la API (la API usa el rol de servicio); revisar que el rol de conexión no sea superusuario y que no haya tablas expuestas con la clave `anon` | Pendiente (sin acceso) |
| Vercel | Vercel | Solo `VITE_API_URL` público; ningún secreto en variables `VITE_*` | Pendiente (sin acceso) |

**Riesgo de configuración sin verificar:** si `NODE_ENV` no es `production` en Render, la API usa un secreto JWT de desarrollo incluido en el código (`getJwtSecret`). Ese caso no está cubierto por ninguna prueba del repositorio.

## Prueba E2E pendiente: cierre de sesión con ventas en IndexedDB

**Estado: no implementada.** La cobertura actual prueba el lote offline en backend, pero ningún E2E de navegador cierra sesión con ventas pendientes en IndexedDB.

**Escenario a implementar** (en `frontend/e2e-real/`, contra API y PostgreSQL reales):
1. Cajero con caja abierta; equipo POS registrado; ventana de contingencia emitida.
2. Sin conexión (o con la API interceptada solo para el envío): registrar dos ventas en efectivo. Quedan `PENDIENTE` en IndexedDB.
3. Cerrar sesión desde la interfaz (`TenantContext.logout` → `POST /auth/logout`).
4. Verificar en el navegador que IndexedDB conserva las dos operaciones con su `operacionId` y estado `PENDIENTE`.
5. Iniciar sesión de nuevo con el mismo cajero.
6. Ejecutar la sincronización. Esperado: las dos ventas quedan `SINCRONIZADA` con correlativo central; en PostgreSQL existe una venta por `operacionId` y el stock descuenta una vez.
7. Repetir la sincronización: no crea duplicados.

**Requisitos:** navegador con IndexedDB real, `POS_OFFLINE_ENABLED=true`, y un modo de conexión controlable en Playwright (`context.setOffline`). Se reutilizan los helpers de `contingencia-real.spec.ts`.

**Por qué queda pendiente:** la prueba depende de un modo offline controlable y de la persistencia de IndexedDB entre inicios de sesión, que no se pudo validar en esta sesión sin una ejecución de navegador dedicada. Hasta cerrarla, la sincronización tras logout queda cubierta solo en backend.

## Estado de los tres bloqueos

| Bloqueo | Estado | Cierre |
|---|---|---|
| 1. TRUST_PROXY en Render | No verificado (sin acceso) | Procedimiento de staging, autorizado por el dueño |
| 2. Deriva de esquema #129 | #129 no añade deriva; la deriva de `main` (219 líneas) sigue abierta | Decisión del dueño y DBA sobre tablas huérfanas |
| 3. Configuración y secretos | Pendiente de verificación en Render, Vercel y Supabase | Revisión con acceso autorizado |

Este informe no autoriza el despliegue. No se modificó infraestructura productiva, no se fusionó ningún PR y no se ejecutaron migraciones productivas.

## Actualización de CENTINELA (cierre de seguridad y protección de producción)

- **Bloqueo 1 (TRUST_PROXY):** sigue pendiente. Se revirtió `TRUST_PROXY: "1"` en `deploy/local/compose.yaml`: esa cabecera estaba comprometida en la integración anterior sin verificación real de Caddy, y la instrucción es no configurar saltos por suposición. Ver `CENTINELA_CONTROLES_BASE_DE_DATOS_20261010.md` §5.
- **Bloqueo 2 (deriva):** el informe técnico para el responsable de base de datos está en `CENTINELA_INFORME_DBA_DERIVA_20261010.md`. La evidencia se regeneró: la versión previa estaba mal etiquetada.
- **Bloqueo 3 (secretos):** nuevo hallazgo CRITICAL en el seed (credencial fija de Super Admin, presente en el historial). Ver `CENTINELA_CONTROLES_BASE_DE_DATOS_20261010.md` §1.
