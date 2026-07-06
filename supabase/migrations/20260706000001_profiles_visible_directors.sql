-- =============================================================================
-- PensiónFlow - Migración: Dirección visible para todos (para el chat general)
-- =============================================================================
-- El chat general permite que aliados y account managers escriban a la DIRECCIÓN.
-- Para poder elegir a un director como destinatario, el cliente necesita ver su
-- perfil (id + nombre). Hoy la RLS de `profiles` solo deja a un aliado ver su propio
-- perfil y el de su Account Manager (ver 20260630000000), por lo que la dirección
-- queda oculta y no se puede iniciar la conversación.
--
-- Esta política es PURAMENTE ADITIVA: en Postgres, varias políticas SELECT se combinan
-- con OR, así que solo AMPLÍA lo visible (nunca restringe). Expone únicamente los
-- perfiles de dirección (roles 'admin'/'director') y solo a usuarios autenticados.
-- No expone datos sensibles nuevos: solo el nombre/rol de la gerencia, con quien todos
-- pueden comunicarse por diseño.
-- =============================================================================

DROP POLICY IF EXISTS "Todos los autenticados ven a la direccion" ON public.profiles;
CREATE POLICY "Todos los autenticados ven a la direccion"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND role IN ('admin', 'director')
  );
