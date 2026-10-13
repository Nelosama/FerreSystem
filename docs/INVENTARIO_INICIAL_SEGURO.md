# Inventario inicial seguro y compatibilidad del piloto

Fecha: **2026-10-12, America/Tegucigalpa**. Implementación independiente desde `main` `7ccfad25`, rama `fix/inventario-inicial-seguro`, código `8b47eb80`. [PR #157](https://github.com/Nelosama/FerreSystem/pull/157) en borrador. Sin merge, despliegue, importación de datos reales ni migraciones productivas. No añade ni cambia esquema o migraciones. `frontend/vercel.json` excluye solo la rama nueva de los despliegues Git automáticos (incluido `ignoreCommand`), para publicar el borrador sin preview de Vercel.

## Revisión de las bases

| Referencia revisada | SHA | Conclusión |
|---|---|---|
| PR #156, documentación independiente | `59de0589685d338cfdc40d18da5868b7b7bc745f` | Describe `main`, pero sus instrucciones no se pueden trasladar completas al candidato. Su rama se conserva sin modificaciones. |
| PR #153, candidato congelado | `95144a17b7eb31262b8961f380f9cb1d8a2066b3` | El alta ya escribe `costoVigente`; ADMIN puede cambiarlo en Precios y aprobación antes de la primera recepción. |
| PR #155, candidato de preproducción | `85e4ff88b4da8c1fda1c8a0e74e6fcd075de5fc3` | Contiene #153. `backend/src` y `frontend/src` son idénticos a #153. Su arranque verifica migraciones y no las aplica por defecto. |
| Integración local aislada | `ebc9fdeb` | #155 + `8b47eb80`, con la resolución de plantilla descrita más abajo. No publicada ni aplicada sobre las ramas congeladas. |

**Cambio externo durante la sesión:** al verificar las referencias antes de publicar, #156 avanzó de `59de0589` a `406c57e299f57061992617e88f542e8694186ec9` (sin escrituras nuestras a su rama). El diff documental añade materiales y un CSV v2 de seis columnas; su validador elimina las columnas de precio, pero conserva cinco unidades y el aviso informativo de stock. La revisión solicitada y las discrepancias históricas siguientes se refieren a `59de0589`; la v2 resuelve la plantilla de precios, pero no aporta el modo estricto ni la inicialización implementados aquí. No se certifican íntegramente los manuales nuevos. #153/#155 no cambiaron sus SHA.

### Discrepancias que afectan el primer día

1. **Costo inicial:** #156 acierta para `main`, donde solo la recepción escribe `costoVigente`. En el candidato el alta ya lo rellena, incluso con cero cuando se importa sin precios. La ruta de precios lo actualiza solo si cambia `precioCosto`; no repara un costo vigente ausente cuando el costo comercial enviado es igual al actual. Los productos legados o creados por levantamiento requieren una vía explícita de inicialización.
2. **Precios del CSV:** #156 trae ocho columnas, con `precioCosto` y `precioVenta`. El importador de #153/#155 ignora esas dos columnas; crea productos pendientes de precio/aprobación. Validar el CSV no significa haber cargado esos precios.
3. **Plantilla descargable del candidato:** seis encabezados y ocho campos por fila de ejemplo. Se elimina toda fila de ejemplo; queda una plantilla vacía con los encabezados que corresponden a cada base.
4. **Unidades:** el rubro ferretería limitaba el CSV a cinco etiquetas, mientras API y levantamientos admiten doce valores. El importador y el validador ahora admiten `UNIDAD`, `PIE`, `METRO`, `METRO_CUADRADO`, `METRO_CUBICO`, `LIBRA`, `KG`, `GALON`, `LITRO`, `CAJA`, `PAQUETE`, `OTRO`. Se conservan los aliases previos (incluido `galón` → `GALON`). **No hay conversión de cantidades**. Usar preferentemente los valores canónicos; los aliases de saco/quintal/etc. siguen siendo `OTRO`, no una conversión de peso.
5. **CxP:** la orden de compra crea la cuenta por pagar; la recepción aumenta existencias y registra el historial de costo. La referencia de #156 a una CxP creada por recepción es imprecisa. Ninguna de las dos operaciones sirve como atajo para inicializar costos.

Fuentes: `backend/src/productos/productos.service.ts`, `backend/src/operaciones/operaciones.service.ts`, `backend/src/levantamientos/levantamientos.service.ts`, `frontend/src/components/ImportarProductosModal.tsx`, `frontend/src/config/rubros.ts`, `frontend/src/utils/unidadMedida.ts` y el esquema Prisma de cada SHA.

## Contrato de inicialización

`POST /api/productos/:id/costo-inicial`, sesión de empresa con JWT de **ADMIN**, módulo inventario. Cuerpo:

```json
{
  "solicitudId": "ea0f3c6e-2b2c-4459-a4db-ef5693f85423",
  "version": 1,
  "costo": 8.25,
  "motivo": "Costo de apertura contrastado con el registro maestro y revisado por administración"
}
```

El UUID mostrado es ilustrativo: generar uno nuevo por producto/operación y conservarlo con el cuerpo original para reintentos.

- Exige costo **positivo**, máximo dos decimales, versión vigente, motivo no vacío y producto activo de la empresa. No acepta inicializaciones de costo cero.
- Solo completa `costoVigente` nulo o cero. Rechaza cualquier costo vigente positivo; no es una edición general de costos.
- Rechaza productos con `ultimaCompraAt` o historial en `costos_compra`, incluso si la fecha está ausente y el costo quedó en cero.
- Actualiza **`costoVigente` y `precioCosto`** al mismo valor, incrementa `version` y actualiza la fecha técnica de edición. Es necesario revisar el costo propuesto contra el maestro: puede reemplazar un costo comercial anterior cuando el vigente está vacío.
- Conserva existencias físicas, reservas, mínimos, unidad, precio de venta, aprobación del precio y fecha de compra. No crea movimientos, compras, recepciones, historial de compra, CxP, ventas ni movimientos de caja.
- ADMIN se verifica en el guard HTTP **y otra vez dentro de la transacción**, leyendo el usuario activo. Un BODEGUERO con permisos de inventario no puede ejecutarla. No hay acceso especial para SUPERADMIN.
- Lock de empresa compartido con las operaciones existentes y lock de fila de producto: una recepción concurrente no puede perder su costo. Auditoría `COSTO_INICIALIZAR` en la misma transacción, con usuario, empresa, fecha, motivo, solicitud, hash, costo/versión anterior y resultado. Un fallo de auditoría revierte todo.
- Repetir la misma solicitud/cuerpo/ADMIN devuelve el **resultado original**, sin volver a escribir, incluso tras una recepción posterior. La respuesta de un reintento es un comprobante histórico, no el estado actual: consultar el producto para conocerlo. Reutilizar el UUID con otro contenido, producto o usuario devuelve 409.
- Después de una recepción, el costo vuelve a depender de la compra real. Antes de recibir, una corrección de un costo ya positivo se revisa con ADMIN mediante la ruta de precios existente del candidato; este endpoint no permite sobrescribirlo.

Implementación: `backend/src/productos/costo-inicial.{controller,service}.ts`, DTO dedicado y registro en `ProductosModule`. No se modifica el servicio de precios existente ni los módulos de compra, recepción, venta, cobro, entrega o contingencia.

## Control estricto y carga del primer día

La herramienta ejecutable está en **`backend/scripts/validar-inventario.py`**, derivada del validador de #156. El validador documental original permanece en #156 como fotografía de esa base; no usarlo para certificar el candidato. Python estándar, solo lectura y sin conexión al sistema.

1. Conciliar el maestro real, unidades, costos y precios con ADMIN; guardar el corte de conteo y un catálogo que incluya códigos activos e inactivos. Para comprobar precios, preparar una hoja CSV de revisión de ocho columnas: `nombre,codigo,categoria,precioCosto,precioVenta,stockActual,stockMinimo,unidadMedida`.
2. Validarla con:

   ```bash
   python3 backend/scripts/validar-inventario.py maestro-revision.csv --perfil maestro --estricto --catalogo catalogo.csv
   ```

   `stockActual` debe ser cero si se aplicará un levantamiento. Ambos precios deben ser positivos. Además bloquea vacíos, duplicados, códigos existentes en el catálogo, ejemplos ficticios, coma decimal, valores fuera de rango, unidades desconocidas y encabezados/columnas ambiguos.
3. **Para #153/#155**, preparar un CSV distinto de seis columnas:

   ```csv
   nombre,codigo,categoria,stockActual,stockMinimo,unidadMedida
   ```

   ```bash
   python3 backend/scripts/validar-inventario.py inventario.csv --perfil preproduccion --estricto --catalogo catalogo.csv
   ```

   Este perfil rechaza columnas `precioCosto`/`precioVenta`, porque se ignorarían. No se autoriza la venta con esta validación: los precios no viajan en este CSV. En `main` el importador sigue usando las ocho columnas y corresponde `--perfil maestro`.
4. Si el responsable decide una carga directa de existencias, sin levantamiento posterior, debe documentar el corte y usar `--permitir-existencias-iniciales "ADMIN: responsable, fecha y motivo"`. Para un precio cero intencional en la hoja de revisión se exige `--autorizar-precios-cero "ADMIN: responsable, fecha y motivo"`. Son excepciones **independientes**; admitir existencias no autoriza precios cero. No aceptar un motivo vacío. Conservar CSV, informe y autorización firmada.
5. Estas excepciones son declaraciones fuera de línea; el programa **no autentica** a ADMIN. No conceden permisos ni aprobación de ventas. El candidato no permite aprobar un precio de venta cero aunque la hoja tenga una excepción. El endpoint de costo inicial tampoco admite costo cero.
6. Solo después del control, importar en el entorno de preproducción autorizado, sin sobrescribir productos existentes. Aplicar una única vía para establecer cantidades: alta con existencias **o** levantamiento sobre stock inicial cero. La inicialización de costo no carga cantidades.
7. ADMIN compara cada producto con el maestro, consulta su id/versión y, si el vigente está nulo/cero y no hubo recepción, ejecuta la inicialización. Para un costo ya positivo no hacer otra inicialización. Conservar solicitudes y verificar auditoría/stock/CxP antes y después. Hay API, sin pantalla ni importador masivo de costos nuevo.
8. En el candidato, ADMIN fija y aprueba el precio de venta mediante **Precios y aprobación**; la inicialización del costo no lo aprueba. Probar con un producto del piloto la consulta, venta/cobro, entrega y cierre antes de operar con el cliente. Los datos reales no se cargaron en esta sesión.

Sin `--estricto`, la herramienta conserva advertencias informativas sobre ceros y existencias. Los procedimientos anteriores exigen el modo estricto. Códigos de salida: 0 válido con datos, 1 errores/sin datos, 2 lectura o argumentos inválidos. Revisar siempre las advertencias y la autorización de excepciones.

## Pruebas de esta sesión

PostgreSQL **17.11 real**, instalado sin privilegios en el directorio de trabajo; clúster exclusivo por suite, loopback, puertos efímeros, usuario local sin root. Nunca se usa una URL de base real. La suite nueva aplica la cadena completa de migraciones solo sobre su clúster temporal: 13 en la base independiente y 24 en la copia del candidato. Las compras en pruebas son fixtures aislados para comprobar la recepción posterior; no se usan para establecer el costo inicial de ningún inventario real.

| Base y comprobación | Resultado |
|---|---|
| Base independiente: costo inicial, compras, ciclo de ventas, edición de productos y levantamientos (5 archivos) | **140 aprobadas, 1 omitida, 0 fallos** |
| Suite nueva de costo inicial, incluida arriba y en la integración | **23/23** en ambas bases |
| #155 + implementación/resolución: costo inicial, compras, contado, cierre de compras, producto-proveedor, precios/aprobación, inventario-ciclo, ciclo de ventas, cobro-entrega, seguridad de entregas, levantamientos y control de arranque (12 archivos) | **243 aprobadas, 1 omitida, 0 fallos** |
| Backend independiente | Compilación correcta; **329/329** unitarias |
| Backend de integración | Compilación correcta; **377/377** unitarias; scripts **42/42** |
| Frontend de integración | **272/272** unitarias; TypeScript y build correctos con `VITE_API_URL=/api` |
| Frontend independiente | **190/190** unitarias; TypeScript y build correctos con `VITE_API_URL=/api` |
| Python, ambos perfiles y autorización de excepciones | **10/10**; incluye CLI/códigos de salida y rechazo de precios ignorados por el candidato |
| Control de migraciones contra #155 | Correcto: **0 migraciones nuevas**, 39 archivos ejecutables revisados |
| Diff de la integración sobre #155 | Sin cambios en `backend/prisma`, operaciones, ventas, entregas ni POS |

La prueba omitida es Chromium condicionado por `REAL_SETTINGS_BROWSER=1` en `ciclo-ventas`; no se ejecutó navegador ni se certifican dispositivos físicos. Las cinco pruebas nuevas del frontend ejecutan normalización y handlers reales del modal con hooks/transporte simulados: incluyen la importación de las doce unidades con un rubro que solo presenta cinco y la descarga sin ejemplos.

Incidentes de preparación resueltos: el cliente Prisma preinstalado estaba desactualizado y la primera compilación backend informó ausencia de `coberturaGarantia`; tras `prisma generate` desde el esquema correcto compila. El primer build frontend carecía de `VITE_API_URL`; se repitió con `/api`. Un fallo de mi harness de frontend al concatenar números se corrigió y las pruebas finales pasan. Estos intentos no se cuentan como resultados aprobados.

Reproducción de la selección PostgreSQL del candidato, en la copia aislada con Prisma generado y `PG_BIN`/`LD_LIBRARY_PATH` apuntando al PostgreSQL local:

```bash
npm run test:integration -- costo-inicial.postgres.integration.ts compras.postgres.integration.ts compras-contado.postgres.integration.ts compras-cierre.postgres.integration.ts productos-proveedores.postgres.integration.ts precios-aprobacion.postgres.integration.ts inventario-ciclo.postgres.integration.ts ciclo-ventas.postgres.integration.ts cobro-entrega.postgres.integration.ts centinela-entregas-148.postgres.integration.ts levantamientos.postgres.integration.ts migraciones-control-arranque.postgres.integration.ts
python3 scripts/validar-inventario.test.py
```

Los ensayos que usan contingencia requieren una clave efímera de prueba de al menos 32 caracteres, distinta del JWT; no reutilizar ninguna clave de entorno real.

## Integración propuesta, no ejecutada en las ramas congeladas

1. Mantener #156 como PR documental independiente. Revisar este PR desde `main`; no sustituir #153/#155 por la rama de implementación, pues esta no contiene el candidato completo.
2. Crear otra rama de integración desde el SHA revisado de #155. Incorporar los commits propios de este PR. No avanzar las referencias congeladas de #153/#155.
3. El cherry-pick de `8b47eb80` sobre #155 produce **un conflicto de código** en `handleDownloadTemplate` de `ImportarProductosModal.tsx`. Resolver conservando **los seis encabezados sin precios del candidato** y:

   ```ts
   const csvContent = headers.join(',') + '\n';
   ```

   Eliminar `cats`, `units`, `sampleRows` y demás variables exclusivas de ejemplos. Conservar también `unidadCsvValida` en la validación de unidades. No restaurar el envío de precios en el importador. Esta es la resolución aplicada y probada en `ebc9fdeb`. Los cambios posteriores de presentación/documentación se incorporaron también en la copia local (`f816443b`), conservando todos los bloques del contexto del candidato; Python 10/10 y modal 5/5 se repitieron allí.
4. El commit de protección de publicación añade una exclusión de Vercel solo para `fix/inventario-inicial-seguro`. Al combinar `frontend/vercel.json` con #155 conservar **ambas** entradas de `git.deploymentEnabled` (`nexus/*` y la rama nueva, ambas `false`) y combinar `ignoreCommand`:

   ```sh
   case "$VERCEL_GIT_COMMIT_REF" in nexus/*|fix/inventario-inicial-seguro) exit 0;; *) exit 1;; esac
   ```

   Esta configuración no habilita ni cambia despliegues de otras ramas. El contexto maestro también produce conflicto documental al incorporar los commits: conservar todos los bloques del candidato y añadir el nuevo bloque, actualizando solo la cabecera de última revisión.
5. Integrar la documentación #156 por separado cuando se autorice. El informe presente tiene precedencia para el procedimiento del candidato; reconciliar el bloque de estado de `CONTEXTO_MAESTRO.md` preservando la bitácora de las tres ramas. Mantener la separación entre maestro de ocho columnas y CSV importable de seis. No usar la frase histórica «solo recepción escribe costo vigente» como descripción del candidato integrado.
6. Regenerar Prisma, compilar y repetir la selección de pruebas anterior sobre el SHA final integrado; añadir la evidencia a su PR de integración. No extrapolar estos resultados a otro SHA ni a PostgreSQL de producción. El guard de #155 y su arranque sin migración deben permanecer intactos.
7. Las decisiones de merge, despliegue, migraciones existentes y carga real quedan para la ventana autorizada y el runbook de #155. Este PR no requiere una migración nueva ni autoriza las existentes.

## Riesgos y condiciones pendientes

- **NO-GO de producción permanece.** Revisiones pendientes de #153/#155, revisión CODEOWNERS de migraciones/arranque, inspección de las bases reales, claves por entorno y respaldo/restauración no se resuelven con estas pruebas.
- ADMIN debe verificar costo y unidad física antes de inicializar. Un monto equivocado modifica costo comercial y vigente; queda auditado. La herramienta offline no sustituye firma ni autenticación. Una unidad distinta no convierte las cantidades.
- La nueva API no es un reemplazo de la aprobación de precios. En el candidato, importar sin fijar/aprobar precios deja los productos fuera de venta.
- Inicialización por producto, sin nueva UI ni carga masiva automática. No se amplió el alcance a compras ficticias, conversiones de unidades, costos promedio, funcionalidades secundarias o edición posterior a recepción.
- Pruebas locales de servicios/HTTP/persistencia, no aceptación del cliente. Sin PostgreSQL 16 de producción, navegador con backend real, lector, impresora, iPhone/Safari ni datos reales en esta sesión. No se confirma CI remota con los resultados locales.

**NEXUS — evidencia local de integridad de esta sesión**, bajo la guía de la copia del candidato. No constituye la revisión independiente de NEXUS/CENTINELA/FARO que permanece pendiente en #153/#155.
