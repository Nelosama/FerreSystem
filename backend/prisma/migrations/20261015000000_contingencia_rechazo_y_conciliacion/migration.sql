-- Contingencia offline: rechazo definitivo con evidencia (R-01, DEF-04) y ventanas anteriores incompatibles.
-- Aditiva y transaccional. No crea ventas ni mueve existencias ni caja.

-- 1. Estado RECHAZADA: la operación se conserva en el diario como evidencia para conciliación, sin aplicarse jamás como venta.
ALTER TABLE "operaciones_contingencia" DROP CONSTRAINT "operaciones_contingencia_estado_check";
ALTER TABLE "operaciones_contingencia" ADD CONSTRAINT "operaciones_contingencia_estado_check"
  CHECK ("estado" IN ('RECIBIDA', 'APLICADA', 'REVISION', 'RESUELTA_MANUAL', 'RECHAZADA'));

-- 2. Ventanas emitidas antes de DEF-01: su instantánea no guarda la prueba de precio aprobado. Se revocan para que el equipo
--    pida una ventana nueva; las operaciones que lleguen con ellas se rechazan de forma explícita (VENTANA_OBSOLETA).
--    La revocación solo afecta a nuevas ventas offline: el diario y las operaciones ya recibidas no se modifican.
UPDATE "contingencia_ventanas" v SET "revocada_at" = NOW()
 WHERE v."revocada_at" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM "catalogo_instantaneas" c
      WHERE c."tenant_id" = v."tenant_id" AND c."hash" = v."catalogo_hash"
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(c."datos"->'productos', '[]'::jsonb)) p
           WHERE COALESCE(p->>'precioAprobado', 'false') <> 'true'));
