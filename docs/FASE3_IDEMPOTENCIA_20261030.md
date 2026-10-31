# Fase 3 — idempotencia, doble envío y doble cobro

## Base y alcance comprobados

Consulta directa a GitHub y `git ls-remote origin refs/heads/main` el 2026-10-30: main `a4ab291aba1a8574e9c66d59b044e35f938bda38`. Rama nueva y única: `fix/fase3-idempotencia-20261030`, creada desde `origin/main` después de fetch. No se incorporan ramas de otros PR.

| PR | Estado observado | Head |
| --- | --- | --- |
| #225 | Abierto, borrador, sin merge | `4a13423c752293ddad1f249746d1c374a8f99201` |
| #226 | Abierto, listo para revisión, sin merge | `ba41159ff416f495fb0dc18eaf44ac0648308bcf` |
| #227 | Abierto, borrador, sin merge | `4cbffb032ed939359b6614b186ab2c24df59fefe` |
| #228 | Abierto, borrador, sin merge | `1d5675aeebe18431f2a6e71316a043826ed5f434` |
| #229 | Abierto, borrador, sin merge | `e1139b049cc4ecfe06ccd5859ac7be40b9f70d0d` |

Se revisaron el informe vigente y las sondas de #225 en su head: sus ocho pruebas de concurrencia usan **solicitudes distintas**. Esta fase complementa esa evidencia con reenvíos de la misma identidad y cambios de contenido.

Lectura: `POSPage.tsx` (bloqueo inmediato con ref, persistencia del pendiente antes de POST, consulta de solicitud y conservación ante error), `api.ts` (timeout 30 s), `authInterceptors.ts` (reenvío del mismo config tras 401), `ventas.service.ts`, `operaciones.service.ts`, `ledger.ts`, `aprobaciones-bancarias.ts`, `entregas-core.ts`, esquema y migraciones de operaciones y autorizaciones bancarias. Sin modificaciones de frontend, contingencia offline ni guards multi-tenant.

## Hallazgos reproducidos y correcciones

1. **Venta: referencia/terminal bancaria omitidas en la comparación del reintento.** La huella v2 no incluye `pagoElectronico`. Tras confirmar una venta con tarjeta, reenviar el mismo `solicitudId` con otra referencia o terminal devolvía éxito y el comprobante anterior. Ahora se compara la autorización normalizada contra el registro durable de `aprobaciones_bancarias` dentro de la transacción, antes de devolver el reintento. Datos diferentes producen conflicto; mayúsculas y espacios exteriores normalizados conservan el reintento. No se cambian las huellas históricas.
2. **Movimiento manual: referencia omitida.** Reenviar su identidad con otra referencia devolvía éxito conservando silenciosamente la anterior. Ahora la comparación incluye referencia y responsable, además de caja, tipo, monto y concepto.

Las dos regresiones se ejecutaron primero contra el producto de main, con pruebas nuevas en el árbol: **2 fallidas por aceptar un resultado donde se esperaba conflicto**, 61 pruebas no seleccionadas. No se usaron marcas de fallo esperado ni se relajaron aserciones.

## Persistencia y efectos

Las operaciones revisadas ya usan transacciones y `lockTenant`; las ventas además bloquean la identidad de solicitud. La identidad se conserva en la BD (ID derivado, huella o evento/auditoría según operación), no en memoria del proceso. Existen PK y restricciones únicas de pagos/recepciones por tenant y solicitud, autorizaciones por tenant/método/terminal/referencia y una caja abierta por usuario. No se necesita migración para estos defectos.

- Misma solicitud concurrente o reenviada después del commit: misma operación, sin repetir reserva, saldo, movimiento de caja ni aprobación.
- Misma solicitud con contenido diferente: conflicto sin escrituras adicionales.
- Solicitud nueva: operación nueva, sujeta a stock, saldo y unicidad del comprobante bancario. No se deduplica por importe o por ventana temporal.
- Fallo tardío al registrar una autorización ya usada: rollback de venta, reserva, correlativo y efectos asociados; la solicitud fallida permanece no registrada y puede reenviarse correctamente. La regresión comprueba una sola venta, una sola traza de creación, un movimiento de caja, stock/correlativo originales y recuperación por solicitud; después permite otra autorización con la identidad fallida.
- Abonos: regresión ampliada a duplicados simultáneos, respuesta perdida tras commit y cambio de monto; un solo pago, autorización y movimiento, con saldo exacto.

La pérdida de respuesta se simula ignorando el resultado confirmado y reenviando el comando; no se afirma una prueba de timeout real de navegador. La suite de ventas también prueba reinicio abrupto de PostgreSQL y recuperación durable.

## Archivos

- `backend/src/ventas/ventas.service.ts`: compara autorización bancaria persistida.
- `backend/src/operaciones/operaciones.service.ts`: completa comparación del movimiento manual.
- `backend/test/ventas.postgres.integration.ts`: identidad bancaria y rollback tardío/reintento.
- `backend/test/caja.postgres.integration.ts`: concurrencia/reenvío, referencia distinta y solicitud nueva.
- `backend/test/pagos-bancarios.postgres.integration.ts`: abono concurrente y reenvío tras respuesta perdida.
- Este informe. `docs/CONTEXTO_MAESTRO.md` se conserva por instrucción expresa del encargo, que prevalece sobre su actualización requerida por AGENTS.md.

## Verificación

SHA de código y pruebas: `dbf163a4092f284262ca297121b31f2ccea8a749`. Ejecuciones locales del 2026-10-30, Node 24.19.0, PostgreSQL 17.11, Prisma 6.4.1. El commit documental posterior no cambia código ni pruebas.

Desde `backend/`:

```bash
# Generación previa: correcta (no conecta a ninguna base).
npx prisma generate

# En el SHA dbf163a4092f284262ca297121b31f2ccea8a749:
PG_BIN=/workspace/pg-test/root/usr/lib/postgresql/17/bin \
LD_LIBRARY_PATH=/workspace/pg-test/root/usr/lib/x86_64-linux-gnu \
npx vitest run --config vitest.config.integration.ts \
  test/ventas.postgres.integration.ts test/caja.postgres.integration.ts \
  test/pagos-bancarios.postgres.integration.ts test/cxc-cxp-balance.postgres.integration.ts \
  test/ciclo-ventas.postgres.integration.ts test/compras.postgres.integration.ts \
  test/compras-contado.postgres.integration.ts test/devoluciones-cxc.postgres.integration.ts \
  test/cobro-entrega.postgres.integration.ts
npm test
npm run build
npm run lint
```

| Comando | Resultado real |
| --- | --- |
| Integración PostgreSQL dirigida | 9 archivos, **226 aprobadas / 0 fallidas / 1 omitida**, 53.45 s |
| `npm test` | 76 archivos, **836 aprobadas / 0 fallidas**, 49.84 s |
| `npm run build` | Código de salida 0 |
| `npm run lint` | Código de salida 0; avisos existentes de variables sin usar y `strictNullChecks` |
| `git diff --check` | Correcto |

La omisión existente es `ciclo-ventas`: Chromium real de conversión/selección de método, condicionado a `REAL_SETTINGS_BROWSER=1`. No se activó ni se declara probado. Las pruebas nuevas se ejecutan sin omisiones. Los mensajes de errores de clientes/contingencia de los logs corresponden a casos negativos esperados; no hay fallos de suite. No se ejecutó la suite PostgreSQL completa ni navegador real.

Contraprueba sobre main más las pruebas nuevas, antes de corregir producto:

```bash
PG_BIN=/workspace/pg-test/root/usr/lib/postgresql/17/bin \
LD_LIBRARY_PATH=/workspace/pg-test/root/usr/lib/x86_64-linux-gnu \
npx vitest run --config vitest.config.integration.ts \
  test/ventas.postgres.integration.ts test/caja.postgres.integration.ts \
  -t 'identidad de venta incluye|movimiento manual: duplicados'
```

Resultado: 2 fallidas por el defecto esperado, 61 no seleccionadas. Una pasada intermedia de cinco archivos dio 117 aprobadas y 1 omitida; la ejecución final de nueve archivos de arriba incluye la ampliación definitiva de abonos.

## Riesgos y decisiones pendientes

- No existe integración de cargo con el banco: se valida la autorización registrada manualmente. Esta fase no certifica que el banco haya cobrado ni puede revertir un cargo externo.
- Una venta electrónica histórica sin su autorización durable devuelve conflicto al reintentar: no se inventa una autorización ni se registra otro cobro. Requiere revisión humana del comprobante original si aparece ese caso; no se altera información histórica.
- Identidades nuevas en efectivo con stock/saldo suficiente representan operaciones nuevas. Deducir que son un doble cobro por coincidir cliente, monto o tiempo requeriría una regla de negocio; no se introduce esa regla.
- Algunas operaciones relacionadas usan huellas del JSON literal: reordenar sus claves puede producir conflicto conservador, sin duplicar efectos. No se cambia el algoritmo compartido ni sus huellas históricas en esta fase.
- El reenvío de la solicitud online está cubierto en servicio y PostgreSQL. La cola/reconciliación offline y la UX quedan a Claude; no se certifican aquí.
- Las decisiones fiscales D1–D11, documento/CAI y aceptación del piloto permanecen pendientes; estos cambios no requieren una regla contable nueva ni resuelven esas decisiones.
- No se ejecutó merge, despliegue, acceso a bases reales, SMTP ni cambios de hosting/infraestructura. PostgreSQL 17.11 se extrajo en el workspace para pruebas, sin instalar un servicio compartido. Cada suite crea y elimina su clúster temporal con datos sintéticos y no toma la URL de producción.

Revisión de integridad de persistencia: **NEXUS**. Sin cambios de esquema ni migraciones.
