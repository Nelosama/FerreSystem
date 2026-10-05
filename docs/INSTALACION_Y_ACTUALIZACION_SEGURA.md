# Instalación nueva, actualización y adopción de una base existente

Fecha: 5 de octubre de 2026. Preparado en codex/recuperacion-ventas / PR #59.

## Cambio realizado

Se agregó 20260925000000_initial_core antes de las cuatro migraciones históricas. El snapshot prisma/baseline.prisma reconstruye el núcleo a partir del esquema histórico de pruebas, excluyendo levantamientos y numeración posterior. No genera el cliente actual. Las migraciones ya existentes se conservan sin cambiar sus archivos ni checksums.

migrate:deploy y start:prod usan ahora migration-safe.mjs. En una base nueva ejecutan toda la cadena. En una base existente sin baseline, con migraciones fallidas/desconocidas, checksums cambiados, huecos, tablas históricas ausentes o trigger de numeración ausente, bloquean el despliegue. No intentan arreglar datos, borrar tablas ni adivinar qué SQL se ejecutó.

**Antes de desplegar este cambio en un servidor existente, realizar la inspección y la adopción si corresponde.** El inicio productivo se detendrá ante un historial incompatible en lugar de aplicar la migración inicial sobre tablas existentes. La adopción se ejecuta aparte, nunca automáticamente durante el inicio.

## Conexiones y requisitos

Node 24, dependencias backend y herramientas PostgreSQL compatibles. Prisma usa DIRECT_URL, o DATABASE_URL si DIRECT_URL no está definida. Configurarlas explícitamente con el gestor de secretos del entorno; el procedimiento no imprime sus valores. Se admite PostgreSQL en el esquema public. Conexión directa, permisos adecuados y TLS verificable según proveedor.

El respaldo usa PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSFILE o PGSERVICE. La restauración usa FERRE_RESTORE_DATABASE_URL, y la comparación histórica FERRE_REFERENCE_DATABASE_URL. Son destinos distintos con propósitos distintos; no reutilizar producción como destino de restauración ni como referencia. No poner contraseñas en Git ni en argumentos del shell.

## 1. Base nueva y vacía

Desde backend, con una base nueva creada por el administrador:

```sh
npm ci
npx prisma generate
npm run migrate:inspect
npm run migrate:deploy
npm run build
```

La inspección debe indicar VACIA y el despliegue terminar en LISTA con pending vacío. La segunda ejecución no debe volver a crear tablas ni numerar clientes. No se ejecuta seed de demostración automáticamente. Configurar la cuenta inicial y el tenant mediante el procedimiento administrativo correspondiente; no usar usuarios/contraseñas ficticios para operación real.

## 2. Base existente: inspección antes de actualización

```sh
npm run migrate:inspect
```

La inspección es de solo lectura. Resultados:

| Estado | Acción |
|---|---|
| VACIA | Instalar toda la cadena en esa base nueva |
| LISTA | Historial comprobado; revisar respaldo, ensayo en copia y migraciones pendientes antes de deploy |
| REQUIERE_BASELINE | No desplegar todavía; comprobar qué etapa representa el esquema y adoptar explícitamente |
| BLOQUEADA | Resolver la causa con revisión técnica; no usar reset/db push ni marcar migraciones a ciegas |

LISTA comprueba historial y algunas estructuras críticas; no certifica ausencia de todo drift, datos correctos ni aceptación del negocio. El diagnóstico del respaldo revisa stock negativo, códigos duplicados, cajas abiertas y saldos. Conciliar con el dueño antes del piloto.

## 3. Respaldo y restauración verificada

En una ventana de mantenimiento, suspender operaciones y cambios de esquema; conservar también una copia fuera del equipo:

```sh
PGSERVICE=ferresystem_backup node scripts/backup-preflight.mjs /ruta/privada/respaldos
```

Obtener la carpeta creada con database.dump, preflight.txt y manifest.json. El manifiesto empieza con restoreTested false.

Crear otra base vacía y configurar FERRE_RESTORE_DATABASE_URL para ella; después:

```sh
npm run backup:verify-restore -- /ruta/privada/respaldos/CARPETA/manifest.json
```

La herramienta verifica checksum, rechaza destino ocupado y ejecuta pg_restore con parada ante error. Comprueba lectura y cantidades de tablas del núcleo y actualiza el manifiesto únicamente tras completar esa restauración. Una restauración parcial requiere otra base vacía; no reintentar sobre datos existentes. Revisar en esa copia ventas, inventario, caja, crédito y usuarios con la aplicación. La restauración no ejecuta lógica del negocio ni notificaciones, pero la copia debe permanecer aislada.

La evidencia técnica de restauración no prueba que el respaldo sea el más reciente ni que corresponda al destino seleccionado. El operador debe verificar origen, hora, pausa operativa y conciliación. No modificar restoreTested manualmente. Mantener manifiesto y dump privados juntos; la herramienta no reemplaza programación de respaldos, retención ni cifrado externo.

## 4. Adopción histórica explícita

Aplicar primero sobre una copia restaurada, no sobre producción. Seleccionar --through como la última migración cuyo efecto ya está en la base. No seleccionar automáticamente la última del repositorio.

Crear una tercera base vacía, desechable, y configurar FERRE_REFERENCE_DATABASE_URL para ella. El comando construye ahí la cadena desde la inicial hasta --through, compara ambos esquemas con Prisma y compara por separado funciones, triggers, restricciones CHECK/FK/PK y políticas RLS. Si difieren, no marca ninguna migración en el destino.

Ejemplo de una base que ya contiene todos los cambios hasta operaciones del 4 de octubre:

```sh
npm run migrate:adopt -- --through 20261004000000_operacion_ferreteria --backup-manifest /ruta/privada/respaldos/CARPETA/manifest.json
npm run migrate:inspect
```

Para una base anterior, elegir su etapa real. La herramienta exige respaldo con checksum coincidente y restauración probada; únicamente registra con migrate resolve las migraciones del prefijo que faltan en el historial. No vuelve a ejecutar su SQL sobre datos existentes. Si ya había historial de las cuatro migraciones, conserva sus checksums y registra solo la inicial.

Si la adopción se interrumpe después de registrar parte del prefijo, el historial puede necesitar revisión: inspeccionar y retomar con otra referencia vacía; no forzar deploy. La referencia queda poblada para inspección; el comando no elimina bases. Una comparación bloqueada requiere revisión de diferencias y ensayo dirigido, no ignorarlas. Extensiones, cambios propios del proveedor o SQL fuera de la cadena pueden exigir un plan específico.

## 5. Actualización y salida del mantenimiento

Después del ensayo sobre copia y la conciliación, repetir el procedimiento aplicable en el destino real, con respaldo actualizado y sin operaciones concurrentes. Después de la adopción:

```sh
npm run migrate:deploy
npm run build
npm run start:prod
```

Verificar pending vacío, API iniciada, permisos, apertura de caja, compra/recepción, contado/crédito, entrega, abono, devolución y cierre. Desplegar frontend compatible con backend. Conservar el respaldo previo; no asumir que volver a una versión antigua de código revierte una migración. Si hay una falla, no resetear: diagnosticar y decidir corrección o recuperación desde respaldo según el estado observado.

## Pruebas y pendientes reales

Pruebas PostgreSQL aisladas cubren instalación completa, segunda ejecución, cliente previo conservado y numerado, adopción de SQL sin historial, historial con baseline faltante, rechazo de drift, trigger ausente, checksum distinto, migración incompleta, huecos y restauración a destino ocupado.

No se consultó ni modificó producción: el entorno sigue sin credenciales productivas configuradas. La arquitectura local/nube, el equipo, las UPS, el alta productiva inicial y la aceptación del cajero siguen pendientes. Estas herramientas preparan ambos alojamientos; no cambian tenant ni introducen sucursales o sincronización.
