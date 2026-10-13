# Solicitud de revisión NEXUS — migración `20261017000000_contingencia_rechazos_importe_incoherente` (F5, opción B)

Estado: **pendiente de revisión de NEXUS.** NEXUS no es accesible desde la sesión de desarrollo; esta solicitud queda publicada y **no se da por recibida** hasta recibir su confirmación. Decisión del propietario: opción B aprobada (2026-10-11). Ejecución en producción: **prohibida** sin autorización.

## 1. Cambio

Archivo: `backend/prisma/migrations/20261017000000_contingencia_rechazos_importe_incoherente/migration.sql`. Reversión manual: `backend/prisma/rollback-manual/20261017000000_contingencia_rechazos_importe_incoherente.sql` (no automática).

```sql
ALTER TABLE "operaciones_contingencia" DROP CONSTRAINT IF EXISTS "operaciones_contingencia_montos_check";
ALTER TABLE "operaciones_contingencia" ADD CONSTRAINT "operaciones_contingencia_montos_check"
  CHECK (
    ("estado" IN ('RECHAZADA', 'RESUELTA_MANUAL') AND "total_centavos" >= 0 AND "efectivo_recibido_centavos" >= 0)
    OR ("total_centavos" > 0 AND "efectivo_recibido_centavos" >= "total_centavos")
  );
```

- Único `DROP`; no se borran filas ni columnas; no se modifica ninguna migración publicada. Lleva la marca `APROBACION-DESTRUCTIVA: CONT-1017 @Nelosama`, que el guard de CI exige y que **requiere revisión de CODEOWNERS** (la marca no sustituye esa revisión).
- Timestamp `20261017000000`: libre. Ninguna rama de trabajo tiene migraciones posteriores a `20261016000000` (comprobado en `main`, FORJA, keen-goldberg, balance-cxc-cxp, kardex-consolidacion, #152 y #153).
- `RESUELTA_MANUAL` se incluye porque «cerrar sin venta» un rechazo por importe incoherente cambia su estado a `RESUELTA_MANUAL`; una prueba contra PostgreSQL real lo detectó (una restricción solo sobre `RECHAZADA` rompía ese cierre).

## 2. Invariantes que se conservan

- `operaciones_contingencia_rechazada_sin_venta_check`: una fila `RECHAZADA` nunca tiene `venta_id`.
- Toda fila `RECIBIDA`, `APLICADA` o `REVISION` exige `total > 0` y `efectivo >= total` (probado contra PostgreSQL real por estado).
- Importes negativos siguen prohibidos en todos los estados.
- Una fila `RECHAZADA` no tiene venta, no genera movimiento de caja y no modifica existencias. La aplicación nunca la aplica (`aplicar` la rechaza); `ACEPTAR` y `REINTENTAR` responden 409.

## 3. Impacto en reportes y conciliación (revisado en el código)

| Consumidor | Qué lee | Impacto | Acción tomada |
|---|---|---|---|
| `ContingenciaService.listar` | filas del diario | Una fila con `efectivo < total` daría cambio negativo | `cambioCentavos = max(0, efectivo − total)` y campo nuevo `faltanteCentavos` |
| `ContingenciaService.resumen` (`contingencia.conflictos`) | suma de `total_centavos` por estado | Los rechazos por importe aportan su **total declarado**, no el efectivo recibido | Campo aditivo `efectivoCentavos` en cada bucket |
| `conciliarEfectivo` (cierre sin venta) | `total_centavos` | Habría ingresado a caja el total aunque se recibió menos | El ingreso es `min(total, efectivo)`; con efectivo 0 no hay movimiento |
| `inventarioPendiente` | líneas del payload de filas sin venta | Sin cambio: lista mercancía pendiente de conciliar físicamente | — |
| Ventas, caja, arqueo, balance | `ventas`, `movimientos_caja`, `cajas` | **Ninguno**: la fila rechazada no crea ventas ni movimientos | Probado: sin venta, sin movimiento, sin cambio de stock |
| Consultas fuera del módulo | `operaciones_contingencia` | Búsqueda en `backend/src`: no hay lectores fuera de `contingencia.service.ts` | — |

## 4. Pruebas (PostgreSQL real)

`backend/test/contingencia-f5-importes.postgres.integration.ts` (8): restricción directa en la base por estado (positivos y negativos); cobro menor al total y total cero sin venta, movimiento ni cambio de stock; intruso sin fila a nombre del dueño; cierre sin venta acotado al efectivo recibido; no aceptable ni reintentable; listado y resumen; regularización de caja cerrada con cobro insuficiente. Más una prueba de concurrencia (10 envíos paralelos del mismo rechazo: una fila y una auditoría).

## 5. Preguntas para NEXUS

1. ¿La restricción debe distinguir `RESUELTA_MANUAL` con venta nula (hoy no hay restricción equivalente a `rechazada_sin_venta_check` para ese estado)?
2. ¿Algún informe externo, exportación o hoja de cálculo suma `operaciones_contingencia.total_centavos` sin filtrar por estado? No hay lectores en el código; los externos solo pueden confirmarse fuera del repositorio.
3. ¿Se acepta el `DROP`/`ADD CONSTRAINT` en una sola transacción o se requiere `NOT VALID` + `VALIDATE`? La tabla es pequeña; el `ADD` valida las filas existentes, que ya cumplen la regla anterior y por tanto la nueva.
4. Procedimiento de reversión: la restauración exige antes decidir qué hacer con filas incoherentes ya registradas (ver el archivo de reversión manual).

## 6. Lo que NO se ha hecho

- No se ha ejecutado ninguna migración en ningún entorno. Solo se aplicó sobre PostgreSQL temporal en las pruebas.
- No hay confirmación de NEXUS. Hasta recibirla, la migración **no debe integrarse** en `main`.
