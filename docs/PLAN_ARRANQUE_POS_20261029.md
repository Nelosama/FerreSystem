# Plan de arranque del punto de venta · 2026-10-29

Rama: `claude/arranque-pos-20261029`, desde `origin/main` `767888a`.
Entregable: rama con commits pequeños y PR en **borrador**. **No se fusiona, no se despliega, no se toca producción ni datos reales.**

## Objetivo

Dejar limpio el arranque inicial de una ferretería: carga de inventario (con y sin precio), aprobación de precios y venta en punto de venta. Lo demás se corrige después.

## Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Base | Nueva rama desde `main`. No se reutilizan ramas existentes. |
| OpenAI (#215, ya en `main`) | Solo documentar en pendientes. No se quita ni se usa. |
| Migración `20261029000000_desglose_fiscal_linea` | No se toca: ni se añade ni se quita. Se documenta como riesgo de despliegue. |
| Factura fiscal | Configurable por empresa. Por defecto **sin bloque fiscal**. Sin datos fiscales inventados. |
| Pruebas que fallan | Si no hay arreglo claro, se marcan con causa y evidencia y se sigue. Nunca se borra ni se salta una prueba para que pase. |

## Alcance

### Paso 1 · Pruebas rotas en `main`
- `saas-onboarding` espera 16 módulos configurables; son 12 predeterminados más `contabilidad`.
- Cambiar la aserción para que use la constante `CONFIGURABLE_TENANT_MODULES`, no un número fijo.
- Criterio: la prueba pasa y sigue comprobando lo mismo (persistencia, historial y aislamiento).

### Paso 2 · Carga de inventario con y sin precio
- Plantilla única de **nueve columnas** (`nombre, codigo, codigoBarras, categoria, unidadMedida, stockActual, stockMinimo, precioCosto, precioVenta`).
- Prueba PostgreSQL con archivo mixto:
  - fila con precio y aprobación → vendible;
  - fila sin precio → existencia cargada, **no vendible**;
  - precio cero → rechazado;
  - usuario no administrador que intenta aprobar → 403.
- Retirar la guía de seis columnas en `docs/operacion-cliente/` y corregir `01-inventario.md`, `11-captura-inventario-simple.md` y `08-primer-dia.md`.
- Criterio: la prueba mixta pasa y la documentación coincide con el código.

### Paso 3 · Factura configurable por empresa
- Interruptor por empresa; por defecto apagado.
- Apagado: el comprobante sale como hoy, con el texto «comprobante interno».
- Encendido: muestra el bloque fiscal con datos que cargue el administrador o el contador (CAI, rango, fecha límite). **No se inventa ningún dato fiscal**; si faltan, no se muestra el bloque.
- Antes de codificar, revisar si ya existe `FiscalCai` y `configuracion` y reutilizarlos.
- Criterio: prueba de comprobante con interruptor apagado y encendido; sin datos, no se imprime bloque.

### Paso 4 · Documentar pendientes
- Anotar en `docs/` los puntos que no entran esta noche: aprobación de precios por lotes, SDK de OpenAI sin uso, migración de desglose sin ensayo, Render sin verificar, respaldo sin restaurar, impresora y lector sin prueba física.

### Paso 5 · Verificación completa
- Backend: `build`, `lint`, pruebas unitarias.
- Backend PostgreSQL: suites de productos, precios, costo inicial, importación, caja, ventas, cobro, entrega, aislamiento, seguridad, migraciones y la nueva prueba mixta.
- Frontend: `tsc -b`, pruebas de nodo, build y lint.
- Resultado y fallos se registran en el PR tal cual.

### Paso 6 · PR en borrador
- Título y cuerpo con: alcance, decisiones, evidencia de cada paso y pendientes.
- Sin merge. Sin despliegue.

## Fuera de alcance esta noche

- Aprobación de precios por lotes (pantalla nueva).
- Quitar o usar el SDK de OpenAI.
- Revertir o ensayar la migración de desglose fiscal.
- Cualquier cambio en Render, Vercel o producción.
- Certificación fiscal o reglas de ISV distintas del 15 %.

## Criterios de parada

- Se para si hay que tocar producción, migrar una base real o tomar una decisión fiscal.
- Una prueba que no se puede arreglar se marca y se sigue.
