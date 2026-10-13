# Coordinación ATLAS y NEXUS — consolidación #134/#140 (KARDEX)

**Estado:** solicitud documentada. KARDEX no pudo coordinar en vivo: en esta sesión no hay otros agentes activos (`ListAgents` sin resultados). Lo que sigue queda pendiente hasta que ATLAS y NEXUS respondan a este documento.

Rama de integración temporal: `claude/kardex-consolidacion-134-140`, desde `claude/integracion-pos-offline-p1` (PR #129, `c5fe4982`), con PR #140 (`1d3971be`) y PR #134 (`57c64962`).

## 1. Regla de venta autorizada (fuente única)

Un producto se vende si y solo si:

    activo = true  AND  precio_aprobado = true  AND  precio_venta > 0   (y existencias disponibles)

- `activo` no equivale a aprobado. Un producto puede estar activo administrativamente sin estar autorizado para vender.
- Solo ADMIN aprueba y fija precios: `PATCH /productos/:id/precios` (`aprobar`, `version`, `precioCosto`, `precioVenta`, `motivo`).
- Cambiar el precio de venta de un producto aprobado **revoca** la aprobación; reaprobar exige `aprobar: true`.
- Un cambio solo de costo **no** revoca la aprobación y actualiza el costo vigente.
- Cada cambio queda en `auditoria_operaciones` (`PRECIO_APROBAR`, `PRECIO_MODIFICAR` con `revocada`).

## 2. Contrato que ATLAS debe consumir (no implementado por KARDEX)

| Interfaz | Estado en la consolidación | Qué debe garantizar ATLAS |
|---|---|---|
| `ventas.service.ts` → `create` | Rechaza producto no aprobado o con precio ≤ 0 (400), dentro de la transacción | No bypass. Venta sin inventario (`sinInventario`) cumple la misma regla. |
| `operaciones.service.ts` → `entregar`, `entregas` | Sin validación de precio (entregar una venta ya registrada) | Confirmar: una revocación posterior no debe bloquear la entrega de una venta ya registrada. Decisión a tomar con ATLAS. |
| `productos.service.ts` → `comercial` | Solo devuelve productos aprobados con precio > 0 | El catálogo POS debe usar este criterio. |
| Catálogo POS offline (`contingencia.service.ts`, ~línea 158) | **Pendiente.** Filtra solo `activo: true` | Agregar `precioAprobado: true` y `precioVenta > 0` al catálogo, y validar la aprobación al sincronizar cada línea. KARDEX **no** edita este archivo: ATLAS trabaja en él. |
| Respuestas de productos | Incluyen `precioAprobado` y `pendienteConfiguracion`; nunca `precioCosto`, `margen` ni `costoVigente` para no ADMIN | Cajero puede consultar precio de venta; no costos. |

Riesgo abierto: con la contingencia activa, un producto no aprobado podría venderse offline mientras su catálogo local no filtre aprobación. Es un bloqueo P0 para cualquier activación offline en clientes.

## 3. Privacidad comercial en operaciones (backend)

Para BODEGUERO, el interceptor `SinCostosParaBodeguero` quita de las respuestas: `precioCosto`, `precio_costo`, `costoVigente`, `costo_vigente`, `costoUnitario`, `costo_unitario`, `costo`, `costos`, `ultimo_costo`, `margen`, y en compras, `subtotal`, `isv` y `total`. Rutas cubiertas: `GET compras`, `POST compras` (respuesta), `GET productos/:id/historial`, `GET productos/:id/proveedores`, `GET entregas`. Prueba HTTP: `src/operaciones/sin-costos-bodeguero.http.spec.ts` (8/8).

**Decisión abierta del dueño:** `POST /operaciones/compras` exige `costo` por línea y BODEGUERO puede enviarlo. Según la regla "sin costos", o se restringe el alta de compra a ADMIN, o BODEGUERO registra la recepción sin costo y ADMIN captura la factura. No se cambió sin decisión.

## 4. Migración y productos históricos (para NEXUS)

Migración `backend/prisma/migrations/20261011150000_precio_aprobacion_producto`:
- Agrega `precio_aprobado` (default false), `precio_aprobado_por`, `precio_aprobado_at`, `precio_modificado_por`, `precio_modificado_at` e índice.
- **Corregida en la consolidación:** solo marca como `LEGADO_MIGRACION` los productos con `precio_venta > 0`. Un producto histórico sin precio válido queda pendiente y **no** se vuelve vendible por existir.
- Verificación: `prisma migrate deploy` aplica la cadena completa en un PostgreSQL temporal (`frontend/e2e-real/run.sh`, 30/30 con backend real).

Decisiones que NEXUS y el dueño deben confirmar antes de producción:
1. ¿Se aprueban automáticamente los productos legados con precio > 0? (Propuesta: sí, para no dejar de vender; alternativa: todos pendientes, con riesgo operativo.)
2. Revisión de DBA del `ALTER TABLE` y del índice sobre la tabla de productos de la empresa.
3. Ninguna ejecución productiva sin autorización: KARDEX no ejecutó migraciones en producción.

## 5. Conciliación de costos (P1)

Diagnóstico de solo lectura: `backend/scripts/diagnostico-costos-vigentes.sql`. Propuesta con respaldo CSV, simulacro y rollback: `docs/CONCILIACION_COSTOS_PROPUESTA.md`.

Simulación sobre base temporal (`test/kardex-consolidacion.postgres.integration.ts`, "simulacro de conciliación"): la regla de última compra afecta **1 registro** en el caso sintético, el producto con compra y costo comercial distinto de la última recepción. El producto sin compra no se toca. La transacción se revierte y no deja escritura.

KARDEX no tiene acceso a datos productivos. Los números anteriores son del caso sintético de prueba; no son el conteo real de la empresa. Para el conteo real hace falta ejecutar el diagnóstico en una réplica de lectura autorizada.

## 6. Preguntas para ATLAS

1. ¿`operaciones.entregar` debe ignorar una revocación posterior de la aprobación? (Propuesta: sí.)
2. ¿Cómo validará el sincronizador offline la aprobación de cada línea al subir la venta?
3. ¿Cuándo se incorpora el filtro de aprobación en `contingencia.service.ts`? (Bloqueante para activar offline.)

## 7. Preguntas para NEXUS

1. Revisión de la migración `20261011150000` (ver sección 4).
2. ¿Hay un ambiente de staging con copia de datos para aplicar la migración antes de producción?

---

## Actualización de ronda (cierre de consolidación)

### Decisiones confirmadas por el dueño
- Legados: aprobación automática solo para productos **activos con precio de venta positivo**. Los demás quedan pendientes. NEXUS valida impacto y respaldo antes de cualquier ejecución; no se ejecuta en producción.
- BODEGUERO registra productos y cantidades recibidas. No consulta, captura ni modifica costos de compra. `POST /operaciones/compras` es solo ADMIN (controlador y servicio).
- Cambiar el precio de venta revoca la aprobación. Cambiar solo el costo no la revoca. Solo ADMIN aprueba.
- Una venta válida y registrada se entrega aunque después se revoque la aprobación. No se modifica el importe de una venta confirmada.

### Contrato para ATLAS (contingencia offline)
Estado actual verificado en código de `claude/integracion-pos-offline-p1`:
- `backend/src/contingencia/contingencia.service.ts`, línea 158: el catálogo filtra solo `activo: true`. **No cumple.**
- Línea 450: la venta offline se crea con `tx.venta.create` directo, sin pasar por la validación de aprobación de `ventas.service.ts`. **No cumple.**

Requisitos que ATLAS debe implementar (KARDEX no edita estos archivos):
1. Catálogo offline: `activo = true AND precio_aprobado = true AND precio_venta > 0`. Incluir `precioAprobado` en la respuesta del catálogo, para que el cliente lo muestre como no vendible.
2. Sincronización: el backend valida de nuevo cada línea (producto activo, aprobado y con precio positivo) antes de crear la venta. Si una línea no cumple, la venta no se registra y se devuelve motivo por línea.
3. Ninguna venta offline puede quedar registrada con un producto pendiente de aprobación, ni por el catálogo ni por la sincronización.
4. Venta sin inventario (`sinInventario`): misma regla de aprobación.
5. Entrega (`operaciones.entregar`): no aplica la aprobación; una venta registrada se entrega aunque después se revoque el precio.

Bloqueo: sin los puntos 1 a 3, la activación de contingencia con clientes reales queda **NO-GO**.

### Contrato para FORJA (costos de compra)
Verificado en tests PostgreSQL (`backend/test/kardex-consolidacion.postgres.integration.ts`, `backend/test/inventario-ciclo.postgres.integration.ts`):
- Recepción de compra: `precio_costo` y `costo_vigente` toman el último costo recibido, incluso si es menor. Probado con 3 → 2.5.
- Conteo físico: no cambia costo, precio ni margen. Probado.
- Historial: cada recepción crea un registro en `costos_compra` con proveedor y orden. Probado.
- Actualización de costo: no modifica `precio_venta` ni `precio_aprobado`. Probado.

FORJA debe revisar estos contratos. No hubo canal en vivo con FORJA en esta sesión; queda como solicitud documentada.

### Solicitud a NEXUS
1. Usar la consolidación `claude/kardex-consolidacion-134-140` en lugar de integrar #134 y #140 por separado. Detalle de conservado y reemplazado: `docs/CONSOLIDACION_134_140_CAMBIOS.md`.
2. Revisar la migración `20261011150000_precio_aprobacion_producto` (filtro `activo = true AND precio_venta > 0`) y validar un respaldo antes de cualquier ejecución productiva.
3. Confirmar el orden de migraciones con #129 en un entorno de staging.
