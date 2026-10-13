-- Contingencia offline (R-01): ventanas emitidas antes de DEF-01.
-- Su instantánea no guarda la prueba de precio aprobado. Se revocan para que el equipo pida una ventana nueva; las operaciones
-- que lleguen con ellas se rechazan de forma explícita (VENTANA_OBSOLETA) y quedan en el diario con salida de conciliación.
-- Solo marca `revocada_at`: no crea, borra ni reescribe filas del diario ni de ventas, y no cambia restricciones.
UPDATE "contingencia_ventanas" v SET "revocada_at" = NOW()
 WHERE v."revocada_at" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM "catalogo_instantaneas" c
      WHERE c."tenant_id" = v."tenant_id" AND c."hash" = v."catalogo_hash"
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(c."datos"->'productos', '[]'::jsonb)) p
           WHERE COALESCE(p->>'precioAprobado', 'false') <> 'true'));
