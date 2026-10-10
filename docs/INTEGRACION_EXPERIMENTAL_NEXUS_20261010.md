# Rama experimental de integración — NEXUS (2026-10-10)

**Rama:** `nexus/integracion-temp`. **Firma:** NEXUS. Es una base **experimental y verificable** para integrar FerreSystem. **No** se fusiona con `main`, **no** se despliega, **no** ejecuta migraciones contra Supabase y **no** abre PR (un PR activaría vistas previas y revisiones automáticas).

## 1. Seguridad de la publicación

| Riesgo | Estado | Cómo se comprobó |
|---|---|---|
| GitHub Actions | Sin disparo por push | `operacion-ferreteria.yml` corre en PR hacia `main` y `claude/**` (CENTINELA lo amplió) y en push a `main`; `playwright.yml` en push/PR de `main`/`master`. Ninguno corre por push a `nexus/*`. **Abrir un PR de esta rama hacia `claude/**` sí activaría CI**; por eso no se abre |
| Vercel (Preview automático) | **Protegido en el repositorio, no verificable desde aquí** | El frontend está enlazado a un proyecto Vercel. `frontend/vercel.json` ahora lleva `git.deploymentEnabled: {"nexus/*": false}` y un `ignoreCommand` que sale con 0 (omite el build) si la rama empieza por `nexus/`. Lógica probada: `nexus/*` → omite; `main` y `claude/*` → construyen. El propietario debe confirmar en Vercel que no aparece despliegue para esta rama |
| Render (backend) | **No verificable desde el repositorio** | No hay `render.yaml` ni configuración de Render en el repo. Render despliega la rama configurada en su panel (se supone `main`); el propietario debe confirmar la rama y que las vistas previas de PR están apagadas |
| Migraciones contra Supabase | Sin disparo | `start:prod` ejecuta `migration-safe.mjs deploy` solo cuando un servicio arranca con ese código; ningún servicio apunta a esta rama |
| Secretos | Sin hallazgos | Barrido de las 32 714 líneas añadidas respecto a `main` (URLs con credenciales, tokens, llaves, asignaciones). Solo tokens ficticios de E2E simulado. Archivos de entorno versionados: únicamente `backend/.env.example` y `frontend/.env.example` |

El cambio de `frontend/vercel.json` afecta solo a ramas `nexus/*`. Si esta rama llegara a fusionarse, esa regla es inocua para el resto.

## 2. Commits exactos de cada agente

Cabezas de rama incorporadas (las ramas de los agentes **no se modificaron**; cada una entra por un merge propio):

| Agente | PR / rama | Commit incorporado |
|---|---|---|
| CENTINELA | #139 `claude/centinela-cierre-produccion` | `8a1ddc36810424282f2d17abe28afff4e3feb287` |
| CENTINELA | #138 `claude/centinela-validacion-produccion` (incluye #137) | `dd19439c77d54d815e03fd5f18c5e46796c991b9` |
| ATLAS / FORJA | #129 `claude/integracion-pos-offline-p1` (incluye #127, #128) | `c5fe49823e5f77b26c62b8c98f104f97758fa2e4` |
| FORJA / FARO | #130+#131 `claude/p1-modulos-administrativos` | `069172623b580b31615863d26c697eaa2ab1b179` |
| FORJA / FARO | #130 `p1-garantias-devoluciones` | `02e4a13488838adb3559d33491f303d301902ebb` |
| FORJA / FARO | #131 `p1-compras-reportes` | `3a37fba06509511de3e92921c6f13bada84aebfc` |
| FARO | #136 `hopeful-franklin-hb3n48` | `2cfdf8b9cbe69901d14d65b6d5caefc0d123f23e` |
| KARDEX | #134 `brave-carson-v2g7q5` | `57c649625e9f2eb6268603bb7bff5e2c6ea01dc6` |
| KARDEX | #140 `keen-goldberg-62o7f1` | **solo `backend/prisma/`** (esquema y migración) de `7c0e73b0ec400e3ec64af80482693da094ab00fa` |
| BALANCE | #135 `conciliacion-pagos-cxc` | `3ee65f5f4d5713baeb1542475793b3efcf65bf1b` |
| BALANCE | #142 `balance-cxc-cxp` | `a94ab9b071889c24169ea565b8f0784fab6830bb` |
| NEXUS | #141 `focused-franklin-avfmae` | `087c09f9e766465855e424d9ba3196c2bf412855` |

**No incorporado:** #143 `claude/forja-compras-proveedores` (`db807c2d36c34e08f5dbe145cb6bfd1aeb195be8`, FORJA). Está apilada sobre el código de #140 y no toca `prisma/`; entra cuando KARDEX entregue la consolidación #134+#140.

La asignación de agentes a PR es una inferencia a partir del contenido.

## 3. Cadena de migraciones (20) y propietario

`20260925000000` … `20261010120000_coberturas_garantia` (13, ya en `main`) y las 7 nuevas, en el orden en que `migrate deploy` las aplica:

| # | Migración | PR | Riesgo |
|---|---|---|---|
| 14 | `20261010140000_productos_proveedores` | #127/#129 (FORJA) | Bajo: tabla nueva |
| 15 | `20261011000000_pos_contingencia_offline` | #128/#129 (ATLAS) | Bajo: 6 columnas con default constante en `ventas`, tablas nuevas |
| 16 | `20261011150000_precio_aprobacion_producto` | #140 (KARDEX) | **Medio**: `UPDATE` de `productos` con `precio_venta > 0` |
| 17 | `20261012000000_autenticacion_sesiones_intentos` | #133/#137 (CENTINELA) | Bajo: tablas nuevas |
| 18 | `20261012000000_conciliacion_pagos_bancarios` | #135 (BALANCE) | Bajo: tablas nuevas |
| 19 | `20261013000000_balance_referencia_pagos` | #142 (BALANCE) | Bajo: columna nullable, `CHECK`, índice único sobre columna nueva |
| 20 | `20261014000000_cliente_plazo_credito` | #142 (BALANCE) | Bajo: columna nullable y `CHECK` |

Observaciones: ninguna contiene `DROP`, `DELETE` ni `TRUNCATE`. #142 trae **dos** migraciones (la segunda, `…cliente_plazo_credito`, no estaba en el encargo). Las migraciones 17 y 18 comparten el prefijo `20261012000000`; Prisma las ordena por nombre completo (autenticación antes de conciliación), sin colisión.

## 4. Conflictos

**Resueltos (mecánicos, sin lógica nueva):**
- `schema.prisma`: ambos lados en cada bloque (relaciones de `Tenant`, modelos al final); se restauró la llave de cierre de dos modelos cada vez.
- `CONTEXTO_MAESTRO.md`: ambos lados; comprobado que ninguna línea de ningún padre se pierde.
- Listas fijas de migraciones en `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts`: unión ordenada (cada PR añade la suya).
- `OperacionesPage.tsx`: declaraciones de FORJA (proveedor preferido) y BALANCE (autorización bancaria) combinadas sin lógica nueva. **FORJA y BALANCE deben revisar.**

**Pendientes (no resueltos a propósito; no son míos):**

| # | Conflicto | Dueño | Estado |
|---|---|---|---|
| 1 | #140 ↔ #134: 10 archivos de código de inventario | KARDEX | Sin consolidar. De #140 solo entra el esquema |
| 2 | Regla de costos: `costo_unitario` en búsqueda de ventas (#134) frente a la prueba de #132 | KARDEX + CENTINELA | 2 fallos en `seguridad-fase2` (pasa 16/16 sin #134) |
| 3 | #142 exige referencia en pagos electrónicos a proveedor y rompe 3 pruebas unitarias y 4 de integración de `compras` | BALANCE (y FORJA) | Reproducido en la rama de #142 sola: es regresión propia de esa rama |
| 4 | #143 depende del código de #140 | FORJA | No incorporada |

## 5. Regla definitiva de costos (decisión del dueño) y solicitud a KARDEX

Regla: **ADMIN** consulta costos y márgenes. **CAJERO** y **BODEGUERO** no. Los permisos se verifican en el **backend** y las pruebas de seguridad cubren cada rol.

NEXUS no resuelve el conflicto #134 ↔ #140 ni elige archivos: KARDEX entrega una rama consolidada. Criterios de aceptación a pedir:

1. Todo endpoint que expone `precio_costo`, `costo_vigente`, `costo_unitario`, `margen` o campos derivados los omite para CAJERO y BODEGUERO, decidido en el servicio, nunca solo en el frontend.
2. Matriz de pruebas por rol (ADMIN, CAJERO, BODEGUERO) y por endpoint: búsqueda de ventas, entregas, productos, inventario, levantamiento, reportes y dashboard.
3. Definir el rol **VENDEDOR** (existe en el esquema y la regla no lo menciona). Recomendación: denegar por defecto.
4. Actualizar las pruebas de #132 que hoy exigen que BODEGUERO conserve el costo en entregas: contradicen la regla nueva.
5. Pasar la suite completa de integración sin las 2 fallas actuales.

## 6. Contratos pendientes de otros agentes (sin modificar su código)

| Agente | Pendiente |
|---|---|
| ATLAS | Unicidad de operaciones offline por `(tenant_id, dispositivo_id, secuencia_local)`: hoy el índice no es único; recuperación de la cola IndexedDB; revalidación de precios aprobados (depende de #140); permisos de entrega; idempotencia de ventas y caja |
| KARDEX | Consolidación #134+#140 y regla de costos (§5) |
| FORJA | Recepción de compras y obligaciones financieras: coordinar #143 con la regla nueva de BALANCE (referencia en pagos electrónicos) y con las tablas `cuentas_operativas`/`pagos_cuenta` |
| BALANCE | Actualizar las pruebas de `compras` rotas por la regla de referencia; revisar el cableado en `OperacionesPage.tsx` |
| CENTINELA | Revisar la propuesta de FK compuestas (`PROPUESTA_FK_COMPUESTAS_TENANT_NEXUS_20261010.md`) y `auditoria_soporte` |

## 7. Verificación (PostgreSQL 16.15 temporal, base vacía)

| Comprobación | Resultado |
|---|---|
| `prisma migrate deploy` (20 migraciones) | Correcto |
| `prisma validate` / `prisma generate` | Correcto |
| `prisma migrate diff` base ↔ esquema | **0 líneas**, 0 DROP |
| `tsc -p tsconfig.build.json` (backend) | 0 errores |
| Frontend `tsc -b` / `vite build` / `npm test` | 0 errores / correcto / 236 de 236 |
| Backend unitarias | **354 pasan, 3 fallan** (todas `compras-proveedores`, regla de #142) |
| Integración PostgreSQL (commit final) | 31 archivos: **493 pasan, 6 fallan** (4 `compras` por #142 + 2 `seguridad-fase2` por #134), 1 omitida (navegador, `REAL_SETTINGS_BROWSER`) |
| De ellas, pruebas nuevas de NEXUS (deriva + FK compuestas) | 15 de 15 |
| Playwright con backend real | **No ejecutado**: la misión lo condiciona a integración completa y hay 2 conflictos abiertos |
| Playwright con backend simulado | No ejecutado |
| Producción | **No verificada** (un diff vacío en base temporal no la valida) |

*Firmado: NEXUS.*
