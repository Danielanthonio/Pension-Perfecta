-- =============================================================================
-- PensiónFlow — VUELTA ATRÁS DEL PIVOTE: el Account Manager se asigna al ALIADO.
-- =============================================================================
-- Deshace la regla de 20260723000000 (`am_por_proyecto`). Desde aquí:
--
--   · Cada ALIADO tiene un Account Manager, que le pone la Dirección a mano
--     desde el módulo "Asignación AM". No hay ruleta, no lo hereda quien
--     captura, no se elige por proyecto.
--   · El AM de un PROYECTO es SIEMPRE el de su aliado dueño. La columna
--     `prospects.account_manager_id` se conserva, pero deja de ser un dato que
--     alguien teclea: pasa a ser un ESPEJO que mantiene la base. Se conserva
--     porque de ella cuelgan la RLS de prospects, Finanzas (`fin_ventas`), los
--     reportes y una veintena de pantallas: convertirla en espejo cambia el
--     modelo sin tocar a ninguno de sus lectores.
--   · Mover un aliado de AM arrastra sus proyectos al nuevo AM.
--
-- LA EXCEPCIÓN, Y POR QUÉ: los proyectos que YA son venta (`fin_estados_venta()`
-- = firma_programada / pagado_comision) NO cambian de AM, ni en el backfill ni
-- al reasignar después. El devengo de comisiones es una reconciliación que se
-- vuelve a correr entera (20260805000000): si una venta cambiara de AM, la
-- comisión del AM anterior se revertiría —o se emitiría un cargo negativo si ya
-- se pagó— y la del nuevo nacería de cero. Una venta la gestionó quien la
-- gestionó; ese hecho no se reescribe. Todo el pipeline vivo sí se mueve.
--
-- Autosuficiente e idempotente: no usa update_updated_at_column() ni referencia
-- profiles.is_active (ninguno de los dos existe en producción).
-- Orden: va DESPUÉS de 20260831000000_hitos_alcanzados.sql.
-- =============================================================================

-- ── 1) La columna del aliado vuelve a ser la fuente de la verdad ─────────────
-- Existe desde el esquema original y sobrevivió al pivote como legado (llevaba
-- congelada desde el 2026-07-23). Aquí se repuebla y vuelve a mandar.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_manager_id uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_account_manager_id
  ON public.profiles(account_manager_id);

COMMENT ON COLUMN public.profiles.account_manager_id IS
  'Account Manager responsable del aliado. Lo asigna la Dirección. De aquí sale el AM de TODOS sus proyectos (prospects.account_manager_id es un espejo).';

COMMENT ON COLUMN public.prospects.account_manager_id IS
  'ESPEJO del AM del aliado dueño: lo mantienen los triggers, no se teclea. Excepción: una venta conserva el AM que la gestionó aunque el aliado cambie de AM.';

COMMENT ON COLUMN public.profiles.auto_assign_enabled IS
  'LEGADO de la ruleta de asignación automática (2026-07-22 / 2026-07-23). Desde 20260831000001 la asignación es manual de Dirección y nada lee esta columna.';

-- Garantiza el lector que usan las políticas de RLS de `profiles` (lo define
-- schema.sql, que NO está aplicado en producción; en prod existe porque lo
-- exigieron las políticas de 20260630000000, pero no se deja al azar).
CREATE OR REPLACE FUNCTION public.get_user_account_manager(user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_manager_id FROM public.profiles WHERE id = user_id;
$$;

-- ── 2) Backfill: de dónde sale el AM de cada aliado hoy ──────────────────────
-- El AM que MÁS proyectos le gestiona (desempate: el del proyecto más reciente,
-- y luego el id, para que el resultado sea determinista). Es el que refleja la
-- relación real de trabajo y el que menos proyectos obliga a cambiar de dueño.
--
-- Los aliados SIN proyectos conservan lo que tuvieran de antes del pivote: es su
-- última asignación conocida y no hay nada mejor con qué contradecirla.
-- Se ignoran los proyectos en papelera y purgados (la app los marca prefijando
-- `notes_director`, no con una columna) y los AM que ya no son AM.
WITH conteo AS (
  SELECT p.aliado_id,
         p.account_manager_id                AS am_id,
         count(*)                            AS n,
         max(p.created_at)                   AS ultimo
    FROM public.prospects p
    JOIN public.profiles am ON am.id = p.account_manager_id
                           AND am.role = 'account_manager'
   WHERE p.aliado_id IS NOT NULL
     AND COALESCE(p.notes_director, '') NOT LIKE '[DELETED:%'
     AND COALESCE(p.notes_director, '') NOT LIKE '[PURGED:%'
   GROUP BY p.aliado_id, p.account_manager_id
),
ganador AS (
  SELECT DISTINCT ON (aliado_id) aliado_id, am_id
    FROM conteo
   ORDER BY aliado_id, n DESC, ultimo DESC, am_id
)
UPDATE public.profiles a
   SET account_manager_id = g.am_id
  FROM ganador g
 WHERE a.id = g.aliado_id
   AND a.role = 'aliado'
   AND a.account_manager_id IS DISTINCT FROM g.am_id;

-- Limpieza defensiva: un aliado no puede apuntar a alguien que ya no es AM
-- (cuenta borrada o cambiada de rol). Se deja en NULL para que salga marcado
-- como "sin asignar" en el módulo y la Dirección lo reparta.
UPDATE public.profiles a
   SET account_manager_id = NULL
 WHERE a.role = 'aliado'
   AND a.account_manager_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.profiles am
      WHERE am.id = a.account_manager_id
        AND am.role = 'account_manager'
   );

-- Cualquier referencia colgada (a un perfil que ya no existe) se limpia antes de
-- exigir la integridad referencial del paso siguiente.
UPDATE public.profiles a
   SET account_manager_id = NULL
 WHERE a.account_manager_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles am WHERE am.id = a.account_manager_id);

-- La FK con ON DELETE SET NULL es la que hace que borrar a un AM devuelva a sus
-- aliados a la mesa de dirección en vez de dejarlos apuntando al vacío. Está en
-- el esquema original, pero schema.sql NO se aplicó en producción, así que se
-- comprueba: sin ella, un AM borrado dejaría carteras fantasma.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.profiles'::regclass
       AND contype = 'f'
       AND conname = 'profiles_account_manager_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_manager_id_fkey
      FOREIGN KEY (account_manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 3) Backfill de proyectos: retroactivo, SALVO las ventas ──────────────────
-- Todo el pipeline vivo pasa al AM de su aliado. Las ventas se quedan con quien
-- las gestionó (ver la cabecera). Tampoco se vacía el AM de un proyecto cuyo
-- aliado quedó sin asignar: quitarle el AM le quitaría la visibilidad por RLS a
-- alguien que hoy sí lo está trabajando. Ese hueco lo cierra la Dirección
-- asignando al aliado, y entonces el trigger de cascada lo arrastra.
UPDATE public.prospects p
   SET account_manager_id = a.account_manager_id
  FROM public.profiles a
 WHERE a.id = p.aliado_id
   AND a.role = 'aliado'
   AND a.account_manager_id IS NOT NULL
   AND p.account_manager_id IS DISTINCT FROM a.account_manager_id
   AND NOT (p.status = ANY (public.fin_estados_venta()));

-- ── 4) El AM de un proyecto nuevo se HEREDA del aliado ───────────────────────
-- Reemplaza el cuerpo de la ruleta de 20260723000000. Se conserva el nombre de
-- la función y del trigger: otros comentarios del esquema los citan por nombre y
-- el orden alfabético de los BEFORE respecto a trg_sellar_hitos_prospecto y
-- trg_set_prospect_creator no cambia (siguen siendo independientes entre sí).
--
-- También corre al cambiar el ALIADO de un proyecto (`reassignProspect`): si el
-- expediente pasa a otro aliado, su gestión pasa al AM de ese aliado.
CREATE OR REPLACE FUNCTION public.assign_am_to_prospect()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin sesión (service_role, restore.js, INSERT masivo desde el SQL Editor) se
  -- respeta el valor que venga: una restauración no debe reescribir el dato.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Una venta no cambia de AM aunque se le mueva el aliado.
  IF TG_OP = 'UPDATE' AND NEW.status = ANY (public.fin_estados_venta()) THEN
    RETURN NEW;
  END IF;

  -- Sin ruleta y sin herencia de quien captura: si el aliado no tiene AM, el
  -- proyecto nace en mesa de dirección hasta que la Dirección asigne al aliado.
  NEW.account_manager_id := public.get_user_account_manager(NEW.aliado_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_am_to_prospect ON public.prospects;
CREATE TRIGGER trg_assign_am_to_prospect
BEFORE INSERT OR UPDATE OF aliado_id ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.assign_am_to_prospect();

-- ── 5) Notificaciones del alta: sin ruleta ───────────────────────────────────
-- Mismo trigger de 20260723000000 (la RLS de `notifications` solo deja INSERT a
-- dirección, así que los avisos al aliado y al AM tienen que salir de aquí), con
-- los textos corregidos: ya nadie sortea nada.
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
  -- Sin sesión: no generar campanas (restauraciones, cargas masivas).
  IF creator IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.account_manager_id IS NOT NULL THEN
    SELECT full_name INTO am_name FROM public.profiles WHERE id = NEW.account_manager_id;
    SELECT full_name INTO ally_name FROM public.profiles WHERE id = NEW.aliado_id;

    -- Al aliado que capturó lo suyo: quién va a atenderlo.
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

    -- Al AM de la cartera, salvo que lo capturara él mismo.
    IF NEW.account_manager_id IS DISTINCT FROM creator THEN
      INSERT INTO public.notifications (user_id, title, message, type, read)
      VALUES (
        NEW.account_manager_id,
        'Nuevo proyecto en tu cartera 📁',
        'Se registró el proyecto de ' || COALESCE(NEW.full_name, 'un cliente')
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

-- ── 6) Cambiar el AM de un aliado arrastra sus proyectos ─────────────────────
-- Se crea DESPUÉS de los backfills a propósito: si existiera antes, cada fila
-- del paso 2 habría disparado su propio UPDATE sobre prospects y habría hecho
-- dos veces el trabajo del paso 3.
--
-- No se toca `updated_at` de los proyectos: una reasignación de cartera no es un
-- movimiento del expediente, y `updated_at` lo leen el "último seguimiento" y la
-- fecha de ejecución aproximada del modo demo.
CREATE OR REPLACE FUNCTION public.cascada_am_de_aliado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
  v_am_nombre text;
BEGIN
  IF NEW.role <> 'aliado' THEN
    RETURN NEW;
  END IF;
  IF NEW.account_manager_id IS NOT DISTINCT FROM OLD.account_manager_id THEN
    RETURN NEW;
  END IF;

  -- Las ventas se quedan con el AM que las gestionó (ver la cabecera).
  UPDATE public.prospects p
     SET account_manager_id = NEW.account_manager_id
   WHERE p.aliado_id = NEW.id
     AND p.account_manager_id IS DISTINCT FROM NEW.account_manager_id
     AND NOT (p.status = ANY (public.fin_estados_venta()));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Sin sesión: se mueve la cartera pero no se reparten campanas.
  IF auth.uid() IS NULL OR NEW.account_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_am_nombre FROM public.profiles WHERE id = NEW.account_manager_id;

  -- Una sola campana por aliado, no una por proyecto.
  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    NEW.account_manager_id,
    'Aliado asignado 👤',
    'Ahora gestionas a ' || COALESCE(NEW.full_name, 'un aliado')
      || CASE WHEN v_n > 0
              THEN ' y sus ' || v_n || ' proyecto(s) en curso.'
              ELSE '. Todavía no tiene proyectos en curso.' END,
    'info',
    false
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    NEW.id,
    'Account Manager asignado 👤',
    'Tu Account Manager es ' || COALESCE(v_am_nombre, 'tu nuevo Account Manager')
      || '. Es quien atenderá tus proyectos.',
    'info',
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascada_am_de_aliado ON public.profiles;
CREATE TRIGGER trg_cascada_am_de_aliado
AFTER UPDATE OF account_manager_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cascada_am_de_aliado();

-- ── 7) La única puerta para asignar: RPC de Dirección ────────────────────────
-- Por RPC y no por RLS, mismo criterio que `asigna_closer_a_aliado`: la escritura
-- va acompañada de validación de roles y de su registro en la auditoría, y así no
-- depende de que el cliente mande la verdad. Acepta varios aliados de un tirón
-- porque el módulo asigna en lote.
-- El CHECK de `accion` se creó en línea dentro del CREATE TABLE, así que Postgres
-- lo bautizó `aliado_auditoria_accion_check`. Se buscan igualmente TODOS los
-- CHECK de la tabla que enumeren acciones: si quedara uno vivo con la lista
-- vieja, el primer 'asignacion_am' reventaría con un 23514 difícil de leer.
DO $$
DECLARE
  v_con text;
BEGIN
  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.aliado_auditoria'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%atribucion_closer%'
  LOOP
    EXECUTE format('ALTER TABLE public.aliado_auditoria DROP CONSTRAINT %I', v_con);
  END LOOP;
END;
$$;

ALTER TABLE public.aliado_auditoria DROP CONSTRAINT IF EXISTS aliado_auditoria_accion_check;
ALTER TABLE public.aliado_auditoria ADD CONSTRAINT aliado_auditoria_accion_check
  CHECK (accion IN ('alta', 'edicion', 'credenciales_vistas', 'credenciales_cambiadas',
                    'estado', 'eliminacion', 'atribucion_closer', 'asignacion_am'));

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

  -- p_am_id NULL es válido: devuelve al aliado a la mesa de dirección.
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

    CONTINUE WHEN NOT FOUND;                        -- no es un aliado: se ignora
    CONTINUE WHEN v_antes IS NOT DISTINCT FROM p_am_id;  -- ya lo tenía

    -- Dispara trg_cascada_am_de_aliado, que arrastra los proyectos.
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

COMMENT ON FUNCTION public.asigna_am_a_aliado(uuid[], uuid, text) IS
  'Única puerta de escritura del AM de un aliado. Solo Dirección; arrastra los proyectos por trigger (salvo ventas) y deja rastro en aliado_auditoria.';

GRANT EXECUTE ON FUNCTION public.asigna_am_a_aliado(uuid[], uuid, text) TO authenticated;

-- ── 8) Resumen para el SQL Editor ────────────────────────────────────────────
DO $$
DECLARE
  v_aliados   bigint;
  v_con_am    bigint;
  v_sin_am    bigint;
  v_desfase   bigint;
  v_ventas    bigint;
BEGIN
  SELECT count(*) FILTER (WHERE role = 'aliado'),
         count(*) FILTER (WHERE role = 'aliado' AND account_manager_id IS NOT NULL),
         count(*) FILTER (WHERE role = 'aliado' AND account_manager_id IS NULL)
    INTO v_aliados, v_con_am, v_sin_am
    FROM public.profiles;

  SELECT count(*) FILTER (WHERE NOT (p.status = ANY (public.fin_estados_venta()))),
         count(*) FILTER (WHERE p.status = ANY (public.fin_estados_venta()))
    INTO v_desfase, v_ventas
    FROM public.prospects p
    JOIN public.profiles a ON a.id = p.aliado_id
   WHERE p.account_manager_id IS DISTINCT FROM a.account_manager_id;

  RAISE NOTICE 'Aliados: % · con AM: % · sin AM: %', v_aliados, v_con_am, v_sin_am;
  RAISE NOTICE 'Ventas que conservan su AM anterior (esperado): %', v_ventas;
  RAISE NOTICE 'Proyectos NO venta cuyo AM no coincide con el de su aliado (esperado 0 salvo aliados sin AM): %', v_desfase;
END;
$$;

-- ── 9) Recargar el caché de esquemas de PostgREST ────────────────────────────
NOTIFY pgrst, 'reload schema';
