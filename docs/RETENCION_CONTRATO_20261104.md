# Persistencia, cuota y retención del diario de contingencia — 2026-11-04

**Base:** `main` `8a43b06d` (merge #236). **Rama:** `claude/persistencia-retencion-20261104`.
**Cubre:** P1-1 (persistencia y cuota) y el diseño ejecutable de P1-5 (retención), de [AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104.md](AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104.md).
**Estado de P1-5:** puertas, resumen y ejecutor implementados y probados, **sin llamadores**. No borra ninguna operación hasta que se cumplan los puntos de la sección 3.

## 1. Implementado y verificado en esta rama

| Módulo | Qué hace | Cómo se verifica |
|---|---|---|
| `frontend/src/offline/almacenamiento.ts` | Lee y solicita `persisted()`/`persist()`, mide `estimate()`, clasifica el espacio libre y reconoce `QuotaExceededError`. Sin API, error o medición inválida devuelve `no-soportado` o `desconocido`, nunca una cifra inventada. | `test/almacenamiento.test.mjs` (23 casos: todas las ramas, incluidas las ausentes y las erróneas) |
| `frontend/src/pages/PosContingenciaPage.tsx` | Pide persistencia al abrir si no la tiene; muestra avisos de persistencia y de espacio (aviso y crítico); con menos de 50 MiB libres bloquea el cobro; el error de escritura dice «espacio lleno» solo si es cuota. | E2E `contingencia-almacenamiento-simulado` (7/7) |
| `frontend/src/offline/retencion.ts` | Puertas de eliminación, hash canónico del payload, resumen de auditoría sin datos personales, reconfirmación con el servidor y ejecutor atómico. | `test/offline-cuota-retencion.test.mjs` (21 casos con IndexedDB simulada) |
| `frontend/test/helpers/cargar-ts.mjs` | Cargador compartido para probar módulos TypeScript. | usado por las dos pruebas anteriores |

**Garantía de no anunciar una venta fallida:** la confirmación solo se muestra después de que la transacción de `registrarOperacion` termina en `complete`. Si la transacción falla, la venta no aparece como guardada, el contador no avanza y no queda ninguna operación a medias (`offline-cuota-retencion`, primer grupo, y E2E «fallo de escritura al guardar»).

## 2. Puertas de la retención (P1-5)

Una operación solo es eliminable si se cumplen **todas**:

1. Estado `SINCRONIZADA` y `requiereRevision` falso. `PENDIENTE`, `ENVIANDO` y `REVISION` nunca son eliminables.
2. El servidor reconfirma **en los últimos 5 minutos** la operación como `APLICADA` (no `RESUELTA_MANUAL`).
3. Coinciden `numeroVenta`, `correlativoDefinitivo` y el **hash del payload** (SHA-256 del contenido canónico).
4. El servidor confirma que la **caja de la operación está cerrada**.

Si falta cualquier dato, la decisión es denegar (falla cerrada). Un fallo de escritura durante la eliminación revierte toda la operación.

**Consecuencia práctica hoy:** la respuesta actual de `GET /contingencia/operaciones/estados` no devuelve `payloadHash` ni `cajaCerrada`. Con esa respuesta **ninguna operación es eliminable**. Lo comprueba la prueba «con la respuesta actual del servidor… nada es eliminable».

## 3. Contrato pendiente de coordinación (no implementado)

### 3.1 Backend (contingencia, fuera de esta rama)
- `GET /contingencia/operaciones/estados` debe devolver para cada operación:
  - `payloadHash`: SHA-256 hexadecimal del contenido canónico definido en `payloadCanonico` (`retencion.ts`). El servidor debe usar la misma serialización: se recomienda compartir vectores de prueba entre frontend y backend.
  - `cajaCerrada`: `true` o `false` según el estado de la caja de la operación (`cajaId`). Si no puede determinarlo, debe devolver `null`, que la retención trata como desconocido.
- Este cambio toca el contrato del backend. Requiere revisión de NEXUS según la regla del repositorio y no se incluye aquí.

### 3.2 Archivos de Codex (`journal.ts`, `sync.ts`, `useConexion.ts`)
No se han modificado. Para activar la retención hace falta acordar:
1. **Declarar `tenantId?: string` en `OperacionLocal`** (`journal.ts`). Ya lo pide P1-3 y evita depender de propiedades extra.
2. **Punto de llamada:** la retención debe ejecutarse después de una sincronización exitosa con sesión válida, en la pestaña operadora y con conexión. Ese punto está en `sync.ts` o en la página, a decidir con Codex. Este PR no lo añade.
3. **Conteo de pendientes** (`contarVentasPorEnviar`): no debe contar operaciones de otra empresa. Sigue pendiente, como en #236.

Hasta que Codex confirme el punto 2, **el ejecutor `eliminarConfirmadas` no tiene llamadores y no puede borrar nada en producción**.

## 4. Limitaciones conocidas

- **Cuota real del motor:** en el E2E no se logra forzar un `QuotaExceededError` del motor de Chromium (con `Storage.overrideQuotaForOrigin` la escritura sigue pasando). La traducción de `QuotaExceededError` a «espacio lleno» está probada por unidad (`almacenamiento.test.mjs`), no end-to-end. El E2E sí prueba que una escritura fallida no deja venta confirmada.
- **`fake-indexeddb`** entrega una excepción lanzada dentro de `add()` como `AbortError`, no como `QuotaExceededError`. Las pruebas de integridad no dependen de ese nombre.
- **Medición de cuota:** `navigator.storage.estimate()` es aproximada y varía por navegador. Los umbrales (200 MiB aviso, 50 MiB bloqueo, 70 % de uso) son la política de §5.3 de la auditoría, no valores medidos en dispositivos reales.
- **iOS/Safari:** no verificado. Puede no ofrecer `persist()` ni `estimate()` con la misma semántica.
- **Resúmenes de auditoría:** se guardan en `meta` con clave `auditoria:<operacionId>`, sin límite de tamaño. Cada resumen ocupa unos cientos de bytes. Una política de purga de los propios resúmenes requiere decisión del dueño.
- **Reinicio:** probado con una segunda instancia de los módulos sobre la misma base simulada, no con cierre real del navegador.

## 5. Pruebas ejecutadas (Node 22.23.4, Chromium 1243)

- `npm test`: **723/723**.
- Nuevas: `almacenamiento.test.mjs` (todas las ramas de persistencia y medición) y `offline-cuota-retencion.test.mjs` (cuota en el alta, puertas, hash, resumen sin datos personales, reconfirmación, ejecutor atómico, omisión por cambio de estado o de carga, fallo a mitad de transacción y reinicio).
- E2E nuevo `contingencia-almacenamiento-simulado`: **7/7**. Contraprueba contra la página de `main`: fallan 3 (los que exigen los avisos), y pasan las 4 de no regresión, como se espera.
- E2E de contingencia, sesión, PWA, offline y auth: **87/87** en total con el nuevo.
- `tsc -b` y build correctos. Lint: 123 advertencias, igual que `main`.
- Guardia de Vercel de la nueva rama: `vercel-pilot-guard` 42/42.
- **No ejecutados localmente:** E2E reales con API y PostgreSQL. Los cubre el CI del PR.

## 6. Pendiente

- Decidir con Codex el punto de llamada y el tipo `tenantId` (sección 3.2).
- Contrato y revisión NEXUS del backend (sección 3.1).
- Validar la medición de cuota en dispositivos reales (la caja de la ferretería o equipos equivalentes).
- Política de purga de resúmenes de auditoría (decisión del dueño).
- Revisar la persistencia en iOS/Safari.
