-- Pensión Perfecta — Un Account Manager puede asignar el proyecto a CUALQUIER
-- aliado del sistema (no solo a los de su cartera).
--
-- Contexto: el selector de asignación en la Captura de Prospecto lista los aliados
-- que el cliente puede LEER. Hasta ahora, la RLS de `profiles` (mig 20260630000000)
-- solo dejaba a un AM ver a sus propios aliados (`account_manager_id = auth.uid()`),
-- así que el selector solo mostraba su grupo. Producto quiere que el AM vea a TODOS
-- los aliados para poder asignar a cualquiera (el INSERT ya está permitido para el
-- rol account_manager por 20260722000000).
--
-- Esta política es PURAMENTE ADITIVA: en Postgres las políticas SELECT se combinan
-- con OR, así que solo AMPLÍA lo visible, nunca restringe. Solo aplica a usuarios
-- cuyo rol es account_manager, y les expone perfiles de rol 'aliado' y
-- 'account_manager' (los aliados para elegirlos; los AM para poder mostrar de quién
-- es cada aliado en el sub-rótulo del selector). A dirección ya la ven todos.
--
-- Nota de privacidad: con esto un AM puede leer los perfiles de aliados de otros AM
-- (nombre, correo, teléfono, etc.). Es intencional para la asignación cruzada. El
-- filtro cliente `exposedProfiles` sigue acotando el RESTO de la app (pipeline,
-- métricas, chat) a la cartera del propio AM; solo el selector de asignación usa la
-- lista completa.

DROP POLICY IF EXISTS "AMs ven todos los aliados y AMs para asignar" ON public.profiles;
CREATE POLICY "AMs ven todos los aliados y AMs para asignar"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND public.get_user_role(auth.uid()) = 'account_manager'
    AND role IN ('aliado', 'account_manager')
  );

-- Forzar la recarga del caché de esquemas de PostgREST en Supabase.
NOTIFY pgrst, 'reload schema';
