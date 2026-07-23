-- =============================================================================
-- PensiónFlow — PIVOTE: el Account Manager se asigna al PROYECTO, no al aliado.
-- =============================================================================
-- La ruleta deja de repartir ALIADOS entre AMs (trigger sobre profiles, mig
-- 20260722000001) y pasa a repartir PROYECTOS: cuando un aliado captura su
-- propio proyecto, se le sortea un AM entre los que tienen el interruptor
-- auto_assign_enabled encendido. Reglas del trigger nuevo:
--   · Aliado captura SU PROPIO proyecto  → AM al azar de la ruleta.
--   · Un AM captura (para cualquier aliado) → el proyecto queda del AM creador.
--   · Dirección captura                   → sin AM (gestión directa / mesa).
--
-- Incluye: columna prospects.account_manager_id + índice, DROP de la ruleta
-- vieja, trigger de sorteo, trigger de notificaciones (la RLS de notifications
-- solo deja insertar a dirección: los avisos deben salir de un trigger
-- SECURITY DEFINER, patrón de 20260705000001), backfill de proyectos
-- existentes con el AM de cartera del aliado, y actualización de RLS:
-- el AM ve/edita prospects POR PROYECTO y cualquier autenticado puede leer
-- perfiles de AMs (para pintar el nombre del AM asignado).
--
-- SE CONSERVAN: profiles.auto_assign_enabled (pool de la ruleta),
-- profiles.account_manager_id (legado; lo referencian sync_profile_to_auth_metadata,
-- get_user_account_manager y políticas de profiles — limpieza en migración futura).
-- PROHIBIDO referenciar profiles.is_active: la columna NO existe en producción.
-- =============================================================================

-- 1) Columna + índice (aditivo; el WITH CHECK del INSERT de prospects no la
--    referencia y se evalúa DESPUÉS de los triggers BEFORE → no rompe nada).
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS account_manager_id uuid NULL
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_account_manager_id
  ON public.prospects(account_manager_id);

-- 2) Matar la ruleta vieja AM→aliado (desplegada por 20260722000001).
DROP TRIGGER IF EXISTS trg_assign_random_am ON public.profiles;
DROP FUNCTION IF EXISTS public.assign_random_am_on_insert();

-- 3) Ruleta nueva: BEFORE INSERT sobre prospects.
CREATE OR REPLACE FUNCTION public.assign_am_to_prospect()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator uuid := auth.uid();
  creator_role text;
  chosen uuid;
BEGIN
  -- Respetar un AM ya fijado explícitamente y los inserts sin sesión (service role).
  IF NEW.account_manager_id IS NOT NULL OR creator IS NULL THEN
    RETURN NEW;
  END IF;

  creator_role := public.get_user_role(creator);

  IF creator_role = 'aliado' AND NEW.aliado_id = creator THEN
    -- Self-capture del aliado: sorteo entre los AM de la ruleta (encendidos).
    SELECT id INTO chosen
    FROM public.profiles
    WHERE role = 'account_manager'
      AND COALESCE(auto_assign_enabled, false) = true
    ORDER BY random()
    LIMIT 1;
    NEW.account_manager_id := chosen;  -- NULL si la ruleta está vacía → mesa de dirección.
  ELSIF creator_role = 'account_manager' THEN
    -- Un AM captura (para sí o para un tercero): el proyecto es suyo,
    -- si no, no lo vería en su propio panel (RLS + filtro por proyecto).
    NEW.account_manager_id := creator;
  END IF;
  -- admin/director → queda NULL (gestión directa).

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_am_to_prospect ON public.prospects;
CREATE TRIGGER trg_assign_am_to_prospect
BEFORE INSERT ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.assign_am_to_prospect();

-- 4) Notificaciones del alta (AFTER INSERT, SECURITY DEFINER).
--    La RLS de notifications solo permite INSERT a admin/director: los avisos
--    que involucran a aliados/AMs deben emitirse aquí (el insert client-side
--    del aliado falla en silencio — causa del bug "no llegó la notificación").
CREATE OR REPLACE FUNCTION public.notify_on_prospect_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator uuid := auth.uid();
  am_name text;
  ally_name text;
BEGIN
  -- Sin sesión (service role / restore.js / INSERT masivo por SQL Editor): no
  -- generar notificaciones. Sin este guard, el bloque "avisar al AM" (que usa
  -- IS DISTINCT FROM, TRUE contra un creator NULL) mandaría una campana espuria
  -- por cada fila restaurada que traiga account_manager_id.
  IF creator IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.account_manager_id IS NOT NULL THEN
    SELECT full_name INTO am_name FROM public.profiles WHERE id = NEW.account_manager_id;
    SELECT full_name INTO ally_name FROM public.profiles WHERE id = NEW.aliado_id;

    -- Aliado que capturó lo suyo: avisarle qué AM atenderá su proyecto.
    IF creator IS NOT NULL AND creator = NEW.aliado_id THEN
      INSERT INTO public.notifications (user_id, title, message, type, read)
      VALUES (
        NEW.aliado_id,
        'Account Manager asignado 👤',
        'Tu proyecto de ' || COALESCE(NEW.full_name, 'tu cliente')
          || ' será atendido por ' || COALESCE(am_name, 'tu Account Manager') || '.',
        'info',
        false
      );
    END IF;

    -- Avisar al AM que le llegó un proyecto (salvo que él mismo lo capturara).
    IF NEW.account_manager_id IS DISTINCT FROM creator THEN
      INSERT INTO public.notifications (user_id, title, message, type, read)
      VALUES (
        NEW.account_manager_id,
        'Nuevo proyecto asignado 🎲',
        'La ruleta te asignó el proyecto de ' || COALESCE(NEW.full_name, 'un cliente')
          || COALESCE(' (aliado: ' || ally_name || ')', '') || '.',
        'info',
        false
      );
    END IF;
  END IF;

  -- Un AM capturó y asignó el proyecto a un TERCER aliado: el aviso
  -- "Proyecto Asignado 📁" que la app inserta client-side lo bloquea la RLS
  -- (solo dirección). Se emite aquí SOLO en ese caso para no duplicar el que
  -- sí logra insertar la dirección.
  IF creator IS NOT NULL AND creator <> NEW.aliado_id
     AND public.get_user_role(creator) = 'account_manager' THEN
    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      NEW.aliado_id,
      'Proyecto Asignado 📁',
      'Se te asignó el proyecto de ' || COALESCE(NEW.full_name, 'un cliente')
        || '. Ya es visible en tu Gestión de Clientes.',
      'info',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_prospect_insert ON public.prospects;
CREATE TRIGGER trg_notify_on_prospect_insert
AFTER INSERT ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_prospect_insert();

-- 5) Backfill (una sola vez): los proyectos existentes heredan el AM de
--    cartera que tenía su aliado dueño. Los de aliados sin AM quedan NULL
--    (gestión directa) para que Dirección los reparta a mano si quiere.
UPDATE public.prospects p
SET account_manager_id = pr.account_manager_id
FROM public.profiles pr
WHERE pr.id = p.aliado_id
  AND p.account_manager_id IS NULL
  AND pr.account_manager_id IS NOT NULL;

-- 6) RLS de prospects: la rama del AM pasa de cartera a POR PROYECTO.
--    (Texto base: 20260630000002. documents / prospect_status_history /
--    prospect_messages filtran con EXISTS sobre prospects → heredan solos.)
--    Nota: se retira 'account_manager' de la rama empresa del SELECT — un AM
--    ya no ve proyectos por pertenecer a una empresa, solo los SUYOS.
DROP POLICY IF EXISTS "Aliados ven sus propios prospectos" ON public.prospects;
CREATE POLICY "Aliados ven sus propios prospectos"
  ON public.prospects FOR SELECT USING (
    aliado_id = auth.uid()
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND account_manager_id = auth.uid()
    )
    OR (
      aliado_id IN (
        SELECT aliado_asignado_id
        FROM public.lider_aliados
        WHERE lider_id = auth.uid()
      )
    )
    OR (
      empresa_multialiado_id IS NOT NULL
      AND empresa_multialiado_id IN (
        SELECT empresa_multialiado_id
        FROM public.profiles
        WHERE id = auth.uid()
          AND (aliado_tipo = 'lider' OR role IN ('admin', 'director'))
      )
    )
  );

DROP POLICY IF EXISTS "Admins y dueños pueden actualizar" ON public.prospects;
CREATE POLICY "Admins y dueños pueden actualizar"
  ON public.prospects FOR UPDATE USING (
    aliado_id = auth.uid()
    OR public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND account_manager_id = auth.uid()
    )
    OR (
      aliado_id IN (
        SELECT aliado_asignado_id
        FROM public.lider_aliados
        WHERE lider_id = auth.uid()
      )
    )
  );

-- 7) RLS de profiles (aditiva): el aliado necesita resolver el NOMBRE del AM
--    sorteado de sus proyectos (columna "Account Manager" del listado, expediente).
--    Sin esto vería "—": la política vieja solo le dejaba leer a su AM de
--    cartera vía get_user_account_manager.
--    ACOTADA a los AMs que están asignados a proyectos PROPIOS del llamante (no
--    "todos los AMs"): RLS es por FILA, no por columna, así que abrir todos los
--    AMs filtraría la fila completa (email, phone, password_provisional en texto
--    plano) de cada AM a cualquier autenticado. Este scope mantiene la exposición
--    al mismo nivel que antes del pivote (solo el/los AM que te atienden). La
--    subconsulta a prospects dispara su RLS, satisfecha por la rama aliado_id =
--    auth.uid() sin recursión (get_user_role/get_user_account_manager son
--    SECURITY DEFINER; la política de prospects no lee profiles directamente).
DROP POLICY IF EXISTS "AMs visibles para autenticados" ON public.profiles;
DROP POLICY IF EXISTS "AMs de mis proyectos visibles" ON public.profiles;
CREATE POLICY "AMs de mis proyectos visibles"
  ON public.profiles FOR SELECT USING (
    role = 'account_manager'
    AND id IN (
      SELECT account_manager_id
      FROM public.prospects
      WHERE aliado_id = auth.uid()
    )
  );

-- 8) Recargar el caché de esquemas de PostgREST.
NOTIFY pgrst, 'reload schema';
