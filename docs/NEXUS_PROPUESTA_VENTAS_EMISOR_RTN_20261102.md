# Propuesta para revisión NEXUS: RTN del emisor en cada venta — 2026-11-02

> **Estado: propuesta, no aplicada.** No se ha creado ninguna migración en `backend/prisma/migrations/`. Solo se aplica tras la aprobación de NEXUS y la orden del dueño. Firma pendiente: NEXUS.

## 1. Problema

El RTN del emisor se guarda en `configuracion.rtn` y se imprime en el comprobante. Si el dueño lo cambia, una reimpresión de una venta antigua mostraría el RTN nuevo y no el que tenía cuando se emitió. Hace falta guardar una copia del RTN en cada venta.

## 2. Cambio de esquema propuesto (aditivo)

```sql
-- Migración propuesta (NO aplicada): 20261102000000_ventas_emisor_rtn
ALTER TABLE ventas ADD COLUMN emisor_rtn VARCHAR(14);

ALTER TABLE ventas ADD CONSTRAINT ventas_emisor_rtn_formato
  CHECK (emisor_rtn IS NULL OR emisor_rtn ~ '^[0-9]{14}$') NOT VALID;
ALTER TABLE ventas VALIDATE CONSTRAINT ventas_emisor_rtn_formato;
```

- **Aditiva:** solo añade una columna nullable y una restricción de formato. No reescribe filas.
- **Históricos:** las ventas anteriores quedan con `NULL`. El comprobante de una venta sin RTN guardado no imprime la línea del RTN. No se rellenan con el RTN vigente, porque sería inventar un dato fiscal histórico.
- **Prisma:** añadir `emisorRtn String? @map("emisor_rtn") @db.VarChar(14)` al modelo `Venta`.

## 3. Cambios de código (no aplicados)

| Punto | Cambio |
|---|---|
| `backend/src/ventas/ventas.service.ts` (creación, ~línea 428) | Leer `configuracion.rtn` del tenant **dentro de la misma transacción** y guardarlo en `emisorRtn`. Nunca tomarlo del cuerpo de la petición |
| `backend/src/ventas/ventas.service.ts` (`requestHash`, ~línea 203) | No incluir `emisorRtn`: lo deriva el servidor |
| Lectura de ventas para comprobante | Devolver `emisorRtn`; el frontend imprime ese valor y no `tenant.rtn` |
| `frontend/src/components/ReciboPDF.tsx` | Para ventas, usar el RTN guardado en la venta. Para cotizaciones, seguir usando el de la empresa vigente (no tienen copia histórica aún) |

## 4. Pruebas requeridas

- PostgreSQL: venta creada con RTN configurado guarda la copia; cambiar el RTN después no altera la venta; venta sin RTN queda en `NULL`; el formato inválido lo rechaza la base de datos.
- Idempotencia: reintentar la misma venta no cambia el RTN guardado.
- Reimpresión: comprobante de una venta antigua con `NULL` no muestra RTN; con copia, muestra la copia.
- Migración: aplicar sobre una copia con datos antes y después, sin pérdida de filas, en PostgreSQL temporal.

## 5. Riesgos y reversión

- **Riesgo bajo:** columna nueva nullable; el código anterior ignora la columna.
- **Reversión:** eliminar la columna solo si no hay ventas con copia. Antes de eso, restaurar respaldo según el runbook de reversión.
- **Orden de despliegue:** migración primero, código después (el código nuevo escribe la columna; el anterior no la conoce).

## 6. Decisiones que necesitan NEXUS y el dueño

1. ¿Se aprueba la columna con restricción `NOT VALID` + `VALIDATE`, igual que la migración de desglose fiscal?
2. ¿El RTN de cotizaciones también se copia? Propuesta: sí, en una segunda migración, para mantener la misma regla.
3. ¿Ventas anteriores a la migración: aceptamos `NULL` como definitivo? Propuesta: sí.
