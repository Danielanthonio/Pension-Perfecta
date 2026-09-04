-- =============================================================================
-- PensiónFlow — El AM del ALIADO decide los proyectos NUEVOS. Nada del pasado
-- se toca. Y a partir de aquí, todo cambio de AM queda respaldado.
-- =============================================================================
-- Contexto. El 31-ago se cambió el modelo a "el AM es del aliado" y se aplicó
-- también HACIA ATRÁS: el backfill sobrescribió `prospects.account_manager_id`
-- en 143 proyectos y hubo que reconstruir la atribución anterior a mano
-- (20260902000001) porque ninguna tabla la guardaba. Esta migración persigue el
-- mismo objetivo de negocio SIN repetir ese error:
--
--   · NO hay backfill. Ni una fila de `prospects` se reescribe aquí.
--   · NO hay cascada. Mover a un aliado de AM NO toca sus proyectos actuales.
--   · Lo único que cambia es el AM con el que NACE un proyecto nuevo.
--
-- Regla nueva, completa (solo cambia el primer caso):
--   · Aliado captura SU PROPIO proyecto → al AM de ese aliado
--     (`profiles.account_manager_id`). Si el aliado no tiene AM —o su AM ya no
--     lo es— cae en la ruleta de siempre, para que nada quede sin dueño.
--   · Un AM captura (para quien sea)   → el proyecto es de ESE AM. Sin cambio.
--   · Dirección captura                → sin AM (mesa de dirección). Sin cambio.
--   · El AM de un proyecto concreto se sigue cambiando A MANO desde Gestión de
--     Clientes y Agenda Futura. Esa columna sigue siendo la verdad para la RLS,
--     los reportes, `fin_ventas` y las comisiones.
--
-- Cómo se revierte (por si acaso): basta con volver a poner el cuerpo de
-- `assign_am_to_prospect()` de 20260902000000 —la rama del aliado sorteando la
-- ruleta directamente— y listo. No hay dato que deshacer, porque no se escribe
-- ninguno. Y si alguna vez hiciera falta reconstruir un reparto pasado, ahora
-- está en `am_historial` (punto 1), que arranca con la foto de HOY.
--
-- Autosuficiente e idempotente: no usa update_updated_at_column() ni referencia
-- profiles.is_active (ninguno de los dos existe en producción).
-- =============================================================================

-- ── 1) EL RESPALDO: bitácora de todo cambio de Account Manager ───────────────
-- Es lo que faltó el 31-ago. Guarda el valor ANTERIOR de cada cambio, así que
-- deshacer un movimiento —uno o mil— vuelve a ser un SELECT y no una
-- arqueología de campanas. Arranca con la foto completa del estado de hoy.
CREATE TABLE IF NOT EXISTS public.am_historial (
  id           bigserial PRIMARY KEY,
  entidad      text NOT NULL CHECK (entidad IN ('proyecto', 'aliado')),
  entidad_id   uuid NOT NULL,
  am_anterior  uuid,
  am_nuevo     uuid,
  cambiado_por uuid,
  motivo       text,
  ocurrio_en   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.am_historial IS
  'Bitácora de cambios de Account Manager, del proyecto y del aliado. La escriben triggers; nadie la edita a mano. Su primera carga es la foto del 2026-09-04, para poder revertir el cambio de regla.';

CREATE INDEX IF NOT EXISTS idx_am_historial_entidad
  ON public.am_historial (entidad, entidad_id, ocurrio_en DESC);
CREATE INDEX IF NOT EXISTS idx_am_historial_fecha
  ON public.am_historial (ocurrio_en DESC);

ALTER TABLE public.am_historial ENABLE ROW LEVEL SECURITY;

-- Solo Dirección la lee. Escriben los triggers, que son SECURITY DEFINER y van
-- como dueños de la tabla: por eso no hace falta política de INSERT.
DROP POLICY IF EXISTS "am_historial_select_direccion" ON public.am_historial;
CREATE POLICY "am_historial_select_direccion" ON public.am_historial
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'director'));

-- Foto inicial: el AM que tiene HOY cada proyecto y cada aliado, incluidos los
-- que no tienen ninguno (un NULL también es un estado que hay que poder
-- restaurar). El NOT EXISTS la hace idempotente: correr la migración dos veces
-- no duplica la foto.
INSERT INTO public.am_historial (entidad, entidad_id, am_anterior, am_nuevo, cambiado_por, motivo)
SELECT 'proyecto', p.id, NULL, p.account_manager_id, NULL,
       'respaldo previo al cambio de regla (2026-09-04)'
  FROM public.prospects p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.am_historial h
    WHERE h.entidad = 'proyecto' AND h.entidad_id = p.id
      AND h.motivo = 'respaldo previo al cambio de regla (2026-09-04)'
 );

INSERT INTO public.am_historial (entidad, entidad_id, am_anterior, am_nuevo, cambiado_por, motivo)
SELECT 'aliado', a.id, NULL, a.account_manager_id, NULL,
       'respaldo previo al cambio de regla (2026-09-04)'
  FROM public.profiles a
 WHERE a.role = 'aliado'
   AND NOT EXISTS (
     SELECT 1 FROM public.am_historial h
      WHERE h.entidad = 'aliado' AND h.entidad_id = a.id
        AND h.motivo = 'respaldo previo al cambio de regla (2026-09-04)'
   );

-- ── 2) Los triggers que mantienen viva la bitácora ───────────────────────────
-- Silenciosos y a prueba de fallos: si algo falla aquí NO puede tumbar el alta
-- de un proyecto ni la asignación de un aliado, así que van en AFTER y con
-- EXCEPTION WHEN OTHERS.
CREATE OR REPLACE FUNCTION public.registra_cambio_am_proyecto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.am_historial (entidad, entidad_id, am_anterior, am_nuevo, cambiado_por, motivo)
    VALUES ('proyecto', NEW.id, NULL, NEW.account_manager_id, auth.uid(), 'alta del proyecto');
  ELSIF NEW.account_manager_id IS DISTINCT FROM OLD.account_manager_id THEN
    INSERT INTO public.am_historial (entidad, entidad_id, am_anterior, am_nuevo, cambiado_por, motivo)
    VALUES ('proyecto', NEW.id, OLD.account_manager_id, NEW.account_manager_id, auth.uid(), NULL);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- la bitácora nunca puede hacer fallar la operación que registra
END;
$$;

DROP TRIGGER IF EXISTS trg_am_historial_proyecto ON public.prospects;
CREATE TRIGGER trg_am_historial_proyecto
AFTER INSERT OR UPDATE OF account_manager_id ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.registra_cambio_am_proyecto();

CREATE OR REPLACE FUNCTION public.registra_cambio_am_aliado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_manager_id IS DISTINCT FROM OLD.account_manager_id THEN
    INSERT INTO public.am_historial (entidad, entidad_id, am_anterior, am_nuevo, cambiado_por, motivo)
    VALUES ('aliado', NEW.id, OLD.account_manager_id, NEW.account_manager_id, auth.uid(), NULL);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_am_historial_aliado ON public.profiles;
CREATE TRIGGER trg_am_historial_aliado
AFTER UPDATE OF account_manager_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.registra_cambio_am_aliado();

-- ── 3) La regla nueva: el proyecto nace con el AM de su aliado ───────────────
-- Único cambio de comportamiento de toda la migración, y solo en el INSERT.
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
    -- 1º El AM de la cartera del aliado. El JOIN contra `role` es a propósito:
    -- si a quien apunta la columna ya no es Account Manager (cambio de rol), la
    -- referencia no sirve y hay que caer a la ruleta. El borrado ya lo cubre el
    -- ON DELETE SET NULL de la FK.
    SELECT a.account_manager_id INTO chosen
      FROM public.profiles a
      JOIN public.profiles m ON m.id = a.account_manager_id AND m.role = 'account_manager'
     WHERE a.id = NEW.aliado_id;

    -- 2º Red de seguridad: aliado sin AM → la ruleta de siempre, para que un
    -- hueco en el reparto de carteras no deje proyectos sin quien los trabaje.
    IF chosen IS NULL THEN
      SELECT id INTO chosen
        FROM public.profiles
       WHERE role = 'account_manager'
         AND COALESCE(auto_assign_enabled, false) = true
       ORDER BY random()
       LIMIT 1;
    END IF;

    NEW.account_manager_id := chosen;  -- NULL si además la ruleta está vacía → mesa.
  ELSIF creator_role = 'account_manager' THEN
    -- Un AM captura (para sí o para un tercero): el proyecto es suyo, si no, no
    -- lo vería en su propio panel (RLS + filtro por proyecto). SIN CAMBIO.
    NEW.account_manager_id := creator;
  END IF;
  -- admin/director → queda NULL (gestión directa). SIN CAMBIO.

  RETURN NEW;
END;
$$;

-- El trigger sigue siendo SOLO de INSERT: cambiar el aliado de un proyecto ya
-- existente NO le cambia el AM.
DROP TRIGGER IF EXISTS trg_assign_am_to_prospect ON public.prospects;
CREATE TRIGGER trg_assign_am_to_prospect
BEFORE INSERT ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.assign_am_to_prospect();

-- ── 4) Que las campanas digan la verdad ──────────────────────────────────────
-- Un proyecto que llega por cartera NO lo mandó la ruleta. El texto de estos
-- avisos es, de hecho, el rastro con el que se reconstruyó la atribución
-- perdida del 31-ago, así que tiene que nombrar al aliado y decir por qué vía
-- llegó el proyecto.
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
  ally_am uuid;
  por_cartera boolean;
BEGIN
  -- Sin sesión (service role / restore.js / carga masiva): sin campanas.
  IF creator IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.account_manager_id IS NOT NULL THEN
    SELECT full_name INTO am_name FROM public.profiles WHERE id = NEW.account_manager_id;
    SELECT full_name, account_manager_id INTO ally_name, ally_am
      FROM public.profiles WHERE id = NEW.aliado_id;

    por_cartera := ally_am IS NOT NULL AND ally_am = NEW.account_manager_id;

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
        CASE WHEN por_cartera THEN 'Nuevo proyecto de tu cartera 👤'
             ELSE 'Nuevo proyecto asignado 🎲' END,
        CASE WHEN por_cartera
             THEN 'Tu aliado ' || COALESCE(ally_name, '(sin nombre)')
                    || ' capturó el proyecto de ' || COALESCE(NEW.full_name, 'un cliente') || '.'
             ELSE 'La ruleta te asignó el proyecto de ' || COALESCE(NEW.full_name, 'un cliente')
                    || COALESCE(' (aliado: ' || ally_name || ')', '') || '.'
        END,
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

-- ── 5) La RPC deja de estar inerte (y ya no miente en sus comentarios) ───────
-- Mismo cuerpo y mismas validaciones de 20260831000001. Lo único que cambia es
-- lo que significa: escribe la CARTERA, no arrastra proyectos. La bitácora de
-- `trg_am_historial_aliado` se dispara sola con cada UPDATE.
CREATE OR REPLACE FUNCTION public.asigna_am_a_aliado(
  p_aliado_ids uuid[],
  p_am_id      uuid,
  p_motivo     text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol   text;
  v_n     integer := 0;
  v_id    uuid;
  v_antes uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;

  v_rol := public.get_user_role(auth.uid());
  IF v_rol NOT IN ('admin', 'director') THEN
    RAISE EXCEPTION 'Solo la Dirección asigna el Account Manager de un aliado.';
  END IF;

  IF p_aliado_ids IS NULL OR array_length(p_aliado_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No se recibió ningún aliado.';
  END IF;

  -- p_am_id NULL es válido: devuelve al aliado a la ruleta.
  IF p_am_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_am_id AND role = 'account_manager'
  ) THEN
    RAISE EXCEPTION 'El destino no es un Account Manager.';
  END IF;

  FOREACH v_id IN ARRAY p_aliado_ids LOOP
    SELECT account_manager_id INTO v_antes
      FROM public.profiles
     WHERE id = v_id AND role = 'aliado';

    CONTINUE WHEN NOT FOUND;                             -- no es un aliado: se ignora
    CONTINUE WHEN v_antes IS NOT DISTINCT FROM p_am_id;  -- ya lo tenía

    -- Solo la CARTERA. Los proyectos que ya existen no se tocan.
    UPDATE public.profiles SET account_manager_id = p_am_id WHERE id = v_id;

    PERFORM public.registrar_auditoria_aliado(
      v_id,
      'asignacion_am',
      jsonb_build_object('account_manager_id', v_antes),
      jsonb_build_object('account_manager_id', p_am_id),
      p_motivo
    );

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_account_manager
  ON public.profiles (account_manager_id)
  WHERE account_manager_id IS NOT NULL;

-- ── 6) Los comentarios vuelven a decir la verdad ─────────────────────────────
COMMENT ON COLUMN public.profiles.account_manager_id IS
  'CARTERA: el Account Manager de este aliado. Desde el 2026-09-04 decide a quién le NACEN los proyectos que capture. NO arrastra los proyectos que ya existen. Lo reparte Dirección en /admin/asignacion-am.';

COMMENT ON COLUMN public.prospects.account_manager_id IS
  'Account Manager del PROYECTO, y la verdad para RLS, reportes, fin_ventas y comisiones. Se fija al nacer (cartera del aliado → ruleta → el AM que captura) y Dirección lo cambia a mano proyecto por proyecto.';

COMMENT ON COLUMN public.profiles.auto_assign_enabled IS
  'Ruleta: reparte al azar los proyectos de aliados que TODAVÍA no tienen Account Manager asignado. Es la red de seguridad, no la vía principal. Lo enciende Dirección en Gestión AMs.';

COMMENT ON FUNCTION public.asigna_am_a_aliado(uuid[], uuid, text) IS
  'Reparte la cartera: fija profiles.account_manager_id de uno o varios aliados. Solo Dirección. NO toca los proyectos existentes; solo decide el AM de los que nazcan después.';

-- ── 7) Comprobación ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cascada   int;
  v_foto_pro  int;
  v_foto_ali  int;
  v_con_am    int;
  v_sin_am    int;
  v_ruleta    int;
BEGIN
  SELECT count(*) INTO v_cascada FROM pg_trigger
   WHERE tgname = 'trg_cascada_am_de_aliado' AND NOT tgisinternal;

  SELECT count(*) INTO v_foto_pro FROM public.am_historial
   WHERE entidad = 'proyecto' AND motivo = 'respaldo previo al cambio de regla (2026-09-04)';
  SELECT count(*) INTO v_foto_ali FROM public.am_historial
   WHERE entidad = 'aliado'   AND motivo = 'respaldo previo al cambio de regla (2026-09-04)';

  SELECT count(*) FILTER (WHERE account_manager_id IS NOT NULL),
         count(*) FILTER (WHERE account_manager_id IS NULL)
    INTO v_con_am, v_sin_am
    FROM public.profiles WHERE role = 'aliado';

  SELECT count(*) INTO v_ruleta FROM public.profiles
   WHERE role = 'account_manager' AND COALESCE(auto_assign_enabled, false) = true;

  RAISE NOTICE 'RESPALDO guardado en am_historial → % proyectos y % aliados.', v_foto_pro, v_foto_ali;
  RAISE NOTICE 'Cascada aliado→proyectos: % (debe decir NO existe).',
    CASE WHEN v_cascada = 0 THEN 'NO existe' ELSE 'EXISTE, revisar' END;
  RAISE NOTICE 'Aliados con Account Manager: % · sin Account Manager: %', v_con_am, v_sin_am;
  RAISE NOTICE 'AMs en la ruleta (red de seguridad para esos %): %', v_sin_am, v_ruleta;
END;
$$;

-- ── 8) Recargar el caché de esquemas de PostgREST ────────────────────────────
NOTIFY pgrst, 'reload schema';
