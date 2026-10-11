# DEF-01 — Cierre: venta offline sin precio aprobado (GUARDIAN, 2026-10-11)

Rama `claude/guardian-def01-offline` desde `nexus/integracion-temp` `e8b75ae6`. Sin merge, despliegue ni migración.

## Recuperación del trabajo de Codex
**No recuperable.** Se buscó en ramas remotas (27), commits (`--all`), PRs y el árbol de `nexus/*`: no existe `CORRECCION_DEF01_OFFLINE_CODEX_20261010.md` ni rama o commit de Codex. Los resultados que Codex reportó (45/45, 417, 245) no se reutilizan ni se dan por válidos. La solución se implementó desde la base y se verificó de forma independiente.

## Causa raíz
1. `construirCatalogo` descargaba todo producto `activo`, sin `precioAprobado` ni `precioVenta > 0`.
2. En `aplicar`, un producto fuera de la ventana era `BLANDO` (`PRODUCTO_FUERA_DE_VENTANA`) y la venta se aplicaba con solo `requiereRevision`. La instantánea firmada no guardaba si el precio estaba aprobado, así que no había evidencia de la aprobación vigente al emitir.

## Cambios (`backend/src/contingencia/contingencia.service.ts`)
- Catálogo: `activo AND precioAprobado AND precioVenta > 0`.
- La instantánea del servidor guarda `precioAprobado: true` por producto (prueba de la aprobación al emitir). No se envía al equipo (el contrato público no cambia).
- Al sincronizar, la evidencia es **solo la instantánea**, nunca el estado actual del producto, así que una aprobación posterior no legitima la venta:
  - producto fuera de la instantánea → `PRODUCTO_FUERA_DE_VENTANA` ahora **DURO**;
  - instantánea sin `precioAprobado === true` o precio ≤ 0 (formato anterior o alterado) → `PRECIO_SIN_APROBACION` **DURO** (política segura: sin prueba, no se autoriza).
- Los conflictos nuevos no están en `superables`: ni `ACEPTAR` ni `REINTENTAR` los convierten en venta. `CERRAR_MANUAL` solo cierra el caso.
- Aprobación revocada después de emitir la ventana: se conserva el tratamiento acordado (se aplica con revisión, `APROBACION_REVOCADA_POSTERIOR`, BLANDO). Un cambio de precio posterior con aprobación vigente sigue sin conflicto (el precio autorizado es el de la ventana).
- Un conflicto duro devuelve antes de cualquier escritura: sin venta, detalle, stock, movimiento de caja, secuencia ni documento (verificado por conteo).
- `frontend/src/pages/ContingenciaAdminPage.tsx`: etiquetas para los conflictos nuevos.
- Fixture `autenticacion-fase3` creaba el producto sin aprobar (dependía del defecto): ahora `precioAprobado: true`.
- Se incorporan desde `nexus/faro-auditoria-integral` `f912f1e4` el spec y el informe de FARO (sin modificar) para poder ejecutar las pruebas.

## Pruebas (Node 22.22, PostgreSQL 16 temporal, ejecutadas por esta sesión)
| Suite | Resultado |
|---|---|
| Contingencia PostgreSQL | 34/34 (25 previas + 9 nuevas) |
| Mutación: servicio revertido a la base | 7 de las 9 nuevas fallan; con la corrección pasan |
| Integración PostgreSQL completa (34 archivos) | 526 aprobadas, 1 omitida (navegador condicionado) |
| Backend unitarias | 366/366 |
| Frontend unitarias | 245/245; `tsc -b` sin errores |
| E2E reales completas | 90 aprobadas · 10 omitidas · 2 fallos no relacionados (abajo) |
| FARO + contingencia real, aisladas | 41 aprobadas · 5 omitidas · 1 fallo (DEF-03) |
| **Dos pruebas FARO de DEF-01** | **ambas PASS** |

Fallos que no son de esta rama: **DEF-03** (`POST /ventas` sin `solicitudId`, defecto distinto, sigue abierto); `balance-real` (vencimiento 29 vs 30 días: desfase UTC/Honduras a las ~00:20 UTC; **falla igual en la base sin estos cambios**).

Cubierto: catálogo (aprobado/cero/inactivo), no aprobado al emitir, aprobación posterior + reenvío + REINTENTAR + ACEPTAR, instantánea sin prueba, línea mixta (rechazo completo), reenvíos simultáneos, aprobación vigente con precio cambiado, revocación posterior, aislamiento entre empresas. Reinicio/reconexión: reenvío del mismo UUID y sesión vencida (`autenticacion-fase3`) pasan.

## Riesgos residuales
- Ventanas emitidas antes del despliegue tienen instantánea sin la marca: sus ventas irían a revisión dura. Aceptable porque la contingencia está apagada por defecto (`POS_OFFLINE_ENABLED`) y la rama no está liberada; antes de activarla, volver a emitir las ventanas.
- Una venta ya cobrada y rechazada queda en `REVISION` (diario inmutable): requiere decisión humana sobre el efectivo recibido; el sistema no la convierte en venta.
- Sin dispositivo ni corte de red físicos; concurrencia con sesiones HTTP, no navegadores.
- Compatibilidad con KARDEX/ATLAS: comprobada sobre `nexus/integracion-temp` (que ya los integra); no se probó contra sus ramas por separado.
- DEF-03 sigue abierto.
