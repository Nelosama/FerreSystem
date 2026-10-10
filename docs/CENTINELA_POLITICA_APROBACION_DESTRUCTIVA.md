# CENTINELA — política de APROBACION-DESTRUCTIVA y protección de integración

**Ámbito:** cualquier migración de base de datos con operaciones destructivas (`DROP`, `TRUNCATE`, `DELETE`, cambio de tipo, `RENAME`).

## 1. Qué es la marca y qué no es

La línea `-- APROBACION-DESTRUCTIVA: <TICKET> @<responsable>` **no es una autorización por sí misma**. Es una declaración verificable de que alguien asumió la responsabilidad. El script `backend/scripts/verificar-migraciones.mjs` comprueba solo el formato. La autorización real depende de los controles de GitHub descritos abajo.

Formato obligatorio: `TICKET` en mayúsculas con guion y número (`CHG-42`), y responsable con handle de GitHub (`@Nelosama`). Un texto libre como `dueño-db` no cumple.

## 2. Condiciones para que la marca sea válida

La marca solo sirve si se cumplen **todas**:

1. La migración es **nueva** en el PR. Las migraciones ya publicadas son inmutables (regla 3 del script).
2. El formato es correcto (ticket y handle).
3. El PR tiene **revisión de CODEOWNERS** de `backend/prisma/`. Ese propietario debe ser distinto de quien escribió la migración.
4. Los checks `validate` y `guard-base-datos` están **en verde** sobre el commit final.
5. Existe un respaldo verificado (`backup:verify-restore`) referenciado en el ticket.
6. La aplicación en producción solo se hace con `migration-safe deploy` (tras `inspect`) en una ventana acordada, por el responsable de base de datos.

Si el PR se modifica después de la aprobación, la aprobación se invalida (ver §3).

## 3. Configuración de protección de ramas (requerida)

Debe configurarse en GitHub → Settings → Branches, para `main` **y** para todas las ramas de integración (`claude/**` que reciban PR). Sin esto, el workflow no es obligatorio:

| Ajuste | Valor requerido |
|---|---|
| Require a pull request before merging | Activado |
| Require approvals | ≥ 1 (≥ 2 si el autor es único propietario de CODEOWNERS, porque GitHub no permite aprobar el propio PR) |
| Require review from Code Owners | Activado |
| Dismiss stale pull request approvals when new commits are pushed | Activado |
| Require status checks to pass | Activado. Checks: **`validate`** y **`guard-base-datos`** (los nombres de job del workflow) |
| Require branches to be up to date before merging | Activado |
| Do not allow bypassing the above settings (incluye administradores) | Activado |
| Restrict force pushes y deletions | Activado |

**Cambios en el workflow que hacen esto posible** (en esta rama):
- `on.pull_request.branches` incluye `claude/**`. Antes solo `main`: las integraciones no ejecutaban el guard.
- `on.push` sobre `main`, para validar también lo que llega a producción.

## 4. Estado de verificación

| Control | Estado en esta sesión |
|---|---|
| Workflow se dispara en PR hacia `claude/**` y `main` | **Verificado en el archivo.** No ejecutado en GitHub real todavía |
| Guard detecta comandos destructivos inyectados | **Verificado localmente** (prueba negativa) |
| Guard rechaza migraciones destructivas sin marca válida | **Verificado** (8 pruebas + 2 nuevas) |
| Checks `validate` y `guard-base-datos` **obligatorios** en la protección de ramas | **No verificable** desde esta sesión: no hay acceso a la configuración de GitHub. Es un bloqueo que requiere administrador del repositorio |
| CODEOWNERS activo y aplicado | **No verificable** en GitHub desde esta sesión. El archivo existe (`.github/CODEOWNERS`) |

## 5. Cómo verificarlo el administrador del repositorio

1. Abrir un PR de prueba hacia una rama `claude/…` que incluya `DROP TABLE` sin marca: el check `guard-base-datos` debe fallar y el merge debe quedar bloqueado.
2. Con la marca válida y sin aprobación de CODEOWNERS: el merge debe seguir bloqueado.
3. Confirmar en la configuración de la rama que `validate` y `guard-base-datos` aparecen como required checks.

## 6. Límites

- El script no sabe si el responsable existe ni si la aprobación es real; eso lo garantiza GitHub con la revisión obligatoria.
- Si alguien con permisos de administrador desactiva la protección, todo lo anterior deja de aplicar. Por eso el paso 3 de la verificación es obligatorio tras cualquier cambio de configuración.
