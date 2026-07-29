-- ============================================================================
-- Fecha REAL de la reunión de asesoría (`prospects.asesoria_at`)
-- ============================================================================
--
-- PROBLEMA. La línea de tiempo saca la fecha de cada hito de
-- `prospect_status_history.changed_at`, que el trigger estampa con `now()`. Para
-- casi todos los hitos está bien (el hito ES el momento en que pasó), pero
-- "Agenda de Asesoría" es distinto: lo que importa no es cuándo se capturó la
-- cita, sino CUÁNDO ES la reunión con el cliente. Hoy quien agenda teclea, por
-- ejemplo, el 15 de agosto y la línea de tiempo muestra el día de la captura.
--
-- SOLUCIÓN. Una columna propia con la fecha y hora que se teclea. El historial
-- sigue registrando cuándo se capturó (es un log de auditoría y así debe
-- quedarse); la línea de tiempo pasa a mostrar `asesoria_at` en ese hito.
--
-- Puramente aditiva: columna nullable + relleno de las citas ya existentes. No
-- toca RLS (se hereda la de `prospects`) ni dispara el trigger de historial, que
-- es `UPDATE OF status` y aquí no se toca `status`.
--
-- ----------------------------------------------------------------------------
-- ANTES DE EJECUTAR — cuántas citas se van a rellenar (solo lectura):
--
--   SELECT count(*) AS con_fecha_en_notas
--     FROM public.prospects
--    WHERE notes_aliado ~ 'día \d{4}-\d{2}-\d{2} a las \d{1,2}:\d{2}';
--
-- REVERSIÓN: ALTER TABLE public.prospects DROP COLUMN asesoria_at;
--   (la columna es nueva, nada más depende de ella)
-- ============================================================================

BEGIN;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS asesoria_at timestamptz;

COMMENT ON COLUMN public.prospects.asesoria_at IS
  'Fecha y hora de la reunión de asesoría con el cliente, tal como la teclea quien agenda (aliado, account manager o director). Es la que muestra el hito "Agenda de Asesoría" de la línea de tiempo. NO es la fecha de captura: esa vive en prospect_status_history.';

-- Relleno de las citas que ya existían. Hasta ahora la única huella de la fecha
-- era el texto de `notes_aliado` ("Asesoría agendada para el día AAAA-MM-DD a
-- las HH:MM hrs."). Se interpreta como hora de CDMX, que es la que se tecleó.
-- Las agendadas vía LeadConnector no traen fecha y se quedan en NULL.
UPDATE public.prospects
   SET asesoria_at = (
         (substring(notes_aliado from 'día (\d{4}-\d{2}-\d{2})') || ' ' ||
          substring(notes_aliado from 'a las (\d{1,2}:\d{2})'))::timestamp
         AT TIME ZONE 'America/Mexico_City'
       )
 WHERE asesoria_at IS NULL
   AND notes_aliado ~ 'día \d{4}-\d{2}-\d{2} a las \d{1,2}:\d{2}';

COMMIT;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (ejecutar después):
--   SELECT count(*) FILTER (WHERE asesoria_at IS NOT NULL) AS con_fecha,
--          count(*) FILTER (WHERE status = 'asesoria_agendada') AS en_el_hito
--     FROM public.prospects;
--
--   -- Muestra de lo rellenado (debe coincidir con el texto de la nota):
--   SELECT full_name,
--          asesoria_at AT TIME ZONE 'America/Mexico_City' AS cita_cdmx,
--          notes_aliado
--     FROM public.prospects
--    WHERE asesoria_at IS NOT NULL
--    ORDER BY asesoria_at DESC
--    LIMIT 10;
-- ----------------------------------------------------------------------------
