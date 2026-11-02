# Diseño: documento de venta configurable por empresa (CAI o comprobante) — 2026-11-02

> Diseño, no implementación. Requiere cambio de esquema (revisión **NEXUS**) y autorización para iniciar el desarrollo.

## Decisiones del dueño (2026-11-02)

1. **SICOFI es inspiración** para el módulo contable de FerreSystem, no un sistema contra el que se concilie. La comparación de reglas ([COMPARACION_SICOFI_20261102.md](COMPARACION_SICOFI_20261102.md)) queda como referencia de diseño; sus defectos documentados no se copian.
2. **Contabilidad es un servicio de pago.** Si el cliente no lo paga, el módulo queda deshabilitado y el cliente lleva su contabilidad manualmente. **Ya implementado:** `contabilidad` es opt-in (`backend/src/common/tenant-modules.ts`, `OPT_IN_TENANT_MODULES`): sin registro habilitado queda apagado; solo el Super Admin lo enciende desde los servicios contratados del negocio; el servidor rechaza sus rutas y la navegación lo oculta. No requiere desarrollo.
3. **Facturación con CAI configurable por el Super Admin, por empresa.** Un cliente puede no tener CAI: entonces el sistema emite comprobante interno.

## Decisiones confirmadas (2026-11-02, después de la evaluación)

- **Quién registra el CAI:** el ADMIN del negocio, con permiso propio que puede conceder al CONTADOR; el Super Admin solo asiste por soporte remoto auditado. Confirmado por el dueño.
- **Primer cliente sin CAI:** la facturación con CAI **no bloquea la salida**; se desarrolla después.
- **Empresas sin CAI:** documento con **formato de factura, sin línea de CAI y sin ninguna leyenda**. Implementado: desglose «Importe exento / Importe gravado / ISV», cantidad en letras, nombre comercial, dirección, teléfono, correo, sucursal y logotipo (`frontend/src/components/ReciboPDF.tsx`, `frontend/src/utils/montoEnLetras.ts`). El título se mantiene «COMPROBANTE DE VENTA» y no se usa la palabra «FACTURA» sin CAI (pendiente de confirmar por el dueño). El RTN de la empresa emisora no aparece: no existe ese dato en la configuración de la empresa.

## Problema actual

- El POS siempre imprime «COMPROBANTE DE VENTA» sin CAI (`frontend/src/components/ReciboPDF.tsx:305`).
- Las tablas `fiscal_cai` y `fiscal_documentos` existen, pero **solo dentro de Contabilidad** (`backend/src/contabilidad/contabilidad.controller.ts:32-33`) y sin contador de correlativo: no sirven para emitir facturas desde el POS. Además, la facturación con CAI no puede depender de un módulo de pago distinto.

## Diseño propuesto

### Configuración (Super Admin)

- Nuevo módulo opt-in **`facturacion_cai`** en `OPT_IN_TENANT_MODULES`, independiente de `contabilidad`. Se enciende o apaga desde el mismo panel de servicios del Super Admin, con auditoría (mecanismo ya existente).
- Apagado (por defecto): comprobante interno. Encendido: cada venta emite factura con CAI.
- Gestión de autorizaciones CAI (alta, desactivación) disponible con el módulo `facturacion_cai`, sin requerir Contabilidad. Quién las registra: ver «Evaluación» abajo.

### Evaluación: quién registra el CAI (recomendación, pendiente de confirmar por el dueño)

- **ADMIN del negocio por defecto**, mediante un permiso propio (`facturacion.cai.gestionar`). El CAI es una autorización del SAR al negocio y el dueño es quien la recibe; muchas empresas no tienen contador y el rol CONTADOR solo tiene uso real con Contabilidad (servicio de pago).
- **CONTADOR opcional:** el ADMIN puede concederle el mismo permiso si la empresa tiene contador. No se exige.
- **Super Admin solo como asistencia** en el alta del cliente, por el soporte remoto existente y con auditoría; no como dueño habitual del dato.
- **Controles para quien no es experto:** vista previa de la factura antes de activar; validación de formato, rango y fecha límite; un CAI con documentos emitidos no se edita (solo se desactiva y se registra otro); aviso al ADMIN cuando queden pocos números o días.

### Empresas sin CAI

El sistema **no exige CAI**: el modo por defecto es comprobante interno, así que se puede ofrecer el servicio a cualquier empresa. El comprobante interno no es documento fiscal; la empresa sigue siendo responsable de emitir sus documentos fiscales por su cuenta (p. ej. talonario de imprenta autorizada). Para enlazarlos, la venta ya admite el número de factura externa (`referenciaFacturaExterna`); se propone mostrarlo en caja como campo opcional.

### Esquema (NEXUS, migración aditiva)

- `fiscal_cai.correlativo_siguiente INT` (inicia en `rango_inicial`; CHECK dentro del rango o `rango_final + 1` = agotado).
- `fiscal_documentos`: índice único `(tenant_id, tipo_documento, numero)` y único `(tenant_id, venta_id)` para tipo 01, para que una venta no tenga dos facturas.
- Sin relleno de ventas históricas: las ventas anteriores quedan como comprobante interno.

### Emisión (en la misma transacción de la venta)

1. Si `facturacion_cai` está encendido, bloquear con `SELECT … FOR UPDATE` el CAI activo de tipo 01 para el establecimiento y punto de emisión de la sucursal (corrige el defecto de SICOFI de correlativo sin transacción).
2. Rechazar la venta si no hay CAI activo, si la fecha supera `fecha_limite_emision` o si el rango está agotado (como SICOFI), con mensaje claro al cajero y aviso previo al ADMIN cuando queden pocos números o días.
3. Asignar número `EEE-PPP-01-NNNNNNNN`, incrementar el correlativo e insertar `fiscal_documentos` con `venta_id`, importes desglosados y el CAI usado.
4. La impresión y la reimpresión leen el CAI, el rango y la fecha límite **del documento emitido**, no del CAI activo (corrige el defecto de SICOFI).
5. Las ventas no se editan después de emitidas; las correcciones van por devolución/nota de crédito (corrige el defecto de SICOFI).

### Documento impreso

- **Con CAI:** «FACTURA», número fiscal, CAI, rango autorizado, fecha límite de emisión, RTN de emisor y cliente, V. Exenta / Exonerada / Gravada 15 % / ISV 15 %, total, cantidad en letras, «Original: Cliente / Copia: Archivo». Formato inspirado en SICOFI (`js/pdfGenerator.js`).
- **Sin CAI:** «COMPROBANTE DE VENTA» con la leyenda de documento no fiscal; texto legal exacto **pendiente**.

### Fuera de la primera entrega

- Notas de crédito con CAI (tipo 06) para devoluciones: segunda fase; mientras tanto, las devoluciones de empresas con CAI requieren nota de crédito emitida fuera del sistema.
- Contingencia sin conexión con CAI: no se pueden asignar números fiscales sin servidor. Para empresas con CAI la contingencia sigue apagada hasta definir D11.
- Exentas/exoneradas: siguen bloqueadas (D3).

## Pruebas requeridas

- PostgreSQL: correlativo sin huecos ni duplicados con ventas concurrentes; rechazo por CAI vencido, agotado o ausente; aislamiento entre empresas; módulo apagado no emite; venta y documento se revierten juntos; reimpresión con el CAI original tras cambiar de lote.
- Navegador: Super Admin enciende y apaga el módulo; el ADMIN/Super Admin registra un CAI; el cajero vende e imprime factura; empresa sin CAI imprime comprobante.
- Unitarias: formato de número y cantidad en letras.

## Estimación

1–2 semanas (esquema + backend + PDF + panel + pruebas), antes de la Fase 3 del plan solo si el primer cliente tiene CAI.
