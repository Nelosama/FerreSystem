# Fase funcional: módulos administrativos P1 — matriz QA (2026-10-10)

**Base:** `origin/claude/integracion-pos-offline-p1` (`bc0a0125`), que integra #127 y #128 (#129). Rama de trabajo: `claude/p1-modulos-administrativos`. No se modificó #129 ni `main`. No hay merge, migraciones productivas ni despliegue.

**Regla aplicada:** lo que no tiene requisitos confirmados por el dueño no se implementa; se documenta la decisión necesaria.

## 1. Matriz de estado

| Módulo | Estado | Qué está verificado | Qué falta | Bloqueo |
|---|---|---|---|---|
| Garantías (coberturas por línea) | Funcional, oculto del menú | Backend con PostgreSQL 37/37. Vendedor 403. Responsables por nombre en el listado. Ruta y menú alineados con el backend | Reclamos de garantía; comprobantes; habilitar el menú | **Decisión del dueño**: reglas de reclamo, mercancía dañada, comprobantes y responsable |
| Devoluciones | Funcional | Trazabilidad existente: solicitante, administrador que decidió, fecha de decisión, destino por línea (`solicitudes_devolucion`). Pruebas PostgreSQL existentes | Comprobante imprimible de devolución | **Decisión del dueño**: formato y contenido del comprobante |
| Reportes administrativos | Funcional con corrección | «Ventas netas» (incluía ISV) separado en base, ISV y total neto de devoluciones. Prueba `base + ISV = total` por método | Desglose de devoluciones en base e ISV | No definido en el modelo: la devolución no guarda base ni ISV por separado |
| Cierres de caja y conciliación | Funcional según pruebas existentes | `caja.postgres.integration.ts` 14/14 (apertura, cierre, diferencias, concurrencia) | Corrección posterior de un cierre confirmado | **Decisión del dueño**: no hay flujo de corrección auditada |
| Compras: proveedor preferido | Funcional | Al elegir producto se sugiere el preferido y el botón lo selecciona. E2E 8/8 | Selector visible en el alta de producto | No aplica |
| Compras: costos | Sin cambios | La regla de costo vigente (última recepción, sube o baja) no se tocó | — | No aplica |
| Listas de precio | Pendiente (marcador) | Ruta en `App.tsx` es `ModuloPendiente`. El POS no lee listas. Guardia de regresión en `modulos-pendientes-guard.test.mjs` | Modelo, API y precedencia de precios | **Decisión del dueño**: orden de precedencia (cliente, lista, producto) y vigencia |
| Apartados | Pendiente (marcador) | Página antigua solo en `localStorage`; ruta de marcador | Modelo, reserva de stock, abonos y cancelación | **Decisión del dueño**: depósito mínimo, plazo, política de cancelación y devolución de abonos. No aparecen en `REQUISITOS_NEGOCIO_VALIDADO.md` |
| Pedidos especiales | Pendiente (marcador) | Página antigua solo en `localStorage`; ruta de marcador | Modelo, anticipo, estados y entrega | **Decisión del dueño**: estados y anticipo. No están definidos |
| Transferencias entre sucursales | Bloqueado | Página antigua solo en `localStorage` | Todo el módulo | **Dependencia de sucursales**: no existe modelo de sucursal (ver §4) |
| Comisiones | Bloqueado | Pantalla con estado de demostración y periodo fijo | Modelo, cálculo y periodo | **Decisión del dueño**: base de cálculo (venta, utilidad o margen), periodo y responsable |
| Idioma por empresa | Parcial | Traducciones ES/EN del menú y de módulos nuevos. Pruebas de i18n existentes pasan | Idioma por empresa y textos en español fijos de compras y otras pantallas | Ver §5 |

## 2. Cambios de esta fase

1. **Garantías:** la ruta y el menú admitían a VENDEDOR, pero el backend responde 403. Ahora solo ADMIN y CAJERO (igual que el backend). El listado devuelve `creadoPorNombre` y `actualizadoPorNombre`, limitados a la misma empresa.
2. **Compras:** sugerencia del proveedor preferido al elegir producto, con botón «Usar preferido». No modifica el costo sugerido ni la actualización de costos.
3. **Reportes:** el resumen devuelve `base` e `ISV` por método de pago. La pantalla muestra base, ISV y el total cobrado neto de devoluciones, con ISV incluido.
4. **Guardia de módulos pendientes:** impide que apartados, transferencias, pedidos especiales o listas de precio se conecten a una ruta operativa o a la venta.
5. **Simuladores E2E:** tres simuladores (producto, compras y P1) no conocían la consulta de proveedores por producto. Se corrigieron.

## 3. Decisiones que requieren aprobación del dueño

1. **Garantías:** reglas de reclamo (estados, motivo obligatorio, plazo), tratamiento de mercancía dañada, comprobantes y responsable de aprobar. Hasta entonces el módulo sigue oculto.
2. **Devoluciones:** formato del comprobante imprimible.
3. **Cierres:** si debe existir corrección posterior de un cierre confirmado, quién la aprueba y cómo queda auditada.
4. **Listas de precio:** orden de precedencia entre precio del cliente, lista y precio del producto, y vigencia de cada lista.
5. **Apartados:** depósito mínimo, plazo, cancelación y devolución de abonos.
6. **Pedidos especiales:** estados, anticipo y entrega.
7. **Comisiones:** base de cálculo, periodo y responsable.
8. **Sucursales:** si el negocio necesita multi-sede en esta fase; requiere modelo de sucursal, pertenencia de usuarios y existencias por sucursal.

## 4. Dependencias

- **Sucursales:** no hay modelo. Bloquea transferencias, existencias por sede, permisos por sucursal y comisiones por sucursal. No se introduce un selector de sucursal ficticio.
- **Comisiones:** dependen de la base de cálculo y del periodo (decisión 7) y de contar con ventas con método de pago y devoluciones trazables.
- **Agente POS offline:** la integración ya está en la base. Esta fase no modificó servicios de contingencia, sincronización ni service worker.

## 5. Idioma por empresa: diseño seguro (propuesta, no implementado)

- **Dónde guardarlo:** `tenant.configuracion.idioma` con enum `ES | EN`, validado en `validateTenantConfiguration`.
- **Quién lo cambia:** solo ADMIN de la empresa o SUPERADMIN. ADMIN y CAJERO no ven un selector de idioma (FS-10).
- **Aplicación:** la UI toma el idioma de la empresa al iniciar sesión. Los datos del usuario y los mensajes de negocio conservan su idioma original.
- **Riesgo:** cambiar el idioma no debe alterar datos ni PDFs ya emitidos. Solo cambia la interfaz.
- **Pruebas necesarias:** PostgreSQL (valor fuera del enum rechazado, otro tenant no cambia), E2E (cambio y recarga), y verificación de que no hay texto en español fijo en las pantallas operativas.
- **Pendiente:** texto en español fijo en `OperacionesPage` (compras, caja, cuentas). Es el mayor riesgo de traducción incompleta.

## 6. Pruebas ejecutadas (2026-10-10, entorno local)

| Suite | Resultado |
|---|---|
| Backend unitarias | 345/345 |
| Integración PostgreSQL 16 (cadena completa, usuario no root) | 21 archivos, 367 aprobadas, 1 omitida |
| Garantías PostgreSQL | 37/37 (incluye VENDEDOR 403 y responsables por nombre) |
| Reportes PostgreSQL (zona horaria, base + ISV = total) | 20/20 |
| Frontend unitarias | 224/224 (incluye guardia de módulos pendientes) |
| Playwright Chromium | 119/119 (incluye 7 E2E del panel de proveedores, estado de cuenta y compra al contado, más la sugerencia de preferido) |

## 7. Límites y riesgos

- Las E2E usan backend simulado. La persistencia la prueban las pruebas PostgreSQL.
- No se probó en iPhone ni en impresora.
- La migración de integración (`20261011000000_pos_contingencia_offline`) debe aplicarse en orden y revisarla un DBA antes de cualquier despliegue.
- Los prisma client y las listas de migraciones de prueba deben mantenerse al día al integrar. Ver `CONTEXTO_MAESTRO.md`.
