# Preparación para salida a producción — 2026-10-28

Estado observado sobre `origin/main` 53e2cc95 y PRs abiertos. Nada de esta revisión cambia `main`, Render, Vercel, la base de datos ni los backups. Decisión de salida: **NO-GO** hasta cerrar los bloqueos de la sección 2.

## 1. Estado observado

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| `main` | 53e2cc95 (merge #209) | `git fetch`, API de GitHub |
| PR #210 | Abierto, borrador. Checks `validate`, `test`, `guard-base-datos` y `Vercel Preview Comments`: **success** | API de GitHub, check-runs de `1848cfb9` |
| PR #211 | Abierto, borrador. Excepciones de precio en POS y cotizaciones. Checks `validate` y `test`: **en curso** | API de GitHub, check-runs de `6f902a69` |
| Vercel (frontend) | `https://ferre-system.vercel.app/` responde **200** | `curl` de solo lectura |
| Render (API) | `https://ferresystem.onrender.com/api` responde **404** (ruta raíz; no es un health check) | `curl` de solo lectura |
| Endpoint de salud de la API | **No verificado**: no hay ruta de salud documentada | Pendiente de confirmar con el dueño |
| Base de datos, migraciones, backups y recuperación | **No verificado** desde esta sesión (sin acceso a Render ni a la base) | Pendiente |

Los checks de `main` no se pudieron leer de forma completa en esta sesión. Antes de cualquier decisión, confirmar el estado de los workflows en la pestaña Actions del repositorio.

## 2. Bloqueos que requieren decisión humana o validación

1. **Excepciones de precio (PR #211).** El backend exige motivo de 10–300 caracteres, rol ADMIN y el permiso `pos.excepcion_precio`. Falta decidir quién otorga ese permiso y cómo se registra el motivo en auditoría. PR #211 no debe integrarse hasta esa decisión.
2. **Alcance fiscal de ISV y exenciones.** No hay regla confirmada para exenciones ni para productos con tratamiento distinto al 15 %. Requiere confirmación del contador del cliente. No modificar cálculos monetarios sin esa regla.
3. **Respaldos y recuperación.** No se ha verificado la frecuencia de respaldo, el lugar de almacenamiento ni una restauración de prueba. Un respaldo no probado no cuenta como recuperación.
4. **Configuración de producción.** Variables de entorno de Render y Vercel (orígenes permitidos, secretos, base de datos) no se revisaron desde aquí. Revisar sin copiar valores secretos.
5. **Módulos habilitables sin operaciones registradas.** Apartados, transferencias entre sucursales, pedidos especiales y listas de precio aparecen en el catálogo pero no registran operaciones. Decidir si se ocultan para la salida o se documentan como pendientes.
6. **Validación física.** Safari/iPhone, impresoras A4/80/58 mm y cámara real no están validadas. No se acreditan con emulación.
7. **Aceptación del cliente.** Pendiente; no se declara sin su confirmación.

## 3. Lo que se puede verificar antes de salir

- Checks completos de PR #210 y #211 sobre su SHA final, sin reutilizar resultados de SHA anteriores.
- Suite de frontend en Windows y en Linux (CI).
- Build de frontend con `VITE_API_URL` de producción (HTTPS, no localhost).
- Migraciones: confirmar que la salida no introduce migraciones nuevas sin plan de reversión.

## 4. Pasos de salida controlada (solo con autorización del dueño)

1. Resolver los bloqueos 1 y 2, o documentar que la salida excluye esos módulos.
2. Confirmar respaldo reciente y una restauración de prueba en entorno temporal.
3. Hacer merge a `main` de los PRs aprobados, uno por uno, esperando los checks de cada uno.
4. Vigilar el despliegue automático de Render y Vercel. Verificar `/api` y el frontend con un usuario de prueba, no con datos de clientes.
5. Prueba de humo: inicio de sesión, venta en efectivo a cuenta de prueba, cotización y consulta de inventario.
6. Plan de reversión: revertir el merge en `main` y redeploy del commit anterior. Si hay migración, no se revierte automáticamente: decidir antes.

## 5. Criterio GO / NO-GO

- **GO** solo si: los bloqueos 1 y 2 están resueltos o excluidos por decisión escrita; hay respaldo verificado; los checks del SHA final pasan; la prueba de humo pasa en producción.
- **NO-GO** si queda cualquier bloqueo crítico abierto, si falta el respaldo verificado, o si algún check falla.

Estado actual: **NO-GO**.
