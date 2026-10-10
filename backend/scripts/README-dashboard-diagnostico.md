# Diagnóstico del HTTP 500 del Dashboard

El esquema completo de `main` responde correctamente en PostgreSQL local. Se reprodujo
`P2022` cuando faltaba una columna que Prisma seleccionaba sin necesitarla
(`productos.version`, `ventas.reserva_pendiente`, `cotizaciones.cliente_email`).
El resumen ahora selecciona sus campos explícitamente. Esto no repara un esquema
incompleto: si falta un campo necesario, el error sigue propagándose.
La causa del incidente de producción requiere evidencia del servidor y de su esquema.

## Comprobación de producción: solo tras autorización

1. El responsable confirma que se puede leer el esquema de la misma base utilizada
   por el backend desplegado. Confirma también el SHA desplegado y la hora del 500.
2. Usa una conexión de PostgreSQL previamente configurada en un servicio libpq
   llamado `ferresystem_dashboard_lectura`, con un rol sin permisos de escritura,
   lectura de metadatos y de `public._prisma_migrations` si existe. Configura TLS
   verificado y las credenciales fuera del repositorio; no compartas URLs, contraseñas
   ni archivos de credenciales. No uses un rol administrador o propietario.
3. Desde la raíz del checkout revisado, ejecuta exactamente:

   ```sh
   umask 077
   PGSERVICE=ferresystem_dashboard_lectura \
   PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000' \
   psql -X -v ON_ERROR_STOP=1 \
     -f backend/scripts/diagnostico-dashboard-lectura.sql \
     > /tmp/ferresystem-dashboard-diagnostico.txt
   ```

   Comprueba que el proceso termina con código 0 y la salida contiene `ROLLBACK`.
   El script contiene solo consultas de metadatos, configuración local de sesión,
   `BEGIN READ ONLY`, metacomandos de psql y `ROLLBACK`. No lee filas comerciales,
   no invoca funciones del negocio ni crea objetos. `-X` impide cargar `.psqlrc`.
   Si la conexión o los permisos fallan, detente y solicita al responsable revisar
   la conexión; no amplíes permisos ni ejecutes migraciones.

4. Interpreta los resultados:
   - Columnas necesarias ausentes: posible causa directa de `P2022` en el resumen actual.
   - Otras columnas ausentes: desajuste real del esquema, pero no necesariamente causa
     del resumen actual. En el backend anterior con selección implícita sí podían fallar.
   - Objetos existentes sin permisos: `information_schema` puede ocultar columnas;
     evita confundirlo con una migración pendiente. Una política RLS requiere revisar
     los permisos del rol del backend, distinto del rol de diagnóstico.
   - Historial inexistente: no prueba por sí mismo que falten migraciones.
   - Historial con `finished_at` nulo y sin `rolled_back_at`: migración no completada.
     Compara los nombres con `backend/prisma/migrations`, sin ejecutar ninguna.
   - Todos los campos presentes: revisa el código exacto desplegado, los tipos de
     columnas y los logs de la petición fallida antes de atribuir la causa al esquema.

5. Solicita solo el código Prisma/SQLSTATE, el modelo o columna afectados y el mensaje
   sanitizado del log del servidor. No compartas parámetros de consultas ni datos
   personales. `P2022` indica columna ausente; `P2021`, tabla ausente; `42501`, permisos;
   `P1000/P1001`, autenticación o conexión; `P2024`, agotamiento del pool. Un error de
   serialización o validación requiere reproducirlo con el caso concreto.

Este procedimiento no autoriza migraciones, cambios de datos, merge ni despliegue.
Un esquema desactualizado se corrige mediante un trabajo separado y autorizado;
no se devuelve un resumen inventado para ocultarlo.
