# Auditoría de contabilidad e integración #180 · #202 · #203 — 2026-10-27

Rama de trabajo: `claude/jowa-production-audit-integration-mvd8vl`, derivada de `feat/contabilidad-honduras` (#180, HEAD `3c84a7a`).
Ensayo de integración: `claude/jowa-production-audit-integration-mvd8vl-ensayo` (#180 + correcciones + #203 + #202).
Sin merge a `main`, sin despliegue, sin migraciones productivas, sin cambios en ramas de otros agentes ni en secretos.

Bases verificadas el 2026-10-27: `main` `2f6168d` (PR #198). #180 `3c84a7a`, #202 `59e739d` y #203 `6d23eec` parten de ese mismo `main` (0 commits detrás).

## 1. Estado del PR #180

Borrador, `mergeable_state: clean`, CI verde en `3c84a7a` (validate, guard-base-datos, piloto real). El módulo de Contabilidad
es opcional y está apagado por defecto; con él apagado no cambia ninguna pantalla operativa.

Verificado sin defectos nuevos:

| Área | Evidencia |
|---|---|
| Rol CONTADOR | `ALTER TYPE "Rol" ADD VALUE` en migración propia; permisos iniciales mínimos `contabilidad.ver` (`usuarios.service.ts`). |
| Permisos | `@Roles('ADMIN','CONTADOR')` + `@RequiredPermission` en cada ruta; reapertura de período solo ADMIN (ruta y servicio). Auditoría estática de todas las rutas (`autorizacion-rutas.spec.ts`): CONTADOR no escribe fuera de Contabilidad. |
| Multi-tenant | Todas las consultas filtran `tenant_id`; FK compuestas y disparador `fiscal_misma_empresa`; RLS en las 11 tablas nuevas. |
| Concurrencia | Escrituras con `lockTenant` + reautorización del actor en la transacción; exportaciones en `REPEATABLE READ`; numeración de asientos única por empresa. |
| Precisión monetaria | Centavos enteros, BigInt en porcentajes, límites DECIMAL(14,2) antes de escribir. |
| Trazabilidad | `fiscal_ajustes` y líneas de asiento de solo inserción (disparadores); asientos solo pasan a REVERTIDO; documentos no se borran. |
| Exportaciones | Excel/CSV neutralizan fórmulas (`textoSeguro`), `Cache-Control: no-store`, auditoría `CONTABILIDAD_EXPORTACION`. |

## 2. Defectos encontrados y correcciones (rama propia)

| Id | Severidad | Defecto | Corrección | Prueba |
|---|---|---|---|---|
| AI-01 | **P0** | Las migraciones `20261022000100_rol_contador` y `20261022000200_contabilidad_honduras` se ordenan **antes** de `20261023000000_auth_recovery`, que ya está en `main` desde #198. Reproducido: una base migrada con `main` `2f6168d` queda `BLOQUEADA (HISTORIAL_CON_HUECOS)` con `migration-safe deploy`; `start:prod` no arrancaría. | Renombradas a `20261027000100_*` y `20261027000200_*` (contenido y checksum idénticos), después de `20261026000000` de #203. | Ensayo: base en estado `main` → `deploy` → `LISTA`, `migrate diff` vacío, enum con CONTADOR. |
| AI-02 | P1 | CI no detectaba AI-01: `verificar-migraciones.mjs` no comprueba el orden frente a la base. | Regla 4: una migración nueva debe ordenarse después de la última de la base. Sobre `3c84a7a` falla (detecta AI-01); tras el renombrado pasa. | `verificar-migraciones.test.mjs` (11/11). |
| AI-03 | P1 | El CONTADOR no podía consultar cuentas por cobrar ni por pagar (las rutas de Operaciones solo admiten ADMIN/CAJERO): sin saldos, abonos, pagos parciales, estados de deuda ni historial para conciliar. | `GET /contabilidad/cartera?tipo=CXC|CXP&corte=AAAA-MM-DD`, solo lectura: monto, pagos y abonos, crédito cancelado por devoluciones, saldo al corte en centavos, estado (PAGADA/VENCIDA/PARCIAL/PENDIENTE, mismas reglas que Operaciones), antigüedad, responsable y referencia de cada movimiento. En el corte de hoy compara con `cuentas_operativas.saldo` y `clientes.saldo_pendiente` y reporta hallazgos sin corregir. Excel «cartera» (cartera + movimientos por tipo). Pantalla «Cuentas por cobrar y pagar» del CONTADOR. | Integración PostgreSQL: venta a crédito, abono parcial, pago a proveedor con referencia, devolución parcial, aislamiento, corte histórico/futuro, integridad con saldo alterado, Excel/CSV, base intacta. Navegador simulado. Unitarias de estado y antigüedad. |
| AI-04 | P1 | ISV: al crear un documento desde una venta convertida de cotización con líneas exentas, todo se tomaba como gravado al 15 % y el documento se rechazaba con `ISV_GENERAL_INCORRECTO` (engañoso). Con una tasa de cotización distinta pasaba lo mismo. | El exento se reconstruye de las líneas de la cotización prorrateando el descuento general (centavos, mitad hacia arriba). Con tasa distinta de la general configurada se exige desglose manual con un mensaje claro. | Unitarias (prorrateo sin perder centavos) e integración (600 gravado + 400 exento → documento válido; 18 % → 400 explicativo). |

No se cambió ninguna tasa ni regla fiscal, ni el cálculo de ventas, cobros, caja o inventario.

## 3. Conflictos con #202 y #203

### #203 (autenticación consolidada)

Conflictos textuales (8), resueltos en el ensayo uniendo ambos lados:

| Archivo | Resolución |
|---|---|
| `backend/scripts/estado-base-solo-lectura.sql` | Catálogo de checksums con las migraciones de ambos, en el orden final. |
| `backend/src/usuarios/usuarios.service.ts` | `permisosIniciales` (CONTADOR) + `exigirIdentificadorUnico` y campos de bloqueo de #203. |
| `backend/src/auth/recovery-mail.service.spec.ts` | Versión de #203 (Gmail SMTP sustituye a Resend). |
| `frontend/src/components/RecoveryForm.tsx` | Versión de #203: ya incorpora la corrección de enlaces sucesivos de #180. |
| `frontend/e2e/auth-security.spec.ts` | Versión de #203 (cubre el caso de #180). |
| `backend/test/auth-recovery.postgres.integration.ts` | Versión de #203 + CONTADOR añadido a las matrices de login, bloqueo al sexto fallo y restablecimiento por ADMIN. |
| `frontend/scripts/vercel-ignore.sh` | Unión de ramas excluidas. |
| `docs/CONTEXTO_MAESTRO.md` | Ambas secciones. |

Conflictos semánticos (sin marca de Git):

- **AI-05 (P0 al integrar):** #180 añade `config-auth.ts`, que en producción exige `AUTH_MAIL_RESEND_API_KEY` y `AUTH_MAIL_FROM`; #203 cambia el correo a Gmail SMTP y pide retirar esa variable. Integrados sin ajuste, el backend no arranca si se sigue la instrucción de #203. Resolución preparada en el ensayo: la misma política de #180 (falla cerrada en producción) con las variables de #203 (`AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`). Requiere decisión del dueño: #203 por sí solo permite producción con correo desactivado (solo avisa).
- Pruebas y scripts de #180 que usaban variables de Resend (`ventas.postgres.integration.ts`, `ensayo-actualizacion-preproduccion.sh`) adaptados en el ensayo. `prueba-correo-resend.mjs` y la sección de Resend de `AUTH_RECOVERY_SECURITY.md` quedan obsoletos (no se borraron).
- CONTADOR y bloqueo: #203 ya trata a CONTADOR como cuenta operativa (bloqueo permanente al sexto fallo, desbloqueo por ADMIN). Compatible; ahora cubierto por pruebas.
- Login de dos campos: #203 conserva el alias `email` en la API; las pruebas reales de #180 que inician sesión por API siguen siendo válidas.
- Migraciones: `20261026000000_auth_login_unico_bloqueo` (#203) es aditiva y no toca tablas de Contabilidad.

### #202 (precios del POS)

Sin conflictos textuales ni migraciones. Ventas, crédito, impuestos, cancelaciones, devoluciones y CxC no cambian; solo la validación del precio vigente en el cobro.

- ADMIN ya no puede cobrar en silencio un precio distinto del vigente (cambio intencional). La excepción exige `pos.excepcion_precio` + motivo y queda auditada (`VENTA_EXCEPCION_PRECIO`).
- **P1 (#202):** el permiso `pos.excepcion_precio` no se puede asignar desde la interfaz de usuarios y el POS no envía `excepcionPrecio`; en la práctica nadie puede vender con precio negociado hasta que exista esa interfaz.
- **P1 (#202):** la conversión de cotización por ADMIN sigue aceptando precios distintos del vigente sin esa excepción: dos políticas distintas para el mismo caso.
- Contabilidad: el libro de ventas lee los importes guardados; no depende del precio del catálogo. Sin impacto.

## 4. Pruebas ejecutadas

Locales, PostgreSQL 16 efímero (clústeres en loopback, nunca producción) y Chromium 1243 del entorno.

| Suite | Rama de trabajo (#180 + correcciones) | Ensayo #180 + #203 + #202 |
|---|---|---|
| Backend unitarias | 689/689 | 725/725 |
| Backend build / tsc / lint | Correctos (sin avisos nuevos) | Correctos |
| Scripts backend (`node --test`) | 52/52 (incluye la regla de orden) | — |
| PostgreSQL integración completa | 1165 aprobadas, 1 omitida opt-in, 1 fallo de entorno (`pg_restore` no enlazado en el entorno local); repetido el archivo con el binario: 46/46. Tras el renombrado: migraciones, deriva, arranque, contabilidad y migración de auth 78/78 | **1198 aprobadas, 1 omitida opt-in, 0 fallos** (67 archivos) |
| Contabilidad PostgreSQL | 33/33 (31 previas + cartera + exentos) | incluida |
| Frontend unitarias / tsc / build / lint | 559/559; correctos | 562/562; correctos |
| Navegador simulado | Contabilidad 17/17 | Suite completa 416 aprobadas, 26 omitidas, 0 fallos |
| Actualización desde una base en estado `main` | `migration-safe deploy` → LISTA, `migrate diff` vacío | LISTA, `migrate diff` vacío |
| Guard de migraciones | Correcto (2 nuevas); sobre `3c84a7a` FALLA por AI-01 | Correcto (3 nuevas) |

No ejecutado localmente: piloto real completo `e2e-real` (lo ejecuta el CI), simulacros de respaldo/actualización con Restic, Safari/iPhone/tableta físicos. Ningún correo real enviado.

## 5. Estado de las migraciones

| Migración | Origen | Estado |
|---|---|---|
| `20261023000000_auth_recovery` | `main` (#198) | Publicada en `main`. |
| `20261026000000_auth_login_unico_bloqueo` | #203 | Aditiva; posterior a `main`. |
| `20261027000100_rol_contador` | #180 (renombrada en esta rama) | Aditiva. Antes `20261022000100`. |
| `20261027000200_contabilidad_honduras` | #180 (renombrada en esta rama) | Aditiva. Antes `20261022000200`. |

Reglas para el merge: quien se fusione después debe tener marcas de tiempo posteriores a la última migración de `main` y a la última aplicada en producción; el guard de CI ahora lo exige. Si #180 se fusionara antes que #203, la migración de #203 tendría que renombrarse por encima de `20261027000200`. Antes de desplegar #180 hay que confirmar en producción (solo lectura, `estado-base-solo-lectura.sql`) que no se aplicaron los nombres antiguos `20261020*` ni `20261022000100/200`.

## 6. Orden recomendado de merge

1. **#203** (autenticación). Antes: ejecutar en producción, en solo lectura, `backend/scripts/auth-identificadores-duplicados.sql` y resolver duplicados; configurar `AUTH_MFA_ENCRYPTION_KEY`, Gmail SMTP y `AUTH_PUBLIC_URL`; plan de enrolamiento MFA del Super Admin; respaldo restaurable. Cerrar #200 y #201 como sustituidos (decisión del dueño).
2. **#202** (precios del POS), sin migraciones. Antes: decidir la interfaz del permiso `pos.excepcion_precio` o aceptar la restricción.
3. **#180 + esta rama**, después de sincronizar con `main` (que ya tendrá #203): aplicar AI-05 tal como quedó en el ensayo. El módulo puede fusionarse apagado; activarlo en una empresa requiere la validación fiscal profesional.

## 7. Pendientes de producción

**P0 — bloqueantes**
1. AI-01 corregido en esta rama; falta que llegue a #180. Confirmar que ningún entorno tiene aplicados los nombres antiguos.
2. AI-05: decidir la política de correo y aplicar la resolución del ensayo al integrar #180 con #203.
3. Variables de producción sin configurar ni verificar (Render): `AUTH_MFA_ENCRYPTION_KEY`, `AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`, `AUTH_PUBLIC_URL`, `FRONTEND_URLS`, `TRUST_PROXY`, `JWT_SECRET`, `CONTINGENCIA_CLAVE_OPERACIONES`; `VITE_API_URL` en Vercel.
4. Identificadores repetidos entre empresas antes de #203 (el login ya no pide empresa).
5. Enrolamiento MFA del Super Admin (#203 lo hace obligatorio) y prueba real de entrega de correo, con autorización del dueño.
6. Respaldo con destino remoto (FS-41 sin configurar) y restauración probada antes de cualquier migración productiva.

**P1 — importantes**
1. Validación fiscal profesional antes de activar Contabilidad en una empresa (ISV por producto/exentos, retenciones, CAI/RTN, criterios).
2. #202: permiso `pos.excepcion_precio` sin interfaz; incoherencia con la conversión de cotizaciones.
3. Safari/iPhone/tableta y PWA instalada sin certificar en dispositivos físicos.
4. Operación: sucursales sin aislamiento operativo, caja huérfana si se desactiva el cajero, compras con costo 0 permitidas (auditoría del piloto 2026-10-24).
5. Asientos automáticos y estados financieros/cierre anual (propuesta sin aplicar).
6. `operaciones.cuentas` consulta los pagos por cuenta (N+1); la cartera contable nueva ya usa una sola lectura.
7. Documentación y script de Resend obsoletos tras #203.

**P2 — posteriores**
1. Hojas de cartera dentro del libro contable mensual.
2. Excepciones de precio (`VENTA_EXCEPCION_PRECIO`) como hallazgo contable.
3. Unicidad de documentos recibidos sin RTN (índice con `rtn_contraparte` nulo admite repetidos).
4. Avisos de lint heredados (`strictNullChecks` desactivado).

## 8. Dictamen técnico

- **#180:** funcionalmente sólido para la fase 1 manual y ahora con cartera CxC/CxP para el CONTADOR. **NO MERGE en su HEAD actual** por AI-01 (bloquea el arranque sobre una base actualizada con `main`). Con esta rama incorporada queda técnicamente apto para fusionarse **apagado**, después de #203; su activación en una empresa sigue condicionada a la validación fiscal profesional.
- **#203:** compatible con #180 tras resolver 8 conflictos textuales y AI-05; recomendado como primer merge, condicionado a los P0 de configuración, identificadores duplicados y MFA.
- **#202:** compatible sin conflictos; fusionable tras decidir los dos P1 de política de precios.
- **Producción:** **NO APTO todavía**. El código integrado pasa todas las pruebas automáticas ejecutadas, pero quedan los P0 de la sección 7, que dependen de configuración, datos de producción y decisiones del dueño, no de código.

## 10. Actualización 2026-10-28 (decisiones del propietario)

- **Retiro de MFA:** implementado **una sola vez**, en `origin/claude/consolidate-auth-pr200-201-xz1q5m` (#203, commit `e9fa20a`), que es la rama que el propietario ha confirmado. Mi versión apilada (`claude/jowa-production-audit-integration-mvd8vl-sin-mfa`, `51ea51e`) queda como alternativa superada, sin fusionar; no se duplica en #205. Pasa las 627 unitarias y la suite PostgreSQL completa de mi versión (1142/1142), equivalente a la de #203.
- **Excepciones de precio (#202):** la regla única está en `claude/jowa-production-audit-integration-mvd8vl-precios` (`0b94c31`, sobre #202 `22d3764`): sin excepción 409, sin permiso 403 (también ADMIN), motivo 400, auditoría por línea. Incluye la conversión de cotización, que antes no tenía permiso ni auditoría. Documentada en `docs/POLITICA_EXCEPCIONES_PRECIO.md`. Pendiente P1: el permiso no aparece en la interfaz y el POS no envía `excepcionPrecio`; el ISV distinto en conversiones queda fuera de la regla.
- **Identificadores repetidos:** verificados en PostgreSQL (duplicados usuario/correo entre empresas, correo que solo difiere en mayúsculas, enlace privado de empresa, Super Admin con precedencia). Toda autenticación ambigua responde 401 genérico sin contadores ni sesiones.
- **#205:** sin cambios de MFA; sincronizado el mailer y `.env.example` con el contenido exacto de #203 (sin fusionar su historia) para evitar conflictos. Compatibilidad: #203 nuevo produce conflictos textuales con #205 en el catálogo de migraciones y en pruebas de autenticación: se resuelven al integrar en el orden #203 → #202 → #180 + #205.
