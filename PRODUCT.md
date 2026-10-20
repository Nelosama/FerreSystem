# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Leyenda de estado: **[Implementado]** verificado en código de `main`; **[Parcial]** existe una parte; **[En desarrollo]** existe solo en otra rama; **[Planificado]** decisión sin implementación; **[Pendiente]** requisito sin resolver.

## Identity

- Nombre comercial: **Jowa System**. Repositorio: FerreSystem. **[Implementado]** (aparece en la interfaz).
- SaaS multi-tenant adaptable a distintos rubros. **[Implementado]** a nivel de datos y configuración (`rubro` por negocio). Ferreterías son la implementación inicial.

## Stack and architecture

- Frontend: React 19 + TypeScript + Vite, aplicación web/PWA (`frontend/public/manifest.webmanifest`, `sw.js`). **[Implementado]**
- Backend: NestJS + Prisma + PostgreSQL. **[Implementado]**
- Hosting: backend en Render, frontend en Vercel, base de datos y Storage de logotipos en Supabase. **[Implementado]** según `docs/CONTEXTO_MAESTRO.md`.
- "Totalmente en la nube": **[Pendiente]** de confirmación. Existe también un despliegue local (`deploy/local`: Caddy + Compose) que contradice la decisión.

## Users and roles

- **Super Admin**: administra negocios, configuración del negocio y auditoría. **[Implementado]** (tabla propia `superAdmin`, panel `/admin/negocios/:tenantId/...`).
- **Administrador**: configuración operativa, precios, usuarios, revisión de contingencia. **[Implementado]** (`ADMIN`).
- **Contador**: contabilidad y control tributario hondureño con permisos propios. **[En desarrollo]**: rama `origin/feat/contabilidad-honduras` (commit `0b4ceae0`), no integrada en `main`. El enum `Rol` de `main` no tiene `CONTADOR`.
- **Cajero**: caja y cobro en mostrador. **[Implementado]** (`CAJERO`).
- **Vendedor**: ventas y cotizaciones. **[Implementado]** (`VENDEDOR`).
- **Bodeguero**: inventario y entregas. **[Implementado]** (`BODEGUERO`).

## Mobile experience

Una sola aplicación integrada, sin app nativa por ahora.

- Navegación adaptada a móvil. **[Implementado]** (`App.tsx`, `isMobile`).
- Dashboard, administración, supervisión, reportes e inventario en móvil. **[Parcial]**: `mobile/README.md` confirma solo la revisión de solicitudes de devolución por ADMIN.
- Escaneo de códigos con cámara. **[Implementado]** (levantamiento). Validación en iPhone/Safari **[Pendiente]**.
- Notificaciones push con la app cerrada. **[Planificado]** (`mobile/README.md`, `docs/APP_MOVIL_Y_NOTIFICACIONES.md`).
- Fotografías opcionales con almacenamiento en la nube. **[Planificado]**: hoy `imagenUrl` solo acepta URL `https` externa. Los logotipos sí usan Supabase Storage privado.
- Sin POS móvil ni operaciones de caja, cobros o facturación. **[Pendiente]**: la ruta `/pos` no se oculta en móvil; depende solo de rol y módulo. Requiere cambio fuera de este alcance.

## Accounting (Honduras)

- Módulo contable con control tributario hondureño y permisos del contador. **[En desarrollo]** (rama `feat/contabilidad-honduras`).
- Exportaciones Excel `.xlsx` en lugar de CSV. **[Pendiente]**: `main` exporta `.xls` en formato XML de Excel 2003 (`frontend/src/utils/excelExport.ts`) y CSV (`csvExport.ts`). La rama de contabilidad declara Excel como formato principal, pero aún no hay `.xlsx`.

## Design

- Una sola identidad visual profesional. **[Implementado]** (tokens en `frontend/src/index.css`; plantillas retiradas en PR #177).
- Fondo gris claro `#F4F5F7`, superficies blancas `#FFFFFF`, bordes suaves `#E4E7EB`. **[Implementado]**
- Color de marca y logotipo configurables por negocio. **[Implementado]**
- Navegación SIDEBAR o TOPNAV configurable por negocio. **[Implementado]**
- Español e inglés (`es.json`, `en.json`). **[Implementado]**
- Interfaz extremadamente sencilla: criterio de diseño, sin medición. **[Pendiente]** de evaluación.
- Configuración del negocio y auditoría solo para Super Admin. **[Implementado]**

## Operating context

- Uso en navegador, instalable como PWA, en computadora de mostrador, tableta y teléfono.
- Impresoras térmicas y A4 configuradas por el negocio; el formato lo define el negocio.
- Operación con conexión inestable: ventas sin conexión en contingencia y sincronización posterior.

## Constraints and open decisions

- Validación física pendiente: Safari/iPhone/PWA instalada, cámaras reales e impresoras A4/80/58 mm.
- Sucursal: **no se puede filtrar** (el esquema no tiene sucursal en ventas, productos ni operaciones). Decisión pendiente del dueño.
- Posicionamiento frente a otros sistemas: **no definido**.

## Evidence on hand

- `docs/CONTEXTO_MAESTRO.md`: estado, pruebas y pendientes.
- `mobile/README.md` y `docs/APP_MOVIL_Y_NOTIFICACIONES.md`: alcance móvil.
- Ausente: fotografías o materiales de marca verificados en el repositorio. No inventar testimonios, clientes ni cifras.

## Product principles

- Una sola identidad visual; solo el color y el logotipo cambian por negocio.
- Lo pendiente de hoy se muestra primero, con cifras confirmadas por el servidor.
- La contingencia sin conexión no oculta operaciones que requieren revisión.
- La vista móvil es consulta y supervisión; la venta y la caja no se ofrecen en móvil (pendiente de implementar).
- Interfaz sencilla, con texto claro en español y traducción completa al inglés.
