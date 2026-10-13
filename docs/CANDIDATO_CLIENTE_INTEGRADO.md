# Candidato integrado para operar con el cliente

**2026-10-12, America/Tegucigalpa.** [PR #158 en borrador](https://github.com/Nelosama/FerreSystem/pull/158). Rama `nexus/candidato-cliente-integrado`. Código integrado y verificado: **`89a70ccf`**. Incorpora por ascendencia #153 `95144a17`, #155 `85e4ff88`, #156 `406c57e2` y #157 `21b1eea5`. Se conservaron esas ramas y `main`; la limpieza de ramas no forma parte de este trabajo. Sin merge en GitHub ni escrituras, migraciones o despliegue en producción.

## Lo que funciona

- Inventario CSV de **seis columnas**: `nombre,codigo,categoria,stockActual,stockMinimo,unidadMedida`. Plantillas importables y descarga del sistema alineadas; sin filas ficticias en la descarga.
- Las **doce unidades** del inventario, incluidos `galon`/`galón`, sin conversiones de cantidades.
- Un solo validador: el de `backend/scripts/validar-inventario.py`. La entrada documental de #156 lo reutiliza con perfil `preproduccion` y modo estricto por defecto. Bloquea stock inicial inesperado, campos vacíos, códigos repetidos, precios que se ignorarían y unidades desconocidas. Para cargar un conteo directo se necesita `--permitir-existencias-iniciales "ADMIN: responsable, corte y motivo"`; no aplicar otra vez un levantamiento al mismo conteo.
- **Precios iniciales, alternativa mínima:** importar los seis campos; ADMIN usa la pantalla existente «Precios y aprobación», contrasta su hoja, captura costo y venta positivos y pulsa «Aprobar para venta». Si el vigente está nulo/cero y no hubo recepción, la misma transacción inicializa el costo con el núcleo seguro de #157 y registra `COSTO_INICIALIZAR` + `PRECIO_APROBAR`. Incluso si el costo comercial ya era igual al revisado, el vigente queda completo. No cambia stock, reservas, CxP ni fecha de compra. Si falla cualquier escritura, ambas operaciones se revierten. La versión puede avanzar dos pasos (uno por inicialización y uno por aprobación); el cliente usa la versión devuelta.
- Se conserva la API idempotente de inicialización explícita, solo ADMIN. No se añade pantalla, módulo ni importador de precios masivo. La preparación por producto se hace antes de abrir caja; la hoja de precios no se importa. Un costo inicial cero no se aprueba mediante esta vía.
- Abrir caja, vender/cobrar con efectivo, tarjeta o transferencia, entregar y cerrar. El cajero cobra y deja pendiente en bodega; ADMIN/BODEGUERO registra la entrega. ADMIN puede cobrar y entregar en mostrador. Referencias bancarias y separación de funciones conservadas.
- Protecciones Vercel `nexus/*` y `fix/inventario-inicial-seguro` conservadas; ambas tienen `deploymentEnabled=false` y el `ignoreCommand` combinado. Publicar esta rama no habilita su preview. El arranque de #155 sigue verificando sin migrar.

## Comprobaciones sobre este candidato

PostgreSQL **17.11 real**, bases locales exclusivas, puertos loopback; backend NestJS compilado y Chromium `/usr/bin/chromium`. Nada del cliente en las pruebas.

| Comprobación | Resultado de esta sesión |
|---|---|
| Selección de 12 archivos PostgreSQL: inicialización, aprobación, compras/recepción, contado, proveedores, inventario, levantamientos, venta/cobro/entrega, seguridad de entregas y control de arranque | **245 aprobadas, 1 omitida, 0 fallos** |
| Navegador + backend + PostgreSQL reales: piloto completo y pantalla de aprobación, sin mocks | **12/12** |
| Backend unitarias / frontend unitarias / scripts | **377/377 · 272/272 · 42/42** |
| Python / entrada documental / protección Vercel | **10/10 · 3/3 · 5/5** |
| Backend/frontend compilación | Correctas |
| Control de migraciones contra #155 | Correcto; **0 migraciones nuevas** |
| Ensayo de liberación desde esquema de main con ventas históricas | **24/24**, incluye respaldo, restauración, actualización, reinicio y reversión |

La prueba PostgreSQL omitida es una prueba de Chromium condicionada por `REAL_SETTINGS_BROWSER`; el recorrido del piloto y precios sí se ejecutó con Chromium real en la selección E2E indicada. No se realizaron nuevas auditorías generales ni una certificación de equipos físicos.

El E2E registra un producto con los seis campos importables, sin precios; confirma que está pendiente, fija costo/precio por la pantalla real, comprueba costo vigente/auditoría/stock y continúa con abrir caja, ventas en tres métodos, idempotencia, referencias bancarias, entrega, historial, cierre y aislamiento de empresa.

El ensayo comprueba 13 → 24 migraciones **en bases simuladas**, conserva las dos ventas previas, verifica las entregas históricas, prueba humo 20/20, reinicio 9/9 y restaura la copia anterior con los mismos conteos. Respaldo y registros de prueba conservados en `/tmp/ferre-ensayo-bZ80mN`; no es un respaldo de producción.

Incidentes de ensayo corregidos: #155 usaba una ruta absoluta a bcrypt de otro equipo; se cambió a la dependencia local y se aborta si falla el hash. El runner E2E ahora admite el usuario actual sin root, conservando `nobody` cuando se ejecuta como root. Un primer intento de scripts coincidió con otra compilación que limpiaba `dist`; se repitió después de terminar la compilación: 42/42. Ninguno de esos intentos fallidos se cuenta como aprobado.

## Lo que falta para desplegar

1. **Acceso operativo seguro al entorno real.** `environment_status` de esta sesión informa cero secretos, variables y credenciales de servicio. La red está restringida y no habilita Render, Supabase o Vercel; no se intentó sortearla. Habilitar el acceso del ejecutor o designar al responsable con acceso para ejecutar el runbook. No enviar contraseñas por chat ni guardarlas en Git.
2. Antes de cualquier merge que pudiera activar despliegues automáticos: verificar Render (`Pre-Deploy` vacío, arranque `npm run start:prod`, sin `FERRE_MIGRAR_AL_ARRANCAR`), configuración/clave de contingencia dedicada requerida para arrancar, `NODE_ENV=production`, URL del frontend y de API. El piloto se libera con contingencia **apagada**.
3. Ejecutar la comprobación de solo lectura de #155 sobre la base real. Determinar exactamente qué migraciones faltan y si existe divergencia de checksum de `20261011150000`. No adoptar ni corregir un historial automáticamente. No se conoce el número de pendientes reales: **11** es el resultado del ensayo desde `main`.
4. Preservar el respaldo existente y crear otro respaldo nuevo en un directorio privado vacío; verificarlo restaurando **en una copia aislada** y ensayar allí las migraciones. No sobrescribir ni eliminar copias anteriores. No migrar si hay diferencias o restauración fallida.
5. **Autorización del dueño para fusionar el PR del candidato a `main` y aplicar únicamente sus migraciones pendientes verificadas.** La puesta en producción ya está solicitada; merge y migraciones siguen excluidos sin esa autorización. Coordinar el orden en la ventana de mantenimiento para que ningún despliegue automático empiece antes de completar las precondiciones.
6. Después de autorización y precondiciones: aplicar las pendientes con `npm run migrate:deploy`, desplegar backend/frontend del SHA integrado, verificar arranque/health y humo de **solo lectura** en producción. La carga real y capacitación siguen el procedimiento de operación y no se sustituyen por fixtures de pruebas. Conservar la copia anterior para una restauración autorizada si fuera necesaria.

Procedimiento técnico ya existente: [RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md](RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md), scripts de respaldo/verificación y `estado-base-solo-lectura.sql`. No se solicita una nueva auditoría general: se requieren las comprobaciones previas a una escritura sobre datos reales.

## Migraciones incluidas, ya existentes en #153/#155

No se creó ni modificó ninguna migración. Desde main en el ensayo estaban pendientes:

- `20261010140000_productos_proveedores`
- `20261011000000_pos_contingencia_offline`
- `20261011150000_precio_aprobacion_producto`
- `20261012000000_autenticacion_sesiones_intentos`
- `20261012000000_conciliacion_pagos_bancarios`
- `20261012000000_entrega_eventos_y_cantidades`
- `20261013000000_balance_referencia_pagos`
- `20261014000000_cliente_plazo_credito`
- `20261015000000_contingencia_revocar_ventanas_anteriores`
- `20261016000000_contingencia_estado_rechazada`
- `20261017000000_contingencia_rechazos_importe_incoherente`

**NEXUS — evidencia local de integridad del candidato.** No sustituye evidencia de respaldo o estado de producción ni atribuye aprobaciones humanas pendientes. No se tocó la limpieza de ramas ni el respaldo real.
