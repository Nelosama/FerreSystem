# FARO — Auditoría QA integral de la rama integrada NEXUS — 2026-10-10

**Rama auditada:** `nexus/integracion-temp` · **Commit:** `e8b75ae647edcd13fd0568e02b858a1db9c65cb1`
**Rama de esta auditoría:** `nexus/faro-auditoria-integral` (creada desde el commit auditado; sin cambios de código de producción). Sin merge, despliegue ni migraciones productivas. No se abrió PR.

## 1. Veredicto

**NO APTA para liberación.** La integración técnica se reproduce (PostgreSQL 517/517 aprobadas y 69 E2E heredadas), pero la auditoría funcional encuentra **un defecto P1 de control de precios en contingencia** y **un defecto P2 de idempotencia en la API de ventas**. Antes de cualquier liberación, el propietario debe decidir DEF-01 y DEF-03 y cerrarlos con prueba.

Lo que sí está verificado: matriz de costos por rol sin fugas, compras con recepción parcial y costo vigente, CXP sin duplicados, pagos a proveedor con referencia única por cuenta, autorización bancaria sin reutilización, concurrencia de stock, devoluciones parciales y contingencia con conflictos de efectivo.

## 2. Resultados de ejecución

| Ejecución | Entorno | Resultado | Verificación |
|---|---|---|---|
| Unitarias backend | Vitest | **366/366** (39 archivos) | Coincide con NEXUS |
| Unitarias frontend | `node --test` | **245/245** | Coincide con NEXUS |
| Integración PostgreSQL | Clúster temporal, usuario sin privilegios | **517 pasan, 0 fallan, 1 omitida** (34/34 archivos) | Coincide con NEXUS |
| E2E reales heredados (balance, clientes, contingencia, garantías, inicio, precios, qa-ciclo-venta) | Backend y PostgreSQL reales | **69 pasan, 0 fallan, 5 omitidas** | Coincide con NEXUS |
| E2E de auditoría FARO (`faro-auditoria-integral.spec.ts`) | Backend y PostgreSQL reales | **25 PASS · 3 FAIL · 5 PENDIENTE** | Nuevo |
| **E2E real completa (rama + FARO)** | Backend y PostgreSQL reales | **94 PASS · 3 FAIL · 10 omitidas** | Los 3 FAIL son los defectos confirmados |

**Notas de reproducción.** (a) La integración **no** se puede ejecutar como root: `initdb` lo rechaza y todas las pruebas quedan omitidas. Se ejecutó como `nobody` en un worktree desechable. (b) El cliente Prisma debe regenerarse con el esquema de la rama (`npx prisma generate`); con un cliente de otra base aparecen 373 fallos falsos.

## 3. Matriz de cobertura por alcance

Leyenda: **PASS** comprobado en backend real y base de datos · **FAIL** defecto confirmado (prueba explícita) · **PENDIENTE** no implementado, no se marca como fallo.

### 3.1 Inventario, precios y permisos

| Caso | Estado | Prueba / evidencia |
|---|---|---|
| Bodeguero da de alta sin precio (producto queda con precio 0 y pendiente) | PASS | `bodeguero da de alta sin precio…` |
| Bodeguero con precio → 403, sin producto creado | PASS | mismo test (SQL: 0 filas) |
| Pendiente fuera del catálogo comercial del cajero; visible al administrador | PASS | `el producto pendiente no aparece…` |
| Aprobación con versión vencida → 400/409; precio cero no se aprueba; bodeguero no cambia precios | PASS | `aprobación con versión vencida…` |
| Venta de producto sin precio aprobado en línea | PASS | `un producto sin precio aprobado no se vende en línea` (400, sin detalle) |

### 3.2 Compras, costos y CXP

| Caso | Estado | Prueba / evidencia |
|---|---|---|
| Compra genera **una** CXP por el total | PASS | `recepción parcial…` (monto 600, COUNT 1) |
| Recepción parcial suma solo lo recibido; costo vigente = último costo recibido | PASS | `recepción parcial…` (stock +4, costo 60) |
| Recibir más de lo pendiente → 400 sin cambios; resto se recibe al completar | PASS | `recibir más de lo pendiente…` |
| Factura repetida con otras mayúsculas/espacios no crea otra deuda; misma factura con otro proveedor sí | PASS | `factura repetida…` |
| Cambio de costo en recepción actualiza costo vigente y queda en auditoría (`COMPRA_RECIBIR`, `datos.orderId`) | PASS | `cambio de costo…` |
| Dos recepciones simultáneas del mismo saldo: solo una aplica (201 + 409), stock +3 exacto | PASS | `dos recepciones simultáneas…` |
| Pago electrónico a proveedor sin referencia → 400 | PASS | `pago electrónico a proveedor…` |
| Misma referencia en la misma cuenta se rechaza; en otra factura se acepta | PASS | mismo test (normaliza mayúsculas) |
| Cajero y vendedor: no compran, no reciben mercancía, no pagan proveedores (403) | PASS | `cajero y vendedor no crean compras…` |

### 3.3 Ventas, cotizaciones y POS

| Caso | Estado | Prueba / evidencia |
|---|---|---|
| Contado en efectivo: ISV 15 %, reserva de stock, movimiento de caja | PASS | `contado en efectivo…` |
| Tarjeta exige autorización bancaria; la misma autorización (referencia + terminal) no se reutiliza (409) | PASS | `tarjeta exige autorización…` |
| Cotización convertida una sola vez | PASS | `cotización convertida una sola vez…` |
| Crédito: suma saldo, crea CXC, respeta límite | PASS | `crédito: suma saldo…` |
| Entrega completa libera reserva y descuenta existencia una sola vez (repetir no descuenta) | PASS | `entrega completa…` |
| **Entrega parcial** | PENDIENTE | No implementada; `POS_VENTA_ENTREGA_DECISION.md` deja la decisión al propietario |
| Devolución parcial acredita solo lo devuelto; exceso → 400 | PASS | `devolución parcial…` (monto 115 por 1 unidad) |
| Dos cajeros por el último producto: una venta; reintento de la ganadora no duplica | PASS | `dos cajeros por el último producto…` |
| **Venta sin `solicitudId` se rechaza** (idempotencia obligatoria) | **FAIL — DEF-03** | `DEF-03: venta sin solicitudId…` (recibe 201) |

### 3.4 Contingencia offline

| Caso | Estado | Prueba / evidencia |
|---|---|---|
| Ventana offline incluye productos aprobados | PASS | `la ventana offline incluye productos aprobados` |
| **La ventana offline excluye productos sin precio aprobado** | **FAIL — DEF-01** | `DEF-01: el catálogo offline no debe incluir…` (incluye el producto pendiente) |
| Efectivo inconsistente (efectivo − cambio ≠ total) → `REVISION|true` | PASS | `operación offline con efectivo inconsistente…` |
| Operación consistente se aplica una sola vez; reenvío no duplica venta | PASS | `operación offline consistente…` (`APLICADA`, 1 venta) |
| Precio distinto al autorizado: se aplica con revisión y conflicto `PRECIO_NO_AUTORIZADO` | PASS | `precio distinto al autorizado…` |
| **Venta offline de producto sin precio aprobado no debe aplicarse** | **FAIL — DEF-01** | `DEF-01: una venta offline…` (queda `APLICADA`) |
| Reinicio, reconexión, pérdida de respuesta, dos pestañas, conflicto de stock, cierre de caja durante contingencia | PASS | Reutilizado: `contingencia-real.spec.ts` (14/14) |

### 3.5 Finanzas: CXC, abonos y referencias

| Caso | Estado | Prueba / evidencia |
|---|---|---|
| Abono parcial reduce saldo; reintento con la misma solicitud no duplica | PASS | `abono parcial, reintento idempotente…` |
| Abono mayor al saldo → 400 | PASS | mismo test |
| Conciliación bancaria solo administrador | PASS (parcial) | Denegación verificada para cajero; contenido de conciliación no auditado |

### 3.6 Seguridad funcional por rol

| Caso | Estado | Prueba / evidencia |
|---|---|---|
| Matriz de **19 rutas × 4 roles** (76 combinaciones): acceso permitido/denegado según `@Roles` | PASS | `1. Matriz de roles…` |
| Ningún rol no administrativo recibe costo, costo vigente, margen ni costo unitario (búsqueda recursiva de claves en cada respuesta) | PASS | mismo test |
| 8 denegaciones clave: vendedor crea producto; cajero aprueba precio; bodeguero cobra abono; vendedor devuelve; cajero cambia configuración POS; bodeguero vende; cajero ve conciliaciones; bodeguero ve dispositivos POS | PASS | `cada rol recibe 403…` |

**Observación de alcance (no es fuga):** `GET /operaciones/devoluciones/:id` responde **404** a CAJERO y VENDEDOR cuando la devolución la registró otro usuario. Es una restricción por propietario, que oculta la existencia del registro. Se trata como PASS en la matriz.

### 3.7 Reportes, dashboard y cotizaciones

| Caso | Estado | Prueba / evidencia |
|---|---|---|
| `/operaciones/resumen` solo administrador | PASS | Matriz (1) |
| `/dashboard` para administrador, vendedor y bodeguero; cajero denegado; sin costo ni margen en la respuesta | PASS | Matriz (1) |
| Cotizaciones (lista y detalle) sin costo para cajero y vendedor | PASS | Matriz (1). **Verificado: la hipótesis de fuga de costo por `include: { producto: true }` no se confirma** |
| **Reporte de ventas por cajero** | PENDIENTE | `/operaciones/resumen` sin dimensión por cajero |

## 4. Determinación de las 5 E2E omitidas

| Omitida | ¿Sigue siendo necesaria? | Decisión |
|---|---|---|
| **1.2 Vuelto en el POS en línea** | Sí. La nota de NEXUS dice «obsoleta» y **no lo es para el POS en línea**: `POSPage.tsx` no tiene efectivo recibido ni cambio. El cálculo existe solo en contingencia | **Mantener como PENDIENTE**. El caso offline queda cubierto en FARO (sección 3.4) |
| **2.2 Datáfono / autorización bancaria** | No. La rama implementa referencia y terminal (`pagoElectronico`) y la tabla `aprobaciones_bancarias` | **Obsoleta**: sustituida por la prueba real de autorización (sección 3.3, PASS) |
| **12.2 Canal web para cliente final** | Sí, pero el alcance no está confirmado. No existe en el código | **Mantener como PENDIENTE** (decisión de negocio) |
| **13.3 Reporte por cajero** | Sí. No existe la dimensión por cajero | **Mantener como PENDIENTE** |
| **14.4 Respuesta tardía del servidor en el POS** | Sí. Requiere inyección de latencia que aún no está automatizada | **Mantener como PENDIENTE** |

Además, la suite FARO omite la **entrega parcial** (no implementada) y mantiene las cuatro pendientes de la sección 8 del archivo de auditoría, de modo que hay 5 omitidas en esta suite.

## 5. Defectos clasificados

### P0 (bloqueo de liberación inmediato)
**Ninguno confirmado** en código ni en pruebas.

### P1

**DEF-01 — La contingencia offline vende productos sin precio aprobado y aplica la venta**
- **Hecho:** `construirCatalogo` descarga todos los productos activos sin filtrar `precioAprobado` (`backend/src/contingencia/contingencia.service.ts:156-159`). La venta offline de un producto pendiente se **aplica** con solo `requiereRevision` (`contingencia.service.ts:492`), porque `PRECIO_NO_AUTORIZADO` es severidad BLANDO (`contingencia.service.ts:420`).
- **Contraste:** la venta en línea sí rechaza productos sin precio aprobado (`backend/src/ventas/ventas.service.ts:218`).
- **Reproducción:** `DEF-01: el catálogo offline…` y `DEF-01: una venta offline…` en `faro-auditoria-integral.spec.ts` (ambas FAIL).
- **Impacto:** cualquier cajero con un POS offline puede cobrar mercancía sin precio aprobado a un precio libre. El cobro entra al libro y solo queda marcado para revisión.
- **Corrección propuesta (no implementada):** filtrar `precioAprobado=true` y `precioVenta>0` en `construirCatalogo`, y tratar el producto no aprobado como conflicto DURO (rechazo, no aplicación). Es la pieza que el commit `7c0e73b0` de #140 intentaba aportar y que NEXUS dejó pendiente.
- **Agentes responsables:** **KARDEX + ATLAS** (según el pendiente #1 de NEXUS). FARO verifica el cierre.

### P2

**DEF-03 — `POST /ventas` acepta venta sin `solicitudId`**
- **Hecho:** `solicitudId` es opcional en `CreateVentaDto` (`backend/src/ventas/dto/create-venta.dto.ts:33-35`) y la idempotencia solo se aplica con `if (dto.solicitudId)` (`backend/src/ventas/ventas.service.ts:142`). Un reintento sin clave crea otra venta y reserva más stock.
- **Mitigación actual:** el único cliente de `POST /ventas` es la pantalla de POS (`frontend/src/pages/POSPage.tsx:324`), que siempre envía la clave. La app móvil no tiene llamadas de venta.
- **Reproducción:** `DEF-03: venta sin solicitudId…` (FAIL, recibe 201).
- **Corrección propuesta (no implementada):** `@IsUUID('4')` sin `@IsOptional` en `CreateVentaDto`. Antes, confirmar que ningún flujo de contingencia ni integración futura llama a `POST /ventas` sin clave.
- **Agentes responsables:** **ATLAS** (POS y ventas). Asignación según la tabla de dueños de NEXUS; confirmar.

### Observaciones (no son defectos)

- **O-01 — 404 por propietario en devoluciones** (sección 3.6): restricción de alcance deliberada.
- **O-02 — Prueba previa `qa-ciclo-venta.spec.ts` 11.3 (test.fail):** es DEF-03 en otra suite. Cuando se corrija DEF-03, debe quitarse ese `test.fail`.
- **O-03 — Migración 16 sobre datos reales** (`UPDATE` de `productos` con `activo = true AND precio_venta > 0`): **no verificada aquí** porque no hay datos de producción. NEXUS la marca como riesgo medio.

## 6. Riesgos no verificados (sin prueba en este entorno)

- Vercel y Render: la protección de despliegue para `nexus/*` está en el repositorio, pero no se comprobó en las plataformas. Requiere confirmación del propietario.
- Migración 16 sobre datos reales (ver O-03).
- Windows, Safari/iPhone, apagón real, cuota de disco real y latencia real de tienda (mismas exclusiones que el piloto).
- Respuesta tardía del servidor en el POS (14.4).
- Descuento de stock en ventas offline frente a reserva en línea: el riesgo R4 de `POS_VENTA_ENTREGA_DECISION.md` sigue abierto.

## 7. Archivos afectados

| Archivo | Cambio |
|---|---|
| `frontend/e2e-real/faro-auditoria-integral.spec.ts` | **Nuevo**: 33 pruebas (25 PASS, 3 FAIL, 5 PENDIENTE). Backend y PostgreSQL reales |
| `docs/FARO_AUDITORIA_INTEGRAL_NEXUS_20261010.md` | **Nuevo**: este informe |
| `backend/src/contingencia/contingencia.service.ts` | Referencia (DEF-01). **Sin cambios** |
| `backend/src/ventas/ventas.service.ts` | Referencia (DEF-03, contraste en línea). **Sin cambios** |
| `backend/src/ventas/dto/create-venta.dto.ts` | Referencia (DEF-03). **Sin cambios** |
| `frontend/src/pages/POSPage.tsx` | Referencia (cliente que envía la clave). **Sin cambios** |
| `frontend/e2e-real/qa-ciclo-venta.spec.ts` | Referencia: sus 5 omitidas se evalúan en la sección 4. **Sin cambios** |

## 8. Cómo reproducir

```bash
# Backend: pruebas unitarias y de integración PostgreSQL
cd backend && npx vitest run
# Integración: como usuario sin privilegios, con cliente Prisma regenerado
npx prisma generate
PG_BIN=/usr/lib/postgresql/16/bin npx vitest run --config ./vitest.config.integration.ts   # ejecutar como no root

# Frontend: unitarias
cd frontend && npm test

# E2E real: auditoría FARO sola, y suite completa
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  bash e2e-real/run.sh e2e-real/faro-auditoria-integral.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  bash e2e-real/run.sh
```

## 9. Condiciones para reconsiderar la liberación

1. DEF-01 cerrado con prueba: el catálogo offline sin productos no aprobados, y la venta offline de un producto no aprobado rechazada (las dos pruebas FAIL pasan a PASS).
2. DEF-03 cerrado: `solicitudId` obligatorio y prueba de reintento sin clave que rechaza. Quitar el `test.fail` de `qa-ciclo-venta.spec.ts` 11.3.
3. Decisiones del propietario: entrega parcial, canal web, reporte por cajero, vuelto en el POS en línea, y la semántica de entrega de venta en línea (R1–R4).
4. Confirmación de Vercel y Render, y ejecución de la migración 16 sobre una copia de los datos reales.

_Firmado: FARO (auditoría QA independiente). No se modificó código de producción; no se hizo merge, despliegue ni migración productiva._
