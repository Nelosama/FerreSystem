# Auditoría de exenciones (T6) — 2026-10-29

Base: `main` `3a6c6695`. Rama: `claude/auditoria-funcional-20261029`. Pruebas en PostgreSQL 16 temporal, datos sintéticos. **No se activa ninguna regla fiscal**: la decisión de qué es exento (D3) y quién lo autoriza (D5) siguen pendientes del contador y del dueño.

## 1. Estado actual

Una línea es exenta solo en cotizaciones (`detalles_cotizacion.exento`). Hoy:

| Acción | Quién puede | Autorización | Auditoría | Evidencia |
| --- | --- | --- | --- | --- |
| Marcar una línea exenta al crear | ADMIN, VENDEDOR, CAJERO | Ninguna | **Ninguna** | `cotizaciones.controller.ts` `@Roles('ADMIN','VENDEDOR','CAJERO')`; `cotizaciones.service.ts` `create` no llama a `audit()` |
| Marcar una línea exenta al editar | ADMIN, VENDEDOR, CAJERO | Ninguna | **Ninguna** | Igual que arriba, `update` |
| Convertir cotización con exenta a venta | Solo ADMIN | Rol | Solo `COTIZACION_VENDER` (sin detalle de exentas) | `cotizaciones.service.ts` `convertirAVenta` |
| Persistir la exención en la venta | Automático al convertir | — | `detalles_venta` **no guarda la marca** (ver `desglose-fiscal`) | Esquema |
| Devolver una línea exenta | ADMIN (directa) o solicitud | Autorización de otro administrador | `VENTA_DEVOLVER` (sin marca) | `operaciones.service.ts` |

## 2. Hallazgos

| ID | Severidad | Hallazgo | Riesgo |
| --- | --- | --- | --- |
| T6-01 | **Alta** | Cualquier VENDEDOR o CAJERO puede marcar una línea como exenta, sin autorización ni motivo | Una venta puede salir sin ISV por decisión de quien cotiza |
| T6-02 | **Alta** | Marcar una exención no deja auditoría: no hay usuario, fecha, motivo ni estado anterior/posterior | No se puede demostrar quién exoneró ni por qué |
| T6-03 | Media | La marca de exención no se guarda en la venta convertida (`detalles_venta`) | La exención se pierde al facturar y solo sobrevive en la cotización |
| T6-04 | Media | La conversión por ADMIN tampoco registra el detalle de las exentas | La auditoría dice `COTIZACION_VENDER` sin qué líneas se exoneraron |

Lo que sí funciona y está probado:
- Un CAJERO no convierte cotizaciones con exentas (400, sin venta). **Probado.**
- Un usuario de otra empresa no ve ni convierte la cotización (404). **Probado.**
- Un CAJERO no lista ni crea usuarios y no puede concederse permisos administrativos (`saas-onboarding`, 1/1 en ejecución). **Probado.**
- Un CAJERO con todos los permisos personalizados recibe 403 en acciones de rol (`centinela-verificacion-atlas`). **Probado en `main`.**

## 3. Pruebas de autorización y aislamiento

Archivo: `backend/test/exenciones-t6.postgres.integration.ts` (rama `claude/auditoria-funcional-20261029`). Resultado: **5/5**.

| Caso | Tipo | Resultado |
| --- | --- | --- |
| VENDEDOR crea cotización con exenta | DEFECTO CONOCIDO (T6-01) | 201: el permiso actual lo permite |
| CAJERO crea cotización con exenta | DEFECTO CONOCIDO (T6-01) | 201 |
| Crear la exención no deja fila de auditoría | DEFECTO CONOCIDO (T6-02) | `auditoriaOperacion` vacía |
| CAJERO no convierte cotización con exenta | Control vigente | 400 («requiere validación del administrador»), sin venta |
| Usuario de otra empresa: GET y convertir | Aislamiento | 404 en ambos; la cotización sigue en BORRADOR |

Cada caso DEFECTO CONOCIDO documenta el comportamiento actual. Cuando se implemente el registro de T6, esos casos cambiarán a 403 o a una fila de auditoría, y deben actualizarse en la misma corrección.

## 4. Diseño del registro auditable de exenciones

Nueva tabla `exenciones_fiscales` (migración aditiva, no ejecutada). Una fila por cada marca o retirada de exención.

| Campo | Contenido |
| --- | --- |
| `id`, `tenant_id` | Identificador y empresa (FK compuesta con `tenants`) |
| `documento_tipo`, `documento_id` | `COTIZACION` (hoy) o `VENTA` (futuro) |
| `detalle_id` | Línea afectada (`detalles_cotizacion.id`) |
| `producto_id` | Producto de la línea (para revisar exenciones por producto, D3) |
| `solicitado_por` | Usuario que marca o pide la exención |
| `solicitado_at` | Fecha y hora de la solicitud |
| `autorizado_por` | Usuario que autoriza (distinto de `solicitado_por`); nulo mientras esté pendiente |
| `autorizado_at` | Fecha y hora de la autorización |
| `motivo` | Texto obligatorio, 10 a 300 caracteres |
| `estado_anterior`, `estado_posterior` | `NINGUNO`, `SOLICITADA`, `AUTORIZADA`, `REVOCADA` |
| `base_legal` | Referencia del contador (opcional hasta D3) |

**Reglas propuestas (no activadas):**
- Quien solicita no puede autorizar (el mismo principio que en devoluciones).
- Solo ADMIN autoriza; la autorización exige motivo.
- Un VENDEDOR o CAJERO solo puede **solicitar**; la línea queda sin ISV solo cuando hay autorización.
- Cada cambio escribe también en `auditoria_operaciones`.
- Tenant obligatorio en todas las consultas.

**Decisión D5** (quién puede solicitar y quién autorizar) queda abierta. Sin esa decisión no se cambian permisos.

## 5. Prueba de control de concesión de permisos administrativos

Requisito: un cajero no puede concederse permisos administrativos.

- `PUT /usuarios/:id` exige `@Roles('ADMIN')`; un CAJERO recibe 403.
- Un ADMIN que no sea de plataforma no gestiona cuentas ADMIN, incluida la suya (`usuarios.service.ts`, `protegerAdmin`).
- Nadie puede concederse `pos.excepcion_precio` a sí mismo (`usuarios.service.ts`, línea 69).
- Hay un único camino de escritura de `permisos` (`usuarios.service.ts`, líneas 84–86).

Pruebas existentes: `saas-onboarding` («CAJERO no puede listar ni crear usuarios»), `centinela-verificacion-atlas` («CAJERO con TODOS los permisos personalizados recibe 403»). Ambas siguen vigentes.

## 6. Decisiones pendientes

| # | Decisión | Quién |
| --- | --- | --- |
| D3 | Qué productos son exentos y dónde se marca | Contador |
| D5 | Quién puede solicitar y quién puede autorizar una exención | Dueño |
| D2 | Tratamiento de exonerados (constancia del SAR) | Contador |
| D8 | Reparto base/ISV en devoluciones con exentas | Contador |

Mientras D3 y D5 estén pendientes, la recomendación para el piloto es **no permitir líneas exentas** en cotizaciones: ocultar la casilla o bloquearla para todos los roles.

## 7. Riesgos

- T6-01 y T6-02 son riesgos de control interno: sin ellos no se puede demostrar quién exoneró una venta.
- Mientras no exista el registro, una exención no puede justificarse ante una auditoría fiscal.
