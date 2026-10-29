# Ensayo de la migración del desglose fiscal — 2026-10-29

Migración: `backend/prisma/migrations/20261029000000_desglose_fiscal_linea` (rama `claude/devoluciones-exenciones-20261029`, commit `84f9b14`, sin PR). Ensayo en PostgreSQL 16 aislado, datos sintéticos, cadena de 32 migraciones de `main` aplicada en orden antes de la nueva. No se accedió a ninguna base real.

## Qué se ensayó

| Paso | Resultado |
| --- | --- |
| Aplicar las 32 migraciones de `main` en orden | Correcto, 72 tablas |
| Insertar datos históricos: empresa, usuario, producto, venta gravada 200 + ISV 30, detalle, devolución parcial 57.50 y su detalle | Correcto |
| Huella de las filas antes de la migración | `5e355003…` (todas las columnas) |
| Aplicar `20261029000000_desglose_fiscal_linea` | Correcto, sin error de restricciones con datos existentes |
| Columnas nuevas tras la migración | `exento`, `base_gravada`, `base_exenta`, `isv`, `tasa_isv` en `detalles_venta`; `base_gravada`, `base_exenta`, `isv` en `detalles_devolucion` |
| Filas con desglose tras la migración | **0** (las ventas anteriores quedan sin desglose, como debe ser) |
| Valores originales tras la migración | Venta 200.00 / 30.00 / 230.00; detalle 4 × 50 = 200.00; devolución 57.50 con reembolso 57.50; detalle de devolución 1 × INVENTARIO. **Sin cambios** |
| Ejecutar el rollback (`docs/ROLLBACK_DESGLOSE_FISCAL_20261029.sql`) | Correcto. Las 5 columnas de `detalles_venta` se eliminan (cuenta: 0) |
| Valores originales tras el rollback | Iguales a los de antes de la migración |

**Nota sobre la huella:** tras la migración la huella completa cambió (`f93bf8…`), porque `row_to_json` incluye las columnas nuevas. Se comprobó columna por columna que los valores originales no cambian; la diferencia de huella no es un cambio de datos.

## Compatibilidad

- **Ventas anteriores:** sin desglose (`NULL`). Su devolución sigue con la regla vigente de proporción del total. Verificado en `desglose-fiscal-devoluciones` («compatibilidad»).
- **Documentos emitidos:** la migración no toca ninguna fila existente. Ninguna venta, devolución ni documento fiscal cambia.
- **Restricciones:** `NOT VALID` y después `VALIDATE`. Con datos existentes, la validación no encontró incoherencias: todas las filas son `NULL`.
- **Interruptor:** con `FISCAL_DESGLOSE_POR_LINEA` apagado (por defecto), ninguna venta nueva escribe desglose.

## Riesgos de la migración en producción

| Riesgo | Mitigación |
| --- | --- |
| `ALTER TABLE` toma un bloqueo exclusivo breve en `detalles_venta` y `detalles_devolucion` | Columnas sin valor por defecto (cambio de catálogo, sin reescritura). Ejecutar en ventana de baja actividad |
| Las restricciones `VALIDATE` recorren la tabla | Con un volumen grande, medir el tiempo en preproducción |
| Desplegar el código antes de migrar | `migration-safe` impide el arranque (por diseño). Orden: respaldo verificado → migrar → desplegar |
| Revertir tras encender el interruptor | El rollback borra los desgloses ya escritos. Solo si no hay ventas con desglose que conservar |
| Migración en producción sin autorización | Prohibido en esta fase. Requiere autorización del dueño y revisión de NEXUS |

## Requisitos para el ensayo en preproducción

1. Copia de preproducción restaurada desde un respaldo reciente, **no** la base de producción.
2. Volumen similar al de producción en `ventas` y `detalles_venta` para medir el tiempo de `VALIDATE`.
3. Ejecutar `scripts/estado-base-solo-lectura.sql` antes y después, para confirmar el estado de la lista de migraciones y sus SHA-256.
4. Verificar que `prisma migrate status` reporta la migración como pendiente antes y como aplicada después.
5. Repetir el ensayo de rollback con el SQL de este documento.
6. Registrar tiempos, bloqueos observados y conteos antes y después.
7. Revisión por NEXUS del SQL final antes de cualquier ejecución.

## Decisiones pendientes

- Autorización del dueño para ensayar en preproducción.
- D9: si el desglose se enciende en producción, y cuándo.
- Restricción de rollback: el borrado de desgloses requiere confirmación explícita.
