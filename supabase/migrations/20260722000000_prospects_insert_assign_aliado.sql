-- Pensión Perfecta — Asignación directa al crear un prospecto
--
-- Permite que Dirección (admin/director) y los Account Managers capturen un
-- prospecto ya asignado a cualquier aliado existente (aliado_id distinto del
-- propio auth.uid()). Hasta ahora la política de INSERT exigía
-- `aliado_id = auth.uid()`, lo que impedía asignar el proyecto a un tercero al
-- momento de crearlo.
--
-- Decisión de producto: el AM puede asignar a CUALQUIER aliado activo (no solo a
-- los de su cartera), igual que el director. Por eso el WITH CHECK del rol
-- account_manager es solo por rol, sin la restricción de get_user_account_manager.
-- El aliado normal sigue restringido a crear únicamente sus propios prospectos.

DROP POLICY IF EXISTS "Aliados crean sus prospectos" ON public.prospects;
CREATE POLICY "Aliados crean sus prospectos"
  ON public.prospects FOR INSERT WITH CHECK (
    aliado_id = auth.uid()
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR public.get_user_role(auth.uid()) = 'account_manager'
  );

-- Forzar la recarga del caché de esquemas de PostgREST en Supabase
NOTIFY pgrst, 'reload schema';
