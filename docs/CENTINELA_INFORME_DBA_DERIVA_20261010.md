# Informe técnico para el responsable de base de datos — deriva heredada de `main`

**Emisor:** CENTINELA (seguridad). **Destinatario:** responsable de base de datos de FerreSystem. **Fecha:** 2026-10-10.
**Carácter:** informe para decisión. No se ejecutó ninguna operación sobre producción ni sobre ninguna base real.

## 1. Resumen

- La base que se obtiene aplicando **todas** las migraciones versionadas en `main` no coincide con `backend/prisma/schema.prisma`. La diferencia es de **219 líneas** de SQL.
- La deriva ya existe en `main`. #129 no añade deriva propia tras la alineación de nombres y relaciones hecha en #138.
- Riesgo principal: cualquier `prisma migrate dev`, `prisma db push` o `prisma migrate reset` contra una base real propondría **borrar 10 tablas con datos**. El repositorio no los ejecuta; el CI los bloquea (`verificar-migraciones.mjs`); no puede impedir su uso manual.
- Recomendación: decidir, con respaldo y ventana, si las tablas huérfanas se **modelan** (sin cambio en la base) o se **retiran** (migración destructiva aprobada). Hasta entonces, no ejecutar ninguna herramienta que compare o sincronice el esquema contra producción.

## 2. Método y reproducción

1. Base limpia en PostgreSQL 16.
2. `prisma migrate deploy` equivalente: aplicar en orden los `migration.sql` de `backend/prisma/migrations/`.
3. `npx prisma migrate diff --from-url <base> --to-schema-datamodel prisma/schema.prisma --script`.

El script `docs/evidencias/deriva-main-20261010/reproducir-deriva.sh` ejecuta estos pasos. Las salidas y su hash están en `SHA256SUMS`:

| Archivo | Contenido | SHA-256 (inicio) |
|---|---|---|
| `deriva-main.sql` | Deriva de `origin/main` (219 líneas) | `279b2606dcd843d2…` |
| `deriva-integracion-antes-alineacion.sql` | Deriva de la integración antes de #138 (255 líneas; regenerada desde el commit `6940e640`) | ver `SHA256SUMS` |
| `listar-fk-base-migrada.sh` | Consulta de FK reales en la base migrada | — |

Nota: una primera versión de este archivo se copió después de la alineación y tenía 219 líneas. Se regeneró desde `6940e640` (255 líneas) y se reemplazó.

Nota de interpretación: en `migrate diff --from-url <base> --to-schema`, **`DROP` significa "existe en la base y no en el esquema"**. Esta interpretación se verificó en la base migrada: `apartados`, `garantias` y las demás tablas existen con sus datos de migración.

## 3. Clasificación de las 219 líneas (medidas en `deriva-main.sql`)

| Categoría | Cantidad | Naturaleza | Riesgo |
|---|---|---|---|
| `DropTable` | 10 | Tablas huérfanas: `abonos_apartado`, `apartados`, `auditoria_soporte`, `cierres_comisiones`, `detalles_transferencia`, `garantias`, `historial_garantias`, `listas_precio`, `pedidos_especiales`, `transferencias` | **Alto** si se aplica una sincronización: pérdida de datos |
| `DropEnum` | 4 | `EstadoApartado`, `EstadoGarantia`, `EstadoPedidoEspecial`, `EstadoTransferencia` | Alto (vinculado a las tablas) |
| `DropColumn` | 1 | `clientes.lista_precio_id` (FK a `listas_precio`) | Alto (pérdida de dato) |
| `DropForeignKey` | 38 | 11 se re-declaran con otra acción (mayormente `ON UPDATE`: base `NO ACTION`, Prisma `CASCADE`). 27 no tienen reemplazo: algunas de tablas huérfanas; otras de tablas vigentes (`ordenes_compra`, `cajas`, `costos_compra`, `detalles_devolucion`, `cuentas_operativas`, `pagos_cuenta`, `movimientos_inventario`, `devoluciones`, `recepciones_compra`, `proveedores`, `detalles_orden_compra`, `movimientos_caja`) | Medio. Las FK siguen activas en la base; no se pierden datos |
| `AddForeignKey` | 11 | Re-declaraciones de las 11 anteriores con otra acción | Bajo |
| `AlterTable` (`DROP DEFAULT`) | 9 | Prisma genera los UUID; la base conserva un default que el esquema no declara en esas 9 columnas `id` | Bajo |

**Las acciones de borrado (`ON DELETE`) de las FK que sí coinciden** (por ejemplo `devoluciones_venta_id_fkey` y `costos_compra_producto_id_fkey`, `RESTRICT`) están alineadas con el esquema. La diferencia está en `ON UPDATE`; las claves primarias son UUID y no se actualizan, así que no afecta a la integridad en la práctica.

## 4. Riesgos de datos y seguridad relacionados

1. **Migración con cambio de tipo:** `20260930000000_alter_stock_decimal_and_operational_models` convierte `productos.stock_actual` y `stock_minimo` a `DECIMAL(12,2)`. Si el tipo anterior tenía más decimales, hubo redondeo. Confirmar en la base de producción cuál era el tipo previo y si hubo pérdida. Esta migración ya está en el historial de `main`; no se modifica.
2. **Usuarios de base de datos:** los scripts y `.env.example` usan una sola URL para ejecución y migraciones (`DATABASE_URL`/`DIRECT_URL`). Recomendado: separar el usuario de aplicación (sin DDL) del usuario de migraciones (dueño del esquema).
3. **Seed con credencial fija (CRITICAL):** ver `CENTINELA_CONTROLES_BASE_DE_DATOS_20261010.md` §1. Confirmar si alguna base accesible tiene la clave `SuperAdmin2026!`.
4. **Historial de migraciones:** `migration-safe.mjs` valida checksums y orden, y bloquea estados incompletos. **No detecta la deriva** entre el esquema y las migraciones.

## 5. Decisiones que necesita el responsable

| # | Decisión | Opciones | Recomendación de CENTINELA |
|---|---|---|---|
| D1 | ¿Las 10 tablas huérfanas tienen datos en producción? | Consultar `SELECT count(*)` en cada una (solo lectura, con autorización) | Verificar antes de cualquier otra decisión |
| D2 | ¿Se conservan? | (a) Modelarlas en `schema.prisma` como `@@ignore` (sin cambio en la base); (b) retirarlas en una migración destructiva aprobada | (a) mientras el dueño decide sobre el módulo; (b) solo con respaldo verificado y ticket |
| D3 | Las 27 FK sin reemplazo | Declararlas en el esquema con su nombre real, o dejarlas como están | Declararlas: no cambia la base y elimina la deriva |
| D4 | Tipo de `productos.stock_*` | Confirmar el tipo previo y el posible redondeo | Confirmar antes de cualquier reconciliación |

## 6. Procedimiento recomendado (cuando se autorice)

1. **Solo lectura:** inventario de datos de las tablas huérfanas en producción (D1). Usuario de solo lectura, sin escribir.
2. **Respaldo verificado:** `backup:verify-restore` sobre un respaldo reciente. Confirmar restauración en base vacía.
3. **Alinear el esquema sin tocar la base** (D2a/D3): añadir modelos `@@ignore` y declarar las FK reales. Validar con `prisma validate`, `prisma generate` y la misma reproducción de este informe: la deriva debe bajar sin cambios de `DROP`.
4. **Migración destructiva (solo si D2b):** nueva migración aditiva de respaldo (por ejemplo, copia de las tablas huérfanas a un esquema de archivo) seguida de `DROP`, con la línea `-- APROBACION-DESTRUCTIVA: <ticket> <responsable>` y revisión de CODEOWNERS. Aplicar con `migration-safe deploy` en una ventana.
5. **Verificación:** repetir la reproducción; la deriva esperada es cero. Registrar el resultado.

## 7. Límites de este informe

- No se consultó la base de producción ni ninguna base real. Los datos de las tablas huérfanas son desconocidos.
- Las 219 líneas se midieron con la versión de Prisma del repositorio (6.4.1). Otra versión puede generar diferencias de formato, no de contenido.
- Este informe no autoriza ninguna migración.
