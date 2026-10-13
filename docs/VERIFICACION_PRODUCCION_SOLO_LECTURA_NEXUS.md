# Verificación de estructura de producción — solo lectura (NEXUS)

**Para:** propietario / responsable técnico. **Firma:** NEXUS.
**Estado:** NO ejecutada. NEXUS no tiene ni pidió acceso a producción. Un diff vacío sobre PostgreSQL temporal **no** valida producción: solo demuestra que las migraciones del repositorio reproducen el esquema del repositorio.

## Reglas

- Usar una credencial de **solo lectura** que ya exista (rol con `SELECT`, o réplica de lectura). No pegar la URL en chats, PR ni tickets.
- Nunca ejecutar `prisma migrate dev`, `prisma db push`, `prisma migrate reset` ni `prisma migrate deploy` contra producción en este procedimiento.
- La salida de `prisma migrate diff --script` es **solo texto**: no se redirige a `psql` ni se aplica.
- Compartir de vuelta solo nombres de objetos y conteos. Nunca filas de datos, URLs ni tokens.

## Preparación (en una máquina del propietario)

```bash
git fetch origin claude/focused-franklin-avfmae
git checkout origin/claude/focused-franklin-avfmae   # esquema alineado de #141
cd backend && npm ci --ignore-scripts
export PROD_RO_URL='postgresql://USUARIO_LECTURA:***@HOST:5432/postgres'   # no compartir
export PGOPTIONS='-c default_transaction_read_only=on'                      # sesión de solo lectura
```

Usar la conexión **directa** (puerto 5432), no el pooler (pgbouncer), para la introspección.

## Pasos

### 1. Historial de migraciones aplicado

```bash
DIRECT_URL="$PROD_RO_URL" node scripts/migration-safe.mjs inspect
```

`inspect` abre una transacción `READ ONLY`. Esperado hoy en producción: historial coherente con las 13 migraciones de `main`, sin `MIGRACION_INCOMPLETA`, `CHECKSUM_DISTINTO`, `MIGRACION_DESCONOCIDA` ni `HISTORIAL_CON_HUECOS`. Cualquier otro código: **parar** y reportar solo el código.

### 2. Diferencia estructural contra el esquema de #141

```bash
DATABASE_URL="$PROD_RO_URL" DIRECT_URL="$PROD_RO_URL" \
  npx prisma migrate diff --from-url "$PROD_RO_URL" \
  --to-schema-datamodel prisma/schema.prisma --script --exit-code > /tmp/diff_prod.sql
echo "exit=$?"; grep -cvE '^--|^$' /tmp/diff_prod.sql
```

- `exit=0` y 0 líneas: la estructura de producción coincide con el esquema de #141.
- `exit=2`: hay diferencias. Reportar **solo** el conteo por tipo:
  `grep -cE '^DROP TABLE' /tmp/diff_prod.sql`, `grep -c 'DROP COLUMN' /tmp/diff_prod.sql`, `grep -c 'ADD CONSTRAINT' /tmp/diff_prod.sql`, `grep -c 'DROP CONSTRAINT' /tmp/diff_prod.sql`.
  Un `DROP TABLE`/`DROP COLUMN` indica un objeto de producción que el esquema no conoce: **no integrar** hasta analizarlo.

### 3. Conteos de las tablas históricas (decisión del dueño: se conservan todas)

```bash
psql "$PROD_RO_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT 'abonos_apartado' t, count(*) FROM abonos_apartado UNION ALL
SELECT 'apartados', count(*) FROM apartados UNION ALL
SELECT 'auditoria_soporte', count(*) FROM auditoria_soporte UNION ALL
SELECT 'cierres_comisiones', count(*) FROM cierres_comisiones UNION ALL
SELECT 'detalles_transferencia', count(*) FROM detalles_transferencia UNION ALL
SELECT 'garantias', count(*) FROM garantias UNION ALL
SELECT 'historial_garantias', count(*) FROM historial_garantias UNION ALL
SELECT 'listas_precio', count(*) FROM listas_precio UNION ALL
SELECT 'pedidos_especiales', count(*) FROM pedidos_especiales UNION ALL
SELECT 'transferencias', count(*) FROM transferencias UNION ALL
SELECT 'clientes con lista_precio_id', count(*) FROM clientes WHERE lista_precio_id IS NOT NULL;
ROLLBACK;
SQL
```

Guardar los conteos como línea base **antes** de cualquier despliegue; después deben ser iguales o mayores.

### 4. Referencias entre empresas distintas

```bash
psql "$PROD_RO_URL" -tA -f scripts/auditoria-tenant-cruzado-lectura.sql | awk -F'|' '$3>0'
```

El script tiene 48 comprobaciones y omite (resultado vacío) las que usan tablas que producción aún no tiene, así que sirve hoy (13 migraciones) y después de integrar (18). Probado en ambos esquemas y con violaciones sembradas. Sin salida = 0 violaciones. Si aparece alguna línea, reportar la restricción y el conteo (no las filas). La base **no** impide estos casos; solo `coberturas_garantia` tiene trigger de coherencia.

### 5. Diagnóstico existente del dashboard (opcional)

```bash
psql "$PROD_RO_URL" -f scripts/diagnostico-dashboard-lectura.sql
```

## Qué devolver a NEXUS

1. Código de `inspect` (paso 1).
2. `exit` y conteos por tipo (paso 2).
3. Conteos del paso 3 y del paso 4.

## Interpretación

| Resultado | Significa | Acción |
|---|---|---|
| Paso 2 vacío, paso 4 vacío | Estructura coincide; sin referencias cruzadas | Puede continuar la preparación de integración |
| Paso 2 con `ADD CONSTRAINT`/`DROP DEFAULT` solamente | Metadatos distintos | Revisar con NEXUS; no bloquea datos |
| Paso 2 con `DROP TABLE`/`DROP COLUMN` | Objetos en producción sin modelo | **NO-GO**: conservar y modelar |
| Paso 1 con códigos de error | Historial de migraciones no coincide | **NO-GO** hasta conciliar con `migrate:adopt` documentado, con respaldo |
| Paso 4 con filas | Datos con referencia entre empresas | **NO-GO** para añadir restricciones; corregir con aprobación explícita |

Después de integrar, repetir pasos 1–4 contra el esquema combinado para ver únicamente las migraciones pendientes legítimas.

*Firmado: NEXUS.*
