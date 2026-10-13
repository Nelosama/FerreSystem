# Integración de esquema entre PR y verificación anti-deriva — NEXUS (2026-10-10)

**Firma:** NEXUS. **Alcance:** esquema Prisma, cadena de migraciones y pruebas que dependen de ellos. No se tocó lógica de negocio de otros agentes. Sin merge, sin despliegue, sin conexión a producción, sin migraciones productivas.

Decisiones del dueño aplicadas: se conservan todas las tablas históricas (incluidas `auditoria_soporte` y `listas_precio`, aunque el backend no las use); #141 sigue en borrador; no se usa `migrate dev`, `db push` ni migraciones en producción.

## 1. Mapa de PR

Las PR están apiladas. Para integrarlas basta partir de la cabeza de la cadena más larga.

| PR | Rama | Base | Migración que añade | Agente (inferido por contenido) |
|---|---|---|---|---|
| #129 | `claude/integracion-pos-offline-p1` | `main` | `20261010140000_productos_proveedores`, `20261011000000_pos_contingencia_offline` | ATLAS (POS), FORJA (compras) |
| #130, #131, #136 | `p1-garantias-devoluciones`, `p1-compras-reportes`, `hopeful-franklin-hb3n48` | #129 | — | FORJA / FARO |
| #132, #133, #137, #138, #139 | cadena de seguridad | #129 → … | `20261012000000_autenticacion_sesiones_intentos` | CENTINELA |
| #134 | `brave-carson-v2g7q5` | #129 | — (cambia código de inventario) | KARDEX |
| #135 | `conciliacion-pagos-cxc` | #129 | `20261012000000_conciliacion_pagos_bancarios` | BALANCE |
| #140 | `keen-goldberg-62o7f1` | #129 | `20261011150000_precio_aprobacion_producto` | KARDEX |
| #141 | `focused-franklin-avfmae` | `main` | — (solo `schema.prisma`) | NEXUS |

La asignación de agentes es una **inferencia** a partir del contenido de cada PR; GitHub no etiqueta PR por agente. #139 contiene #127, #128, #132, #133, #137 y #138 (verificado por ancestría). **Las cabezas cambian mientras se trabaja**: durante esta sesión #129, #137, #139 y #140 recibieron commits nuevos y la integración se actualizó y volvió a verificarse. Cabezas usadas en el resultado final: #139 `8a1ddc36`, #129 `c5fe4982`, #140 `7c0e73b0`, #134 `57c64962`, #135 `3ee65f5f`, #136 `2cfdf8b9`, #130 `02e4a134`, #131 `3a37fba0`, #141 `82343098`.

## 2. Estrategia aplicada

Rama **local** temporal `nexus/integracion-temp`, creada desde `origin/claude/centinela-cierre-produccion` (#139). **No se subió al remoto** (las reglas de esta sesión solo permiten empujar a la rama designada); ninguna rama de agente fue modificada. Receta reproducible:

```bash
git checkout -B nexus/integracion-temp origin/claude/centinela-cierre-produccion
git merge origin/claude/focused-franklin-avfmae          # #141
git merge origin/claude/p1-garantias-devoluciones        # #130
git merge origin/claude/brave-carson-v2g7q5              # #134
git merge origin/claude/p1-compras-reportes              # #131
git merge origin/claude/hopeful-franklin-hb3n48          # #136
git merge origin/claude/conciliacion-pagos-cxc           # #135
git merge origin/claude/integracion-pos-offline-p1       # #129 (commits posteriores a #139)
# #140: solo backend/prisma (esquema + migración); su código NO se integra (ver §3)
```

Regla de resolución en `schema.prisma`: conservar ambos lados (todas las colisiones son adiciones) y cerrar con `}` el modelo que compartía llave. Se validó con `prisma validate` tras cada paso.

## 3. Conflictos encontrados

| Conflicto | PR | Resolución | Quién debe revisar |
|---|---|---|---|
| `schema.prisma`: relaciones de `Tenant` y final del archivo (ambos añaden modelos) | #141 vs #139; #135 | Ambos lados conservados; llave de cierre restaurada | NEXUS (resuelto) |
| `CONTEXTO_MAESTRO.md` (cabecera y secciones) | #141, #131, #136 | Ambos lados; se conserva la cabecera de la rama de integración. Comprobado: 0 líneas perdidas | Cada agente en su sección |
| Lista fija de migraciones en `ventas.postgres.integration.ts` | #135, #140 | Unión ordenada por nombre (12 migraciones) | NEXUS (resuelto) |
| Lista fija de migraciones en `reportes-zona-horaria.postgres.integration.ts` | integración | Añadidas `…precio_aprobacion_producto` y `…autenticacion_sesiones_intentos` (causaba 20 fallos `precio_aprobado does not exist`) | NEXUS (resuelto) |
| `OperacionesPage.tsx`: declaraciones de estado (`preferido`/`cargarPreferido` de FORJA y `autRef`/`autTerminal`/`autorizacionValida` de BALANCE) | #135 vs #129 | Declaraciones combinadas sin duplicar `contado` ni `metodoContado`; sin lógica nueva. `tsc -b` 0 errores, frontend 236/236 | **FORJA y BALANCE deben revisar** |
| **Código de inventario**: #140 vs #134, 10 archivos (`productos.service`, `levantamientos.service`, `ventas.service`, pruebas, `InventarioPage`, `LevantamientoPage`, `ImportarProductosModal`, locales) | #134 vs #140 | **No resuelto**: ambas son de KARDEX y mezclan reglas de negocio. De #140 se integró solo `backend/prisma/` | **KARDEX** |
| **Choque de comportamiento sin conflicto de texto**: #134 quita `costo_unitario` de la búsqueda de ventas para todos los roles; la prueba de #132 exige que ADMIN lo conserve | #134 vs #132/#133 | **No resuelto**. `seguridad-fase2` pasa 16/16 sin #134 y falla 2 con #134 | **KARDEX y CENTINELA** |
| Prefijo de migración repetido `20261012000000` (autenticación y conciliación) | #135 vs #137 | Sin renombrar: nombres completos distintos; Prisma las ordena por nombre completo (autenticación antes que conciliación) | BALANCE y CENTINELA (conviene un prefijo propio) |

## 4. Verificación sobre PostgreSQL 16.15 temporal (base vacía)

Cada estado: `prisma migrate deploy` real, `validate`, `generate`, `migrate diff`, `tsc -p tsconfig.build.json`.

| Estado | Migraciones | `deploy` | `validate` / `generate` | `migrate diff` | `tsc` build |
|---|---|---|---|---|---|
| #141 (`82343098`) | 13 | correcto | correcto | **0 líneas**, 0 DROP | 0 errores |
| Combinado (integración, final) | 18 | correcto | correcto | **0 líneas**, 0 DROP | 0 errores |

Objetivo de 0 diferencias destructivas o inesperadas: **cumplido en PostgreSQL temporal**. No hay cambios legítimos pendientes de migración ocultos: ninguna migración histórica fue modificada.

Pruebas del estado combinado:

| Suite | Resultado |
|---|---|
| Backend unitarias | 38 archivos, 357/357 |
| Integración PostgreSQL | 28 archivos: **468 pasan, 2 fallan, 1 omitida** |
| Frontend unitarias / `tsc -b` | 236/236 / 0 errores |

Los 2 fallos son `seguridad-fase2` (costo en búsqueda de ventas y en entregas) y se deben al choque #134 ↔ #132 de §3, no al esquema. La omitida es una prueba de navegador condicionada por `REAL_SETTINGS_BROWSER`. Playwright no se ejecutó.

## 5. Contratos por agente (solo esquema)

| Agente | Objetos | Hallazgo |
|---|---|---|
| ATLAS | `dispositivos_pos`, `contingencia_ventanas`, `catalogo_instantaneas`, `operaciones_contingencia`; 6 columnas nuevas en `ventas`; trigger de inmutabilidad | Idempotencia en base solo por `UNIQUE(venta_id)`. El índice `(tenant_id, dispositivo_id, secuencia_local)` **no es único**: dos operaciones con la misma secuencia de un dispositivo pueden coexistir si la aplicación no lo impide. Decisión de ATLAS |
| KARDEX | 5 columnas e índice en `productos` | La migración incluye `UPDATE productos SET precio_aprobado = true …` solo para filas con `precio_venta > 0` (marca `LEGADO_MIGRACION`; versión actual de #140, antes sin filtro). No es destructivo pero modifica datos existentes |
| FORJA | `productos_proveedores` (único por tenant+producto+proveedor; único parcial de preferido) | Unicidad correcta. La base acepta un producto de otra empresa (ver abajo) |
| BALANCE | `aprobaciones_bancarias` (único tenant+método+terminal+referencia), `conciliaciones_bancarias` (únicos tenant+terminal+fecha y tenant+solicitud) | Idempotencia correcta. Colisión de prefijo de migración (§3) |
| CENTINELA | `sesiones_auth`, `intentos_login` (sin tenant, por sujeto/clave) | Sin FK a tenant; coherente con su diseño. `auditoria_soporte` conservada (decisión del dueño) |

### Aislamiento entre empresas (tenant)

En el esquema combinado **no existe ninguna FK compuesta con `tenant_id`**: las 42 relaciones de una columna entre tablas con tenant no impiden que un hijo apunte a un padre de otra empresa, y no hay `UNIQUE(tenant_id, id)` en los padres. Solo `coberturas_garantia` tiene un trigger de coherencia.

Reproducido en la base temporal (transacción revertida): una fila de `productos_proveedores` de la empresa A referenciando un producto de la empresa B **fue aceptada**. Hoy el aislamiento depende solo de la capa de aplicación.

- CENTINELA llegó a la misma conclusión de forma independiente y entregó la lista priorizada de FK compuestas: `docs/CENTINELA_FK_COMPUESTAS_PARA_NEXUS_20261010.md` (rama #139). Pidió que NEXUS construya las consultas de detección por tabla.
- Medición (hecha): `backend/scripts/auditoria-tenant-cruzado-lectura.sql`, solo lectura, **48 comprobaciones** generadas del catálogo: 42 FK entre tablas con tenant, 5 comparaciones padre-padre para líneas sin `tenant_id` (`detalles_venta`, `detalles_compra_proveedor`, `detalles_cotizacion`, `detalles_orden_compra`, `detalles_transferencia`) y 1 de dos saltos (`detalles_devolucion`). Probado: 0 violaciones en base limpia; detecta violaciones sembradas en `productos_proveedores` y `detalles_venta`; rechaza escrituras. No cubre tablas con un solo padre (`movimientos_caja`, `pagos_proveedor`, etc.), que heredan el tenant del padre.
- **No se implementó la corrección** (las migraciones de FK compuestas y `UNIQUE(tenant_id, id)` de CENTINELA quedan sin escribir hasta que la auditoría de producción dé resultado vacío y el dueño apruebe el diseño; el orden de CENTINELA §4 es razonable). Pasar a FK compuestas cambia el modelo de relaciones de todos los agentes y exige que producción esté libre de casos previos. Opciones en §8.

## 6. Verificación de producción (solo lectura)

No se tuvo ni se pidió acceso. **El diff vacío sobre PostgreSQL temporal no valida producción.** Procedimiento exacto para el propietario: [VERIFICACION_PRODUCCION_SOLO_LECTURA_NEXUS.md](VERIFICACION_PRODUCCION_SOLO_LECTURA_NEXUS.md).

## 7. Seguridad de la migración (no ejecutada)

Las 5 migraciones nuevas del conjunto combinado (no se añadió ninguna de NEXUS) fueron revisadas: **ninguna contiene `DROP`, `DELETE` ni `TRUNCATE`**. Solo crean tablas, añaden columnas con valor por defecto constante, crean índices y, en un caso, hacen `UPDATE`.

| Migración | Riesgo | Verificación previa |
|---|---|---|
| `20261010140000_productos_proveedores` | Bajo: tabla nueva e índices únicos | Nada que verificar en datos |
| `20261011000000_pos_contingencia_offline` | Bajo: 6 columnas con default constante en `ventas`; tablas nuevas | Tamaño de `ventas` (bloqueo breve del `ALTER`) |
| `20261011150000_precio_aprobacion_producto` | **Medio**: `UPDATE` de las filas de `productos` con `precio_venta > 0`; `CREATE INDEX` sin `CONCURRENTLY` | Conteo de `productos` por tenant; ventana de baja actividad; **aprobación explícita independiente** del `UPDATE` |
| `20261012000000_autenticacion_sesiones_intentos` | Bajo: tablas nuevas | — |
| `20261012000000_conciliacion_pagos_bancarios` | Bajo: tablas nuevas | — |

**Respaldo previo (obligatorio):** `pg_dump --format=custom --no-owner --no-acl -f respaldo_AAAAMMDD.dump "$URL_LECTURA"`; restaurar en una base temporal y comparar conteos de `productos`, `ventas`, `clientes` y de las 10 tablas históricas.
**Recuperación:** `pg_restore --clean --if-exists --no-owner -d <base_nueva>`; las migraciones son aditivas, así que revertir el código no exige revertir la base. Para #140, la reversión documentada es `DROP INDEX` + `DROP COLUMN` de las 5 columnas (**operación destructiva: requiere aprobación independiente**).
**Orden sugerido:** (1) verificación de solo lectura de producción; (2) respaldo y restauración de prueba; (3) aplicar con `migrate deploy` solo tras autorización; (4) repetir verificación y comparar conteos.

## 8. Decisiones pendientes

1. **#134 ↔ #132/#133 (costo en búsqueda de ventas).** Opciones: (a) el costo se oculta solo a VENDEDOR y ADMIN lo conserva; (b) se oculta a todos y se actualiza la prueba de #132. Recomendación: (a); KARDEX y CENTINELA lo acuerdan.
2. **#140 ↔ #134 (código de inventario).** Los dos autores resuelven el conflicto en una rama propia; NEXUS integra solo esquema.
3. **Coherencia de tenant en base de datos.** Opciones: (a) mantener solo control en aplicación; (b) triggers de coherencia como el de `coberturas_garantia`, por tabla nueva; (c) `UNIQUE(tenant_id, id)` en padres y FK compuestas (`NOT VALID` y luego `VALIDATE`). Recomendación: (b) para tablas nuevas de FORJA, ATLAS y BALANCE; (c) como proyecto aparte con revisión de CENTINELA. Antes de cualquiera, correr la auditoría de solo lectura en producción.
4. **Unicidad de `(tenant_id, dispositivo_id, secuencia_local)` en `operaciones_contingencia`** (ATLAS).
5. **Prefijo de migración** `20261012000000` repetido: renombrar solo si el dueño lo autoriza y antes de aplicar en cualquier entorno compartido.

*Firmado: NEXUS.*
