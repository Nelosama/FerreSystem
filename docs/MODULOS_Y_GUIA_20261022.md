# Modo Guía y administración de módulos

Implementación sincronizada mediante merge normal con `main` `97609ed5` (#185 incluido), en `codex/guia-control-modulos`. La evidencia vigente de pruebas y publicación se registra en `CONTEXTO_MAESTRO.md`.

## Catálogo real y alcance

`backend/src/common/tenant-modules.ts` y `frontend/src/config/modulesCatalog.ts` conservan las 16 claves existentes. Ninguna tiene excepción CORE. Los registros ausentes conservan la disponibilidad heredada; un registro explícitamente desactivado es autoritativo. La configuración no concede roles ni permisos.

| Clave | Función | Dependencias para habilitar |
| --- | --- | --- |
| `pos` | Ventas, entregas, devoluciones y contingencia | inventario, clientes, arqueo_caja |
| `cotizaciones` | Presupuestos | inventario, clientes |
| `pedidos_especiales` | Encargos (pendiente) | — |
| `apartados` | Reservas (pendiente) | — |
| `inventario` | Productos, precios y movimientos | — |
| `levantamiento` | Conteo físico | inventario |
| `ordenes_compra` | Proveedores y compras | inventario |
| `transferencias_sucursal` | Transferencias (pendiente) | — |
| `garantias` | Garantías por factura, consulta y registro PostgreSQL | — |
| `clientes` | Directorio y crédito de clientes | — |
| `listas_precio` | Segmentos (pendiente) | — |
| `usuarios` | Gestión de personal por ADMIN | — |
| `comisiones_venta` | Calculadora de comisiones | pos, usuarios |
| `arqueo_caja` | Caja, cierres, cuentas y pagos | — |
| `reportes` | Informes y KPIs | — |
| `configuracion` | Clave heredada de configuración/marca | — |

No se añade Contabilidad ni CONTADOR: siguen en el PR #180, fuera de esta base. Al integrar #180 se debe conservar su disponibilidad explícita opt-in y extender la guía para su rol; no tratar un registro ausente de Contabilidad como habilitado. Añadir `contabilidad` al catálogo como clave opcional (será la 17.ª), mantener su guard y permisos `contabilidad.*`, y autorizar CONTADOR únicamente en sus rutas y en el progreso propio de guía. Añadir pasos ES/EN de consulta y registro solo según sus permisos; extender la matriz tenant/rol y las pruebas de módulos antes de integrarlo. No ampliar las autorizaciones de ADMIN, Caja o POS por introducir CONTADOR.

Proveedores pertenece a compras; precios a inventario; entregas, devoluciones y contingencia a POS. Comisiones usa los endpoints compartidos de usuarios y ventas: no existe un servicio independiente de cálculo o liquidación en backend. Desactivar comisiones bloquea su ruta; los endpoints compartidos conservan sus propios módulos y permisos. No se implementan las cuatro funciones pendientes ni se conectan sus antiguas páginas de localStorage.

`configuracion` no convierte la autenticación, el perfil, la lectura de identidad del negocio ni el panel de plataforma en servicios opcionales. En esta base las escrituras de marca y configuración ya son exclusivas de Super Admin. Su estado es administrable, pero no elimina ese mecanismo de recuperación ni crea un panel de configuración para ADMIN. Los estados de las cuatro claves pendientes tampoco equivalen a disponibilidad funcional. Garantías sí cuenta con pantalla y API operativas; se corrige su clasificación heredada para que aparezca en navegación cuando esté habilitada y el rol lo permita.

## Persistencia, dependencias y seguridad

`PUT /admin/tenants/:id/modules` exige el token de plataforma y su guard existente. Valida lista, claves conocidas, booleanos y duplicados; obtiene el estado vigente dentro de una transacción con bloqueo por negocio, aplica el cambio parcial propuesto y rechaza dependencias inconsistentes antes de escribir. No desactiva dependientes silenciosamente: se seleccionan juntos, o se mantienen sus requisitos. El panel agrupa ventas, inventario/compras, administración y finanzas/reportes, muestra requisitos y pide confirmación ante desactivaciones.

La transacción actualiza `tenant_modules`, la revisión del negocio y el evento `ACTUALIZAR_SERVICIOS`, con instantáneas anterior/nueva e identidad real. La auditoría por negocio muestra fecha y nombre del actor de plataforma. Desactivar no elimina productos, ventas, cuentas, movimientos, usuarios ni sus permisos. Super Admin conserva `/admin/tenants/:id/usuarios` aun si el negocio no tiene Usuarios.

`TenantModuleGuard` consulta PostgreSQL por petición y deja de ignorar Clientes y Caja. Se completan los guards de clientes, caja/cuentas, conciliación y consultas de proveedores de producto. Las rutas frontend y navegación usan los mismos estados. Inicio filtra sus consultas por módulos y permisos; no ofrece una consulta alternativa de datos de funciones desactivadas. Los servicios compartidos conservan sus guards de rol, permisos y tenant. El control no convierte el catálogo administrativo de sucursales en un filtro operativo: la base todavía no asigna cada venta/producto a una sucursal.

Reportes sigue consultando sus ventas históricas cuando Inventario está apagado: omite la consulta de productos y la sección de existencias, sin abrir un acceso alternativo al catálogo deshabilitado.

La sesión consulta la configuración al recuperar el foco y cada 30 segundos mientras la pestaña está visible. La API bloquea nuevas peticiones inmediatamente según el estado confirmado en el servidor; una petición ya iniciada puede terminar. La sincronización offline conserva el diario local: conviene sincronizar ventas y terminar turnos antes de desactivar POS/Caja. No se cambia el protocolo de contingencia.

## Guía

La preferencia `configuracion.modoGuia` utiliza el JSON PostgreSQL ya existente y solo admite booleanos. Ausente o falso significa **desactivada** para negocios existentes y nuevos: no se introduce una invitación inesperada. Super Admin la cambia en Configurar negocio; ADMIN no puede escribirla, ni siquiera llamando directamente a la API.

`GET/PUT /auth/guia` usa exclusivamente la identidad validada. La guía de plataforma tiene progreso propio; cada usuario de negocio tiene el suyo en la cuenta asociada a ese negocio. No se acepta un tenant o usuario del cuerpo como destino. Las sesiones de soporte no participan. Desactivar la guía bloquea sus escrituras y retira tanto invitación como Ayuda.

La interfaz ofrece invitación discreta, Ayuda, reinicio, omisión, avance, retroceso, salida y finalización. Guarda estados `pending`, `active`, `dismissed`, `completed`, clave del paso, versión y fecha; las guías completadas no invitan de nuevo. Al salir se conserva el paso, que se puede retomar desde Ayuda. Si cambian permisos/módulos se recalculan los pasos y se usa un paso autorizado disponible.

CAJERO recibe cinco pasos: búsqueda/escáner, productos y cantidades, total, pago/confirmación y comprobante. ADMIN recibe hasta seis pasos agrupados: inicio, productos, contactos/compras, informes, caja y personal. VENDEDOR y BODEGUERO reciben tareas disponibles según su rol y permisos; con pocos módulos pueden quedar menos de tres pasos. Super Admin recibe cinco pasos sobre negocios, módulos, identidad, planes y estado. Las explicaciones de consulta no autorizan escrituras; las funciones inaccesibles se excluyen.

La guía ocupa espacio en el flujo normal de la página, sin superponerse a tablas ni controles operativos (regresión verificada en 1280, 768 y 390 px). Se navega únicamente a pantallas de consulta/autorizadas y se resalta un elemento visible; si falta o queda fuera del área móvil se resalta el contexto. No hay overlay modal ni clics automáticos. La guía solo escribe su progreso: no agrega artículos, cobra, aplica inventarios ni modifica operaciones. ES/EN y componentes existentes, sin dependencias nuevas.

## Esquema y operación — NEXUS

Migración aditiva `20261022000000_guia_progreso`: columnas JSONB `usuarios.guia_progreso` y `super_admins.guia_progreso`, no nulas con `{}` predeterminado. No cambia tablas operativas, claves foráneas ni datos históricos. `schema.prisma` representa las mismas columnas.

Aplicar mediante el procedimiento existente de migraciones, con respaldo verificado y antes de arrancar el backend nuevo; regenerar Prisma durante el build. Sin variables nuevas. El código anterior ignora las columnas; revertir código no exige borrarlas. La reversión manual está documentada como sentencias inactivas en `backend/prisma/rollback-manual/20261022000000_guia_progreso.sql` y perdería únicamente progreso de guías si se ejecutara expresamente.

Las pruebas crean PostgreSQL temporal local; no usan ni modifican bases compartidas o productivas. No se ejecuta merge ni despliegue. Firma: **NEXUS**.

## Coordinación de la sincronización (2026-10-22 UTC)

Merge normal de `main` `97609ed5` en `947067f3`: único conflicto en `docs/CONTEXTO_MAESTRO.md`, resuelto conservando #185 y #189. POS, inventario, ventas por cajero y autenticación de main se conservan; no se modifica POSPage.

Simulación sin escrituras en ramas ajenas contra #188 `67844c66`: conflictos en `docs/CONTEXTO_MAESTRO.md`, `frontend/src/pages/NegocioDetallePage.tsx` y `frontend/src/pages/POSPage.tsx` (este último corresponde a #185 frente a #188). Al integrarlo conservar ModuleControls, la guía en el flujo de contenido, el vuelto y los cambios UX de Claude. También revisar los merges automáticos de TenantContext, Configuración, Inventario y locales; no basta con eliminar marcadores. #180 `b9edf6c0` sigue fuera: requiere conciliar schema, inventario SQL de migraciones, catálogo/guard, rutas, SuperAdminPage, locales y exclusiones de previews. No se modifica ninguna de esas ramas.

La evidencia y el dictamen definitivos se publican en [PR #189](https://github.com/Nelosama/FerreSystem/pull/189), vinculados al SHA comprobado. Una prueba fallida o interrumpida no cuenta como aprobada.
