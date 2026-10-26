# Navegación híbrida única y mejoras UX/UI de Stitch — 2026-10-23

Rama `claude/sweet-davinci-vh7br4` (base `main` `b60b49b`, que ya incluye el PR #193 fusionado). Sin cambios de backend, Prisma, migraciones, cálculos monetarios, ISV, descuentos, crédito, caja, inventario, JWT/CSRF, sesiones ni aislamiento multi-tenant. Sin dependencias nuevas, sin Tailwind, sin fuentes ni iconos externos. Identidad visual conservada: se tocaron anchos, distribución, espaciado, encuadre y comportamiento de menús; no paleta, tipografías, iconografía, colores de marca ni estilos generales de botones.

Referencia: ZIP de Google Stitch «Optimización UX/UI y navegación híbrida» (prototipos HTML/PNG de dashboard, Super Admin, POS, contabilidad y móvil, más la auditoría `auditor_a_ux_ui_jowa_system_pr_193.md`). El HTML de Stitch no se copió: usa Tailwind, Material Symbols y una paleta propia; solo se tradujeron distribución y comportamiento a los componentes React y el CSS existentes.

## 1. Navegación híbrida única
Panel lateral compacto (rail de 84 px) + barra superior contextual para **todos** los roles. `AppLayout` (`frontend/src/App.tsx`) ya no lee `modoNavegacion`; el valor histórico `TOPNAV`/`SIDEBAR` se conserva en la base y en `TenantInfo` (marcado como compatibilidad) pero no decide nada.

| Rol | Rail | Notas |
|---|---|---|
| SUPERADMIN | `PlatformRail`: Inicio · Empresas · Módulos · Usuarios y soporte · Auditoría | No existe «Configuración global» a nivel de plataforma (la configuración es por negocio, pestañas del negocio); no se inventó una pantalla. Respaldos queda bajo Auditoría. |
| ADMIN | `AdminRail`: Inicio · Ventas · Inventario · Compras · Clientes · Más | Sin cambios de agrupación. |
| CAJERO | `CajeroRail`: Inicio · Caja · Mi caja · Más | Enfocado en venta y caja; sin costos ni administración. |
| VENDEDOR | `AdminRail` con sus accesos autorizados (Ventas, Clientes/Más) | Antes usaba el menú lateral clásico. |
| BODEGUERO | `AdminRail`: Inicio · Inventario · Compras · Logística (entregas) · Más | Entregas es «Logística», no una venta. |
| CONTADOR | **No existe en `main`** (el rol llega con el PR #180). | El rail es genérico (`availableTasks`): cuando el rol y sus módulos existan aparecerán sin cambiar el shell. No se expone nada contable incompleto. |

Barra superior (`AdminTopbar`, `PlatformTopbar` para el Super Admin): negocio, sucursal activa, búsqueda de tareas (`TaskFinder`, campo plegado con panel flotante, Ctrl+K), estado de caja, notificaciones, usuario con su rol y **un solo** cierre de sesión. Las acciones de navegación viven solo en el rail. El aviso de soporte remoto y su salida/modo edición se extrajeron de `TopBar` a `SoporteBanner` (misma lógica, mismos textos y auditoría).

RBAC y módulos: el rail no decide qué se ofrece; recibe solo lo que `availableTasks` autoriza (rol + permiso + módulo habilitado). Las rutas siguen protegidas por `ProtectedRoute` y el backend. Inicio es siempre accesible.

## 2. Configuraciones eliminadas
- `ConfiguracionPage`: sección «4. Navegación» (selector TOPNAV/SIDEBAR) y su envío en el guardado.
- `NegocioDetallePage`: selector de navegación en «Marca», la etiqueta «Navegación:» del resumen y el texto «Marca y navegación» (ahora «Marca»).
- `SuperAdminPage`: columna y modal «Navegación», selector en «Editar marca», `guardarNavegacionTenant` y su auditoría `CAMBIO_NAVEGACION`.
- `App.css`: reglas de `.jowa-topnav*`, `.topnav-*`, `.jowa-sidebar*`, `.app-sidebar`; componentes `Sidebar.tsx` y `TopNavigation.tsx`.
- Locales ES/EN: claves de los selectores y sus textos explicativos.
- Los guardados ya **no envían** `modoNavegacion`: el backend lo trata como opcional y no toca el valor histórico (no hay migración ni borrado de columna).

## 3. Dashboard ADMIN
`AdminHomePage` + `admin-dashboard.css`. Cuatro indicadores en una fila (`repeat(4, minmax(0, 1fr))`), cuerpo en dos columnas fluidas (principal 2fr: «Necesita tu atención» y «Últimas ventas»; lateral 1fr: «Acciones frecuentes», alertas de inventario y tendencia). Contenedor hasta 1920 px, centrado, con margen `clamp(20px, 2.2vw, 40px)`: ya no queda una franja vacía a 1920×1080. ≤1100 px una columna con indicadores 2×2 y orden por prioridad (atención, acciones, ventas, alertas, tendencia). Sin cambios de cálculos, indicadores ni endpoints; estado de caja y selector de sucursal viven en la barra superior.

## 4. Logotipo del negocio en el rail
`LogotipoNegocio` con `encuadre`: cuadrado de 56 px (`.logo-marco`) con `object-fit: contain` (sin deformar ni recortar), superficie neutra existente (`--surface`) y, solo para logotipos **claros y transparentes** (que sobre blanco desaparecerían), `--plat-2` con borde `--plat-ink`. La decisión (`utils/fondoLogotipo.ts`, función pura con prueba unitaria) mide una miniatura en el navegador; el archivo original nunca se modifica. Sin logotipo: iniciales sobre el color de marca. Cajero y los demás roles usan el mismo marco.

## 5. Super Admin — empresas
Tabla sustituida por tarjetas compactas (`.empresa-card`): fila 1 insignia 40 px + nombre + contacto + «Gestionar empresa»; fila 2 estado, plan y color; pie con servicios N/M y «Iniciar soporte». Alto según contenido (sin `min-height`), 380 px mínimos por columna. «Gestionar empresa» es un `MenuDesplegable` (portal en `body`, `position: fixed`): no lo recorta ningún `overflow`, se reposiciona arriba/abajo y sin desbordar los lados (`utils/posicionMenu.ts`, con pruebas), Escape/clic fuera/desplazamiento lo cierran, flechas/Inicio/Fin navegan, `aria-haspopup`/`role="menu"`. Se conservan servicios/módulos, estado, plan, marca, soporte y configuración.

## 6. Pruebas (Chromium 1194 del entorno, API simulada o backend real; sin dispositivo físico)
| Comprobación | Resultado |
|---|---|
| Unitarias (`npm test`) | **536/536** (14 nuevas en `test/navegacion-hibrida.test.mjs`: guardas de TOPNAV/SIDEBAR, áreas del Super Admin, RBAC y módulos por rol, Inicio, permisos, logotipo, posición de menús) |
| `tsc -b` / build | sin errores / correcto |
| Lint | 111 avisos, igual que `main` (ninguno nuevo) |
| Playwright simulado, suite completa | **359 aprobadas, 0 fallidas**, 26 omitidas (7 son las capturas de evidencia bajo demanda `CAPTURAS_HIBRIDA=1`; 19 ya se omitían en `main`) |
| `e2e/navegacion-hibrida-simulado.spec.ts` (nuevo, 38 casos + 7 de captura) | rail y barra por rol con valor histórico SIDEBAR/TOPNAV; cajero, vendedor y bodeguero; módulos apagados; Inicio con todo apagado; búsqueda de tareas (Ctrl+K); Configuración/Marca/Resumen/Editar marca sin selector y sin enviar `modoNavegacion`; dashboard a 1920×1080, 1600×900, 1366×768, 820×1180 y 390×844 (cuatro indicadores en fila, sin franja derecha, sin scroll horizontal); cuatro tipos de logotipo; tarjetas de empresas y menú «Gestionar empresa» (abajo, arriba, bordes, móvil, teclado, clic fuera) y lista sin scroll horizontal en las cinco resoluciones |
| Piloto real (`e2e-real`, NestJS + PostgreSQL 16 temporal, sin deriva de esquema) | **155 aprobadas, 1 fallida, 2 sin ejecutar (dependientes en serie), 4 omitidas**. La fallida es `contingencia-real` n.º 14 (actualización del service worker): **falla igual en `origin/main` `b60b49b`** (comprobado en un worktree limpio, 12 pasan y esa falla), no depende de este cambio |
| Intermitente | `session-lifecycle` «logout… Atrás no reactiva módulos» falló una vez en una pasada con carga alta y pasó 2/2 al repetirla y en la pasada completa siguiente |

Las especificaciones antiguas de TOPNAV/menú lateral (`menu-jowa-v3`, `navigation-settings`, `diseno-unico`, `admin-shell-simulado`, `admin-pendientes-simulado`, `ux-ronda1-regresion`, `guide`, y en `e2e-real` `administracion-cloud-real` y `logotipo-real`) se reescribieron a la navegación única conservando sus aserciones de acceso, módulos, permisos y contraste; no se eliminó ninguna prueba para obtener verde. Un fallo real de CSS (menú sin estilos tras una edición) lo detectaron las propias pruebas nuevas y se corrigió antes del commit.

## 6b. Evidencias (`docs/evidencias/navegacion-hibrida/`, capturas reales del sistema con API simulada)
1. `01-dashboard-admin-1920x1080.png` · 2. `02-dashboard-admin-1366x768.png` (y `02b` a 820×1180) · 3. `03-superadmin-empresas.png` · 4. `04-menu-gestionar-empresa.png` · 5. `05-rail-logotipo-oscuro.png` (y `05b` claro) · 6. `06-movil-admin.png` · 7. `07-cajero-hibrida.png` (y `07b` bodeguero) · 8. **Contador: sin captura** (el rol no existe en `main`). Referencias de Stitch: `stitch-referencia-dashboard-admin.png`, `stitch-referencia-superadmin-empresas.png`.

Comparación con Stitch: misma estructura (rail + barra con negocio, sucursal, búsqueda, caja, campana y usuario; cuatro indicadores; columna principal con atención y últimas ventas; columna lateral con acciones; tarjetas de empresas con «Gestionar empresa» arriba a la derecha y datos en bandas). Diferencias importantes: colores, tipografía e iconos son los de Jowa (no el azul/Inter/Material de Stitch), el buscador es un campo plegado, no hay «Resumen de estaciones de cobro» ni métricas SaaS inventadas, y en tablet (≤1024 px) la búsqueda se reduce a su icono para que el negocio no se trunque.

## 7. Diferencias con Stitch (no implementadas, a propósito)
- **Stitch usa azul `#2563eb`, Inter y Material Symbols**: se conservaron la paleta, la tipografía y los iconos de Jowa (restricción absoluta).
- **Datos del prototipo que no existen en Jowa**: «Facturas proveedores» en Stitch muestra un monto y Jowa muestra el número de facturas de proveedores abiertas (no se cambiaron cálculos ni indicadores). «Resumen de Estaciones de Cobro» por caja, métricas SaaS (MRR, «Emisión fiscal SAR», cupos), RTN/subdominio/corte fiscal en las tarjetas, «Registrar nueva empresa» con exportar/filtros y la cinta «Layout Fluido 1920×1080 Activo»: **no existen** en Jowa y no se inventaron.
- **POS del cajero, contabilidad, inventario móvil, auditoría móvil y reportes móviles**: no se tocaron. El POS de Stitch cambia el flujo de cobro (caja y ventas), la contabilidad pertenece al PR #180 y el panel móvil administrativo no admite POS ni movimientos de caja. Quedan fuera de este PR.
- Buscador de la barra superior: en Stitch es un campo abierto; aquí es un campo plegado con panel flotante para no reservar ancho fijo (el contenido por rol y permiso es el mismo).
- Rol Contador: sin pantalla porque el rol no existe aún en `main`.

## 8. Pendientes reales
- Aceptación del cliente, merge y despliegue: no realizados.
- Rol Contador y su rail: dependen del PR #180.
- Sin prueba en Safari/iPhone ni tableta física; el menú desplegable y el logotipo se verificaron en Chromium emulado.
- `contingencia-real` n.º 14 (service worker) falla también en `main`: pendiente ajeno a este cambio.
- CI de GitHub Actions no consultado: no hay PR abierto para esta rama.

## Sincronización con `main` `01f9110` (PR #194)

Merge normal sin force push; único conflicto textual en `docs/CONTEXTO_MAESTRO.md`. Resultados de pruebas y la nota sobre `contingencia-real` n.º 14 (falla igual en `main`) en la sección homónima del contexto maestro. **Decisión pendiente de producto:** la rama elimina la elección TOPNAV/SIDEBAR; si se exige conservarla, hay que reintroducir `Sidebar.tsx`/`TopNavigation.tsx` y la lectura de `modoNavegacion` en `AppLayout` antes de fusionar.
