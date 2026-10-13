# Auditoría QA independiente del ciclo de venta — 2026-10-10

**Base auditada:** `origin/claude/integracion-pos-offline-p1` = `58941e5d` (head de PR #129). Rama de trabajo de esta auditoría: `claude/hopeful-franklin-hb3n48`, creada desde esa base.
**Suite:** `frontend/e2e-real/qa-ciclo-venta.spec.ts`: 38 pruebas. 33 tienen resultado automatizado (una de ellas, DEF-02, es un fallo confirmado marcado como `test.fail`) y 5 son PENDIENTE marcadas con `test.skip`.
**Entorno:** backend NestJS compilado + PostgreSQL 16 temporal aislado (`frontend/e2e-real/run.sh`) + frontend real construido contra ese backend + Chromium 1194. Sin mocks en la suite de venta; no se toca producción ni se ejecutan migraciones productivas.

## Resultado en una línea

Las reglas de negocio críticas del ciclo de venta (ISV, stock reservado, idempotencia, abonos, descuentos con tope, aislamiento entre empresas, sesiones revocadas, concurrencia y cierre de caja) se comportan como se espera en backend real y PostgreSQL. Hay **un defecto confirmado** (idempotencia opcional al crear venta) y **funciones aún no desarrolladas**: cálculo de cambio, reporte por cajero, venta en línea y referencia bancaria del POS.

## Ejecución

```bash
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  bash e2e-real/run.sh e2e-real/qa-ciclo-venta.spec.ts          # solo esta auditoría
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  bash e2e-real/run.sh                                          # suite E2E real completa
```

Resultados observados en esta sesión:

| Ejecución | Resultado |
|---|---|
| Línea base previa (suite E2E real existente) | 29/29 PASS |
| Auditoría QA sola (última ejecución) | 33 PASS · 5 PENDIENTE · 0 FAIL no esperado (DEF-02 como fallo esperado) |
| Suite E2E real completa, ejecución final | **62 PASS · 5 PENDIENTE · 0 FAIL no esperado** |
| Contingencia (14 pruebas) aislada, dos ejecuciones | 14/14 PASS en ambas |
| Contingencia dentro de la suite completa, una de cuatro ejecuciones | 1 fallo (ver **PR-01**, prueba inestable) |
| `tsc --noEmit` sobre el archivo nuevo | sin errores |

## Matriz PASS / FAIL / PENDIENTE

Leyenda — **PASS**: comprobado en backend real y base de datos. **FAIL**: defecto confirmado (la prueba se marca `test.fail` con su ID). **PENDIENTE**: funcionalidad no desarrollada, sin prueba de fallo. **PARCIAL**: cubierto solo en parte; se indica qué falta.

### Prioridades 1–10

| # | Prioridad | Caso | Estado | Prueba / evidencia |
|---|---|---|---|---|
| 1 | Contado efectivo | Total con ISV 15 %, stock reservado, movimiento EFECTIVO en caja | PASS | 1.1 (API + BD) |
| 1 | Contado efectivo | Venta completa desde el POS (código + Enter, "Procesar Venta") | PASS | 14.1 (UI + BD) |
| 1 | Contado efectivo | **Cálculo de cambio (vuelto)** | PENDIENTE | 1.2 `test.skip`. No hay campo de efectivo recibido ni cálculo en `POSPage.tsx`. Solo lo anuncia `modulesCatalog.ts`; no figura como requisito en `REQUISITOS_NEGOCIO_VALIDADO.md`: confirmar |
| 2 | Tarjeta | Se registra como TARJETA y no suma al efectivo esperado | PASS | 2.1 (API + BD) |
| 2 | Tarjeta | Referencia de autorización del POS bancario externo | PENDIENTE | 2.2 `test.skip`. Sin integración ni campo de autorización |
| 3 | Crédito | Suma saldo del cliente y crea cuenta por cobrar | PASS | 3.1 (API + BD) |
| 3 | Crédito | Rechazos: sin cliente, cliente sin crédito, sobre límite; sin venta creada | PASS | 3.2 |
| 3 | Crédito | Venta a crédito desde la interfaz | PARCIAL | Solo API. No se automatizó el cobro a crédito desde la UI |
| 4 | Abonos | Parcial reduce cuenta, cliente y crédito de la venta | PASS | 4.1 |
| 4 | Abonos | Total deja saldo en cero; abono adicional rechazado | PASS | 4.5 |
| 4 | Abonos | Mismo abono reenviado no crea segundo pago | PASS | 4.2 |
| 4 | Abonos | Abono mayor al saldo o con más de dos decimales | PASS | 4.4 |
| 5 | Cotización | Conversión única; segunda conversión rechazada; venta creada | PASS | 5.1 (API + BD) |
| 5 | Cotización | Conversión desde la interfaz, a crédito, cotización vencida | PARCIAL | Solo API |
| 6 | Descuentos | Cajero sin permiso no aplica descuento y no se crea venta | PASS | 6.1 |
| 6 | Descuentos | Cajero con permiso: dentro del tope aplica; por encima exige administrador | PASS | 6.2 |
| 6 | Descuentos | Administrador aplica descuento sin tope de cajero | PASS | 6.3 |
| 7 | Venta en línea | Venta con reserva de stock y entrega posterior | PASS | 12.1 (API + BD): reserva 4 → entrega descuenta existencia física; repetir la entrega no vuelve a descontar |
| 7 | Canal web | Compra desde tienda para cliente final | PENDIENTE | 12.2 `test.skip`. No existe en el código y no aparece en `REQUISITOS_NEGOCIO_VALIDADO.md`; confirmar alcance |
| 8 | Offline | Guardado local, cobro sin conexión, reconexión sin duplicar, reinicio, dos pestañas, conflicto de stock, cierre de caja durante contingencia | PASS | Suite existente `contingencia-real.spec.ts` (14 pruebas, dos ejecuciones aisladas 14/14) |
| 8 | Offline | Sesión vencida con diario offline | FLAKY | Contingencia 11; ver **PR-01** |
| 8 | Offline | Venta offline de tarjeta/crédito o numeración fiscal | PENDIENTE | Bloqueado por diseño en `CONTEXTO_MAESTRO`; no se probó |
| 9 | Cierre de caja | Efectivo esperado solo suma efectivo; sobrante exige nota; cierre repetido idéntico; cierre distinto rechazado | PASS | 15.1 |
| 9 | Cierre de caja | **Faltante** (diferencia negativa) | PARCIAL | Misma ruta de código que el sobrante; no se ejecutó como caso independiente |
| 10 | Reportes | Resumen del día por método coincide con la base de datos (solo administrador) | PASS | 13.1 |
| 10 | Reportes | Cajero no accede al resumen administrativo | PASS | 13.2 |
| 10 | Reportes | Rango de fechas de varios días | PARCIAL | Solo se probó un día |
| 10 | Reportes | **Reporte por cajero** | PENDIENTE | 13.3 `test.skip`. `/operaciones/resumen` no tiene dimensión por cajero |

### Casos negativos

| Caso | Estado | Prueba |
|---|---|---|
| Doble clic en confirmar venta | PASS | 14.2 (UI: una sola venta, stock descontado una vez) |
| Mismo solicitudId enviado dos veces a la vez | PASS | 11.1 (una venta, mismo número) |
| Mismo solicitudId con líneas distintas | PASS | 11.2 (409) |
| **Venta sin solicitudId, reintento** | **FAIL — DEF-02** | 11.3 (`test.fail`, fallo esperado: 201 en lugar de 400) |
| Pérdida de respuesta tras enviar (UI) | PASS | 14.3. La UI pide revisar; no reenvía; una sola venta |
| Pérdida de conexión durante la operación offline | PASS | Contingencia 2, 3, 4, 7 |
| Respuesta tardía del servidor | PENDIENTE | 14.4 `test.skip`. Requiere inyección controlada de latencia |
| Dos cajeros, último producto a la vez | PASS | 10.1 (exactamente una venta; stock reservado 1) |
| Descuentos sin permiso | PASS | 6.1, 6.2 |
| Abonos duplicados por doble clic en la interfaz | PASS | 4.6 (un solo pago, saldo correcto) |
| Manipulación de importes (precio, total, ISV, cantidades, descuento negativo, método inventado, tipo/método incoherente) | PASS | 7.1–7.4 |
| Acceso a operaciones de otra empresa (ventas, cuentas, cotizaciones, cliente ajeno) | PASS | 8.1 (404 y sin escritura) |
| Sesión vencida (token caducado) | PASS | 9.1 (401, sin venta) |
| Token alterado | PASS | 9.2 (401) |
| Usuario desactivado con token vigente | PASS | 9.3 (401; sin venta). Nota: la respuesta es 401, no 403 |

## Defectos clasificados por severidad

### DEF-02 — Idempotencia opcional al crear venta (severidad media)

- **Hecho:** `POST /ventas` acepta una venta sin `solicitudId`. Un reintento sin clave crea una venta nueva y descuenta de nuevo el stock reservado.
- **Evidencia:** prueba 11.3 fallando con `Expected: 400 / Received: 201`; `backend/src/ventas/dto/create-venta.dto.ts:31-34` (`@IsUUID('4') @IsOptional() solicitudId`); `backend/src/ventas/ventas.service.ts` solo aplica la idempotencia con `if (dto.solicitudId)`.
- **Mitigación actual:** la interfaz siempre envía `solicitudId` (`POSPage.tsx`, `pending.solicitudId`). Las pruebas 11.1, 11.2, 14.2 y 14.3 pasan.
- **Riesgo:** cualquier cliente o integración que no envíe la clave puede duplicar ventas en un reintento.
- **Corrección propuesta (no implementada):** hacer `solicitudId` obligatorio en `CreateVentaDto` (quitar `@IsOptional`). Antes de aplicarla, confirmar que ningún flujo de contingencia ni cliente móvil llama a `POST /ventas` sin clave. Al corregir, la prueba 11.3 pasa a FAIL por "passed unexpectedly" y debe quitarse el `test.fail`.

### PR-01 — Prueba de contingencia inestable (prueba, no producto; severidad baja)

- **Hecho:** en una de cuatro ejecuciones de la suite completa, `contingencia-real.spec.ts` prueba 11 (sesión vencida) esperó `PENDIENTE` y recibió `ENVIANDO` justo después de reconectar.
- **Evidencia:** `Expected: "PENDIENTE" / Received: "ENVIANDO"` en `contingencia-real.spec.ts:379`. La misma prueba pasó en las dos ejecuciones aisladas y en la línea base. El archivo se ejecuta antes que la auditoría, así que esta suite no lo causa.
- **Corrección propuesta:** sustituir la lectura inmediata por una espera con reintento (`expect.poll`) sobre el estado que se quiere comprobar.

### Discrepancia de documentación (severidad baja)

- `frontend/src/config/modulesCatalog.ts:15` anuncia "cálculo de cambio" en el POS, pero la función no existe. Se registra como pendiente (1.2). Propuesta: ajustar el texto del catálogo hasta implementar el cambio.

## Pendientes reales (no son fallos)

1. **Cálculo de cambio (vuelto)** en el POS de contado (1.2).
2. **Referencia de autorización del POS bancario** externo para tarjeta (2.2).
3. **Canal web para cliente final** (12.2). La venta en línea con reserva y entrega ya está cubierta (12.1). La semántica de entrega, automática o manual, sigue abierta en `docs/POS_PILOTO_QA_FINAL.md` §7 y debe decidirla el propietario antes de un piloto con ventas reales.
4. **Reporte por cajero**, además de método y fecha (13.3).
5. **Respuesta tardía del servidor** en el POS (14.4).
6. **Pruebas de UI pendientes**: cobro a crédito, cotización convertida y tarjeta desde la interfaz; faltante de caja y rango de fechas de varios días (ver PARCIAL en la matriz).
7. **Estabilizar contingencia 11** (PR-01).
8. **Decidir DEF-02** con los responsables de integraciones (corrección propuesta arriba).

## Límites de esta auditoría

- Entorno local de sandbox: PostgreSQL 16 temporal y Chromium local. No se verificó CI de GitHub ni un despliegue.
- No cubre el descuento de stock en ventas offline, que la validación de piloto ya registra como riesgo abierto (`docs/POS_PILOTO_QA_FINAL.md`, sección de riesgos).
- El entorno tiene Node 22.22.0; el frontend declara `>= 24`. Las pruebas corrieron sin fallos atribuibles a ese aviso, pero no se confirmó en Node 24.
- No se probó datáfono físico, corte de red real del equipo ni varios dispositivos. Las pérdidas de conexión son inyecciones controladas en el navegador; la concurrencia de cajeros usa dos sesiones HTTP contra la misma base, no dos navegadores.
- Las pruebas de sesión vencida y revocada se ejecutan por API. La prueba UI de sesión vencida offline es la contingencia 11 (PR-01).
- Los datos de la auditoría son sintéticos (`QA …`, correos `.invalid`) y se crean en una base temporal que se elimina al terminar `run.sh`.
- Sin merge, sin despliegue, sin migraciones productivas y sin aceptación del cliente.
