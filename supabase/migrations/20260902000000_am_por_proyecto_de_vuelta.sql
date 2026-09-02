-- =============================================================================
-- PensiónFlow — VUELTA al AM por PROYECTO. Deshace 20260831000001.
-- =============================================================================
-- El modelo aliado→AM estuvo vivo en producción del 2026-08-31 al 2026-09-02 y
-- se revierte por decisión de Dirección. Desde aquí manda otra vez la regla de
-- 20260723000000:
--
--   · Aliado captura SU PROPIO proyecto  → AM al azar entre los de la ruleta.
--   · Un AM captura (para quien sea)     → el proyecto queda de ESE AM.
--   · Dirección captura                  → sin AM (gestión directa / mesa).
--   · El AM de un proyecto se reasigna A MANO, proyecto por proyecto, desde
--     Gestión de Clientes y Agenda Futura.
--
-- LO QUE ESTA MIGRACIÓN **NO** PUEDE HACER, Y HAY QUE SABERLO:
-- no devuelve el reparto por proyecto que existía antes del 31 de agosto. El
-- backfill de 20260831000001 sobrescribió `prospects.account_manager_id` con el
-- AM del aliado dueño y el valor anterior no quedó registrado en ninguna tabla
-- (`prospect_status_history` solo guarda estados). El respaldo más cercano es del
-- 9 de agosto: 307 de los 534 proyectos vivos y tres semanas de desfase, así que
-- restaurar desde ahí introduciría errores nuevos en vez de arreglar los viejos.
-- Consecuencia práctica: cada proyecto CONSERVA el AM que tiene hoy —el de su
-- aliado— y a partir de aquí Dirección lo reasigna a mano donde no corresponda.
-- En el respaldo del 9-ago, 18 de 74 aliados tenían proyectos repartidos entre
-- varios AM (206 proyectos): ese reparto es el que se aplanó.
--
-- SE CONSERVAN a propósito (no estorban y quitarlos sí tiene riesgo):
--   · `profiles.account_manager_id` con los valores del 31-ago. Vuelve a ser un
--     campo LEGADO que la aplicación no lee. Antes del 31-ago también existía,
--     pero congelado con valores de julio: esto es estrictamente menos rancio.
--     Las políticas de RLS de 20260630000000 que lo miran quedan como estaban.
--   · La FK `profiles_account_manager_id_fkey` (estaba en el esquema original).
--   · La RPC `asigna_am_a_aliado` y el valor 'asignacion_am' del CHECK de
--     `aliado_auditoria`. La RPC queda INERTE —ya no arrastra proyectos, porque
--     el trigger de cascada desaparece— y se deja para que nada reviente en la
--     ventana entre correr esta migración y desplegar el código revertido. El
--     valor del CHECK se mantiene porque hay 5 filas de auditoría que lo usan.
--
-- Autosuficiente e idempotente: no usa update_updated_at_column() ni referencia
-- profiles.is_active (ninguno de los dos existe en producción).
-- =============================================================================

-- ── 1) Se acaba la cascada aliado → proyectos ────────────────────────────────
-- Es el corazón del modelo que se revierte: mover un aliado de AM ya no toca
-- ninguno de sus proyectos.
DROP TRIGGER IF EXISTS trg_cascada_am_de_aliado ON public.profiles;
DROP FUNCTION IF EXISTS public.cascada_am_de_aliado();

-- ── 2) El alta de un proyecto vuelve a la ruleta ─────────────────────────────
-- Cuerpo idéntico al de 20260723000000. Deja de heredar el AM del aliado.
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

-- El trigger vuelve a ser SOLO de INSERT: cambiar el aliado de un proyecto ya no
-- le cambia el AM (eso lo añadió 20260831000001 y se va con ella).
DROP TRIGGER IF EXISTS trg_assign_am_to_prospect ON public.prospects;
CREATE TRIGGER trg_assign_am_to_prospect
BEFORE INSERT ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.assign_am_to_prospect();

-- ── 3) Los avisos del alta vuelven a hablar de la ruleta ─────────────────────
-- Cuerpo de 20260723000000. Sigue haciendo falta que salgan de un trigger: la
-- RLS de `notifications` solo deja INSERT a dirección.
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
  -- Sin sesión (service role / restore.js / carga masiva): sin campanas.
  IF creator IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.account_manager_id IS NOT NULL THEN
    SELECT full_name INTO am_name FROM public.profiles WHERE id = NEW.account_manager_id;
    SELECT full_name INTO ally_name FROM public.profiles WHERE id = NEW.aliado_id;

    -- Aliado que capturó lo suyo: avisarle qué AM atenderá su proyecto.
    IF creator = NEW.aliado_id THEN
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

  -- Un AM capturó y asignó el proyecto a un TERCER aliado: el aviso que la app
  -- inserta client-side lo bloquea la RLS (solo dirección), así que sale de aquí.
  IF creator <> NEW.aliado_id
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

-- ── 4) Los comentarios vuelven a decir la verdad ─────────────────────────────
COMMENT ON COLUMN public.prospects.account_manager_id IS
  'Account Manager del PROYECTO. Lo pone la ruleta al capturar (o el AM que captura) y Dirección lo reasigna a mano proyecto por proyecto.';

COMMENT ON COLUMN public.profiles.account_manager_id IS
  'LEGADO desde el 2026-09-02: la aplicación NO lo lee. Conserva el reparto de carteras del 31-ago-2026 por si vuelve a hacer falta. El AM va por PROYECTO.';

COMMENT ON COLUMN public.profiles.auto_assign_enabled IS
  'Si está en true, el AM entra en la ruleta que reparte PROYECTOS nuevos al azar cuando un aliado captura lo suyo. Lo enciende Dirección en Gestión AMs.';

COMMENT ON FUNCTION public.asigna_am_a_aliado(uuid[], uuid, text) IS
  'INERTE desde el 2026-09-02: escribe profiles.account_manager_id, que ya nadie lee, y su cascada a proyectos se eliminó. Se conserva solo por compatibilidad.';

-- ── 5) Comprobación ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cascada  int;
  v_insert   text;
  v_ruleta   int;
BEGIN
  SELECT count(*) INTO v_cascada FROM pg_trigger
   WHERE tgname = 'trg_cascada_am_de_aliado' AND NOT tgisinternal;

  SELECT pg_get_triggerdef(oid) INTO v_insert FROM pg_trigger
   WHERE tgname = 'trg_assign_am_to_prospect' AND NOT tgisinternal;

  SELECT count(*) INTO v_ruleta FROM public.profiles
   WHERE role = 'account_manager' AND COALESCE(auto_assign_enabled, false) = true;

  RAISE NOTICE 'Cascada aliado→proyectos eliminada: %', CASE WHEN v_cascada = 0 THEN 'sí' ELSE 'NO, revisar' END;
  RAISE NOTICE 'Trigger de alta: %', COALESCE(v_insert, '(no existe, revisar)');
  RAISE NOTICE 'AMs en la ruleta que recibirán los proyectos nuevos: %', v_ruleta;
END;
$$;

-- ── 6) Recargar el caché de esquemas de PostgREST ────────────────────────────
NOTIFY pgrst, 'reload schema';
