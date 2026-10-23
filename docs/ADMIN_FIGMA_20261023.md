# Panel ADMIN del prototipo Figma — integración (2026-10-23)

Rama `codex/figma-admin-integration` (base `main` `24ae784`). Sin cambios de backend, Prisma, migraciones, cálculos monetarios, ISV, descuentos, crédito, JWT/CSRF ni sesiones. Sin dependencias nuevas ni Tailwind.

## Qué cambia (solo ADMIN, modo SIDEBAR, sin soporte/impersonación)
- **Rail de 84 px** (`IconRail`, compartido con Cajero; `AdminRail`): Inicio, Ventas, Inventario, Compras, Clientes y Más. Los grupos son solo agrupación visual; cada panel lista únicamente lo que `availableTasks` ofrece (rol + permiso + módulo habilitado). Estado activo con el color del negocio (`--color-primary`), logotipo real, teclado (Escape cierra y devuelve el foco).
- **Barra superior** (`AdminTopbar`): negocio, sucursal, estado de caja, notificaciones, usuario/rol y salir; solo datos reales.
- **Inicio** (`AdminHomePage`): 4 indicadores (ventas del día, cuentas por cobrar, facturas de proveedores, stock bajo), hasta 4 acciones frecuentes por permiso, «Necesita tu atención», últimas ventas, tendencia y alertas, con estados de carga/vacío/error.
- **Móvil administrador**: no ofrece POS, apartados, pedidos especiales, devoluciones, cierres de caja ni cuentas (`utils/movilAdmin.ts`). Es presentación; la autorización de rutas sigue siendo rol/permiso/módulo (`ProtectedRoute` + backend).
- `TOPNAV` conserva su layout; el Super Admin y el Cajero conservan sus shells. La guía existente se reutiliza.

## Fuentes de datos
| Indicador | Origen |
|---|---|
| Ventas del día | `GET /dashboard` |
| Stock bajo / atención | `GET /dashboard`, `GET /dashboard/pendientes` |
| Cuentas por cobrar / facturas de proveedores | `GET /operaciones/cuentas?tipo=CXC|CXP` (se calcula en cliente sobre saldos abiertos) |
| Cotizaciones | `GET /dashboard` |

## Pruebas (ver PR para resultados)
`frontend/e2e/admin-shell-simulado.spec.ts` (nuevo) + especificaciones actualizadas a la navegación nueva; `test/*.test.mjs`; piloto `e2e-real`.

## Diferencias con Figma
Se usa el color configurado por el negocio y no el teal fijo; fondo de página según tokens existentes; saludo con nombre completo; sin menú de perfil desplegable (chip de usuario + salir); campana sin contador inventado; acciones abren el módulo (sin formularios profundos).

## Riesgos / pendientes
- `/operaciones/cuentas` devuelve todas las cuentas (incl. pagadas) y hace consultas N+1: conviene un endpoint agregado.
- El selector de sucursal es informativo (el esquema no segmenta datos por sucursal).
- Impersonación de soporte y TOPNAV mantienen el layout anterior.
- Indicadores de cuentas se ocultan si el módulo `arqueo_caja` está deshabilitado.
- Prueba `contingencia-real` n.º 14 (service worker) fue intermitente bajo carga en la suite completa; pasa aislada.

Evidencia: `docs/evidencias/admin-figma/` (Figma vs implementación, escritorio y móvil).
