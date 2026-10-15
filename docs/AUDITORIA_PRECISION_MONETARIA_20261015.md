# Auditoría de precisión monetaria — PR #166

Fecha: 2026-10-15 UTC. Repositorio: `Nelosama/FerreSystem`. Única rama publicada: `codex/auditoria-precision-monetaria`. Base: `main` `74ba4dcc`; conserva como ancestro el commit original `463efae8` y sus cuatro correcciones.

**Estado: borrador, NO MERGE por ahora.** #165 fue comprobado antes de modificar archivos compartidos y sigue abierto en `cc29135a`, sin integrar. `origin/main` continúa en `74ba4dcc`. No se fusionó #165 ni se incorporó anticipadamente su rama. Cuando el responsable lo integre, falta actualizar esta misma rama desde `main`, resolver cualquier conflicto conservando ambas funcionalidades y repetir la validación conjunta. No se han creado ramas ni PR adicionales, hecho merge de PR, desplegado ni conectado a datos productivos.

## Correcciones

Las cuatro correcciones originales permanecen:

| Defecto original | Corrección conservada |
| --- | --- |
| Importes válidos altos rechazados por residuo binario (L 16,777,216.01 y L 1,234,567,890.12) | Conversión desde representación decimal de dos posiciones y validación en unidades. |
| Límite 99.99 % sobre L 9,900,000,050.01 aceptaba un centavo extra | Producto y división del límite con `BigInt`. |
| 1000 pares +L 1,000,000,000.01 / −L 1,000,000,000.00 inventaban faltante de caja | Acumulación y neto en centavos con `BigInt`. |
| Venta offline de precio 0.01 × cantidad 0.01 se confirmaba con total cero | Rechazo en el diario antes de abrir IndexedDB. |

La continuación corrige las diferencias del POS que mantenían abierto el bloqueo monetario:

| Caso | Antes | Resultado corregido |
| --- | --- | --- |
| L 4.02 × 0.25 | Subtotal 1.00, total 1.15 | Subtotal 1.01, ISV 0.15, total 1.16. |
| L 1.50 | ISV 0.22, total 1.72 | ISV 0.23, total 1.73. |
| L 0.05 con 70 % | Descuento mostrado 0.03 frente a 0.04 enviado; total mostrado 0.02 | Descuento mostrado/enviado 0.04; total 0.01. |
| L 0.29 con 50 % | Descuento enviado 0.14 y total 0.17 | Descuento 0.15 y total 0.16. |
| L 4.02 × 0.25 + L 1.50 | Total mostrado 2.88 | Subtotal 2.51, ISV 0.38, total 2.89. |

`POSPage.tsx` usa `utils/posMoney.ts` tanto para la pantalla como para el payload de cobro/reintento. Este adaptador reutiliza `offline/money.ts`; el backend ya usa las mismas reglas en `common/dinero.ts`. El descuento se calcula sobre el subtotal redondeado por línea con un cociente entero; se conservan todos los decimales del porcentaje, incluida notación exponencial. Las líneas del carrito, comprobante y datos enviados al PDF usan el subtotal fiscal redondeado. El comprobante identifica el descuento y su subtotal de respaldo conserva el significado bruto de la API.

La auditoría de devoluciones detectó otro defecto real: 12 unidades a L 0.21 facturan L 2.90; devolver 9 producía L 2.17 por el cociente binario, frente a L 2.18 con mitad hacia arriba. `planDevolucion` ahora mantiene pesos exactos en diezmilésimas y el reparto acumulado en `BigInt`; resta en centavos lo ya devuelto. La segunda devolución devuelve L 0.72 y completa L 2.90. Con un abono previo de L 1.01, la primera cancela L 1.89 de crédito y reembolsa L 0.29; la segunda reembolsa L 0.72. El saldo de cuenta y cliente queda en cero y los reembolsos suman exactamente lo pagado.

**Reglas comerciales y esquema:** se conservan HNL, ISV 15 % sobre subtotal menos descuento, redondeo por línea y mitad hacia arriba; devoluciones proporcionales acumuladas que cancelan primero la deuda y reembolsan el excedente pagado. Sin cambios de contratos, permisos, esquema ni migraciones. No se corrigen datos históricos automáticamente. La exclusión Vercel de esta rama se conserva.

## Pruebas y reproducibilidad

Entorno: Node 24.19.0, Prisma 6.4.1 regenerado y PostgreSQL 17.11 extraído en una carpeta temporal, ejecutado como usuario no privilegiado. Solo bases aisladas y datos sintéticos. Chromium del entorno (`/usr/bin/chromium`).

- Backend unitarias completas: **458/458**, 47 archivos; conserva las regresiones de las cuatro correcciones originales.
- Frontend completo: **321/321**. Ejecución posterior de los tres archivos POS/recuperación/dinero: **51/51** (solapadas con la completa).
- Prueba diferencial: **10.000 carritos** con varios productos, cantidades decimales y descuentos; coincidencia de líneas, subtotal, ISV y total entre frontend, backend y offline. Casos adicionales de porcentaje con tres decimales, notación exponencial e importe alto.
- Regresiones rojas antes de corregir: cuatro casos del componente POS y devolución HTTP/servicios con PostgreSQL (2.17 frente a 2.18); verdes tras corregir. La devolución con abono previo también pasa en PostgreSQL real.
- Integración final PostgreSQL real: **241/241 en 9 archivos**, con las suites listadas en el comando siguiente (ventas, crédito, pagos bancarios, caja, CxC/CxP, cobro/entrega, devoluciones, contingencia y redondeo/cobro).
- Navegador real, 5 archivos: **10 aprobadas, 1 fallida, 13 no ejecutadas** por la secuencia serial de contingencia. Pasan crédito/abonos (6), caja (1), cobro/entrega (1), contingencia en línea (1) y la nueva prueba POS con sus cinco casos (1).
- **Fallo pendiente reproducido también en la base `463efae8`:** `contingencia-real.spec.ts:192`, tras `setOffline(true)` y recarga, la aplicación muestra «En línea» y no aparece «● Sin conexión». Base aislada: 1 aprobada/1 fallida; mismo Chromium 151.0.7922.173. No se atribuye a las nuevas correcciones ni se presenta la suite offline como aprobada. No se debilitó ni omitió la prueba.
- Builds backend y frontend correctos; frontend con `VITE_API_URL=/api`. Lint de archivos modificados sin errores (avisos previos de React, variables preexistentes del test y configuración `strictNullChecks`). `git diff --check` y guard de migraciones correctos: **0 migraciones nuevas**.

Comandos (desde cada paquete):

```sh
# backend
npx prisma generate
npm test
npm run build
PG_BIN=<ruta-postgresql>/bin npm run test:integration -- test/redondeo-cobro.postgres.integration.ts test/ventas.postgres.integration.ts test/credito.postgres.integration.ts test/pagos-bancarios.postgres.integration.ts test/caja.postgres.integration.ts test/cxc-cxp-balance.postgres.integration.ts test/cobro-entrega.postgres.integration.ts test/devoluciones-cxc.postgres.integration.ts test/contingencia.postgres.integration.ts

# frontend
npm test
VITE_API_URL=/api npm run build
PG_BIN=<ruta-postgresql>/bin PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e-real -- precision-monetaria-real balance-real caja-interfaz-real cobro-entrega-real contingencia-real
```

El harness de navegador crea su propio clúster, aplica las migraciones reales con `migrate deploy`, comprueba deriva completa, siembra dos empresas y arranca API NestJS y frontend construidos. La nueva prueba `precision-monetaria-real.spec.ts` comprueba los cinco casos en pantalla, descuento del POST, respuesta de factura y filas NUMERIC de venta/caja. Las suites existentes cubren crédito y abonos, caja, cobro/entrega y desconexión/sincronización de contingencia.

Incidencias de preparación resueltas: el cliente Prisma instalado no incluía `precioAprobado`; se regeneró desde el esquema sin cambiarlo. PostgreSQL no estaba instalado y se preparó localmente sin privilegios. La prueba nueva de navegador intentó aprobar de nuevo un producto creado ya aprobado por ADMIN y esperaba `L ` donde el formateador usa `L. `; se corrigió la prueba sin relajar sus comprobaciones de importes.

## Pendientes y límites

- #165 sigue sin integrar: actualización con su `main` y regresión conjunta pendientes. No se declara listo para producción.
- Recarga offline de contingencia falla también en el commit original; 13 pruebas posteriores de esa secuencia no se ejecutaron. Falta resolver/validar ese flujo con el navegador objetivo. No se encontró una diferencia monetaria restante en los casos válidos ejecutados; esto no acredita el resto de la secuencia offline.
- Checks de GitHub correspondientes al HEAD publicado: se informan en el PR al finalizar; ningún resultado local sustituye esos checks.
- No se probó impresión física, iPhone/Safari físico, datáfono real, apagón/UPS ni datos históricos de producción. Las pruebas locales no acreditan esas condiciones.
- Las devoluciones históricas ya calculadas con el algoritmo anterior se conservan; la siguiente devolución descuenta exactamente lo ya registrado del derecho acumulado, sin reescribir el historial.

Resumenes y hashes de fuentes/pruebas: [evidencia de esta continuación](evidencias/pr166-20261015/RESULTADOS.txt).

NEXUS — validación de integridad monetaria en PostgreSQL aislado. Estado y bitácora vigentes también en `CONTEXTO_MAESTRO.md`, sección PR #166.
