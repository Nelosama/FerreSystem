# Consolidación general de Jowa System — 2026-10-25 UTC

Documento de continuidad para la rama de consolidación `consolidacion/jowa-20261025` (base `main` `01f9110a`). Sin merge a `main`, sin despliegue, sin producción, sin force push, sin borrado de ramas remotas.

## 1. Estado de la matriz de consolidación

Comprobado contra GitHub y `git` el 2026-10-25.

| Rama / PR | Estado real | Decisión | Commits en la consolidación |
|---|---|---|---|
| `main` `01f9110a` | Base. Incluye #194, #193, #191, #190, #189, #188, #185, #183 | Base de la integración | — |
| #194 `codex/pos-cancelacion-autorizada` | Merged en `main` | Ya integrado | — |
| #193 `codex/figma-admin-integration` | Merged | Ya integrado | — |
| #191 `claude/amazing-bohr-9e5bpj` | Merged | Ya integrado | — |
| #190 `claude/admiring-albattani-n1ruvp` | Merged | Ya integrado | — |
| #189 `codex/guia-control-modulos` | Merged | Ya integrado | — |
| #192 `codex/auth-recovery-security` | **Cerrada sin merge** (2026-10-23). Su commit `15f63571` no estaba en `main`; la rama remota ya no existe. Recuperada con `git fetch origin <sha>` | **Integrada** en la consolidación (prioridad 1: autenticación, MFA y recuperación) | `9ce1048` |
| #196 `claude/gallant-knuth-c68iv1` (abierta) | Normaliza `NODE_ENV` en cookies y cabeceras; sin conflictos con `main` | **Integrada** | `8c25f10` |
| #197 `claude/kind-pasteur-ilo43m` (borrador) | Solo pruebas e informe del piloto; sin cambios de producto | **Integrada** | `5625c82` |
| #195 `claude/sweet-davinci-vh7br4` (abierta) | Navegación híbrida, dashboard y Super Admin (61 archivos) | **Integrada**; conflictos resueltos (ver §3) | `b90b8dc` |
| #180 `feat/contabilidad-honduras` (borrador, dictamen propio «NO MERGE») | Contabilidad fase 1 (194 archivos). Se fusiona limpio con `main` pero **7 archivos en conflicto** con el shell híbrido ya integrado: `App.tsx`, `main.tsx`, `SuperAdminPage.tsx`, `guide.spec.ts`, `ventas.postgres.integration.ts`, `vercel-ignore.sh` y el contexto | **No integrada en esta pasada.** Requiere reconciliar el layout (rail CONTADOR sobre el shell nuevo) y revisión fiscal profesional | — |
| `claude/charming-planck-vmn1y4` | Sin PR. Ancestro de `feat/contabilidad-honduras` (ya incluido en #180) | Absorbida por #180; no integrar por separado | — |
| `claude/sweet-davinci-vh7br4`, `claude/gallant-knuth-c68iv1`, `claude/kind-pasteur-ilo43m`, `feat/contabilidad-honduras` | Ramas remotas de los PR anteriores | Se conservan; no se eliminan | — |

PR que quedarán **absorbidos** por el PR de consolidación cuando se abra: #192 (cerrado), #195, #196 y #197. #180 sigue separado.

## 2. Orden de integración aplicado

Según prioridad de la misión (seguridad → monetario → ventas → … → correcciones):

1. #192 — autenticación por empresa, MFA y recuperación privada (seguridad y recuperación).
2. #196 — configuración de entorno (`NODE_ENV`) en cookies y cabeceras (seguridad).
3. #197 — pruebas de preparación del piloto (sin cambios de producto).
4. #195 — navegación híbrida y Super Admin (experiencia de usuario).
5. #180 — contabilidad Honduras: **pendiente** (ver §5).

## 3. Conflictos resueltos

| Merge | Archivo | Resolución |
|---|---|---|
| #192 | `frontend/scripts/vercel-ignore.sh` | Unión de la lista de ramas excluidas de preview + `codex/auth-recovery-security` |
| #192 | `backend/test/ventas.postgres.integration.ts` | Se conservan ambos imports (`devolucionAutorizada` y `syntheticPlatformMfa`) |
| #192 | `docs/CONTEXTO_MAESTRO.md` | Se conserva la bitácora de `main` (#194); la rama de #192 solo aportaba una sección vacía |
| #195 | `frontend/scripts/vercel-ignore.sh` | Lista de `main` + `claude/sweet-davinci-vh7br4` |
| #195 | `frontend/e2e-real/administracion-cloud-real.spec.ts` | Se conserva el helper `setPrivatePassword` (#192) y el test nuevo de TOPNAV/SIDEBAR (#195) |
| #195 | `docs/CONTEXTO_MAESTRO.md` | Se conservan ambas bitácoras |

Ningún cambio ajeno fue descartado: en cada conflicto se unieron las dos versiones.

## 4. Pruebas ejecutadas en la rama de consolidación

Resultados obtenidos localmente en esta sesión (no son los de CI de GitHub).

| Comprobación | Resultado | Notas |
|---|---|---|
| Backend `vitest run` (unitarias) | **595/595** (59 archivos) | Tras #192 y #196: 592 y luego 595 |
| Backend `npm run build` (Nest) | Correcto | `tsconfig` de build |
| Backend `oxlint --type-aware src/ test/` | 0 errores; avisos heredados | |
| Backend `tsc --noEmit -p tsconfig.json` | Errores solo en `test/**` (globales de Vitest sin tipar) | Preexistente en `main`; no es el contrato de compilación |
| Backend `test:scripts` | **51/51** | |
| Frontend `tsc -b` | Correcto | |
| Frontend `npm test` (node --test) | **542/542** | |
| Frontend `VITE_API_URL=/api npm run build` | Correcto | Sin esa variable el build aborta por diseño |
| Frontend `npm run lint` | Sin errores; avisos heredados | |
| Playwright navegación (10 archivos: navegacion-hibrida, navigation-settings, menu-jowa-v3, diseno-unico, ux-ronda1-regresion, admin-home, admin-shell, cajero-rail, arranque, guide) | **159 aprobadas / 0 fallos / 4 omitidas** | Chromium del entorno |
| PostgreSQL 16 `ventas.postgres.integration.ts` | **46/46** | Requiere envoltura no root (ver §6) |
| PostgreSQL suite completa de integración | Ver §4.1 | |

### 4.1 Suite completa PostgreSQL

Pendiente de cierre en esta sesión; se actualiza al terminar.

## 5. Pendientes reales

1. **#180 contabilidad Honduras sin integrar.** Reconciliar `App.tsx` y `main.tsx` con el shell híbrido (rail del CONTADOR sobre `AdminRail`/`CajeroRail`), revisar `SuperAdminPage.tsx`, `guide.spec.ts`, la prueba de ventas y el contexto. Después, revisión fiscal profesional (ISV por producto, exentos, retenciones, CAI/RTN, redondeo). El propio PR declara NO MERGE para la contabilidad completa.
2. **#192 requiere configuración antes de cualquier despliegue**: `AUTH_MFA_ENCRYPTION_KEY` (respaldada), Resend con remitente y dominio verificados (`AUTH_MAIL_RESEND_API_KEY`, `AUTH_MAIL_FROM`), `AUTH_PUBLIC_URL`, y enrolamiento MFA del propietario del Super Admin (las sesiones antiguas de plataforma no acreditan MFA). Detalle en `docs/AUTH_RECOVERY_SECURITY.md`.
3. Pasarelas de correo reales, validación física de iPhone/Safari/PWA, lector físico y tickets 58/80 mm (sin cambios desde los informes previos).
4. Pendientes de UX heredados de #195: decisión del dueño sobre el tema global del negocio frente a `--color-primary`; tabla de negocios en móvil.
5. Passkeys de #192: contrato documentado, implementación WebAuthn pendiente.

## 6. Bloqueos y notas del entorno

- `initdb`/`pg_ctl`/`postgres` no corren como root. Se usaron envolturas en el directorio temporal de la sesión que ejecutan esos binarios con `runuser -u nobody` (documentado en `docs/CONTEXTO_MAESTRO.md`, sección del piloto de #197). No se modificó el sistema.
- `frontend/artifacts/*.png` se regeneran al correr Playwright; se restauran antes de commitear.
- No hay acceso a producción ni a Render/Vercel/Supabase desde el entorno.

## 7. Estado de preparación para producción

**No listo para producción.** La rama integra cambios de seguridad (#192) que todavía exigen configuración de infraestructura, enrolamiento MFA y revisión técnica; la contabilidad (#180) no está integrada. Ninguna prueba sustituye la aceptación del cliente ni la validación en dispositivos físicos.

## 8. Siguiente tarea recomendada

1. Cerrar la suite completa de PostgreSQL y registrar el resultado en §4.1.
2. Abrir el PR de consolidación hacia `main` (borrador) con esta matriz.
3. Reconciliar #180 sobre el shell híbrido en una rama aparte, con sus pruebas de navegación del CONTADOR.

## 9. Commits relevantes

- `9ce1048` — integración de #192 (autenticación, MFA y recuperación).
- `8c25f10` — integración de #196 (`NODE_ENV`).
- `5625c82` — integración de #197 (pruebas del piloto).
- `b90b8dc` — integración de #195 (navegación híbrida).
