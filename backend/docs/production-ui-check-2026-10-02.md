# Prueba web de producción — 2 de octubre de 2026

Sitio: https://ferre-system.vercel.app/

Alcance: cuenta autorizada con rol ADMIN de empresa. Pruebas de lectura mediante el navegador integrado, a 390 × 844 y 1440 × 900. No equivalen a una prueba física en Safari de iPhone o Chrome de Android. No se guardaron clientes, cotizaciones, usuarios, productos ni ventas.

## Resultados observados

| Prueba | Resultado |
|---|---|
| Inicio de sesión | Carga el resumen operativo de la empresa. |
| Recarga en Usuarios | Conserva la sesión y vuelve a mostrar la cuenta ADMIN. No se probó la renovación tras expirar el token. |
| POS | Abre sin mensaje de error de conexión. Catálogo vacío; botón de venta deshabilitado con carrito vacío. No se verificó una venta ni la existencia esperada de productos. |
| Inventario | Abre sin error visible y muestra lista vacía. |
| Usuarios | Muestra el administrador de la empresa. No se alteraron cuentas ni permisos. |
| Clientes | Falla la consulta con HTTP 500 tanto en móvil como en escritorio. La consola registra `Error al obtener clientes: AxiosError: Request failed with status code 500`. |
| Nuevo cliente | El formulario abre y puede cancelarse sin guardar. Su botón de entrada muestra la clave de traducción `CLIENTS.NEW_CLIENT`. |
| Cotizaciones | Lista vacía sin error visible; abre y cancela nueva cotización. |
| Selector de clientes en cotización | Muestra `No se pudieron consultar los clientes`. |
| POS móvil | Dos columnas; el carrito y su contenido quedan cortados por el borde derecho. |
| Formulario de cliente móvil | Abre, pero teléfono/correo y RTN/tipo siguen repartidos en dos columnas estrechas. |
| Formulario de cotización móvil | La barra inferior permanece delante de la parte baja del modal. Se necesita validar y corregir su superposición. |

## Límites y siguiente diagnóstico

Esta cuenta no permite validar el panel SUPERADMIN ni el flujo de soporte. No se realizaron altas, edición, eliminación, cobros, importaciones, cambios de sucursal ni ajustes de configuración.

La causa del HTTP 500 no está confirmada. La consulta de clientes selecciona `numero_cliente` a través de Prisma; una columna o migración ausente es una hipótesis consistente con este fallo. El caso de trigger ausente se reprodujo previamente solo en PostgreSQL local temporal y afecta las altas, pero por sí solo no demuestra la causa de este error de lectura.

Revisar los logs de Render correspondientes a la consulta de clientes y el comando de despliegue. Si se requiere inspección del esquema, `customer-number-diagnostic.sql` realiza únicamente consultas de lectura. No ejecutar cambios de esquema ni marcar migraciones como aplicadas sin verificar el estado real.

## Verificación posterior a la migración manual

Los logs compartidos por el usuario confirmaron Prisma P2022: no existía `clientes.numero_cliente`. El usuario ejecutó en Supabase SQL Editor el contenido de la migración de numeración y reportó Success.

Tras recargar la web de producción con la misma cuenta:

- Clientes deja de mostrar el error 500 y presenta el directorio vacío.
- El selector de clientes de nueva cotización deja de mostrar error y responde que no encontró clientes, permitiendo ingreso manual.
- Se canceló el formulario sin guardar. No se verificó todavía la creación de un cliente en producción.

La migración manual debe reconciliarse con el historial de Prisma antes de automatizar `migrate deploy`. El funcionamiento de estas consultas no constituye verificación de ese historial.
