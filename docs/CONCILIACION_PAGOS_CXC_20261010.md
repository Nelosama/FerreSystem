# Conciliación de pagos y cuentas por cobrar (2026-10-10)

**Base:** `origin/claude/integracion-pos-offline-p1` (`58941e5d`, integración de #127 y #128, según #129). Rama: `claude/conciliacion-pagos-cxc`. Sin merge, sin migraciones productivas, sin despliegue, sin cambios en `main`.

## 1. Auditoría previa (qué se reutilizó)

| Pieza existente | Decisión |
|---|---|
| Venta con `metodoPago` (EFECTIVO, TARJETA, TRANSFERENCIA, CREDITO) y movimiento de caja por método | Reutilizada. Se añade la autorización antes de confirmar |
| Crédito: cuenta por cobrar, límite, saldo del cliente, idempotencia por solicitud | Reutilizado sin cambios |
| Abonos `POST /operaciones/cuentas/:id/pagos` con caja, auditoría y solicitud | Reutilizado. Se añade la autorización para CxC |
| Cierre de caja con esperado solo en efectivo y totales por método | Reutilizado. Verificado por pruebas existentes |
| Arqueo con diferencia, responsable, fecha y motivo (`notas`) | Reutilizado |
| Conversión de cotización a venta (inserta la venta directamente) | **Hueco corregido**: convertir con tarjeta sin autorización se confirmaba |
| Sin integración bancaria, sin conciliación de POS bancario | Nuevo |

## 2. Matriz de requisitos

| Requisito | Estado | Evidencia |
|---|---|---|
| 1. Tarjeta: solo se confirma con autorización del banco registrada | Terminado (control por registro, no verificación bancaria) | `pagos-bancarios` 20/20; `ciclo-ventas` 16/16; E2E `pos-tarjeta-simulado` 2/2 |
| 1. Referencia y terminal registradas | Terminado | `aprobaciones_bancarias` con método, terminal, referencia, monto, origen, usuario; auditoría `VENTA_CREAR` |
| 1. Cierre separa tarjeta de efectivo | Terminado (existente) | `caja` y `ventas` PostgreSQL |
| 1. Conciliación de movimientos contra el cierre del POS bancario | Terminado (captura manual del total del banco) | `conciliaciones_bancarias`; E2E conciliación |
| 1. Diferencias registradas y auditadas | Terminado | Diferencia con motivo obligatorio; auditoría `CONCILIACION_BANCARIA` |
| 2. Crédito solo para clientes autorizados | Terminado (existente) | Prueba de cliente sin crédito |
| 2. Crédito genera cuentas por cobrar, no efectivo | Terminado | Prueba: movimiento `CREDITO`, CxC 115 |
| 2. Consultar saldo, facturas e historial | Parcial: cajero ve cuentas y abonos; el estado completo con límites sigue solo en ADMIN | `cuentas` CXC y `estado-cuenta` |
| 2. Abonos parciales y totales | Terminado (existente) | `caja` y `credito` PostgreSQL |
| 2. Abonos afectan el medio de pago sin duplicar ventas | Terminado | Abono con tarjeta: un pago, una autorización, un movimiento |
| 3. Efectivo esperado vs contado | Terminado (existente) | `caja` |
| 3. Faltantes y sobrantes con responsable, fecha, monto, motivo | Terminado (existente) | Diferencia y `notas` en el cierre |
| 3. No alterar ventas ni cierres | Verificado | Prueba: conciliación no cambia ventas, autorizaciones ni movimientos |
| 4. Permisos ADMIN, CAJERO, VENDEDOR | Terminado | Conciliación solo ADMIN (servicio y ruta); cajero 403 en E2E |
| 4. Sin duplicar cobros ni abonos | Terminado | Referencia única por empresa, método y terminal; solicitud idempotente |
| 4. Aislamiento entre empresas | Verificado | Prueba: otra empresa no ve autorizaciones ni conciliaciones |
| 4. Auditoría de operaciones sensibles | Terminado | `VENTA_CREAR`, `CUENTA_PAGAR`, `COTIZACION_VENDER`, `CONCILIACION_BANCARIA` |
| 5. No integrar el banco | Cumplido | Ninguna llamada externa |
| 5. POS offline solo efectivo | Cumplido | La contingencia construye ventas en efectivo; no se modificó |
| 5. No tocar la lógica de contingencia offline | Cumplido | `backend/src/contingencia` sin cambios |

## 3. Decisiones que requieren aprobación del dueño

1. **Verificación real del voucher.** El sistema registra lo que el cajero digita tras la aprobación del POS físico. No puede comprobarla con el banco. ¿Se acepta este control, o se exige integración o un archivo de cierre del banco?
2. **Quién registra la conciliación.** Hoy la registra un ADMIN. ¿Se requiere un segundo administrador o un umbral de diferencia?
3. **Tolerancia.** Hoy cualquier diferencia exige motivo de al menos 10 caracteres. ¿Debe haber una tolerancia en lempiras?
4. **Abonos con tarjeta por cajeros.** Hoy el cajero puede registrarlos con autorización. ¿Debe requerir aprobación de ADMIN?
5. **Corrección de conciliaciones.** Hoy una conciliación no se corrige; solo se registra otra en otro día. ¿Debe existir un flujo auditado de corrección?
6. **Reembolsos con tarjeta.** Las devoluciones con tarjeta no tienen autorización de reembolso. Pendiente de decisión.
7. **Voucher duplicado en otra terminal.** Hoy una misma referencia es válida en terminales distintas. ¿Debe bloquearse por empresa?

## 4. Riesgos y límites

- **No hay verificación bancaria.** El control depende de que el cajero registre la autorización real. La conciliación diaria es el control compensatorio.
- **Captura manual del total del banco.** Un error al digitarlo se detecta como diferencia; no se corrige automáticamente.
- **Datos de tarjeta.** No se guardan números de tarjeta, solo referencia y terminal.
- **Reconciliación por día de negocio.** Usa la zona `America/Tegucigalpa`. Una venta a las 23:59 cae en el día correcto.
- **Migración aditiva.** `20261012000000_conciliacion_pagos_bancarios` crea dos tablas. Debe revisarla un DBA antes de `migrate deploy`. Las listas explícitas de migraciones de pruebas (`ventas`, `reportes-zona-horaria`) ya la incluyen.
- **Coordinación con #132 (seguridad).** Este PR toca `cotizaciones.controller.ts` solo en el método `convertir` (un parámetro). El PR de seguridad cambia las cabeceras de la clase; no hay solapamiento de líneas. Al integrar, revisar ese archivo.
- **POSPage compartido.** Se añadió el bloque de autorización (campos, validación y payload) sin tocar la lógica de recuperación ni la de contingencia. El agente offline debe revisar el cambio al integrar.
- **Sin verificación en dispositivo.** No hay prueba con POS bancario físico ni con impresora.

## 5. Pruebas (2026-10-10, entorno local)

| Suite | Resultado |
|---|---|
| Backend unitarias | 345/345 |
| Integración PostgreSQL 16 (cadena completa, usuario no root) | 23 archivos, 392 aprobadas, 1 omitida |
| `pagos-bancarios.postgres.integration.ts` (nuevo) | 20/20 |
| Frontend unitarias | 225/225 |
| Playwright Chromium | 123/123 (incluye 5 E2E nuevas: abono con tarjeta, conciliación, negativo de cajero, POS con tarjeta sin autorización y efectivo sin campos) |
