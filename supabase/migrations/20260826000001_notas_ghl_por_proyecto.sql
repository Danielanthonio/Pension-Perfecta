-- =============================================================================
-- PensiónFlow — la llave de las notas de GHL es (proyecto, nota), no la nota.
-- =============================================================================
-- La migración 20260826000000 puso un índice ÚNICO GLOBAL sobre `ghl_nota_id`
-- para que reimportar no clonara la bitácora. La idea era buena; el alcance,
-- equivocado.
--
-- Aquí una misma persona tiene con frecuencia DOS proyectos —el de Modalidad 40
-- y el de Modalidad 10— y en GoHighLevel es UN solo contacto. Al sincronizar,
-- el primer proyecto se quedaba con las notas y el segundo chocaba:
--
--     23505 · Key (ghl_nota_id)=(FZ8r2L8W3thlA1WlFkiH) already exists
--
-- Y como PostgREST aborta el lote entero al primer conflicto, ese segundo
-- proyecto no se quedaba con «una nota menos»: se quedaba SIN NINGUNA. El
-- expediente de Modalidad 10 seguía diciendo «Sin notas» mientras el de
-- Modalidad 40, del mismo señor, las tenía todas.
--
-- La bitácora es del PROYECTO —cuelga de `prospect_id`, se lee en la ficha del
-- proyecto y su resumen se agrupa por proyecto—, así que la llave que impide
-- duplicar tiene que serlo también: la misma nota de GHL puede estar una vez en
-- cada expediente, y no dos veces en el mismo.
--
-- Esto es exactamente lo que ya comprueba la importación antes de insertar
-- (filtra por `prospect_id` + `origen='ghl'`), así que el índice pasa a decir lo
-- mismo que el código en vez de contradecirlo.
--
-- Aditiva y sin pérdida: cambia un índice por otro más permisivo. Nada de lo ya
-- importado se toca, y ninguna fila existente viola la llave nueva (era única en
-- un espacio más estrecho).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) La llave correcta
-- ─────────────────────────────────────────────────────────────────────────────
-- Se crea ANTES de tirar la vieja: si algo fuera mal, la tabla nunca se queda ni
-- un instante sin protección contra duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS prospect_notas_ghl_por_proyecto_unico
  ON public.prospect_notas (prospect_id, ghl_nota_id)
  WHERE ghl_nota_id IS NOT NULL;

DROP INDEX IF EXISTS public.prospect_notas_ghl_id_unico;

COMMENT ON COLUMN public.prospect_notas.ghl_nota_id IS
  'Id de la nota en GoHighLevel. Único POR PROYECTO (no global): un mismo contacto de GHL alimenta los varios proyectos de la misma persona —Modalidad 40 y Modalidad 10—, y cada expediente lleva su copia.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Verificación (informativa; sale en los NOTICE del editor SQL)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_nuevo int;
  n_viejo int;
  n_ghl   bigint;
  n_proy  bigint;
BEGIN
  SELECT count(*) INTO n_nuevo FROM pg_indexes
   WHERE schemaname='public' AND indexname='prospect_notas_ghl_por_proyecto_unico';
  SELECT count(*) INTO n_viejo FROM pg_indexes
   WHERE schemaname='public' AND indexname='prospect_notas_ghl_id_unico';
  SELECT count(*), count(DISTINCT prospect_id) INTO n_ghl, n_proy
   FROM public.prospect_notas WHERE origen='ghl';
  RAISE NOTICE 'Llave por proyecto: % nuevo, % viejo (debe ser 1 y 0). Hay % notas de GHL en % proyectos; los expedientes que se quedaron vacíos se llenan al siguiente sincronizado.',
    n_nuevo, n_viejo, n_ghl, n_proy;
END $$;

NOTIFY pgrst, 'reload schema';
