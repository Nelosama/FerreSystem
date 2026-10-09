# Bitácora de pendientes FerreSystem — 2026-10-09

**Estado:** registro de hallazgos; NO implica corrección, despliegue ni validación independiente.  
**Fuente:** auditoría UI/UX + QA de Claude del módulo ADMIN (informe aportado por el propietario), más requerimientos conversados.  
**Seguimiento:** contrastar cada punto contra `main` y PRs mergeados antes de asignarlo; marcar `PENDIENTE / EN CURSO / CORREGIDO / REVALIDAR` con evidencia y PR. Evitar duplicar trabajos ya terminados.

## Resumen de la auditoría de Claude

40 hallazgos originales: **3 P0, 17 P1, 16 P2, 4 P3**. Claude reportó pruebas reales en producción para parte de los flujos, inspección de código para otros y flujos NO TESTED. No asumir que todos siguen abiertos sin comprobar el estado actual.

### P0 — críticos
- **FS-01** POS: tras rechazo 4xx, venta pendiente queda bloqueada; reintento manda `vencimiento: ""` y backend responde `vencimiento must be a valid ISO 8601 date string`. Normalizar fecha, retirar vencimiento fuera de crédito, distinguir 4xx de fallo de red, desbloquear edición, test de regresión.
- **FS-02** Clientes/crédito: no existe control UI para habilitar crédito/límite/plazo aunque API ofrece `PATCH /clientes/:id/credito`. Añadir ficha Crédito con permisos y auditoría.
- **FS-03** Usuarios: contraseña temporal fija `Ferre2026!` prellenada. Retirarla; generación segura y cambio obligatorio al primer ingreso; verificar backend.

### P1 — altos
- **FS-04** CxP: vencimiento se muestra un día antes; manejar fecha calendario sin conversión horaria.
- **FS-05** Reportes: cortes por UTC desplazan ventas nocturnas; usar zona horaria del tenant.
- **FS-06** Inventario: vencimiento/lote/serie/garantía aparecen pero no se persisten.
- **FS-07** Inventario: alta y edición inconsistentes; edición incompleta, sin confirmación ni desactivación.
- **FS-08** Compras: costo prellenado concatena dígitos al escribir; selección correcta y advertencia de variación.
- **FS-09** CxP/Caja: pago a proveedor en efectivo descuenta caja abierta sin selección explícita de origen.
- **FS-10** Configuración: ADMIN puede modificar idioma y rubro; reservar al SUPER ADMIN, persistir idioma por tenant y aplicar ES/EN sin selector en ADMIN/CAJERO.
- **FS-11** i18n: pantallas operativas siguen parcialmente en español al usar EN; traducir textos/enums.
- **FS-12** Mensajes: errores técnicos backend visibles; validaciones legibles y modales/toasts propios.
- **FS-13** Recibo POS: crédito rotulado TOTAL PAGADO y ausencia de datos fiscales; diferenciar comprobante interno de factura fiscal válida.
- **FS-14** Clientes/permisos: menú accesible a CAJERO/VENDEDOR pero backend responde 403; alinear navegación y autorización.
- **FS-15** Crédito: venta sin vencimiento por defecto; derivarlo del plazo del cliente.
- **FS-16** Comisiones: porcentaje no persiste y período fijo marzo 2026.
- **FS-17** Sucursales: opciones ficticias hardcoded en Usuarios.
- **FS-18** Auditoría: altas/cambios de crédito de clientes sin trazabilidad.
- **FS-19** Inventario: doble envío de producto puede duplicar POST.
- **FS-20** POS/Usuarios: límite descuento inconsistente (0 % vs 100 %).

### P2 — medios
- **FS-21** Restaurar scroll al cambiar ruta.
- **FS-22** Encabezados excesivamente altos, controles globales duplicados.
- **FS-23** Título de Clientes dice NUEVO CLIENTE.
- **FS-24** Compras: nombres y estados inconsistentes (Órdenes/Compras/SOLICITADA).
- **FS-25** Compras: formulario conserva proveedor/vencimiento tras registrar.
- **FS-26** Levantamiento: conteo ciego para contador no ADMIN.
- **FS-27** Levantamiento: UUID/enums técnicos visibles en UI.
- **FS-28** Levantamiento: foco y cantidad tras escaneo poco prácticos.
- **FS-29** Tablas desbordan horizontalmente; adaptar responsive.
- **FS-30** Modal de usuario no cierra con Escape ni devuelve foco.
- **FS-31** Botones icono sin nombre accesible.
- **FS-32** Entrega mostrador requiere confirmación extra; evaluar entrega en POS sin perder auditoría.
- **FS-33** Devoluciones no aceptan número impreso tipo V-1.
- **FS-34** Caja abierta más de 12 horas sin alerta.
- **FS-35** Reportes: “Ventas netas” incluye ISV; separar base/ISV/total.
- **FS-36** Módulos simulados con localStorage y datos ficticios: ocultar hasta persistencia real.

### P3 — bajos
- **FS-37** Capitalización inconsistente de menús.
- **FS-38** Documento 2 debe mostrar referencia comercial legible.
- **FS-39** Confirmaciones demasiado genéricas.
- **FS-40** Persistencia local de pendientes de otros tenants: aislamiento y limpieza segura.

## Nuevo requerimiento — FS-41 (P1): mantenimiento y respaldos invisibles para el usuario operativo

**Decisión de producto:** el usuario ADMIN/CAJERO/VENDEDOR opera la ferretería; el sistema ejecuta las tareas técnicas automáticamente. No mostrar botones, estados crudos o mensajes tipo “Actualizar estado del respaldo”, “backup no configurado”, “comprobar servidor” o “sincronizar” en pantallas de negocio cuando puedan automatizarse. El SUPER ADMIN/responsable técnico sí tendrá consola de salud, alertas, historial y recuperación.

**Criterios de aceptación:**
1. Persistencia transaccional inmediata para cada venta, compra, abono y cierre; no confundir guardar operación con respaldo de BD.
2. Respaldos programados por un servicio fiable fuera del navegador, con política configurable de frecuencia/retención, copias cifradas y almacenamiento separado de la BD primaria. Propuesta inicial: respaldo diario y recuperación a punto en el tiempo si infraestructura lo permite; confirmar RPO/RTO y costos.
3. Al cerrar caja, persistir de forma atómica el cierre y su evidencia de auditoría; no generar un dump completo por cada venta o cierre. Si se requiere un respaldo adicional post-cierre, encolarlo de forma asíncrona y sin bloquear caja.
4. Monitoreo de éxito/fracaso de respaldos, alertas solo a SUPER ADMIN/soporte, y pruebas periódicas de restauración en entorno aislado.
5. Sincronización/actualización de catálogo y reintentos seguros automáticos; estados claros solo cuando el usuario necesite intervenir.
6. Mantener confirmación humana para decisiones sensibles: cerrar caja, aplicar ajuste de inventario, reversar operaciones.
7. Eliminar/ocultar controles técnicos para roles operativos tanto en UI como en permisos backend; no ocultar errores operativos que afecten la integridad de una venta.
8. Pruebas de programación, retención, fallos, recuperación, permisos y continuidad con conectividad intermitente.

**Estado:** PENDIENTE de diseño técnico, implementación y validación; no afirmar que ya existe un backup automático funcional.

## Observación operativa urgente: datos QA en producción

El informe de Claude indica pruebas con identificador `QA-AUDIT` en tenant Ferretería Alex: producto, proveedor, factura, cliente, ventas, abono y levantamiento no aplicado. Reporta **L 100** pagados desde una caja existente, **L 431.25** registrados como tarjeta y una venta a crédito. **Conciliar con caja y reportes antes del cierre**. No borrar directamente movimientos contables ni datos históricos; verificar qué registros siguen vigentes.

## Orden de trabajo sugerido

1. Conciliar efectos de QA en producción.
2. Seguridad FS-03; POS FS-01; crédito FS-02.
3. Integridad monetaria y fechas FS-08/09/04/05/15.
4. Inventario, permisos, auditoría e i18n.
5. FS-41: diseño e implementación de automatización de respaldo y ocultación de controles técnicos.
6. Rediseño UX/UI: navegación compacta, acciones necesarias, accesibilidad y móvil.

**Regla:** PRs pequeños, con pruebas y evidencia; no hacer merge automático. Esta bitácora registra hallazgos, no sustituye verificar el estado actualizado del repositorio.
