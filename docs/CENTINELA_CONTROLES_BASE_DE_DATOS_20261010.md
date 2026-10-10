# CENTINELA — controles de base de datos y protección de producción (2026-10-10)

**Agente:** CENTINELA (seguridad). **Rama:** `claude/centinela-cierre-produccion`. **Estado:** GO para integrar, NO-GO para producción.

Este informe responde a: qué rutas del repositorio pueden operar contra la base de producción de Supabase, qué rutas pueden modificar o eliminar tablas sin migración versionada y autorizada, qué controles se añaden, y qué queda pendiente. Ninguna acción se ejecutó contra producción. No hubo merge, despliegue ni migraciones productivas.

## 1. Hallazgo crítico: credencial fija de Super Admin en el repositorio

**Severidad: CRITICAL, si el seed se ejecutó alguna vez contra una base accesible.**

- `backend/prisma/seed.ts` contenía `SuperAdmin2026!` como clave del Super Admin `admin@ferresystem.hn` y la **sobrescribía** con `upsert` (`update.passwordHash`) en cada ejecución. También creaba una empresa de demostración con la clave fija `Ferre2026!` para `cajero@lamundial.hn`, e imprimía ambas claves.
- La credencial aparece en `main` (dos apariciones), en el historial de git (merge #64, `12fccd71`) y en el árbol de trabajo.
- **El README decía que el seed está bloqueado con `NODE_ENV=production`. No existe tal guardia en el código** (cero referencias a `NODE_ENV` en `seed.ts`).
- Cualquier entorno donde se haya ejecutado `prisma db seed` tiene esa clave pública como clave válida del Super Admin. Un Super Admin controla todas las empresas (soporte, impersonación y administradores).

**Acciones en esta rama (no requieren infraestructura):**
- `seed.ts` exige `SUPER_ADMIN_PASSWORD` y `TENANT_ADMIN_PASSWORD` (≥ 12 caracteres), sin valores por defecto. No sobrescribe un Super Admin existente. No imprime claves.
- `seed.ts` rechaza `NODE_ENV=production` y **cualquier base sin marca de entorno registrada** (ver `CENTINELA_SEED_Y_CLAVES_DEMO_20261010.md`). El host ya no se usa como criterio: solo cuenta la marca en la base y su identificador aprobado.
- `replace-super-admin.ts` ya no contiene el correo personal fijo; exige `SUPER_ADMIN_OBJETIVO_EMAIL` y la confirmación con ese mismo valor.
- `frontend/e2e-real/seed.cjs` solo escribe en `127.0.0.1`/`localhost` (verificado: rechaza un host remoto).

**Acciones que requieren el dueño (no las puede hacer esta rama):**
1. Confirmar si `SuperAdmin2026!` o `Ferre2026!` están activas en **algún** entorno (producción, staging, Supabase de desarrollo). Comprobarlo sin revelar la clave: intentar el inicio de sesión desde un entorno autorizado; si responde 200, rotar **inmediatamente** y revisar la auditoría de soporte (`SOPORTE_*`) de ese entorno.
2. Rotar cualquier Super Admin o administrador de empresa que coincida con esas claves.
3. La historia de git no se reescribe en esta fase (sin autorización). Considerar la clave como comprometida en cualquier entorno donde se usó.

## 2. Inventario de rutas que pueden operar sobre la base

Cada ruta se clasifica por si puede **modificar esquema**, **eliminar datos**, o **escribir datos** en la base indicada por `DATABASE_URL`/`DIRECT_URL`.

| # | Ruta | Qué ejecuta | Puede tocar producción | Riesgo | Control actual | Control en esta rama |
|---|---|---|---|---|---|---|
| R1 | `npm run start:prod` (contenedor local `CMD`) | `migration-safe deploy` → `prisma migrate deploy` | Sí, si `DIRECT_URL` apunta a producción | Aplica migraciones en cada arranque. Solo si el estado es `VACIA` o `LISTA`. | `migration-safe.mjs` bloquea otros estados, verifica checksums y orden | CI guard + CODEOWNERS sobre `backend/prisma/` |
| R2 | Render: Build y Start (README) | Build: solo `prisma generate`. Start: `node dist/main.js` | No aplica migraciones | Bajo. El riesgo es que alguien añada un *Pre-Deploy Command* o cambie el comando en el panel de Render | Solo documentación | **Recomendado**: revisar el panel de Render (dueño) y auditar cambios de comandos |
| R3 | `npm run deploy` (`nest deploy`, `@nestjs/mau`) | Despliegue de la aplicación a un servicio externo (AWS vía Mau) | No directamente la base | Desconocido: ejecuta un despliegue fuera de Render y del flujo revisado | No documentado en el README de despliegue | **Recomendado**: eliminar el script o documentar su uso y su aprobación |
| R4 | `npm run dev`, `dev.sh`, `dev.js` | Arranca backend (`start:dev`/`start`) y frontend | Sí, si el `.env` del desarrollador tiene la URL de producción | Escritura de datos de producción desde una máquina de desarrollo | `.env.example` apunta a Supabase sin distinguir entornos | **Recomendado**: proyecto Supabase separado para desarrollo; nunca copiar la URL de producción a `.env` |
| R5 | `prisma db seed` (`package.json` → `prisma.seed`) | `tsx prisma/seed.ts` | Sí | **CRITICAL** (ver §1) | Ninguno; README falso | Corregido en esta rama (§1) |
| R6 | `prisma migrate reset` | Borra **todo el esquema y datos**, luego ejecuta `prisma.seed` | Sí | Destrucción total; la guardia del seed llega **después** del borrado | Ninguno en el repositorio | CI guard (no hay invocación en el repo). **Riesgo residual:** un desarrollador con URL de producción en su `.env`. Mitigación: R4 |
| R7 | `prisma db push` (cualquier modo) | Sincroniza el esquema sin historial; puede eliminar columnas/tablas con `--accept-data-loss` | Sí | Destructivo y fuera de migraciones | README lo prohíbe; sin enforcement | CI guard: rechaza `db push` en cualquier archivo ejecutable |
| R8 | `prisma migrate dev` | Crea migraciones y, si detecta deriva, puede proponer `reset` | Sí | Destructivo con deriva (como la de `main`, §4) | Sin enforcement | CI guard: rechaza `migrate dev` en ejecutables. **Riesgo residual:** uso manual (ver R4) |
| R9 | `migration-safe.mjs adopt` | Marca migraciones como aplicadas (`migrate resolve --applied`) tras comparar esquemas con una referencia vacía | Escribe historial en producción | Medio: altera `_prisma_migrations` sin ejecutar SQL | Exige respaldo verificado y referencia vacía; comparación de esquema | Sin cambio. Solo el responsable de base de datos, con respaldo |
| R10 | `prisma/replace-super-admin.ts` | `DELETE` de Super Admins y creación de uno nuevo | Sí | Destructivo por diseño, operación del dueño | Confirmación por variable | Correo personal eliminado del código; exige `SUPER_ADMIN_OBJETIVO_EMAIL` |
| R11 | `scripts/restore-verify.mjs` | Restaura un respaldo en `FERRE_RESTORE_DATABASE_URL` | Solo si el destino no está vacío | Bajo: exige base vacía | Verifica que no haya objetos en `public` antes de restaurar (verificado en código) | Sin cambio |
| R12 | `frontend/e2e-real/seed.cjs` | Crea empresas y usuarios de prueba con clave conocida | Sí, si `DATABASE_URL` apunta a otra base | Escritura de usuarios con clave conocida | Solo `run.sh` lo ejecuta, sobre clúster temporal | Limitado a `127.0.0.1` (ver §1) |
| R13 | Tests de integración PostgreSQL | Crean clústeres temporales propios; `DELETE` y `DROP` solo dentro de ellos | No | Bajo | Ningún test lee `DATABASE_URL` del entorno (verificado con búsqueda) | Sin cambio |
| R14 | CI (`operacion-ferreteria.yml`, `playwright.yml`) | Solo bases en `127.0.0.1` | No | Bajo | `DATABASE_URL` fijado a `127.0.0.1` | Job `guard-base-datos` añadido |

**Migraciones versionadas:** ninguna contiene `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ni `DELETE`. Una migración (`20260930000000_alter_stock_decimal_and_operational_models`) cambia el tipo de `productos.stock_actual` y `stock_minimo` a `DECIMAL(12,2)`. Es una conversión con posible redondeo si los valores anteriores tenían más decimales. Ya está aplicada en `main`; queda registrada para revisión del DBA.

## 3. Controles de CI/CD propuestos e implementados

### 3.1 Implementado en esta rama

1. **`backend/scripts/verificar-migraciones.mjs`** (job `guard-base-datos` en el workflow):
   - **Regla 1:** rechaza `prisma db push`, `prisma migrate dev`, `prisma migrate reset`, `prisma db seed`, `--accept-data-loss` y `--force-reset` en `package.json`, workflows, Dockerfiles, `deploy/` y scripts del backend. Excluye tests y documentación.
   - **Regla 2:** toda migración **nueva** con SQL destructivo (`DROP`, `TRUNCATE`, `DELETE`, cambio de tipo, `RENAME`) exige la línea `-- APROBACION-DESTRUCTIVA: <ticket> <responsable>`. Los comentarios SQL no cuentan. La aprobación real la da CODEOWNERS.
   - **Regla 3:** las migraciones ya publicadas son inmutables. Solo se permiten archivos nuevos (`A`).
   - **No bloquea** migraciones aditivas, ni las destructivas aprobadas y revisadas.
   - Pruebas: `backend/scripts/verificar-migraciones.test.mjs`, 8/8. Suite de scripts completa: 21/21.
2. **`.github/CODEOWNERS`:** revisión obligatoria del responsable para `backend/prisma/`, `migration-safe.mjs`, `verificar-migraciones.mjs`, `deploy/`, `.github/` y `docs/agentes/`. Requiere activar la regla de protección de rama en GitHub (dueño).
3. **Seed y scripts de administración** con guardias (§1 y R10, R12).

### 3.2 Recomendado (requiere configuración del dueño)

- **Protección de `main`:** exigir que el job `guard-base-datos` y el job `validate` pasen, y revisión de CODEOWNERS antes de fusionar.
- **Usuario de base de datos separado por función:** el usuario de la aplicación en tiempo de ejecución sin privilegios DDL; el usuario de migraciones (dueño del esquema) usado solo por el responsable, con aprobación. En Supabase: revisar que el rol de conexión no sea superusuario y que no tenga acceso de escritura a tablas de otras empresas por la clave `anon`.
- **Proyecto Supabase separado para desarrollo y pruebas.** Ningún `.env` versionado ni local debe contener la URL de producción.
- **Render:** no configurar *Pre-Deploy Command* con migraciones. Las migraciones de producción se ejecutan por un procedimiento manual con respaldo verificado (`migration-safe deploy` después de `inspect`).
- **Eliminar o documentar `npm run deploy`** (`nest deploy`), que despliega fuera del flujo revisado.
- **Ventana de cambio:** las migraciones con aprobación destructiva solo se aplican con respaldo verificado (`backup:verify-restore`) y ticket abierto.

## 4. Deriva heredada de `main` (resumen; detalle en el informe del DBA)

La deriva se mide con `prisma migrate diff` sobre una base migrada limpia. **Las líneas `DROP` indican objetos que existen en las migraciones y no en `schema.prisma`.** La dirección documentada antes era incorrecta y se corrige aquí.

- 219 líneas, idénticas en `main` y en la integración tras la alineación de #138.
- 10 tablas huérfanas, 4 enums, 1 columna huérfana, 38 FK que la base tiene y el esquema no declara con ese nombre (11 se re-declaran con otra acción, sobre todo `ON UPDATE`; 27 no tienen reemplazo y pertenecen a tablas huérfanas o vigentes como `ordenes_compra`, `cajas` o `costos_compra`) y 9 defaults de `id` eliminados.
- Evidencia y checksums: `docs/evidencias/deriva-main-20261010/` (`SHA256SUMS`, reproducción en `reproducir-deriva.sh`).

**Riesgo principal:** si alguien ejecuta `prisma migrate dev` o `db push` con la base real, Prisma propondrá `DROP TABLE` sobre `apartados`, `garantias`, `transferencias`, etc. (R7, R8). El CI guard bloquea esos comandos en el repositorio; no puede impedir su uso manual desde una máquina con la URL de producción (R4).

## 5. Estado de los bloqueos de producción

| Bloqueo | Estado tras esta fase |
|---|---|
| 1. TRUST_PROXY en Render | **Pendiente. Sin configuración por suposición.** Se revirtió la cabecera `TRUST_PROXY=1` añadida a `deploy/local/compose.yaml`, que no estaba verificada en Caddy. Procedimiento de staging en `docs/AUTENTICACION_FASE3_SESIONES_20261010.md` §9 y `backend/scripts/verificar-trust-proxy.mjs`. |
| 2. Deriva de esquema | Mitigado en el riesgo de #129 (0 líneas adicionales). La deriva de `main` sigue abierta: **decisión del DBA** (§4 y `CENTINELA_INFORME_DBA_DERIVA_20261010.md`). |
| 3. Configuración y secretos | Mitigado en el repositorio: sin secretos versionados fuera de la credencial del seed (corregida en esta rama, pero **en el historial**). Pendiente: rotación si la clave estuvo activa (§1), y verificación de Render, Vercel y Supabase con acceso autorizado. |

## 6. Veredicto

- **GO para integrar** esta rama en la rama de integración: corrige la credencial fija, añade guardias y control de CI sin tocar migraciones legítimas, y no cambia la lógica de negocio ni del POS offline.
- **NO-GO para producción** hasta: (a) confirmar y rotar la credencial del seed si estuvo activa; (b) decisión del DBA sobre la deriva de `main`; (c) prueba de TRUST_PROXY en staging autorizado; (d) verificación de configuración y secretos en Render, Vercel y Supabase.
