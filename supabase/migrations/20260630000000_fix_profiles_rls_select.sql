-- =============================================================================
-- PensiónFlow - Migración: Corregir políticas RLS SELECT en profiles
-- =============================================================================

-- 1. Eliminar la política anterior restrictiva
DROP POLICY IF EXISTS "Admins ven todos y AMs ven sus aliados" ON public.profiles;

-- 2. Crear la nueva política con permisos para perfiles relacionados
CREATE POLICY "Admins ven todos y AMs ven sus aliados"
  ON public.profiles
  FOR SELECT
  USING (
    -- El propio usuario puede ver su perfil
    auth.uid() = id
    -- Administradores y directores pueden ver todos los perfiles
    OR public.get_user_role(auth.uid()) = 'admin'
    -- Directores pueden ver todos los perfiles
    OR public.get_user_role(auth.uid()) = 'director'
    -- Un Account Manager puede ver los perfiles de sus aliados asignados
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND account_manager_id = auth.uid()
    )
    -- Un Aliado puede ver el perfil de su Account Manager asignado
    OR (
      id = public.get_user_account_manager(auth.uid())
    )
    -- Un Líder puede ver los perfiles de sus aliados comerciales asignados
    OR (
      id IN (SELECT aliado_asignado_id FROM public.lider_aliados WHERE lider_id = auth.uid())
    )
    -- Un Aliado puede ver el perfil de su Líder de Grupo
    OR (
      id IN (SELECT lider_id FROM public.lider_aliados WHERE aliado_asignado_id = auth.uid())
    )
  );
