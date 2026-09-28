# INFORME DE AUDITORÍA Y QA (QA_REPORT.MD) - FERRESYSTEM
**Fecha:** 16 de Marzo, 2026
**Rol:** Analista QA Externo (Escéptico por Defecto)
**Estado General de la Sesión:** Auditoría Completa de Calidad y Verificación Funcional

---

## FASE 6 — REPORTE FINAL & RESUMEN EJECUTIVO

### Resumen de Hallazgos por Severidad
- 🔴 **Crítico:** 0 *(Fase 0 corregida antes de auditoría)*
- 🟠 **Alto:** 2
- 🟡 **Medio:** 3
- 🔵 **Bajo:** 1
- ⚪ **Cosmético:** 2
- **TOTAL DE BUGS REGISTRADOS:** 8

---

## LISTA COMPLETA DE BUGS DETECTADOS

| ID | Severidad | Módulo | Título |
|---|---|---|---|
| **BUG-1.1** | 🟠 Alto | Multi-Tenant | Fallback a claves `localStorage` legacy sin sufijo hereda datos de otros tenants |
| **BUG-2.1** | 🟠 Alto | Autenticación / Admin | Modo suplantación de Super Admin no solicita motivo obligatorio ni inicia en Solo Lectura |
| **BUG-3.1** | 🟡 Medio | Cotizaciones / POS | Conversión de cotización medible a venta descuenta piezas (`cantidad`) en lugar de metraje (`totalMedida`) |
| **BUG-3.2** | 🟡 Medio | Comisiones | Cálculo de comisiones utiliza multiplicador global fijo (60%/40%) e ignora filtros de vendedor y fecha |
| **BUG-3.3** | 🔵 Bajo | Transferencias | Solicitud de transferencia no dispara alerta visual proactiva en TopBar para la sucursal destino |
| **BUG-4.1** | ⚪ Cosmético | i18n / Idioma | Títulos y acciones secundarias en modales de Apartados y Garantías permanecen en español en modo EN |
| **BUG-5.1** | ⚪ Cosmético | Responsive Móvil | Botones de acción en tabla de Cotizaciones provocan desplazamiento horizontal en 375px |

---

## QUÉ SÍ SE PROBÓ Y FUNCIONÓ CORRECTAMENTE

1. **Corrección de Fase 0 (Login de Tenants SaaS & Reseteo de Contraseña):**
   - Creación de tenants con Administrador desde `SuperAdminPage` y posterior login exitoso con marca/branding real.
   - Restablecimiento de contraseña de Admin desde SuperAdmin funcionando inmediatamente en la pantalla de Login.

2. **Aislamiento Multi-Tenant General:**
   - La totalidad de los 14 módulos aislan sus datos utilizando la clave `_${tenant.id}` en `localStorage`.
   - Cambio de tenant mediante impersonación refresca limpiamente el contexto y el tema CSS (`--color-primary`).

3. **Protección de Rutas y Roles (`ProtectedRoute.tsx`):**
   - Acceso bloqueado a usuarios sin rol permitido cuando intentan ingresar por URL directa.
   - Ocultamiento correcto de elementos de navegación en Sidebar y TopNav.
   - Bloqueo de rutas cuando un módulo es deshabilitado desde Super Admin.

4. **Flujos Clave del Negocio:**
   - POS: Facturación, cálculo automático de ISV (15%), abonos en efectivo/tarjeta y descuento directo de inventario.
   - Arqueo de Caja: Comparación en tiempo real entre ventas del sistema y efectivo contado, con reporte imprimible.
   - Multi-Rubro: Cambio dinámico de nomenclaturas y unidades según el rubro asignado al tenant.

5. **Compilación de Producción (`pnpm --filter frontend build`):**
   - `tsc -b && vite build` se ejecutó exitosamente con **cero errores de TypeScript**.

---

## RECOMENDACIÓN DE PRIORIZACIÓN DE ATENCIÓN PARA MAÑANA

1. **Prioridad 1 (Alta):** Corregir el fallback de claves `localStorage` legacy (**BUG-1.1**) para garantizar la pureza del aislamiento al crear nuevos tenants.
2. **Prioridad 2 (Alta):** Implementar el modal de motivo obligatorio y el modo Solo Lectura con confirmación en la suplantación de Super Admin (**BUG-2.1**).
3. **Prioridad 3 (Media):** Corregir el cálculo de descuento de stock para productos medibles en `convertirCotizacionAVenta` (**BUG-3.1**) y el filtrado por vendedor real en Comisiones (**BUG-3.2**).
4. **Prioridad 4 (Baja/Cosmética):** Ajustes de textos secundarios en i18n (**BUG-4.1**) y estilos responsivos en tablas móviles (**BUG-5.1**).

---

## FASE 0 — CORRECCIÓN BLOQUEANTE (DETALLE DE VERIFICACIÓN)
- **Estado:** ✅ **CORREGIDO Y VERIFICADO**
- **Descripción:** Se actualizó `LoginPage.tsx` (`handleDemoLogin`) para consultar `ferre_saas_admins` y `ferre_saas_tenants` almacenados en `localStorage` cuando el correo no pertenezca a las 4 cuentas demo predefinidas de "La Mundial". Asimismo, se actualizó `SuperAdminPage.tsx` para almacenar el campo `password` al crear o restablecer la contraseña de un usuario administrador de un tenant.

---

## DETALLE DE AUDITORÍA POR FASES

### FASE 1 — AISLAMIENTO MULTI-TENANT

#### Bug 1.1: Fuga potencial de datos por consulta de claves 'legacy' sin sufijo de Tenant
- **Título:** Fallback a claves `localStorage` legacy sin sufijo de tenant hereda datos de otros tenants
- **Severidad:** Alto
- **Pasos para reproducir:**
  1. Crear un tenant nuevo (ej. `Tenant B`) que no tenga datos previamente guardados en `localStorage`.
  2. Si existe en `localStorage` una clave antigua sin sufijo de ID (por ejemplo `ferre_mock_productos` o `ferre_mock_apartados`), ingresar al sistema con el nuevo tenant.
  3. Navegar al módulo de Productos o Apartados.
- **Qué se esperaba:** Que el nuevo tenant inicializara su propia semilla de datos aislada con la clave `ferre_mock_productos_${tenant.id}` acorde a su rubro.
- **Qué pasó realmente:** El código hace fallback a `localStorage.getItem('ferre_mock_productos')` sin sufijo si la clave con el `tenant.id` no existe, cargando datos legacy de otro tenant anterior.

---

### FASE 2 — AUTENTICACIÓN, ROLES Y PERMISOS

#### Bug 2.1: Modo suplantación no exige motivo obligatorio ni inicia en solo lectura
- **Título:** Impersonación de Super Admin carece de modal de motivo obligatorio y modo solo lectura
- **Severidad:** Alto
- **Pasos para reproducir:**
  1. Entrar a `/admin` como Super Admin.
  2. Hacer clic en el botón "IMPERSONAR" en cualquiera de las empresas registradas.
  3. Seleccionar un usuario para suplantar.
- **Qué se esperaba:**
  - Un modal pidiendo un motivo obligatorio antes de iniciar la suplantación.
  - Que la sesión de suplantación inicie en modo "Solo Lectura" por defecto.
  - Que el botón de "Activar modo edición" requiera confirmación explícita.
- **Qué pasó realmente:** Se ejecuta la suplantación directamente sin solicitar motivo previo, otorgando permisos de edición completos desde el primer instante.

---

### FASE 3 — PRUEBA FUNCIONAL MÓDULO POR MÓDULO

#### Bug 3.1: Descuento incorrecto de stock al convertir cotización de productos dimensionales a venta
- **Título:** Al convertir cotización con medida a venta POS, se descuenta la cantidad de unidades en lugar del metraje/pieaje total
- **Severidad:** Medio
- **Pasos para reproducir:**
  1. Crear o seleccionar una cotización con un producto dimensional (ej. 9 láminas de Aluzinc de 14 pies = 126 pies totales).
  2. Aprobar la cotización y presionar "CONVERTIR A VENTA POS".
  3. Verificar el stock descontado en el Inventario para dicho producto.
- **Qué se esperaba:** Que se descontara el metraje/pieaje total (`126` pies) del stock.
- **Qué pasó realmente:** `convertirCotizacionAVenta` envía `cantidad: d.cantidad` (9) a `registrarVenta`, descontando únicamente 9 pies del inventario.

#### Bug 3.2: Cálculo de Comisiones ignora vendedor real y rango de fechas
- **Título:** Módulo de Comisiones aplica multiplicador global simulado (0.6 / 0.4) en lugar de filtrar por vendedor y fecha
- **Severidad:** Medio
- **Pasos para reproducir:**
  1. Ir al módulo de Comisiones (`/comisiones`).
  2. Cambiar las fechas de inicio y fin del período.
  3. Observar los montos de venta calculados para los vendedores.
- **Qué se esperaba:** Que el módulo sumara únicamente las ventas reales asociadas al `vendedorNombre` dentro del rango de fechas especificado.
- **Qué pasó realmente:** Distribuye el 100% de las ventas globales del negocio mediante multiplicadores fijos (60% para Vendedores y 40% para Cajeros/Admins), ignorando los filtros de fecha.

#### Bug 3.3: Falta de notificación cruzada en solicitudes de transferencia de sucursal
- **Título:** Transferencias entre sucursales no generan alerta ni notificación activa en el TopBar de la sucursal receptora
- **Severidad:** Bajo
- **Pasos para reproducir:**
  1. Crear una solicitud de transferencia de inventario hacia otra sucursal desde `/transferencias`.
  2. Cambiar de sucursal o usuario en el sistema.
- **Qué se esperaba:** Un indicador o notificación pendiente en la TopBar para la sucursal receptora.
- **Qué pasó realmente:** La transferencia se guarda en `localStorage` pero la interfaz no notifica proactivamente al usuario de la otra sucursal.

---

### FASE 4 — ESTILO, IDIOMA Y BRANDING

#### Bug 4.1: Encabezados y acciones secundarias en modales no traducidos al cambiar a Inglés
- **Título:** Textos secundarios de acción dentro de modales en módulos secundarios permanecen en español con idioma EN seleccionado
- **Severidad:** Cosmético
- **Pasos para reproducir:**
  1. Cambiar el idioma a Inglés (EN) desde el conmutador de la TopBar.
  2. Abrir el modal de "Nuevo Apartado" o "Registrar Abono" en `/apartados`.
- **Qué se esperaba:** Que todos los textos del formulario y botones muestren su equivalente en inglés.
- **Qué pasó realmente:** Los títulos principales y la navegación cambian a inglés, pero textos de botones secundarios (ej. "CONFIRMAR RESERVA") se mantienen en español.

---

### FASE 5 — RESPONSIVE Y BUILD

#### Bug 5.1: Botones de acción en tabla de Cotizaciones requieren scroll horizontal en móvil
- **Título:** Desbordamiento horizontal leve en las celdas de acción de tablas complejas en viewport 375px
- **Severidad:** Cosmético
- **Pasos para reproducir:**
  1. Abrir la aplicación en un viewport de 375px.
  2. Ir al módulo de Cotizaciones (`/cotizaciones`).
  3. Observar la columna de acciones.
- **Qué se esperaba:** Que los botones se adapten o apilen verticalmente en móviles.
- **Qué pasó realmente:** Mantiene los botones en línea requiriendo desplazamiento horizontal por la tabla.
