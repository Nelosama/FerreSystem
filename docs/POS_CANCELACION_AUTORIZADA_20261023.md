# Cancelación POS y anulación administrativa — 2026-10-23

Rama independiente `codex/pos-cancelacion-autorizada`, creada desde `main` `b60b49b309cbdadf522a87e773fd6241323f864a`. Sin merge, despliegue, cambios de dependencias, esquema o migraciones. No se escribe en producción. PR ajenos #180 y #192 inspeccionados y conservados.

## Causa comprobada y punto de confirmación

`POSPage` persistía dos cosas diferentes: un borrador local que nunca se envió, y una solicitud `ferre_pending_sale:<tenant>:<usuario>` guardada antes de `POST /ventas`. Solo ofrecía revisar, corregir o reintentar esa solicitud. Una validación rechazada o una operación abandonada podían dejar el POS retenido indefinidamente.

El pendiente no demuestra que falte cobrar: si se pierde la respuesta, la venta puede estar confirmada. `VentasService.create` confirma cuando hace **commit de su transacción**, que incluye número, venta `COMPLETADA`, reserva o salida física, crédito, movimiento de caja, eventos y auditoría. El modo BODEGA reserva; MOSTRADOR entrega y descuenta. Una consulta `NO_REGISTRADA` no impide que un POST retrasado se registre después.

Ya existían solicitudes de devolución, decisiones ADMIN y movimientos compensatorios. Faltaban el bloqueo de autoautorización y la exigencia de autorización independiente al revertir el total por el endpoint directo ADMIN.

## Solución

- **Borrador:** «Cancelar venta», confirmación con foco en Cancelar y limpieza de carrito, cliente, descuento, método, autorización bancaria, efectivo, proveedor, avisos y recuperación. Al recargar se ofrecen «Continuar venta» y «Descartar venta». Funciona sin conexión cuando la pantalla ya está cargada. No crea documento, numeración ni movimientos en el servidor; un borrador exclusivamente local no genera auditoría financiera ficticia.
- **Solicitud enviada:** `POST /ventas/solicitudes/:id/descartar` verifica identidad y permiso `pos.vender` dentro de la transacción. Comparte los bloqueos de tenant y solicitud con `create` y la consulta. Si ya existe la venta propia, devuelve `REGISTRADA` con el comprobante; nunca la elimina. Si pertenece a otro actor, devuelve conflicto sin exponerla.
- **Descarte durable:** registra `VENTA_DESCARTAR` una sola vez en `auditoria_operaciones`, usando la identidad derivada por tenant. La consulta devuelve `DESCARTADA`; `create` rechaza su reutilización incluso ante POST retrasado. No hace falta crear una venta vacía o consumir numeración. La UI conserva la recuperación hasta confirmar el resultado y reconoce también el descarte tras un reinicio o una respuesta perdida.
- **Venta confirmada:** en Devoluciones se puede seleccionar «Solicitar anulación de toda la venta», indicar motivo, método y destino físico. Se reutilizan `solicitudes_devolucion`, su JSON de comando (`anulacion: true`) y su documento compensatorio. ADMIN decide desde su sesión, distinta de la del solicitante. Ningún formulario recibe contraseñas del administrador. Autorizar por sí solo no mueve saldos; el solicitante ejecuta desde su caja conforme a las reglas existentes.
- **Backend:** rechaza autoautorización y ejecución con autorizador idéntico al solicitante; revalida rol y actividad del Admin al ejecutar. La ruta directa ADMIN sigue admitiendo devoluciones parciales históricas, pero rechaza completar la reversión total sin solicitud autorizada, aunque se omita `anulacion` o existan devoluciones anteriores.
- **Integridad:** bloqueos transaccionales, identidad idempotente, control de cantidades y revalidación al autorizar/ejecutar. Dos solicitudes de anulación total activas no pueden coexistir. La venta original conserva número, estado y contenido; las devoluciones compensan caja/crédito/reservas/existencias conforme a los destinos existentes. Los pagos y comprobantes históricos no se borran.
- **Trazabilidad:** solicitante, autorizador, motivo solicitado y de decisión, fechas, venta original y resultado permanecen enlazados. La auditoría de ejecución incluye ambos actores, venta, motivo y marca de anulación.

## Archivos modificados

Código:

- `backend/src/ventas/ventas.controller.ts`
- `backend/src/ventas/ventas.service.ts`
- `backend/src/operaciones/operaciones.dto.ts`
- `backend/src/operaciones/operaciones.service.ts`
- `frontend/src/pages/POSPage.tsx`
- `frontend/src/pages/DevolucionesPage.tsx`
- `frontend/scripts/vercel-ignore.sh` (exclusión de preview de esta rama).

Pruebas:

- `backend/test/helpers/devolucion-autorizada.ts`: flujo real de dos cuentas sintéticas, sin sustituir servicios.
- `backend/test/devoluciones-cxc.postgres.integration.ts`: siete regresiones de descarte, concurrencia, permisos, anulación, rechazo y auditoría; fixtures de reembolso por el flujo autorizado.
- `backend/test/{caja,centinela-entregas-148,ciclo-ventas,cobro-entrega,credito,piloto-flujo-completo,ventas}.postgres.integration.ts`: adaptación de reversiones completas a autorización independiente; conserva negativos directos y verificaciones monetarias/de inventario.
- `frontend/test/devoluciones-recovery.test.mjs`: solicitudes ajenas para decisiones y regresión de autoautorización oculta.
- `frontend/e2e/pos-tarjeta-simulado.spec.ts`: cinco casos nuevos de cancelación, recuperación, red y respuesta perdida.
- `frontend/e2e-real/pos-cancelacion-real.spec.ts`: cierre/reapertura y ciclo de anulación con dos sesiones, API/JWT/PostgreSQL reales.
- `frontend/e2e-real/faro-auditoria-integral.spec.ts`: fixture de lectura con devolución parcial ADMIN; anulación completa cubierta por el nuevo recorrido.

Documentación: este informe y `docs/CONTEXTO_MAESTRO.md`.

## Pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| Backend unitarias | 581/581, 57 archivos |
| Frontend unitarias | 523/523 |
| PostgreSQL dirigido (8 suites) | 194 aprobadas, una omitida opt-in en esa ejecución |
| POS con API simulada, Chromium local | 12/12 |
| Navegador + NestJS + PostgreSQL reales: cancelación y POS/cajeros | 5/5 |
| FARO integral con API real | 28 aprobadas, 2 omitidas heredadas |
| Backend y frontend: build y lint | Correctos; avisos heredados |
| Guard de migraciones | Correcto, 0 migraciones nuevas |
| Deriva Prisma/PostgreSQL del arnés real | Sin deriva |

La regresión PostgreSQL general se registra al terminar en el PR y en el contexto maestro. No se confunde una pasada inicial fallida con aprobación completa.

Entorno: PostgreSQL 17.11 extraído fuera del repositorio y ejecutado por el usuario sin privilegios; bases temporales en loopback. Cliente Prisma regenerado localmente. Chromium del sistema, porque la descarga del navegador Playwright previsto devuelve 403 por política de red. Sin modificar emulación, permisos ni controles de negocio para hacer pasar las pruebas.

Las primeras pasadas detectaron fixtures que aún esperaban reversión total directa, un conflicto de puerto entre arneses y selectores propios que dependían del estado previo/cierre del modal; se corrigieron arneses y expectativas, conservando aserciones de negocio. Los errores sintéticos de auditoría y permisos en logs son controles negativos deliberados.

## Límites y riesgos pendientes

1. Una solicitud con resultado desconocido requiere conexión para descartarse de forma segura. Ante un fallo de red se conserva la identidad y se puede reintentar. Los borradores nunca enviados sí se descartan offline. No se borra silenciosamente una venta que pudo cobrarse.
2. No certificado en PWA instalada, Safari/iPhone o hardware físico. Cierre/reapertura de pestaña y persistencia local sí verificados en Chromium. Una recuperación local corrupta continúa requiriendo conciliación administrativa; no se borra evidencia potencial de cobro.
3. La anulación total se representa mediante la devolución compensatoria existente, sin cambiar la venta original a `ANULADA`. La emisión fiscal con CAI/notas de crédito y los cierres contables pertenecen al PR #180, aún separado. No se certifica cumplimiento fiscal por emitir una devolución operativa.
4. Ventas con devoluciones anteriores se tramitan como devoluciones de remanentes. Una misma línea entregada parcialmente requiere destinos separados por tramos conforme al flujo existente; la anulación total simplificada no inventa un destino único para mercancía entregada y reservada.
5. La marca durable de descarte vive en la auditoría. No debe purgarse `VENTA_DESCARTAR` mientras pueda reintentarse su identidad. La consulta usa el índice de tenant existente; medir crecimiento antes de incorporar un índice específico. Un rollback o convivencia con backend antiguo no respeta la marca: evitar versiones mixtas cuando se habilite el flujo.
6. Si un ADMIN solicita una anulación, necesita otro ADMIN del mismo negocio; no se permite aprobarse a sí mismo ni usar Super Admin como atajo. Las credenciales compartidas por personas no se pueden detectar técnicamente: el sistema exige identidades/sesiones separadas y conserva ambas.

Recomendación final y checks del SHA publicado: ver PR. Sin merge ni despliegue.

Firma de integridad PostgreSQL: **NEXUS**.
