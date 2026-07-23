-- Pensión Perfecta — Asignación ALEATORIA de aliados a Account Managers (ruleta)
--
-- Regla de producto: al crear un aliado —por alta manual en Gestión de Usuarios,
-- por registro con código de invitación o por auto-recuperación de perfil en el
-- primer login— su Account Manager se asigna AL AZAR entre los AM que participan
-- en la "ruleta". Antes esto lo hacía a mano el director (o el aliado heredaba el
-- AM que lo invitaba). El director puede seguir re-asignando después a mano.
--
-- Participan en la ruleta SOLO los AM con `auto_assign_enabled = true` y activos.
-- El director enciende/apaga ese interruptor por AM desde el panel de Account
-- Managers. Los que estén apagados (p. ej. cuentas de prueba) quedan fuera del
-- sorteo.
--
-- Todo es ADITIVO e IDEMPOTENTE. Si NINGÚN AM está en la ruleta, el aliado queda
-- sin AM (mesa del director), exactamente igual que hoy.

-- 1) Interruptor por AM: ¿participa en la ruleta de asignación automática? --------
--    Default false → tras desplegar, la ruleta está VACÍA hasta que el director
--    encienda a los AM reales. Mientras tanto, el comportamiento es el actual
--    (aliado sin AM). Cero riesgo de repartir aliados a cuentas equivocadas.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_assign_enabled boolean NOT NULL DEFAULT false;

-- 2) Función: elige un AM al azar de la ruleta y lo pone en el aliado nuevo -------
--    SECURITY DEFINER para que la LECTURA de la lista de AM no dependa del RLS del
--    que inserta (un aliado que se registra por sí mismo no podría leer a todos los
--    AM). Es BEFORE INSERT: solo ajusta NEW, no vuelve a insertar (no hay recursión).
-- OJO: la tabla `profiles` de producción NO tiene columna `is_active` (la app
-- está escrita para funcionar sin ella y la trata como "siempre activo"). Por eso
-- este trigger NO puede referenciar `is_active`: hacerlo rompería TODO INSERT de
-- aliado. El pool de la ruleta se define solo por `auto_assign_enabled`.
CREATE OR REPLACE FUNCTION public.assign_random_am_on_insert()
RETURNS trigger AS $$
DECLARE
  chosen_am uuid;
BEGIN
  -- Solo aplica a aliados que se crean SIN AM. Si ya trae un AM (asignación
  -- explícita) o no es un aliado, no se toca.
  IF NEW.role = 'aliado' AND NEW.account_manager_id IS NULL THEN
    SELECT id INTO chosen_am
    FROM public.profiles
    WHERE role = 'account_manager'
      AND COALESCE(auto_assign_enabled, false) = true
    ORDER BY random()
    LIMIT 1;

    -- chosen_am puede ser NULL si nadie está en la ruleta: el aliado queda sin AM.
    NEW.account_manager_id := chosen_am;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_assign_random_am ON public.profiles;
CREATE TRIGGER trg_assign_random_am
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_random_am_on_insert();

-- Forzar la recarga del caché de esquemas de PostgREST en Supabase.
NOTIFY pgrst, 'reload schema';
