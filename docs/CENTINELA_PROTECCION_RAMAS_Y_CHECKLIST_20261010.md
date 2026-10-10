# CENTINELA — protección de ramas y lista de comprobación de infraestructura (2026-10-10)

**Firma:** CENTINELA. **Alcance:** instrucciones verificables sin acceso a producción. No hay merge, despliegue, migración ni cambio de datos. No contiene credenciales ni hashes.

---

## 1. Estado de CI verificado (checks reales, no supuestos)

Comprobado con `get_check_runs` y los logs de los jobs el 2026-10-10.

| PR | Rama head | Rama base | Check `guard-base-datos` | Causa / resultado |
|---|---|---|---|---|
| [#137](https://github.com/Nelosama/FerreSystem/pull/137) | `claude/integracion-seguridad-fase3` | `claude/integracion-pos-offline-p1` | Fallo (run 38089964618) | `Cannot find module backend/scripts/verificar-migraciones.mjs`: el workflow se portó, el script no. **Corregido** en commit `f7623e17`; pendiente de confirmar run nuevo. |
| [#138](https://github.com/Nelosama/FerreSystem/pull/138) | `claude/centinela-validacion-produccion` | `claude/integracion-seguridad-fase3` | Fallo (run 38089966311) | Mismo motivo. **Corregido** en commit `dd19439c`; pendiente de confirmar run nuevo. |
| [#139](https://github.com/Nelosama/FerreSystem/pull/139) | `claude/centinela-cierre-produccion` | `claude/centinela-validacion-produccion` | Éxito | El script existe en su propia rama. |
| [#141](https://github.com/Nelosama/FerreSystem/pull/141) | `claude/focused-franklin-avfmae` | `main` | Sin check de migraciones en la última consulta | Requiere revisión del workflow de su rama. |

**Lección:** `pull_request` ejecuta el workflow del **head** del PR. Un workflow nuevo solo protege un PR si el head contiene también los scripts a los que llama. Un check verde no prueba que el guard se haya ejecutado: hay que comprobar el job y su log.

**Rama de ATLAS sin guard:** `claude/integracion-pos-offline-p1` (base de #137, head de #129) tiene una versión antigua del workflow: trigger de `pull_request` solo hacia `main` y sin el job `guard-base-datos` funcional, y no tiene `backend/scripts/verificar-migraciones.mjs`. CENTINELA no la modificó (sin coordinación). Propuesta: ATLAS integra el workflow y el script en esa rama, o el propietario lo autoriza explícitamente. Hasta entonces, #129 no está protegido por el guard.

---

## 2. Guía para proteger las ramas (GitHub, repositorio `Nelosama/FerreSystem`)

Acción: **propietario o administrador del repositorio** (CENTINELA no tiene permiso de administración).

### 2.1 Ruleset o protección de `main`

Ajustes → Rules → Rulesets → New branch ruleset (o Branches → Branch protection rule). Objetivo: `main`.

1. **Require a pull request before merging:** activar.
   - Required approvals: **1** mínimo (2 si hay más de un responsable activo).
   - Dismiss stale pull request approvals when new commits are pushed: **activar**.
   - Require review from Code Owners: **activar** (usa `.github/CODEOWNERS`).
   - Require approval of the most recent reviewable push: **activar**.
2. **Require status checks to pass:** activar.
   - Require branches to be up to date before merging: **activar**.
   - Checks requeridos (nombres observados en los runs reales): **`validate`** y **`guard-base-datos`**. Añadir `test` solo si el propietario lo confirma en el workflow vigente de `main`.
   - Si un check no aparece en la lista, es que nunca se ha ejecutado en ese repositorio: ejecutar un PR de prueba antes de exigirlo.
3. **Block force pushes:** activar. **Restrict deletions:** activar.
4. **Do not allow bypassing the above settings:** activar (incluye administradores). Sin esta opción, un administrador puede integrar sin revisión, y la regla de `APROBACION-DESTRUCTIVA` pierde valor.
5. **Linear history:** opcional; si se activa, el propietario decide la estrategia de merge.

### 2.2 Ramas de integración `claude/**`

Las ramas de integración también necesitan protección, porque `APROBACION-DESTRUCTIVA` solo tiene validez junto con revisión obligatoria y protección de rama. Mismo ruleset, con el patrón `claude/integracion-*`. Excepción permitida: ramas personales de trabajo sin merge hacia `main`.

### 2.3 Cómo se verifica (solo lectura, lo ejecuta el propietario)

Con la CLI de GitHub autenticada:

```
gh api repos/Nelosama/FerreSystem/rulesets
gh api repos/Nelosama/FerreSystem/branches/main/protection
```

Resultado esperado: `required_status_checks.contexts` incluye `validate` y `guard-base-datos`; `required_pull_request_reviews.require_code_owner_reviews` es `true`; `enforce_admins.enabled` es `true`; `allow_force_pushes.enabled` es `false`.

Y en la interfaz: un PR de prueba hacia `main` no permite merge con un check en rojo.

### 2.4 Qué bloquea el guard (`backend/scripts/verificar-migraciones.mjs`)

- Comandos prohibidos en ejecutables (`db push`, `migrate dev/reset`, `db seed`, `--accept-data-loss`, `--force-reset`).
- SQL destructivo en migraciones **nuevas** (DROP, TRUNCATE, DELETE FROM, cambio de tipo, RENAME) sin la línea `-- APROBACION-DESTRUCTIVA: <TICKET> @<handle>`.
- Modificación o borrado de migraciones publicadas.
- Creación de la tabla `entorno_ferresystem` desde una migración.

**Límite:** el guard no sustituye la revisión humana. La marca solo indica que alguien la escribió; la validez depende de CODEOWNERS y del ruleset de la sección 2.1.

---

## 3. Lista de comprobación para el propietario: Render, Vercel y Supabase

Todos los pasos son **verificación**, no cambio. Cualquier cambio que modifique producción requiere decisión del propietario.

### 3.1 Render (API)

- [ ] **NODE_ENV = production** en el servicio de producción. Verificar en el panel de variables.
- [ ] **JWT_SECRET** definido, con al menos 32 bytes aleatorios, distinto del de cualquier otro entorno. No copiar de staging.
- [ ] **TRUST_PROXY**: **no configurar por suposición.** Procedimiento: (1) desplegar en un servicio de staging autorizado; (2) ejecutar `backend/scripts/verificar-trust-proxy.mjs --api <URL-staging>/api --limite <AUTH_LOGIN_MAX_FALLOS_IP> --modo evasion`; (3) confirmar `CORRECTO`; (4) repetir con `--modo aislamiento` desde otra red. Solo entonces fijar el valor verificado en producción. Referencia: `docs/AUTENTICACION_FASE3_SESIONES_20261010.md` §9.
- [ ] **AUTH_ACEPTAR_TOKENS_SIN_SESION = false** (recomendado). Si se usa `true`, **AUTH_TOKENS_SIN_SESION_HASTA** debe ser fecha ISO con máximo 24 h. El arranque debe fallar si no cumple; comprobar en los logs del último deploy.
- [ ] **Build command y start command** sin `prisma db push`, `prisma migrate dev` ni `prisma migrate reset`. Verificar en la configuración del servicio, no solo en el repositorio (el guard solo analiza archivos versionados).
- [ ] **Migraciones**: si el start command aplica migraciones, debe usar `migrate deploy` a través de `backend/scripts/migration-safe.mjs`, solo con estado VACIA o LISTA. Confirmar que no hay ejecución automática de migraciones pendientes de otra rama.
- [ ] **Auto-deploy**: desactivar el despliegue automático desde ramas `claude/**`. Solo `main`, y solo tras merge aprobado.
- [ ] **Variables de seed**: `SUPER_ADMIN_PASSWORD`, `TENANT_ADMIN_PASSWORD`, `SEED_CONFIRMAR_IDENTIFICADOR` **no** deben existir en producción.
- [ ] **Logs**: revisar que no se imprimen contraseñas ni tokens (buscar `password`, `Bearer`, `refresh`).

### 3.2 Vercel (frontend)

- [ ] **VITE_API_URL** del entorno de producción apunta a la API de producción por HTTPS. El build falla sin esta variable (guardia del proyecto); confirmar que no se usa un valor de prueba.
- [ ] **Despliegues de vista previa** (previews) de ramas `claude/**` apuntan a una API de staging o simulada, **nunca** a la API de producción ni a Supabase productivo.
- [ ] **Variables que empiezan por `VITE_`** son públicas en el navegador: no contienen secretos. Revisar la lista.
- [ ] **Protección de previews**: si el proyecto es público, activar la protección de despliegues de vista previa (Deployment Protection), o confirmar que no contienen datos reales.
- [ ] **Production Branch** = `main`.

### 3.3 Supabase (PostgreSQL)

- [ ] **Copias de seguridad / PITR** activas y con retención conocida. Anotar la fecha de la última copia verificada. Sin esto, no hay plan de recuperación (FS-41 no está acreditado en producción).
- [ ] **Usuario de solo lectura** para la comprobación de deriva (`prisma migrate diff --from-url <copia>`, ver `docs/CENTINELA_INFORME_DBA_DERIVA_20261010.md`). Crear el rol con `SELECT` únicamente; no usar la clave de servicio para esto.
- [ ] **Clave de servicio (service role)** nunca en el frontend ni en previews de Vercel.
- [ ] **Tabla `entorno_ferresystem` ausente en producción.** Su presencia indicaría un seed contra un entorno que no debía recibirlo. Comprobación de solo lectura: `select to_regclass('public.entorno_ferresystem');` debe devolver `null`.
- [ ] **Tablas históricas** (`garantias`, `apartados`, `transferencias`, `listas_precio`, `auditoria_soporte`, `cierres_comisiones`, etc.) existen con sus datos. **No ejecutar nada que las modifique** hasta que el responsable de base de datos (NEXUS) emita informe y el propietario autorice.
- [ ] **Tabla `_prisma_migrations`**: comparar la lista de migraciones aplicadas con `backend/prisma/migrations`. Solo lectura.
- [ ] **Credenciales de demostración**: ejecutar `backend/scripts/auditar-claves-demo.mjs` **solo** contra una copia restaurada, nunca contra producción directamente. Si hay coincidencias, la rotación requiere autorización escrita (decisión pendiente del propietario).

---

## 4. Bloqueos reales que requieren acceso del propietario

| # | Bloqueo | Quién lo resuelve | Bloquea |
|---|---|---|---|
| B1 | Configurar ruleset y checks obligatorios en GitHub | Administrador del repositorio | Integración segura de todas las ramas |
| B2 | Verificar `TRUST_PROXY` en un staging real de Render | Propietario con acceso a Render | Despliegue de la validación de límites por IP |
| B3 | Comprobación de deriva de solo lectura contra producción | Responsable de base de datos con rol de solo lectura | Integración de #141 y de cualquier migración |
| B4 | Decisión sobre rotación de credenciales de demostración | Propietario (autorización escrita) | Producción |
| B5 | Respaldo y PITR verificados en Supabase | Propietario con acceso a Supabase | Cualquier cambio de base de datos |
| B6 | Decisión de propiedad de la cola offline E5 | Propietario (producto), implementación ATLAS | Cierre de sesión con ventas pendientes |

**Sin estos bloqueos resueltos, el veredicto para producción se mantiene en NO-GO.** Para integración, se mantiene GO condicionado a que los checks de §1 pasen en los PR de integración.

---

## 5. Próxima acción de CENTINELA

1. Confirmar en los checks de #137 y #138 que `guard-base-datos` pasa tras el commit de portado.
2. Informar a ATLAS (rama base de #129) sobre la lección de §1: el workflow debe ir acompañado de su script.
3. Mantener #139 en borrador hasta que el propietario configure B1.

*Firmado: CENTINELA.*
