# Mapa de integración hasta `main` — 2026-10-11

**Base:** `origin/main` `7ccfad25` (14 migraciones). **Candidato:** `claude/vigilant-feynman-6p6jt2` @ `7dced6d9` (PR #152, borrador). **Veredicto:** ver §5. Sin merge ni despliegue.

## 1. Estado de la pila

- `main` no contiene contingencia, entregas ni el módulo de caja. El candidato contiene 139 commits por encima de `main` y 25 migraciones (11 nuevas).
- PR en borrador apilados: #152 → #150 → #148 → #144/#145 → #143…#128 (ver tabla).
- Ninguna rama está fusionada. Ningún PR tiene aprobación humana registrada.

## 2. Conflictos medidos con `git merge-tree` (sin escribir nada)

| Rama | Contenida en candidato | Migraciones propias | Conflictos con candidato | Nota |
|---|---|---|---|---|
| `claude/balance-cxc-cxp` (#142) | No | 2 | **0** | Integrable sin conflicto textual; revisar migraciones. |
| `claude/forja-compras-proveedores` (#143) | No | 3 | **13** (incl. `contingencia.service.ts`, `producto-response.ts`, `cashier-response.interceptor.ts`) | Choque de compras/costos con la protección de precios. Requiere resolución manual. |
| `claude/keen-goldberg-62o7f1` (#140) | No | 3 | **8** | Mismo nombre de migración `20261011150000_precio_aprobacion_producto` con contenido distinto (`d84f7934` frente a `8885a35a` en el candidato). |
| `claude/kardex-consolidacion-134-140` (#134/#140) | No | — | **1** (`compras-contado.postgres.integration.ts`) | Choque menor de pruebas. |
| Resto de ramas de la pila | Sí | — | 0 | Ya integradas en el candidato. |

**Colisión de migraciones (bloqueante):** tres versiones distintas de `20261011150000_precio_aprobacion_producto` (main no la tiene). Antes de integrar, una sola debe conservarse y las otras renombrarse con nuevo timestamp, sin editar migraciones ya publicadas.

## 3. Dependencias y orden recomendado

1. **Ya en el candidato (sin acción):** PR #127 (operaciones P1), #128/#129 (POS offline), #130/#131, #132/#133 (seguridad fase 2/3), #134 (inventario), #135/#136, #137/#138/#139 (seguridad), #144/#145/#148/#150, #152.
2. **Integrar #142 (balance CXC/CXP)** — sin conflicto textual. Verificar que su migración no coincida con otra por nombre.
3. **Resolver #140 (keen-goldberg, DEF-01 costos/precios)** con el candidato: la regla de precio aprobado ya está en el candidato; conservar la versión más restrictiva y renombrar su migración.
4. **Resolver #143 (forja, compras y costo vigente)** sobre el resultado del paso 3. Es el bloque más grande de conflictos y toca contingencia; requiere revisión de ATLAS y de CENTINELA, no solo de compilación.
5. **Kardex #134/#140 (choque menor de pruebas)** tras el paso 4.
6. Re-ejecutar: suite PostgreSQL completa, guard de migraciones, FARO, CENTINELA, en el SHA final de cada paso.

## 4. Riesgos de integración

- Migraciones publicadas: el guard de CI (`verificar-migraciones.mjs`) impide modificar migraciones ya registradas. Las colisiones de nombre no se detectan con `merge-tree` si el contenido no cambia en la misma línea; hay que comprobarlas por nombre.
- Pruebas de compras (`compras-contado`) y de costo vigente pueden contradecirse entre ramas.
- Ninguna rama integrada ha pasado auditoría sobre el SHA final de su paso.

## 5. Veredicto GO/NO-GO para versión mínima operativa

Ver el comentario del Issue #151 de la misma fecha. Resumen: **NO-GO para entrega al cliente hoy**; posible **piloto supervisado en base de staging** solo tras: (a) PASS de CENTINELA sobre el SHA final, (b) resolución de la colisión de migraciones y de #140/#143, (c) autorización expresa del propietario. Sin producción.

## 6. Pendientes de infraestructura (no resueltos por código)

Según `docs/agentes/BLOQUEOS_REALES_REQUIEREN_ACCESO.md`: verificación de TRUST_PROXY en Render, revisión de comandos de pre-deploy, secretos y `NODE_ENV`, claves demo en Supabase, protección de ramas con checks obligatorios, y prueba de restauración del respaldo.
