# PR #180 — preparación técnica para producción (2026-10-24 UTC)

Rama `feat/contabilidad-honduras`. **Sin merge, sin despliegue, sin migraciones en producción, sin correos reales, sin tocar secretos.** Firma de esquema/migraciones: **NEXUS**. Este documento no sustituye la aprobación del propietario ni la del contador.

## 1. Defecto técnico corregido: orden de migraciones

**Síntoma reproducido (PostgreSQL 16 efímero):** una base con las migraciones de `main` (hasta `20261022000000_guia_progreso`) quedaba `BLOQUEADA` con `HISTORIAL_CON_HUECOS` al usar el código del PR, y `migrate:deploy` se negaba. Causa: las migraciones del PR `20261020000000_rol_contador` y `20261020000100_contabilidad_honduras` se ordenaban **antes** de `20261021…` y `20261022…`, ya presentes en `main`. `migration-safe.mjs` exige que el historial aplicado sea un prefijo del orden de carpetas; el CI no lo detectaba porque siempre parte de una base vacía o de la versión inmediata anterior.

**Corrección:** renombradas (contenido y checksum idénticos; nunca se aplicaron en producción) a `20261022000100_rol_contador` y `20261022000200_contabilidad_honduras`, ordenadas entre `guia_progreso` y `auth_recovery`. Referencias actualizadas (`schema.prisma`, `estado-base-solo-lectura.sql`, propuesta de asientos, `CONTABILIDAD_HONDURAS.md`). La guardia **no se relajó**.

**Prueba:** `migraciones-control-arranque.postgres.integration.ts` → «base con las migraciones de main…» (falla con los nombres antiguos, pasa con los nuevos). Comprobación manual: base con `main` → `startup` del PR dice «faltan 3 migraciones» → `deploy` → `LISTA` → `startup` OK.

**Acción del propietario:** si alguna base de *preview/staging* ya aplicó las migraciones con los nombres antiguos, quedará `MIGRACION_DESCONOCIDA`; recrearla o renombrar sus filas en `_prisma_migrations` bajo respaldo. En producción no hay nada que renombrar.

## 2. Disponibilidad ante configuración faltante

Comportamiento verificado en código (`config-auth.ts`, `main.ts`, `migration-safe.mjs`):

| Situación | Resultado | Disponibilidad |
|---|---|---|
| Faltan variables de auth con `NODE_ENV=production` | El proceso nuevo **no arranca** (error con nombres, nunca valores) | Render no promueve una instancia nueva que no pasa el arranque: **la versión anterior sigue sirviendo**. Requiere ruta de health check configurada |
| Código nuevo sin migraciones aplicadas | `start:prod` verifica en solo lectura y no arranca | Igual: la versión anterior sigue activa. Nunca migra solo salvo `FERRE_MIGRAR_AL_ARRANCAR=SI` (no usar en producción) |
| Resend caído o sin clave | `RecoveryMailService` responde 503 genérico; login y operación no dependen del correo | Sin pérdida de servicio |

Se **mantiene** el arranque fallido (fail-closed): degradar a «arrancar sin MFA/correo» debilitaría un control de seguridad (el Super Admin entraría sin segundo factor cifrable) y no es necesario para proteger la disponibilidad. Condiciones para que la protección funcione:

1. **Health Check Path = `/api/health`** en el servicio de Render (Settings → Health & Alerts). Sin él, Render considera sano cualquier puerto abierto.
2. **Configurar las variables ANTES de desplegar el código nuevo** (el código anterior las ignora) y **migrar antes** del despliegue.
3. No borrar manualmente la instancia anterior hasta ver el nuevo despliegue «Live».

## 3. Variables de Render (cuatro obligatorias) — instrucciones exactas

Solo el propietario, en Render → servicio backend → *Environment*. Nunca pegar valores en chat, issues, commits ni variables `VITE_*`.

| Variable | Valor (cómo obtenerlo; no se inventa ninguno) |
|---|---|
| `AUTH_MFA_ENCRYPTION_KEY` | Generar en su máquina: `openssl rand -hex 32` (64 hex). Guardar en gestor de contraseñas **con copia de respaldo**: perderla impide descifrar el TOTP de todos los administradores; no rotar sin plan de recifrado |
| `AUTH_MAIL_RESEND_API_KEY` | Resend → API Keys → crear clave con permiso **solo envío**, restringida al dominio |
| `AUTH_MAIL_FROM` | `Nombre <correo@dominio-verificado>` — dominio/subdominio propio verificado en Resend (SPF y DKIM publicados; DMARC recomendado). Desactivar tracking de enlaces |
| `AUTH_PUBLIC_URL` | Origen HTTPS definitivo del frontend, sin ruta, consulta ni credenciales (p. ej. `https://<su-dominio>`); debe terminar en origen puro, la validación rechaza cualquier otra forma |

Marcar las tres primeras como *secret*. Verificar que siguen definidas y no son de ejemplo: `NODE_ENV=production`, `JWT_SECRET`, `FRONTEND_URLS` (orígenes exactos), `TRUST_PROXY`.

**Orden recomendado**
1. Respaldo verificado y restauración probada en copia aislada (`npm run backup:verify-restore`).
2. `npm run migrate:inspect` contra producción (solo lectura): debe decir `LISTA` y listar como pendientes exactamente `20261022000100_rol_contador`, `20261022000200_contabilidad_honduras`, `20261023000000_auth_recovery` (más cualquiera de `main` aún no aplicada). Cualquier otro estado (`BLOQUEADA`, `CHECKSUM_DISTINTO`, `HUECOS`) detiene el proceso.
3. Añadir las cuatro variables en Render (aún sin desplegar el código nuevo).
4. `npm run migrate:deploy` en ventana autorizada.
5. Desplegar el SHA aprobado; confirmar «Live» y `GET /api/health`.
6. Prueba de entrega Resend con `backend/scripts/prueba-correo-resend.mjs` (requiere `CONFIRM_ENVIO_REAL` y destinatario confirmado por escrito por el propietario) → resultado `ok: true`.
7. Enrolamiento MFA del Super Admin (checklist en `AUTH_RECOVERY_SECURITY.md`) **antes de cerrar la ventana**: las sesiones anteriores de Super Admin se rechazan sin prueba MFA.

## 4. Migraciones, compatibilidad y rollback

- Las tres migraciones del PR son aditivas (tablas, columnas, enum `CONTADOR`, `email` nulo). Verificadas en PostgreSQL efímero, nunca producción.
- **Corrección de una afirmación previa:** `AUTH_RECOVERY_SECURITY.md` y otros documentos decían que el rollback preferido era «revertir el código manteniendo el esquema». **Reproducido: no funciona** — el código de `main` ejecutado contra una base con las migraciones nuevas sale con código 1 (`MIGRACION_DESCONOCIDA`) y no arranca. Consecuencias:
  - Mientras la instancia anterior siga corriendo ya iniciada, sirve; **cualquier reinicio** de esa instancia fallará tras migrar.
  - Un rollback real exige **restaurar el respaldo previo a la migración** (perdiendo lo escrito desde entonces) o ejecutar un SQL de reversión revisado por NEXUS bajo respaldo y retirar las filas de `_prisma_migrations`. Existen reversiones manuales inactivas solo para `guia_progreso`; **no existen** para estas tres migraciones y `ALTER TYPE … ADD VALUE` no es reversible por rollback.
  - Por eso: ventana con respaldo verificado, registrar la hora exacta del respaldo y decidir *antes* el umbral de rollback (p. ej. fallo de arranque o login imposible en los primeros N minutos).
- Rollback de **solo código** (sin tocar la base) es viable únicamente hacia un SHA que ya contenga estas migraciones (p. ej. un commit anterior de este mismo PR), no hacia `main` actual.

## 5. Checklist de validación fiscal del contador

Nada de esto está aprobado; son las reglas que el sistema **no precarga** o deja a decisión del contador. Marcar solo tras revisión documentada con La Gaceta/SAR.

- [ ] **Texto vigente** del Acuerdo 481-2017 y reformas (609-2017, 725-2018, 817-2018) frente a lo que cita `CONTABILIDAD_HONDURAS.md` §2 (fuentes secundarias; SAR no accesible desde el entorno).
- [ ] **Formato de correlativo** `NNN-NNN-NN-NNNNNNNN` y catálogo de tipos de documento (01, 04, 05, 06, 07, 09, 10, 11, 12).
- [ ] **CAI**: rango, fecha límite, normalización (solo mayúsculas y 6–60 caracteres; sin validar estructura) y reglas de saltos de correlativo.
- [ ] **RTN**: 14 dígitos sin dígito verificador; confirmar que no se requiere otra validación.
- [ ] **ISV**: tasas (15 %, 18 %) y vigencias a registrar por empresa; el POS trata toda venta como gravada al 15 % (exentos/exonerados fuera de alcance).
- [ ] **Retenciones** ISV/ISR: agentes designados, porcentajes, base de cálculo, vigencia y base legal por cliente (sin valores precargados).
- [ ] **Política de descuento** BRUTO vs NETO en asientos (`motor/reglas.ts`): sin valor por defecto.
- [ ] **Compras**: momento de reconocimiento del inventario (FACTURA vs RECEPCION; «mercadería en tránsito»).
- [ ] **Devoluciones**: reparto proporcional de ISV (redondeo «mitad hacia arriba») y del descuento.
- [ ] **Resumen de ISV**: confirmar que es solo cálculo de trabajo y no sustituye declaración; plazos DMC 2024.
- [ ] **Cierre/reapertura de períodos** (huella, quién reabre — solo ADMIN) y conservación de la bitácora `fiscal_ajustes`.
- [ ] **Plan de cuentas** y asociación concepto→cuenta (asientos automáticos persistentes siguen sin aplicar; requiere autorización de esquema).
- [ ] **Exportaciones** CSV/Excel/PDF: formato aceptable para el SAR/contador.
- [ ] **Facturación electrónica**: confirmar si es obligatoria para el cliente (fuentes contradictorias).
- [ ] Firma y fecha del contador responsable (nombre, colegiación). Registrarlas en `CONTEXTO_MAESTRO.md`.

## 6. Resultados de verificación de esta revisión

Ver la sección correspondiente de `CONTEXTO_MAESTRO.md` y el comentario del PR para SHA y cifras por ejecución. Límites: Chromium local 151 vs 153 esperado; sin Safari/iPhone físicos; Resend sin entrega real.
