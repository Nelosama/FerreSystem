# Inicio por tareas y buscador de navegación

Implementado en `codex/recuperacion-ventas`, dentro del PR #59.

- Buscador en todas las pantallas autenticadas, con navegación lateral, superior y móvil. Encuentra pantallas por palabras de trabajo cotidiano: comprar, personal, cobrar, caja, crédito o cotizar; admite mayúsculas, acentos y varias palabras.
- Inicio del administrador con compras, productos, usuarios, reportes, cuentas, caja, devoluciones y auditoría. Inicio de caja con apertura, venta, cotización, clientes, abonos y entregas. Bodega tiene sus propios accesos.
- Descripciones breves explican para qué sirve cada acceso. Caja muestra el orden recomendado: abrir, vender, contar y cerrar.
- Los accesos respetan el rol y los módulos habilitados. Menús y buscador comparten la comprobación de acceso. El administrador vuelve a ver reportes aunque no reciba una lista explícita de permisos, como ya permiten las rutas protegidas.
- Las pantallas todavía pendientes no aparecen como tareas disponibles en el buscador ni como accesos del inicio.
- Se corrigieron dos rutas que estaban fuera de `Routes` y podían impedir el arranque de la aplicación.
- El resumen informa si está cargando o falló, permite reintentar y mantiene disponibles las tareas. Se retiraron del inicio los enlaces que no respetaban el rol, el porcentaje de crecimiento ficticio y la tendencia semanal de ejemplo. La cabecera ya no inventa un horario de turno.

## Alcance y próximos pasos

Este buscador encuentra **pantallas y tareas**, no registros de todas las tablas. Los productos y clientes se buscan dentro de sus módulos. No ejecuta operaciones ni concede autorizaciones.

Sigue pendiente validar estos recorridos con el cajero y el administrador de la ferretería: abrir caja, completar una venta, recibir una compra, registrar un abono y revisar un reporte. Medir los pasos que les cuestan y simplificar esos formularios será la siguiente mejora de usabilidad. Las notificaciones y autorizaciones remotas requieren una implementación real aparte.

## Validación

Compilación de producción y 29 pruebas frontend aprobadas. Las seis pruebas nuevas cubren búsqueda, acentos, permisos, módulos deshabilitados, tareas pendientes, renderizado real de React con enlaces del router y ubicación de rutas. No se validó todavía con usuarios de la ferretería ni con una base productiva.
