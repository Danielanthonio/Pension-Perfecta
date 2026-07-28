-- ============================================================================
-- Corrección de datos: proyectos en `asesoria_agendada` que nunca tuvieron fecha
-- ============================================================================
--
-- CONTEXTO. Hasta ahora `asesoria_agendada` significaba dos cosas distintas:
--   a) el director/AM eligió la subetapa "Agenda Asesoria" al aprobar  -> en realidad
--      quería decir "listo para presentar" (NO hay reunión agendada), y
--   b) el aliado grabó la fecha de la reunión con el cliente           -> sí la hay.
-- Se distinguían por un texto en `notes_aliado`, que es frágil.
--
-- El modelo nuevo separa los dos hitos: al aprobar se deja "Listo para Presentar"
-- (`aprobado_listo`) y a "Agenda de Asesoría" (`asesoria_agendada`) solo se llega
-- grabando la fecha. Esta migración reubica los del caso (a), que si no aparecerían
-- un paso más adelante del que les toca y sin fecha de reunión.
--
-- ----------------------------------------------------------------------------
-- ANTES DE EJECUTAR — cuántos proyectos se van a tocar (solo lectura):
--
--   SELECT count(*) AS a_corregir
--     FROM public.prospects
--    WHERE status = 'asesoria_agendada'
--      AND (notes_aliado IS NULL OR notes_aliado NOT LIKE '%Asesoría agendada%');
--
--   -- y los que NO se tocan (sí tienen fecha grabada):
--   SELECT count(*) AS con_fecha
--     FROM public.prospects
--    WHERE status = 'asesoria_agendada'
--      AND notes_aliado LIKE '%Asesoría agendada%';
--
-- REVERSIÓN: los ids corregidos quedan en public.fix_agenda_sin_fecha_20260728.
--   UPDATE public.prospects p SET status = 'asesoria_agendada'
--     FROM public.fix_agenda_sin_fecha_20260728 b WHERE p.id = b.prospect_id;
--   UPDATE public.prospect_status_history h SET status = 'asesoria_agendada'
--     FROM public.fix_agenda_sin_fecha_20260728 b
--    WHERE h.prospect_id = b.prospect_id AND h.status = 'aprobado_listo';
-- ============================================================================

BEGIN;

-- 1. Congelar a quién se toca. La tabla queda como respaldo/reversión (no se borra).
DROP TABLE IF EXISTS public.fix_agenda_sin_fecha_20260728;
CREATE TABLE public.fix_agenda_sin_fecha_20260728 AS
SELECT id AS prospect_id, notes_aliado, now() AS fixed_at
  FROM public.prospects
 WHERE status = 'asesoria_agendada'
   AND (notes_aliado IS NULL OR notes_aliado NOT LIKE '%Asesoría agendada%');

-- Sin acceso de los clientes: es una tabla operativa de respaldo.
ALTER TABLE public.fix_agenda_sin_fecha_20260728 ENABLE ROW LEVEL SECURITY;

-- 2. Reetiquetar su historial. Esa fila registra CUÁNDO el director dejó el proyecto
--    en ese punto, que en el modelo nuevo se llama `aprobado_listo`. Si no se corrige,
--    la línea de tiempo mostraría fecha en "Agenda de Asesoría" —un hito por delante
--    de donde queda el proyecto— y ninguna en "Listo para Presentar".
UPDATE public.prospect_status_history h
   SET status = 'aprobado_listo'
  FROM public.fix_agenda_sin_fecha_20260728 b
 WHERE h.prospect_id = b.prospect_id
   AND h.status = 'asesoria_agendada';

-- 3. Mover el estado actual. Se desactiva el trigger de historial porque el paso 2 ya
--    dejó la fila correcta: si no, se añadiría otra fechada hoy y el hito "Listo para
--    Presentar" mostraría la fecha de esta migración en vez de la de la aprobación real.
ALTER TABLE public.prospects DISABLE TRIGGER trg_record_prospect_status_change;

UPDATE public.prospects p
   SET status = 'aprobado_listo'
  FROM public.fix_agenda_sin_fecha_20260728 b
 WHERE p.id = b.prospect_id;

ALTER TABLE public.prospects ENABLE TRIGGER trg_record_prospect_status_change;

COMMIT;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (ejecutar después):
--   SELECT count(*) FROM public.fix_agenda_sin_fecha_20260728;   -- cuántos se movieron
--   -- Debe dar 0: ya no queda ningún agendado sin fecha.
--   SELECT count(*) FROM public.prospects
--    WHERE status = 'asesoria_agendada'
--      AND (notes_aliado IS NULL OR notes_aliado NOT LIKE '%Asesoría agendada%');
-- ----------------------------------------------------------------------------
