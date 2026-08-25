-- =============================================================================
-- PensiónFlow — AUTORÍA DEL PROYECTO: quién capturó cada prospecto.
-- =============================================================================
-- Hasta hoy no había forma de saber si un proyecto lo dio de alta el ALIADO
-- desde su portal o si se lo capturó su Account Manager (o Dirección). El dato
-- se perdía: `aliado_id` guarda de QUIÉN ES el proyecto —el AM puede capturar a
-- nombre de un aliado— y `account_manager_id` guarda quién LO GESTIONA. Ninguno
-- de los dos dice quién lo TECLEÓ.
--
-- Ese dato es el termómetro de adopción de la plataforma: la meta es que los
-- aliados suban sus propios proyectos, y sin medirlo no se sabe si sube o baja.
--
-- Esta migración añade tres columnas a `prospects` y las sella en la base:
--   · created_by      — id de quien capturó (FK a profiles).
--   · created_by_role — SNAPSHOT del rol que tenía al capturar. Es snapshot a
--                       propósito: si mañana un aliado asciende a AM, el
--                       histórico no debe reescribirse.
--   · created_by_name — SNAPSHOT del nombre, mismo criterio que `aliado_name`:
--                       el reporte se pinta sin depender de que quien lo mira
--                       tenga permiso de leer ese perfil (RLS) ni de que la
--                       cuenta siga existiendo.
--
-- La autoría NO es falsificable desde el navegador: el trigger PISA lo que
-- venga en el INSERT y escribe siempre `auth.uid()`. Solo se respeta el valor
-- entrante cuando no hay sesión (service_role / backfill).
--
-- Backfill del histórico: se reconstruye con dato REAL, no con heurística.
-- `documents.uploaded_by` siempre queda como el creador del prospecto (así lo
-- escribe el alta desde que existe la columna), de modo que el uploader del
-- PRIMER documento del expediente es quien capturó. Al 2026-08-24 eso cubre los
-- 468 proyectos de producción (310 de aliados, 150 de AMs, 8 de Dirección).
--
-- Autosuficiente: no usa `update_updated_at_column()` (no existe en producción)
-- y NO referencia `profiles.is_active` (la columna no existe allá).
-- =============================================================================

-- 1) Columnas + índices (aditivo: nada las referencia en un WITH CHECK).
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS created_by_role text NULL;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS created_by_name text NULL;

COMMENT ON COLUMN public.prospects.created_by IS
  'Quién CAPTURÓ el proyecto (≠ aliado_id, que es de quién es, y ≠ account_manager_id, que es quién lo gestiona). Lo sella el trigger trg_set_prospect_creator con auth.uid().';
COMMENT ON COLUMN public.prospects.created_by_role IS
  'Snapshot del rol de created_by EN EL MOMENTO del alta (aliado / account_manager / admin / director / closer / finanzas).';
COMMENT ON COLUMN public.prospects.created_by_name IS
  'Snapshot del nombre de created_by, para pintar el reporte sin depender de RLS sobre profiles.';

CREATE INDEX IF NOT EXISTS idx_prospects_created_by ON public.prospects(created_by);
CREATE INDEX IF NOT EXISTS idx_prospects_created_by_role ON public.prospects(created_by_role);

-- 2) Trigger que sella la autoría en cada alta.
CREATE OR REPLACE FUNCTION public.set_prospect_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator uuid := auth.uid();
  v_role text;
  v_name text;
BEGIN
  -- Sin sesión (service_role, backfill, seeds): se respeta lo que traiga el INSERT.
  IF creator IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.role, p.full_name INTO v_role, v_name
  FROM public.profiles p
  WHERE p.id = creator;

  -- Se PISA lo que venga del cliente: la autoría la decide la sesión, no el payload.
  NEW.created_by := creator;
  NEW.created_by_role := v_role;
  NEW.created_by_name := v_name;

  RETURN NEW;
END;
$$;

-- Corre después de trg_assign_am_to_prospect (los BEFORE se disparan en orden
-- alfabético del nombre del trigger). Son independientes: uno toca
-- account_manager_id y el otro las columnas created_by_*.
DROP TRIGGER IF EXISTS trg_set_prospect_creator ON public.prospects;
CREATE TRIGGER trg_set_prospect_creator
BEFORE INSERT ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.set_prospect_creator();

-- 3) Backfill del histórico desde el PRIMER documento del expediente.
WITH primer_doc AS (
  SELECT DISTINCT ON (d.prospect_id)
         d.prospect_id,
         d.uploaded_by
  FROM public.documents d
  WHERE d.uploaded_by IS NOT NULL
    AND d.prospect_id IS NOT NULL
  ORDER BY d.prospect_id, d.uploaded_at ASC NULLS LAST, d.id
)
UPDATE public.prospects p
SET created_by      = pd.uploaded_by,
    created_by_role = pr.role,
    created_by_name = pr.full_name
FROM primer_doc pd
LEFT JOIN public.profiles pr ON pr.id = pd.uploaded_by
WHERE p.id = pd.prospect_id
  AND p.created_by IS NULL;

-- 4) Los proyectos sin un solo documento se quedan en NULL a propósito: la
--    plataforma NO inventa autoría. La UI los pinta como "Sin registro".

-- 5) Verificación (informativa; sale en los NOTICE del editor SQL).
DO $$
DECLARE
  total int;
  con_autor int;
  n_aliado int;
  n_am int;
BEGIN
  SELECT count(*) INTO total FROM public.prospects;
  SELECT count(*) INTO con_autor FROM public.prospects WHERE created_by IS NOT NULL;
  SELECT count(*) INTO n_aliado FROM public.prospects WHERE created_by_role = 'aliado';
  SELECT count(*) INTO n_am FROM public.prospects WHERE created_by_role = 'account_manager';
  RAISE NOTICE 'Autoría de proyectos: % de % con creador (aliado: %, account manager: %)',
    con_autor, total, n_aliado, n_am;
END $$;
