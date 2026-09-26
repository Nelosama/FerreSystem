# NOCHE SPRINT LOG - FerreSystem

## FASE 0 — Auditoría Rápida (Inicial)
- **Estado Actual Contextos**: `MockDataContext.tsx` maneja el estado local persistido en `localStorage` (`ferre_mock_productos`, `ferre_mock_cotizaciones`, `ferre_mock_ventas`, `ferre_users`) con productos, cotizaciones y ventas de prueba. `TenantContext.tsx` administra la sesión actual del usuario, el tenant activo y la suplantación por SuperAdmin. `NotificationContext.tsx` gestiona solicitudes de descuento en tiempo real mediante `window` storage events.
- **Páginas & Enrutamiento**: `LoginPage.tsx` posee accesos rápidos por rol. Rutas protegidas controlan el acceso según rol (`ADMIN`, `CAJERO`, `BODEGUERO`, `VENDEDOR`, `SUPERADMIN`).
- **Estilos Visuales**: Variables CSS custom properties (`--color-primary`, `--color-sidebar-bg`, etc.) inyectadas dinámicamente según el tenant activo. Estilo industrial activo por defecto con bordes oscuros de 2px.

---

## FASE 1 — Motor Multi-Rubro
- **Completado**:
  - Creado enum `Rubro` en `src/types/index.ts` con los 10 giros comerciales solicitados (`FERRETERIA`, `PULPERIA`, `MINIMARKET`, `FARMACIA`, `PAPELERIA`, `DISTRIBUIDORA`, `AGROSERVICIO`, `REPUESTOS_AUTOMOTRICES`, `ELECTRODOMESTICOS`, `GENERAL`).
  - Creado `src/config/rubros.ts` con la interfaz `RubroConfig` y la matriz exacta de nombres de catálogo, categorías por defecto, unidades de medida y placeholders de stock bajo.
  - Creado hook `useRubroConfig()` para inyectar dinámicamente las reglas del rubro en los componentes de UI sin duplicar código.
  - Integrado el selector de rubro en `ConfiguracionPage.tsx` y `SuperAdminPage.tsx`.
  - Dinamizada la etiqueta de inventario en `Sidebar.tsx` según el rubro activo (`nombreCatalogo`).
  - Actualizado `InventarioPage.tsx` para sugerir categorías del rubro, filtrar unidades de medida y mostrar campos condicionales de vencimientos/lote y garantía/número de serie.
  - Dinamizadas las alertas de stock bajo en `DashboardPage.tsx` con `mensajeStockBajo`.

---

## FASE 2 — Catálogo Ampliado de Módulos & Control del Super Admin
- **Completado**:
  - Implementados los 8 nuevos módulos funcionales con persistencia en `localStorage`:
    1. **`apartados`** (`ApartadosPage.tsx`): Reservas con porcentaje de abono inicial, historial de abonos parciales y liberación de stock al cancelar.
    2. **`arqueo_caja`** (`ArqueoCajaPage.tsx`): Arqueo físico de caja por turno vs ventas en efectivo registradas, cálculo automático de faltantes/sobrantes e historial.
    3. **`ordenes_compra`** (`OrdenesCompraPage.tsx`): Gestión CRUD de proveedores, emisión de órdenes de compra y recepción total de stock.
    4. **`transferencias_sucursal`** (`TransferenciasPage.tsx`): Transferencias de inventario entre sedes con control de estado (En Tránsito -> Recibido).
    5. **`garantias`** (`GarantiasPage.tsx`): Consulta y registro de pólizas por número de serie (S/N) y cliente con control de vigencia.
    6. **`pedidos_especiales`** (`PedidosEspecialesPage.tsx`): Backorders para productos sin stock con opción de notificación directa al cliente.
    7. **`listas_precio`** (`ListasPrecioPage.tsx`): Segmentación de clientes (Consumidor Final, Mayorista, Contratista) with porcentaje de descuento automático.
    8. **`comisiones_venta`** (`ComisionesPage.tsx`): Cálculo de comisiones por vendedor en rangos de fechas según su % configurado.
  - Registradas todas las rutas en `App.tsx` con `ProtectedRoute`.
  - Agregado campo `modulosHabilitados` en `TenantInfo` y panel modal en `SuperAdminPage.tsx` para activar/desactivar módulos individualmente por cliente.
  - Actualizado `Sidebar.tsx` para ocultar o mostrar automáticamente los menús según los módulos permitidos para el tenant.

---

## FASE 3 — Mejoras de UI y Separación Portal Super Admin
- **Completado**:
  - **Separación de Login Super Admin**: Creada la página `SuperAdminLoginPage.tsx` y la ruta `/admin/login`. Removidos completamente del login de clientes (`LoginPage.tsx`) los accesos directos o referencias de SuperAdmin.
  - **Selector de 3 Estilos de Interfaz**:
    1. **INDUSTRIAL**: Sidebar charcoal (`#1C1917`), bordes duros de 2px, esquinas rectas (2px).
    2. **MINIMALISTA**: Sidebar claro (`#F5F5F4`), bordes finos de 1px, esquinas medias (10px).
    3. **MODERNO**: Sidebar con fondo del color primario del tenant, bordes suaves y esquinas redondeadas (12px).
  - **Tipografías**: Selectores de fuentes de títulos (`Archivo`, `Space Grotesk`, `Poppins`, `Montserrat`) y cuerpo (`Inter`, `IBM Plex Sans`, `Nunito Sans`).
  - **Panel de Vista Previa**: Panel en vivo en `ConfiguracionPage.tsx` para inspeccionar la combinación de tema, color y tipografías antes de aplicar cambios.

---

## FASE 4 — Internacionalización Básica (ES / EN) y Configuración Fiscal/Moneda
- **Completado**:
  - Creados archivos de traducción `locales/es.json` y `locales/en.json`.
  - Creado `I18nContext.tsx` con hook `useI18n()` y persistencia de idioma en `localStorage`.
  - Expandido `RubroConfig` en `config/rubros.ts` para soportar objetos bilingües `{ es: string, en: string }`.
  - Agregados campos `moneda: { simbolo, codigo }` e `impuesto: { nombre, tasa }` en `TenantInfo` con valores por defecto (Lempiras / ISV 15%) y selector de idioma en `ConfiguracionPage.tsx`.

---

## FASE 5 — Cierre y Reporte
- **Resumen Final**:
  - Fases 0 a 4 completadas al 100% manteniendo el modo simulado en `localStorage`.
  - Todo el sistema se probó para asegurar cero errores de compilación/linting (`npx oxlint`) y cero regresiones en los módulos base (inventario, POS, cotizaciones, usuarios).

---

## Decisiones de Diseño Tomadas Autónomamente
1. **Modelado de Persistencia de Módulos**: Cada módulo mantiene su propia clave en `localStorage` (ej. `ferre_mock_apartados`, `ferre_mock_arqueos`) para no sobrecargar el almacenamiento ni arriesgar corrupción de datos al probar características individuales.
2. **Fallback de Autenticación de Super Admin**: Si el backend de NestJS no está corriendo, `/admin/login` permite ingresar directamente en modo demo para continuar la revisión del panel SaaS sin bloqueos.
3. **Mantenimiento de Compatibilidad Retroactiva**: Si un tenant existente no posee definido `rubro` o `modulosHabilitados`, el sistema asume por defecto `FERRETERIA` y la totalidad de los 13 módulos habilitados para no romper ninguna funcionalidad probada.

---

## Cosas para Revisar Mañana con Daniel
1. **Revisión de Módulos Habilitables**: Confirmar si la lista de 13 módulos del catálogo cubre todas las variantes comerciales esperadas para los primeros clientes SaaS.
2. **Personalización por Rubro**: Revisar si se requieren campos adicionales específicos para Giros como Farmacia (ej. principio activo, registro sanitario) o Repuestos Automotrices (ej. compatibilidad de modelo/año).
3. **Flujo de Suplantación Remota**: Probar la experiencia del Super Admin entrando en modo soporte remoto a diferentes tiendas y roles.
