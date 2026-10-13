-- APROBACION-DESTRUCTIVA: CONT-1016 @Nelosama
-- Contingencia offline: estado terminal RECHAZADA para rechazos definitivos (VENTANA_OBSOLETA, VENTANA_DE_OTRO_CAJERO, CAJA_DE_VENTANA_NO_VALIDA).
-- No modifica migraciones publicadas. Reemplaza la restricción de estado (DROP CONSTRAINT) por una versión que admite RECHAZADA;
-- es el único DROP, y no se borran filas ni columnas. La marca de arriba es la aprobación exigida por el guard de CI.
-- Backfill acotado: solo operaciones en REVISION sin venta, sin resolución y con un código de rechazo en sus conflictos.
-- Sus conflictos, payload, auditoría y trazabilidad se conservan intactos.

ALTER TABLE "operaciones_contingencia" DROP CONSTRAINT IF EXISTS "operaciones_contingencia_estado_check";
ALTER TABLE "operaciones_contingencia" ADD CONSTRAINT "operaciones_contingencia_estado_check"
  CHECK ("estado" IN ('RECIBIDA', 'APLICADA', 'REVISION', 'RESUELTA_MANUAL', 'RECHAZADA'));

-- Un rechazo definitivo nunca tiene venta asociada.
ALTER TABLE "operaciones_contingencia" ADD CONSTRAINT "operaciones_contingencia_rechazada_sin_venta_check"
  CHECK ("estado" <> 'RECHAZADA' OR "venta_id" IS NULL);

UPDATE "operaciones_contingencia" o SET "estado" = 'RECHAZADA'
 WHERE o."estado" = 'REVISION'
   AND o."venta_id" IS NULL
   AND o."resolucion" IS NULL
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(o."conflictos") c
      WHERE c->>'codigo' IN ('VENTANA_OBSOLETA', 'VENTANA_DE_OTRO_CAJERO', 'CAJA_DE_VENTANA_NO_VALIDA')
   );
