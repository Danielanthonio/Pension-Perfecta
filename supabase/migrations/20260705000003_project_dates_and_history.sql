-- =============================================================================
-- PensiónFlow - Migración: Fechas del proyecto (vigencia del cálculo + historial de estados)
-- =============================================================================
-- Puramente aditiva. Dos partes independientes:
--  A) sim_emitted_at: fecha en que se emitió el cálculo, para mostrar su vigencia.
--  B) prospect_status_history: registra cada cambio de estado con su fecha, para
--     mostrar en la línea de tiempo cuándo se agendó, firmó carta, entró a análisis
--     de riesgo, se cerró ganada y se pagó/cerró.
-- =============================================================================

-- ── A) Fecha de emisión del cálculo (vigencia) ──────────────────────────────
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS sim_emitted_at timestamptz;

-- ── B) Historial de estados ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospect_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  status      varchar(50) NOT NULL,
  changed_by  uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_prospect_status_history_prospect
  ON public.prospect_status_history(prospect_id, changed_at);

ALTER TABLE public.prospect_status_history ENABLE ROW LEVEL SECURITY;

-- Ver historial: quien pueda ver el prospecto padre (mismo patrón que documents/mensajes).
DROP POLICY IF EXISTS "Ver historial de prospectos permitidos" ON public.prospect_status_history;
CREATE POLICY "Ver historial de prospectos permitidos"
ON public.prospect_status_history
FOR SELECT
TO public
USING (
  EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = prospect_status_history.prospect_id)
);

-- Trigger que registra el estado inicial y cada cambio posterior.
-- SECURITY DEFINER: el INSERT al historial no depende de la RLS de esta tabla; el cambio
-- de estado en prospects ya viene autorizado por la RLS de prospects.
CREATE OR REPLACE FUNCTION public.record_prospect_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.prospect_status_history (prospect_id, status, changed_by, changed_at)
    VALUES (NEW.id, NEW.status, auth.uid(), COALESCE(NEW.created_at, now()));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.prospect_status_history (prospect_id, status, changed_by, changed_at)
    VALUES (NEW.id, NEW.status, auth.uid(), now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_prospect_status_change ON public.prospects;
CREATE TRIGGER trg_record_prospect_status_change
AFTER INSERT OR UPDATE OF status ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.record_prospect_status_change();

-- Semilla: los prospectos existentes no tienen historial. Registramos su estado ACTUAL
-- con la última fecha de actualización, para que al menos el hito vigente tenga fecha.
INSERT INTO public.prospect_status_history (prospect_id, status, changed_at)
SELECT p.id, p.status, COALESCE(p.updated_at, p.created_at, now())
FROM public.prospects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.prospect_status_history h WHERE h.prospect_id = p.id
);

-- Realtime (opcional): permite refrescar fechas en vivo. Tolerante a que no exista la publicación.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'prospect_status_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prospect_status_history;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
