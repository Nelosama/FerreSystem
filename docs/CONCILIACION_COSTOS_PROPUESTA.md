# Conciliación de costos históricos — propuesta (KARDEX, PR #134)

**Estado:** propuesta sin ejecutar. No se corrige ningún dato. Requiere autorización explícita del dueño antes de cualquier escritura en productiva.

## 1. Problema

Productos creados antes de la regla de costos pueden tener `precio_costo` (costo comercial, usado en ventas y cotizaciones) distinto de `costo_vigente` (costo de la última recepción). Ambos campos deben representar el mismo costo comercial vigente (decisión 5). Corregirlo masivamente sin revisión podría alterar costos que el administrador fijó a propósito.

## 2. Diagnóstico de solo lectura (ya disponible)

`backend/scripts/diagnostico-costos-vigentes.sql`. Lista productos con `precio_costo IS DISTINCT FROM costo_vigente`, la última compra (`costos_compra`, orden, factura, proveedor, costo y fecha) y una clasificación:

| Clasificación | Significado | Acción propuesta |
|---|---|---|
| `SIN_COSTO_VIGENTE` | `costo_vigente` nulo | Revisar; ver regla C |
| `SIN_COMPRA_REGISTRADA` | No hay recepción registrada | Confirmar costo con el dueño; no tocar |
| `COSTO_VIGENTE_COINCIDE_CON_ULTIMA_COMPRA` | Solo difiere `precio_costo` | Regla A |
| `COSTO_VIGENTE_DIFERENTE_DE_ULTIMA_COMPRA` | Inconsistencia real | Revisar caso por caso |

Ejecución recomendada en réplica de lectura o copia restaurada, nunca contra escritura directa:

```bash
psql "$URL_LECTURA" -v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = on" \
  -f backend/scripts/diagnostico-costos-vigentes.sql > diagnostico-costos-$(date +%Y%m%d).txt
```

Prueba: `inventario-ciclo.postgres.integration.ts` ("diagnóstico de costos es de solo lectura…"), que además verifica que una escritura en esa transacción falla.

## 3. Decisiones que necesito del dueño

1. **Regla A — costo de la última compra:** para productos con compra registrada, ¿`costo_vigente = precio_costo = costo de la última recepción`? Esto aplica la decisión 5.
2. **Protección de ediciones manuales:** si ADMIN editó `precio_costo` después de la última recepción, ¿el costo manual prevalece? Propuesta: **sí**, esos productos se excluyen y se listan para revisión.
3. **Productos sin compra:** ¿`costo_vigente` toma `precio_costo` (el costo ya fijado por ADMIN) o queda pendiente?
4. Responsable autorizado y ventana de aplicación.

## 4. Respaldo antes de cualquier cambio

Sin DDL: exportación CSV de los productos afectados, ejecutada desde la misma sesión de lectura:

```sql
\copy (SELECT id, tenant_id, codigo, precio_costo, costo_vigente, updated_at, ultima_compra_at
       FROM productos
       WHERE precio_costo IS DISTINCT FROM costo_vigente)
  TO 'respaldo-costos-AAAAMMDD.csv' CSV HEADER
```

El archivo se guarda fuera del repositorio, con hash y responsable registrados.

## 5. Aplicación propuesta (simulacro primero; no ejecutar sin aprobación)

Filtro de ediciones manuales, para la regla 2: productos cuya última edición de `precio_costo` en `auditoria_operaciones` (`PRODUCTO_EDITAR`, cambios con `precioCosto`) es posterior a `ultima_compra_at` quedan fuera.

```sql
BEGIN;
-- 1) Lista aprobada: pegar identificadores revisados por el dueño.
CREATE TEMP TABLE lista_aprobada (producto_id uuid PRIMARY KEY, costo_nuevo numeric(12,2) NOT NULL);
\copy lista_aprobada FROM 'lista-aprobada.csv' CSV HEADER

-- 2) Antes/después, para auditoría y rollback.
CREATE TEMP TABLE cambios AS
SELECT p.id, p.tenant_id, p.precio_costo AS costo_antes, p.costo_vigente AS vigente_antes, l.costo_nuevo
FROM productos p JOIN lista_aprobada l ON l.producto_id = p.id;

-- 3) Actualización acotada a la lista aprobada; sin tocar precio_venta.
UPDATE productos p
SET precio_costo = c.costo_nuevo, costo_vigente = c.costo_nuevo, version = version + 1, updated_at = NOW()
FROM cambios c WHERE p.id = c.id;

-- 4) Verificación: filas afectadas = lista aprobada; diagnóstico sin esos productos.
SELECT count(*) FROM cambios;              -- debe coincidir con lista_aprobada
-- 5) Auditoría por producto (usuario responsable autorizado).
INSERT INTO auditoria_operaciones (id, tenant_id, usuario_id, operacion, entidad_id, datos)
SELECT gen_random_uuid(), c.tenant_id, :'responsable', 'COSTO_CONCILIACION', c.id,
       jsonb_build_object('antes', jsonb_build_object('precioCosto', c.costo_antes, 'costoVigente', c.vigente_antes),
                          'despues', jsonb_build_object('precioCosto', c.costo_nuevo, 'costoVigente', c.costo_nuevo),
                          'motivo', 'Conciliación autorizada de costos históricos', 'version', 'PR-134')
FROM cambios c;
-- COMMIT;   -- solo tras revisión del conteo y de la auditoría
ROLLBACK;    -- modo simulacro por defecto
```

## 6. Verificación

- Conteo de filas afectadas igual a la lista aprobada.
- Diagnóstico posterior sin esos productos.
- Ningún `precio_venta` modificado (comparar con el respaldo CSV).
- Auditoría `COSTO_CONCILIACION` con antes y después por producto.
- Pruebas `inventario-ciclo` y `productos` pasando sobre copia restaurada.

## 7. Rollback

Si la verificación falla o el dueño revierte la decisión, dentro de la misma transacción antes del `COMMIT`: `ROLLBACK`. Después de `COMMIT`:

```sql
BEGIN;
CREATE TEMP TABLE respaldo (id uuid PRIMARY KEY, precio_costo numeric(12,2), costo_vigente numeric(12,2));
\copy respaldo FROM 'respaldo-costos-AAAAMMDD.csv' CSV HEADER
UPDATE productos p SET precio_costo = r.precio_costo, costo_vigente = r.costo_vigente, version = version + 1, updated_at = NOW()
FROM respaldo r WHERE p.id = r.id;
INSERT INTO auditoria_operaciones (id, tenant_id, usuario_id, operacion, entidad_id, datos)
SELECT gen_random_uuid(), p.tenant_id, :'responsable', 'COSTO_CONCILIACION_REVERSION', p.id, '{"motivo":"Rollback de conciliación"}'::jsonb
FROM productos p JOIN respaldo r ON r.id = p.id;
COMMIT;
```

## 8. Riesgos

- Sobrescribir un costo fijado a propósito por ADMIN (mitigado por la regla 2).
- Ventas o cotizaciones futuras que usen `precio_costo` cambiarían su costo unitario desde el momento de la aplicación; las ventas ya registradas conservan su `costo_unitario` histórico.
- Versión de producto incrementada: formularios abiertos recibirán 409, comportamiento esperado.
- Datos de copia restaurada pueden no reflejar productiva en el momento de aplicar: repetir el diagnóstico justo antes.

## 9. Impacto en otros módulos

Finanzas (BALANCE): cambia costo de ventas futuras y reportes de margen. Requiere revisión de BALANCE antes de aplicar.
