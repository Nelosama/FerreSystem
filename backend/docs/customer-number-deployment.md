# Numeración de clientes: preparación y despliegue

Esta funcionalidad agrega `clientes.numero_cliente`, una restricción única por empresa, la tabla `secuencias_cliente` y un trigger que asigna números automáticamente. La API nueva necesita la migración antes de arrancar. La API anterior sigue creando clientes correctamente después de aplicarla: el trigger asigna el número aunque el INSERT no incluya ese campo.

## Migración preparada

Archivo: `prisma/migrations/20261002000000_add_customer_numbers/migration.sql`.

Los clientes existentes reciben números por empresa, en orden de fecha de creación e ID. Sus IDs, nombres, RTN, teléfonos y relaciones no cambian. La numeración se muestra como `CLI-000001`. El contador permanece aunque se eliminen clientes; los números no se editan ni se reutilizan. Eliminar por completo una empresa elimina su propio contador junto con sus datos.

La migración se ejecuta en una transacción. Durante la ejecución las escrituras en clientes esperan; el ALTER TABLE también puede bloquear lecturas brevemente. Su duración depende del volumen de clientes y de transacciones concurrentes. No ejecuta DELETE, TRUNCATE ni DROP sobre datos existentes.

La asignación requiere el trigger, además de las columnas/tablas. `prisma db push` no instala esa lógica. No desplegar esta funcionalidad usando `db push --accept-data-loss`.

## Orden para producción

1. Desactivar el despliegue automático de Render antes de publicar el código que necesita la nueva columna. Guardar la referencia del último deploy correcto y verificar un respaldo recuperable de la base.
2. Revisar el estado actual del esquema y su historial de migraciones. La configuración anterior usaba `db push`; no se puede asumir que las migraciones de septiembre estén registradas o que deban ejecutarse nuevamente.
3. Si el historial de migraciones ya es compatible, aplicar la nueva migración mediante Prisma Migrate antes de desplegar la API. Si no lo es, preparar primero el baseline contra el esquema real. No marcar migraciones antiguas como aplicadas sin comprobar sus cambios, ni ejecutar `migrate deploy` a ciegas.
4. Comprobar que todos los clientes tienen un número positivo, que no se repite dentro de una empresa, que el contador refleja el máximo asignado y que el trigger `clientes_assign_number` está instalado. Probar un alta y buscarla por su número.
5. Configurar Root Directory como `backend` y el Build Command sin cambios automáticos de esquema:

   ```sh
   npm ci --include=dev && node node_modules/prisma/build/index.js generate && npm run build
   ```

6. Mantener Start Command como `node dist/main.js`. Comprobar las variables de conexión, JWT y FRONTEND_URL sin compartir secretos. Desplegar manualmente el commit validado.
7. Verificar el inicio, el listado de clientes y una nueva cotización con cliente seleccionado. Si es necesario revertir el código, conservar la migración aditiva: la API anterior es compatible. No eliminar la columna, el contador o el trigger como rollback automático.

## Validación local

`npm run test:integration` crea un PostgreSQL temporal con el esquema anterior, inserta clientes preexistentes y ejecuta exactamente el SQL preparado. Verifica backfill por empresa, preservación de datos, INSERT de la versión anterior, altas concurrentes, números inmutables y no reutilización tras borrado. También compila y arranca la API nueva en producción contra esa base temporal. No utiliza la base de Supabase.
