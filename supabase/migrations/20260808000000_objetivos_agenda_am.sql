-- =============================================================================
-- PensiónFlow — Objetivos de agenda por Account Manager
-- =============================================================================
-- Pedido por Dirección el 2026-08-08, junto con la botonera de Reportes por rol
-- (ALIADOS / ACCOUNT MANAGER / CLOSER).
--
-- QUÉ RESUELVE
-- El reporte «AM · Agenda» enfrenta dos barras por Account Manager: OBJETIVO y
-- REAL. El REAL se calcula de `prospects`; el OBJETIVO no sale de ningún lado —
-- lo teclea la Dirección. Esta tabla es donde vive ese número.
--
-- DECISIONES
--   · La clave es (am_id, periodo, metrica). `periodo` es un mes 'YYYY-MM': el
--     objetivo es mensual y queda histórico, así que en septiembre se puede
--     mirar cómo se cumplió el de agosto en vez de sobrescribirlo.
--   · `metrica` existe porque el reporte tiene botonera (proyectos, aprobados,
--     condicionados, evaluados, otorgados): cada una puede tener su propia meta.
--     Por defecto 'agenda', que es la del boceto.
--   · RLS: la Dirección escribe y lee todo; un Account Manager lee SOLO el suyo
--     y no escribe ninguno — la meta se la pone Dirección, no él.
--
-- AUTOSUFICIENTE A PROPÓSITO
-- `schema.sql` NO está aplicado en producción, así que aquí no se supone que
-- exista `update_updated_at_column()` ni ninguna otra función compartida: todo
-- lo que hace falta se crea con nombre propio y prefijo del módulo.
--
-- NO se referencia `profiles.is_active`: esa columna no existe en producción.
--
-- Todo es ADITIVO e IDEMPOTENTE y va dentro de una transacción.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) HELPERS PROPIOS
-- ─────────────────────────────────────────────────────────────────────────────
-- Rol de quien llama. SECURITY DEFINER para que la política no dependa de que el
-- usuario pueda leerse a sí mismo en `profiles` (y para no recursar sobre la RLS
-- de esa tabla al evaluar esta).
CREATE OR REPLACE FUNCTION public.reportes_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$fn$;

-- La Dirección puede ser 'admin' O 'director': ambos valores conviven en
-- producción y comprobar solo uno deja fuera a media dirección.
CREATE OR REPLACE FUNCTION public.reportes_es_direccion()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(public.reportes_my_role() IN ('admin', 'director'), false);
$fn$;

REVOKE ALL ON FUNCTION public.reportes_my_role()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reportes_es_direccion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reportes_my_role()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reportes_es_direccion() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) LA TABLA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.am_objetivos (
  am_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Mes al que aplica la meta, 'YYYY-MM'. Texto y no `date` porque la unidad ES
  -- el mes: guardar un día invita a que dos filas del mismo mes no colisionen.
  periodo    text        NOT NULL,
  metrica    text        NOT NULL DEFAULT 'agenda',
  objetivo   integer     NOT NULL DEFAULT 0,
  updated_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (am_id, periodo, metrica),
  CONSTRAINT am_objetivos_objetivo_no_negativo CHECK (objetivo >= 0),
  CONSTRAINT am_objetivos_periodo_formato      CHECK (periodo ~ '^[0-9]{4}-[0-9]{2}$')
);

COMMENT ON TABLE public.am_objetivos IS
  'Meta mensual que la Dirección fija a cada Account Manager. La consume el reporte «AM · Agenda» (objetivo vs real). Una fila por AM, mes y métrica.';
COMMENT ON COLUMN public.am_objetivos.periodo IS
  'Mes de la meta en formato YYYY-MM. Histórico: no se sobrescribe de un mes al siguiente.';
COMMENT ON COLUMN public.am_objetivos.metrica IS
  'Qué se mide contra la meta: agenda | proyectos | evaluados | aprobados | condicionados | otorgados.';

CREATE INDEX IF NOT EXISTS am_objetivos_periodo_idx ON public.am_objetivos (periodo);

-- `updated_at` con función propia: la compartida no existe en producción.
CREATE OR REPLACE FUNCTION public.am_objetivos_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS am_objetivos_touch_trg ON public.am_objetivos;
CREATE TRIGGER am_objetivos_touch_trg
  BEFORE UPDATE ON public.am_objetivos
  FOR EACH ROW EXECUTE FUNCTION public.am_objetivos_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.am_objetivos ENABLE ROW LEVEL SECURITY;

-- Dirección: lee y escribe todo.
DROP POLICY IF EXISTS am_objetivos_direccion_all ON public.am_objetivos;
CREATE POLICY am_objetivos_direccion_all ON public.am_objetivos
  FOR ALL
  TO authenticated
  USING (public.reportes_es_direccion())
  WITH CHECK (public.reportes_es_direccion());

-- Account Manager: SOLO lectura y SOLO de su propia meta. Sin política de
-- escritura, así que un AM no puede bajarse el objetivo para cumplirlo.
DROP POLICY IF EXISTS am_objetivos_am_select ON public.am_objetivos;
CREATE POLICY am_objetivos_am_select ON public.am_objetivos
  FOR SELECT
  TO authenticated
  USING (am_id = auth.uid());

REVOKE ALL ON public.am_objetivos FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.am_objetivos TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
