# CENTINELA — auditoría de seguridad de la integración NEXUS (2026-10-10)

**Firma:** CENTINELA. **Commit auditado:** `e8b75ae6` en `nexus/integracion-temp`. **Alcance:** solo pruebas y documentación. No hay merge, despliegue, migraciones ni cambios productivos. NEXUS no recibió cambios en su rama.

## 1. Veredicto

- **Aislamiento entre empresas en las rutas probadas: se mantiene.** Ninguna prueba de acceso cruzado de datos falló. La empresa B no lee, modifica ni paga nada de la empresa A por HTTP.
- **Defectos demostrados: 3** (ver §3), ninguno de fuga de datos entre empresas. Dos son de permisos o integridad de negocio (P1) y uno es un oráculo de existencia (P2).
- **Integración: GO condicionado.** Condiciones: decidir la regla de entrega de CAJERO (D1) y aprobar el plan de FK compuestas (D2) antes de producción.
- **Producción: NO-GO**, sin cambio. Faltan la comprobación de deriva de solo lectura contra producción y las reglas de protección de GitHub.

## 2. Pruebas ejecutadas (commit `e8b75ae6`, PostgreSQL 16 temporal, usuario `nobody`)

| Suite | Resultado | Evidencia |
|---|---|---|
| Unitarias backend (Vitest) | **39 archivos, 366/366** | `docs/evidencias/auditoria-integracion-nexus-20261010/unitarias-backend.log` |
| Scripts (`node --test`) | **33/33** | `scripts.log` |
| Integración PostgreSQL completa | **34 archivos, 517 pasan, 1 omitida, 0 fallos** | `integracion-base.log` |
| Auditoría CENTINELA (nueva, `backend/test/centinela-auditoria-integracion.postgres.integration.ts`) | **18 pasan, 3 `it.fails` que se cumplen** | `centinela-auditoria.log` |
| Mutación: quitar el filtro de empresa en `entregar` | La prueba A2 **falla** (detecta la regresión) | `mutacion-filtro-tenant-entregar.log` |

Nota: NEXUS reportó 6 fallos en un commit anterior (`162b5c06`). **No se reproducen en `e8b75ae6`**: la integración completa pasa.

Las pruebas `it.fails` documentan defectos: pasan mientras el defecto existe y fallan cuando se corrige, para obligar a convertirlas en `it`.

## 3. Defectos demostrados

| ID | Prioridad | Defecto | Demostración | Responsable |
|---|---|---|---|---|
| D1 | **P1** | CAJERO puede entregar pedidos (`POST /operaciones/ventas/:id/entregar`). El contrato `docs/POS_ENTREGA_CONTRATOS.md` §2.1 dice que solo ADMIN y BODEGUERO. | Respuesta **201** con la venta entregada (sonda). Prueba `CAJERO no entrega pedidos` (`it.fails`). | ATLAS (módulo POS) y propietario (decisión de regla) |
| D2 | **P1** | La base acepta relaciones entre empresas: una venta de A apunta a un cliente de B, y una cuenta por cobrar de A apunta a un cliente de B. | `UPDATE ventas SET cliente_id` y `INSERT cuentas_operativas` **se ejecutan sin error** (pruebas E1 y E2, `it.fails`). El catálogo confirma 58 FK de una columna y **0 FK compuestas**. | NEXUS |
| D3 | **P2** | Oráculo de existencia en idempotencia: una solicitud de otra empresa responde **409** y una libre **201**. Afecta a `movimientos de caja` y a `ventas`. No se devuelven datos ajenos. | Pruebas B1 y «ventas: una solicitud de otra empresa…». Mismo patrón que el hallazgo 2.5-2 de ATLAS. | ATLAS |

### 3.1 Por qué D2 es P1 y no P0

Las rutas probadas validan la empresa de la referencia antes de escribir (la prueba de ventas rechaza un cliente ajeno). Por eso no hay una fuga explotable hoy por HTTP. El riesgo es que la base no lo impide: cualquier código futuro, importación o corrección manual puede crear una referencia cruzada sin aviso. Se mantiene P1 hasta que la FK compuesta esté aplicada en las tablas P1 de la matriz.

## 4. Hallazgos verificados sin defecto

- **Rutas:** 127 rutas en 16 controladores (inventario `docs/evidencias/.../inventario-rutas.tsv`, generado con `inventario-rutas.cjs`). Las rutas de `super-admin` tienen `SuperAdminGuard` por método; `backup-status` usa `SuperAdminGuard`.
- **Costos y márgenes:** `ProductoResponseInterceptor` usa lista blanca (`publicProduct`); `CashierResponseInterceptor` filtra claves de costo; `SinCostosParaBodeguero` en compras, proveedores de producto, historial y entregas; `LevantamientoResponseInterceptor` elimina precio y costo de ítems y reduce advertencias a un conteo. El `cambiosCosto` de recepciones solo se guarda en `auditoria_operaciones`, que solo lee ADMIN; la respuesta de recepción no lo incluye.
- **Pagos a proveedores (CXP):** exigen ADMIN en `GET /cuentas` y en `POST /cuentas/:id/pagos`.
- **Cajas:** `cajaDetalle` y `cerrar` filtran por dueño; ADMIN ve todas.
- **Autenticación:** el seed no contiene claves demo; el `upsert` no sobrescribe cuentas existentes; el refresh token se rechaza como credencial de API; `validarConfiguracionAuth` se ejecuta al arrancar. Las claves `Ferre2026!` y `SuperAdmin2026!` solo aparecen en pruebas (hash en memoria) y en el script de auditoría.
- **Idempotencia de pagos y recepciones:** buscan por `tenant_id` y `solicitud_id`. Idempotencia de ventas: si la solicitud es de otra empresa, lanza conflicto sin devolver el registro (D3).
- **Entregas repetidas:** la segunda llamada no cambia `entregado_at`.

## 5. Riesgos potenciales (no demostrados)

| ID | Prioridad | Riesgo | Por qué no es defecto demostrado | Acción |
|---|---|---|---|---|
| R1 | P2 | `GET /operaciones/entregas` devuelve **todos** los pedidos pendientes del tenant a CAJERO. El contrato dice «sus ventas». | Lectura de código: la consulta no filtra por `usuario_id`. No se creó una segunda venta de otro cajero para probarlo. | ATLAS: decidir alcance; añadir prueba. |
| R2 | P2 | `GET /operaciones/proveedores` accesible a CAJERO, VENDEDOR y BODEGUERO. | Contenido de proveedor no revisado en detalle (contacto, RTN). | KARDEX/ATLAS: confirmar campos. |
| R3 | P2 | `GET /productos`, `GET /productos/:id` y `GET /tenant/settings` no tienen `@Roles`: cualquier rol del tenant puede leerlos. | Productos usan lista blanca (sin costos). `/tenant/settings` no revisado en contenido. | Revisar contenido de settings. |
| R4 | P2 | 31 de las 58 relaciones no tienen índice que empiece por la columna FK ni por `(tenant_id, columna)`. | Rendimiento al borrar o actualizar un padre; no es un defecto de seguridad. | Crear índices `(tenant_id, columna)` junto con la FK compuesta. |
| R5 | P2 | `aprobaciones_bancarias.usuario_id` y `conciliaciones_bancarias.usuario_id` son referencias cruzables sin FK compuesta. Son tablas de conciliación (BALANCE). | Sin prueba propia; las pruebas de conciliación ya validan que otra empresa no las ve. | BALANCE y NEXUS: incluir en la lista. |
| R6 | P2 | Cotizaciones y dashboard no se probaron por HTTP en esta fase. | Revisión estática: sin campos de costo en el servicio; el interceptor global filtra claves conocidas. | FARO o CENTINELA en la siguiente fase. |

## 6. Matriz de NEXUS (`docs/MATRIZ_TENANT_TABLAS_CRITICAS_NEXUS_20261010.md`)

Verificada contra el catálogo de PostgreSQL (migraciones de `e8b75ae6`, 21 archivos):

- **58 de 58 relaciones coinciden**: ni faltan ni sobran. Las dos líneas de «impacto» no son relaciones.
- **«Tenant en hija»:** 42 hijas tienen `tenant_id` y 16 relaciones (11 tablas distintas) no. La matriz dice «11 tablas», que coincide.
- **«Índice de apoyo»:** la matriz marca «no» en 31 relaciones y «sí» en 27. El catálogo confirma esas cifras si se acepta como índice de apoyo uno que empiece por la columna FK **o** por `(tenant_id, columna)`: 16 cumplen lo primero y 11 solo lo segundo. Con la definición estricta (la columna FK al inicio), 42 no tendrían índice. **Recomendación:** definir la columna en la matriz como «índice que empieza por la columna o por (tenant_id, columna)» para evitar confusión.

## 7. Evaluación de las FK compuestas propuestas (`backend/prisma/propuestas/tenant-fk-compuestas/`)

Correcto:
- Unicidad `(tenant_id, id)` como requisito para referenciar; FK `NOT VALID` seguida de `VALIDATE` tras auditoría en cero; rollback que no toca filas ni FK existentes; el piloto no está en `prisma/migrations`.

Observaciones antes de producción:
1. **`ALTER TABLE … ADD CONSTRAINT … UNIQUE` bloquea escrituras** mientras construye el índice. Para tablas con volumen, usar `CREATE UNIQUE INDEX CONCURRENTLY` y después `ALTER TABLE … ADD CONSTRAINT … UNIQUE USING INDEX`. Ejecutar fuera de transacción.
2. **`ventas.cliente_id` tiene `ON DELETE SET NULL` en la FK actual.** La FK compuesta debe ser `NO ACTION` (ya lo indica la matriz §4). Verificar en una copia que borrar un cliente con ventas funciona con ambas FK activas.
3. **Índices `(tenant_id, columna)`** antes de las FK compuestas, para que borrar o actualizar un padre no recorra la hija.
4. **Tablas hijas sin `tenant_id`** (11 tablas): columna nullable, *backfill* por lotes desde el padre, `CHECK (tenant_id IS NOT NULL) NOT VALID` y `VALIDATE`, y solo después `SET NOT NULL`.

## 8. Propuesta de migración para D2 (no ejecutar en producción)

Orden sugerido, una migración por tabla padre, cada una con respaldo previo y ensayo en copia:

1. Auditoría de solo lectura (`backend/scripts/auditoria-tenant-cruzado-lectura.sql`) con cero filas en todas las tablas P1.
2. Índices únicos `(tenant_id, id)` en `clientes`, `productos`, `proveedores`, `usuarios`, `ventas`, `cuentas_operativas`, `cajas` (concurrentes).
3. FK compuestas `NOT VALID` en las relaciones P1 de la matriz; `VALIDATE` en ventana de baja actividad.
4. Índices `(tenant_id, columna)` para cada FK compuesta.

Pruebas que deben existir antes de aplicar: inserción cruzada rechazada (E1, E2 pasan a `it`), y las pruebas de integración completas en verde.

## 9. Decisiones y responsables

| ID | Decisión | Responsable |
|---|---|---|
| D1 | ¿CAJERO puede entregar pedidos? El código dice sí; el contrato dice no. Recomendación CENTINELA: seguir el contrato (ADMIN y BODEGUERO) hasta que ATLAS lo cambie por escrito. | Propietario, con ATLAS |
| D2 | Aprobar el plan de FK compuestas (§8) y su orden. | NEXUS y propietario |
| D3 | Corregir el oráculo de existencia (§3, D3): devolver la misma respuesta para ids ajenos que para ids libres. | ATLAS |
| D4 | Decidir alcance de entregas por vendedor (R1). | ATLAS y propietario |

## 10. Acciones concretas para NEXUS (coordinación, sin tocar su rama)

1. Revisar la lista de §5 R5 y añadir `aprobaciones_bancarias` y `conciliaciones_bancarias` a la matriz.
2. Ajustar la propuesta piloto según §7 (índices concurrentes, `NO ACTION`).
3. Confirmar que `pruebas E1 y E2` siguen como `it.fails` en su rama hasta que haya FK compuestas.

## 11. Evidencias

Carpeta `docs/evidencias/auditoria-integracion-nexus-20261010/` con `SHA256SUMS`: inventario de rutas, FK del catálogo, logs de pruebas y la mutación. Reproducción: `node inventario-rutas.cjs <ruta-backend> <raíz-del-repo>` y `npx vitest run --config ./vitest.config.integration.ts centinela` como usuario sin privilegios.

## 12. Límites

- Sin datos de producción. Las comprobaciones son sobre bases vacías con datos sembrados.
- No se probó Playwright ni el frontend.
- Cotizaciones, dashboard y reportes no tienen prueba HTTP propia en esta fase (R6).
- Las claves de demostración no se consultaron en ningún entorno real.

*Firmado: CENTINELA.*
