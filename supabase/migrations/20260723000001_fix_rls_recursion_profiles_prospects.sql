-- =============================================================================
-- HOTFIX CRÍTICO: recursión mutua de RLS entre profiles y prospects.
-- =============================================================================
-- La mig 20260723000000 creó la política de profiles "AMs de mis proyectos
-- visibles" con un subquery INLINE a prospects:
--     id IN (SELECT account_manager_id FROM prospects WHERE aliado_id = auth.uid())
-- Ese subquery dispara la RLS de prospects, cuya política "Aliados ven sus
-- propios prospectos" (recreada en la misma migración) a su vez hace subquery a
-- profiles (rama empresa_multialiado_id):
--     profiles -> prospects -> profiles -> ...
--   => ERROR 42P17 "infinite recursion detected in policy for relation"
--   => TODO SELECT sobre profiles falla => el fetch del perfil al iniciar sesión
--      revienta => ensureProfileExists devuelve null => la app tira
--      "No se pudo iniciar sesión" y SACA al usuario (cualquier rol).
--   (El modo demo usa localStorage y NUNCA ejecuta RLS: por eso no se detectó.)
--
-- Solución: mover el subquery a una función SECURITY DEFINER, que corre con los
-- privilegios del dueño (postgres) y BYPASSA la RLS de prospects, cortando el
-- ciclo. Es el MISMO patrón ya usado dentro de estas políticas por
-- get_user_role() y get_user_account_manager().
--
-- Se preserva EXACTAMENTE el alcance acotado del pivote: el aliado solo puede
-- leer el/los AM asignados a SUS propios proyectos (no todos los AMs), así que
-- password_provisional / email / phone del resto de AMs siguen protegidos.
-- =============================================================================

-- 1) Helper SECURITY DEFINER: los AM asignados a los proyectos del llamante.
CREATE OR REPLACE FUNCTION public.am_ids_for_my_prospects()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT account_manager_id
  FROM public.prospects
  WHERE aliado_id = auth.uid()
    AND account_manager_id IS NOT NULL;
$$;

-- 2) Reescribir la política SIN subquery inline a prospects (usa el helper).
DROP POLICY IF EXISTS "AMs de mis proyectos visibles" ON public.profiles;
CREATE POLICY "AMs de mis proyectos visibles"
  ON public.profiles FOR SELECT USING (
    role = 'account_manager'
    AND id IN (SELECT public.am_ids_for_my_prospects())
  );

-- 3) Recargar el caché de esquemas de PostgREST.
NOTIFY pgrst, 'reload schema';
