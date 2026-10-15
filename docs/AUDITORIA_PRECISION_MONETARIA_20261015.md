# Auditoría de precisión monetaria — Jowa System

Fecha: 15 de octubre de 2026, America/Tegucigalpa. Base: `main` actualizado, `74ba4dcc0ade29cd4800f95f9348d31d238444f0`. Rama única: `codex/auditoria-precision-monetaria`.

**Recomendación: NO MERGE.** Las correcciones verificadas están listas para revisión, pero persisten diferencias monetarias reproducibles en `POSPage.tsx`, protegido por la instrucción de no modificar archivos del PR #165. No se hizo merge ni despliegue.

Se leyó el contexto vigente y se consultaron Git y los PR abiertos. Los 28 archivos de #165 se excluyeron de las modificaciones, incluido `CONTEXTO_MAESTRO.md`; por eso la bitácora de esta auditoría queda en este informe separado. No hay cambios de interfaz, estilos, navegación, marca, permisos, contratos API, esquema ni migraciones.

**Regla existente conservada.** HNL; cantidades con hasta dos decimales; subtotal redondeado por línea; mitad hacia arriba para valores no negativos; ISV 15 % sobre subtotal menos descuento; total = base + ISV. Está explícita en `backend/src/common/dinero.ts`, `redondeo-monetario.ts` y los vectores compartidos con `frontend/src/offline/money.ts`. No se creó una regla fiscal. El POS en línea no recibe efectivo entregado ni calcula cambio; el modo de contingencia sí tiene esos campos. CXC rechaza un abono superior al saldo.

**Defectos corregidos y evidencia.**

| Defecto | Reproducción anterior | Corrección y regresión |
| --- | --- | --- |
| Falsos rechazos de importes válidos altos | `aCentavos(16777216.01)` y `aCentesimas(16777216.01, 'Precio')` fallaban. `decimal(1234567890.12, 'Pago', true)` también: multiplicar por 100 amplificaba el residuo binario. Ambos valores caben en `DECIMAL(12,2)`. | Validación en unidades y conversión desde la representación de dos decimales; tolerancias nominales anteriores conservadas. Cinco regresiones fallaron antes y pasaron después. Prueba HTTP/PG de venta y abono por L 1,234,567,890.12 verifica los valores persistidos. |
| Límite porcentual permite un centavo extra | Subtotal L 9,900,000,050.01 y límite 99.99 %: el máximo exacto redondeado es L 9,899,010,050.00; el servidor aceptaba L 9,899,010,050.01 por un producto intermedio inseguro. | Producto y división del límite en `BigInt`, con la misma fórmula de mitad hacia arriba. Regresión roja/verde del límite exacto y del centavo adicional. |
| Diferencia ficticia en arqueo | 1000 pares de movimientos EFECTIVO +L 1,000,000,000.01 / −L 1,000,000,000.00: resumen mostraba L 10.01 esperados y L 10.00 por método. Cerrar con L 10 sin nota era rechazado. | Acumulación de centavos con `BigInt`; cuatro pruebas de resumen/cierre, incluida suma bruta superior a `MAX_SAFE_INTEGER`. HTTP/PG inserta 2000 movimientos NUMERIC: con apertura L 100, cierre L 110 y diferencia cero. |
| Confirmación local de venta con total cero | Precio L 0.01 × cantidad 0.01 redondea a total cero. La pantalla offline permitía llegar al diario y confirmar, aunque el backend rechaza `IMPORTE_INVALIDO`. | El diario rechaza antes de abrir IndexedDB. Usa el error y el manejo asíncrono existentes; no se cambió la pantalla. Regresión roja/verde en `offline-logica.test.mjs`. |

La conversión sigue rechazando milésimas reales, no finitos y valores fuera del rango seguro. El resumen conserva números en la API: si una suma bruta final supera la precisión representable por `Number`, ese contrato limita su representación; el neto se calcula exactamente antes de convertir y los importes persistibles de `DECIMAL(12,2)` caben en el rango seguro.

**Defectos pendientes en archivos protegidos.** Confirmados sobre el componente real transpiliado, sus handlers y el formateador real, con React/API simulados en VM; los resultados esperados proceden del módulo monetario real del backend. No se presentan como pruebas de navegador.

| Caso en `frontend/src/pages/POSPage.tsx` | Resultado actual | Resultado según regla existente |
| --- | --- | --- |
| L 4.02 × 0.25 | Subtotal L 1.00; pantalla total L 1.15 | Backend subtotal L 1.01; total L 1.16 |
| L 1.50 sin descuento | Pantalla ISV L 0.22; total L 1.72 | Backend ISV L 0.23; total L 1.73 |
| L 0.05 con descuento 70 % | Pantalla total L 0.02; se envía descuento L 0.04 | Backend factura L 0.01 con el descuento recibido |
| L 0.29 con descuento 50 % | Se envía L 0.14 de descuento; se factura L 0.17 | Descuento exacto L 0.15; total L 0.16 |
| L 4.02 × 0.25 más L 1.50 | Pantalla total L 2.88 | Backend total L 2.89 |

Las expresiones actuales se pueden reproducir con Node sin depender del arnés:

```js
Math.round(4.02 * 0.25 * 100) / 100; // 1.00
Math.round(1.50 * 0.15 * 100) / 100; // 0.22
Math.round(0.05 * (70 / 100) * 100) / 100; // 0.03: descuento mostrado
Math.round(0.05 * 70) / 100; // 0.04: descuento enviado
Math.round(0.29 * 50) / 100; // 0.14
```

Corresponden a los cálculos de `POSPage.tsx` alrededor de las líneas 224–237 y al descuento del payload alrededor de la 369. No se cambió el backend para imitar esos errores. Requieren corrección coordinada posterior en ese archivo y nuevas regresiones de interfaz.

**Casos obligatorios comprobados.**

| Caso | Evidencia |
| --- | --- |
| L 0.10 + L 0.20 y múltiples productos | HTTP/PG: subtotal 0.30, ISV 0.05, total 0.35; VM del POS coincide en este caso. |
| Cantidades decimales | Regresión existente HTTP/PG: 2.5 × 25.99 → subtotal 64.98, ISV 9.75, total 74.73. Diferencia de 4.02 × 0.25 documentada arriba. |
| Descuentos porcentuales | Pruebas del límite exacto/centavo adicional y evidencia de porcentajes 50/70 del POS. |
| Impuestos y redondeo | Vectores compartidos, mitad hacia arriba y regresión 64.975; diferencia de ISV sobre 1.50 documentada arriba. |
| Pagos exactos y parciales | HTTP/PG: abonos 0.10 y 0.25 saldan 0.35, sin residuo en venta, cliente ni cuenta. |
| Pago superior al total y cambio | Contingencia, lógica real: total 0.35 / recibido 1.00 → cambio 0.65; recibido 0.35 → cambio 0; recibido 0.34 bloqueado por faltante 0.01. CXC: sobrepago 0.36 sobre saldo 0.35 rechazado sin pago ni movimiento adicional. |
| Valores elevados | Venta/abono alto HTTP/PG y arqueo de 2000 movimientos; VM: 1,234,567.89 × 2.75 → subtotal 3,395,061.70 y total 3,904,320.96. |

**Validación ejecutada.** Node 24.19.0, Prisma 6.4.1 regenerado desde el esquema existente y PostgreSQL 17.11 temporal como usuario sin privilegios. Datos sintéticos, sin leer ni conectar bases productivas.

- Backend unitarias completas finales: 458/458 en 47 archivos; selección final de ventas/operaciones/dinero: 107/107 en 12 archivos, incluida en la completa.
- Frontend `npm test`: 37/37 archivos aprobados; ejecución directa final de lógica offline: 18/18; protección Vercel: 9/9. No se suman estos conteos solapados.
- HTTP/PostgreSQL: 187/187 en siete archivos: `ventas`, `credito`, `pagos-bancarios`, `caja`, `cxc-cxp-balance`, `cobro-entrega` y `redondeo-cobro`.
- Builds backend y frontend aprobados. Lint de archivos modificados sin errores; backend informa avisos de `strictNullChecks` desactivado. `git diff --check` y control de migraciones aprobados, cero migraciones nuevas.
- Los primeros intentos de pruebas HTTP y del control de migraciones fallaron por restricciones de sockets/procesos del sandbox; se repitieron con el permiso de ejecución requerido y pasaron. No motivaron cambios de aplicación.
- No se ejecutó aceptación física ni navegador real en esta auditoría. La evidencia VM es complementaria a HTTP/PG, no los sustituye.

**Archivos modificados.**

- Código: `backend/src/common/{huella-solicitud,redondeo-monetario}.ts`, `backend/src/operaciones/{ledger,operaciones.service}.ts`, `frontend/src/offline/journal.ts`.
- Regresiones: los dos `.spec.ts` monetarios de `common`, `backend/src/operaciones/resumen-caja-precision.spec.ts`, `backend/test/redondeo-cobro.postgres.integration.ts`, `frontend/test/offline-logica.test.mjs`.
- Publicación sin preview: `frontend/vercel.json` excluye exclusivamente esta rama; `frontend/test/vercel-pilot-guard.test.mjs` verifica la exclusión. Es necesario para respetar «sin despliegue» al publicar el PR.
- Este informe. No se modificó ningún archivo de #165; lista contrastada nuevamente antes de publicar.

**Bitácora.** Lectura de contexto, fetch y comprobación de main/PR actuales; auditoría paralela de ventas/POS/pagos/caja; reproducciones sobre implementación real; regresiones rojas; correcciones mínimas; pruebas verdes unitarias y HTTP/PG; compilación, lint y revisión independiente del diff. Publicación de un solo PR en borrador, pendiente de resolver las discrepancias protegidas y de revisar sus checks. Ninguna fusión ni operación productiva.
