-- =============================================================================
-- PensiónFlow — NOTAS DE SEGUIMIENTO del proyecto (estilo Go High Level).
-- =============================================================================
-- Hoy un proyecto no tiene bitácora de seguimiento. Lo único parecido son dos
-- campos de TEXTO ÚNICO en `prospects`:
--   · `notes_aliado`   — lo que el aliado escribió UNA vez, al capturar.
--   · `notes_director` — el dictamen de Dirección (y, ojo, también el sello
--                        `[DELETED:…]` de la papelera; esta migración NO lo toca).
-- Los dos se PISAN al reescribirse: no hay historia, no hay fecha y no hay autor.
-- Así no se puede responder la pregunta del negocio: «¿cuántos días lleva este
-- proyecto sin que nadie lo toque?».
--
-- Esta migración añade una bitácora de verdad: `prospect_notas`, una fila por
-- nota, con su fecha y su autor. Tantas como se quieran, en orden cronológico.
--
-- Reglas del negocio que quedan selladas EN LA BASE (no en el navegador):
--   1) La FECHA la pone el servidor. Nadie puede antedatar un seguimiento.
--   2) El AUTOR lo pone la sesión (`auth.uid()`), pisando lo que venga en el
--      INSERT — mismo criterio que `created_by` de proyectos (20260824000000).
--      Se guardan además el nombre y el rol como SNAPSHOT: la nota se pinta sin
--      depender de que quien la lee tenga permiso de leer ese perfil (RLS) ni de
--      que la cuenta siga existiendo.
--   3) ESCRIBEN aliado, account manager y dirección. Closer y finanzas no: no
--      trabajan expedientes (la ficha ni se les abre).
--   4) LEEN todos los que ya pueden ver el proyecto. La bitácora es COMPARTIDA:
--      el aliado ve lo que anota su AM y al revés. Es el modelo de GHL y es lo
--      que hace que el seguimiento sirva de conversación. Si algún día hiciera
--      falta la nota interna (que el aliado no ve), se añade una columna
--      `interna boolean` y una rama al SELECT; no hace falta rehacer nada.
--   5) Se CORRIGE y se BORRA solo la nota propia (además, Dirección puede borrar
--      cualquiera). Corregir deja marca visible: `edited_at`.
--
-- Autosuficiente: no usa `update_updated_at_column()` (no existe en producción,
-- ver [[reference-schema-sql-not-applied-in-prod]]) y NO referencia
-- `profiles.is_active` (la columna tampoco existe allá).
-- Aditiva: crea tabla, funciones y políticas propias. No altera ninguna tabla ni
-- política existente, así que no puede romper ningún flujo vivo.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) La tabla
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospect_notas (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  uuid        NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  -- El autor puede desaparecer (baja de un aliado) sin llevarse la nota por
  -- delante: la bitácora es antecedente del CLIENTE, no del empleado.
  autor_id     uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  autor_nombre text        NOT NULL DEFAULT 'Usuario',
  autor_rol    text        NOT NULL DEFAULT 'aliado',
  texto        text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- NULL mientras la nota sea la original. Se rellena sola al corregirla.
  edited_at    timestamptz NULL,
  -- Tope generoso pero tope: una nota es un seguimiento, no un expediente. Y no
  -- se aceptan notas en blanco ni de solo espacios.
  CONSTRAINT prospect_notas_texto_acotado CHECK (char_length(btrim(texto)) BETWEEN 1 AND 4000)
);

COMMENT ON TABLE public.prospect_notas IS
  'Bitácora de seguimiento de un proyecto: una fila por nota, con fecha del servidor y autor sellado. Compartida entre aliado, account manager y dirección.';
COMMENT ON COLUMN public.prospect_notas.autor_id IS
  'Quién escribió la nota. Lo sella el trigger trg_sella_autor_nota con auth.uid(); lo que mande el cliente se ignora.';
COMMENT ON COLUMN public.prospect_notas.autor_nombre IS
  'Snapshot del nombre del autor, para pintar la nota sin depender de la RLS de profiles ni de que la cuenta siga viva.';
COMMENT ON COLUMN public.prospect_notas.autor_rol IS
  'Snapshot del rol del autor EN EL MOMENTO de escribir (aliado / account_manager / admin / director).';
COMMENT ON COLUMN public.prospect_notas.edited_at IS
  'Fecha de la última corrección del texto. NULL = la nota está tal cual se escribió.';

-- La bitácora siempre se lee igual: las notas de UN proyecto, de la más nueva a
-- la más vieja. El índice cubre esa consulta entera.
CREATE INDEX IF NOT EXISTS prospect_notas_proyecto_fecha_idx
  ON public.prospect_notas (prospect_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) La autoría y la fecha las decide el servidor
-- ─────────────────────────────────────────────────────────────────────────────
-- Sin esto, cualquiera con la clave anónima podría escribir una nota a nombre de
-- otro o fechada en el pasado, y el histórico de seguimiento dejaría de valer
-- como prueba de gestión.
CREATE OR REPLACE FUNCTION public.sella_autor_nota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  quien    uuid := auth.uid();
  v_rol    text;
  v_nombre text;
BEGIN
  -- Sin sesión (service_role, migraciones, seeds): se respeta lo que traiga el
  -- INSERT. Es la única puerta por la que se podría cargar histórico.
  IF quien IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.role, p.full_name INTO v_rol, v_nombre
  FROM public.profiles p
  WHERE p.id = quien;

  NEW.autor_id     := quien;
  NEW.autor_nombre := coalesce(nullif(btrim(coalesce(v_nombre, '')), ''), 'Usuario');
  NEW.autor_rol    := coalesce(v_rol, 'aliado');
  NEW.created_at   := now();
  NEW.edited_at    := NULL;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sella_autor_nota ON public.prospect_notas;
CREATE TRIGGER trg_sella_autor_nota
BEFORE INSERT ON public.prospect_notas
FOR EACH ROW
EXECUTE FUNCTION public.sella_autor_nota();

-- Corregir una nota cambia el TEXTO y nada más. Ni el autor, ni la fecha, ni el
-- proyecto al que cuelga: si se pudieran mover, «corregir» sería una forma
-- elegante de reescribir la historia. Y la corrección deja marca.
CREATE OR REPLACE FUNCTION public.protege_nota_editada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.id           := OLD.id;
  NEW.prospect_id  := OLD.prospect_id;
  NEW.autor_id     := OLD.autor_id;
  NEW.autor_nombre := OLD.autor_nombre;
  NEW.autor_rol    := OLD.autor_rol;
  NEW.created_at   := OLD.created_at;
  NEW.edited_at    := CASE
                        WHEN NEW.texto IS DISTINCT FROM OLD.texto THEN now()
                        ELSE OLD.edited_at
                      END;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_protege_nota_editada ON public.prospect_notas;
CREATE TRIGGER trg_protege_nota_editada
BEFORE UPDATE ON public.prospect_notas
FOR EACH ROW
EXECUTE FUNCTION public.protege_nota_editada();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prospect_notas ENABLE ROW LEVEL SECURITY;

-- LEER: quien ya pueda ver el proyecto padre. El EXISTS dispara la RLS de
-- `prospects`, así que esta tabla HEREDA exactamente su modelo de acceso (dueño
-- aliado, líder de su empresa, el AM del proyecto, dirección) y no hay que
-- mantener dos veces la misma lista de casos. Es el patrón de `documents`.
DROP POLICY IF EXISTS "Ver notas de proyectos permitidos" ON public.prospect_notas;
CREATE POLICY "Ver notas de proyectos permitidos"
ON public.prospect_notas
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = prospect_notas.prospect_id)
);

-- ESCRIBIR: solo a nombre propio, solo en un proyecto que ya se puede ver, y
-- solo los tres roles que hacen seguimiento comercial. El `autor_id = auth.uid()`
-- lo garantiza el trigger de arriba; aquí se comprueba otra vez porque el WITH
-- CHECK se evalúa DESPUÉS del trigger y es la última palabra.
DROP POLICY IF EXISTS "Escribir notas en proyectos permitidos" ON public.prospect_notas;
CREATE POLICY "Escribir notas en proyectos permitidos"
ON public.prospect_notas
FOR INSERT
TO authenticated
WITH CHECK (
  autor_id = auth.uid()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['aliado'::text, 'account_manager'::text, 'admin'::text, 'director'::text])
  AND EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = prospect_id)
);

-- CORREGIR: la nota propia. Nadie edita la de otro, ni siquiera Dirección — si
-- Dirección pudiera reescribir la nota de un aliado, la bitácora dejaría de ser
-- prueba de nada.
DROP POLICY IF EXISTS "Corregir la nota propia" ON public.prospect_notas;
CREATE POLICY "Corregir la nota propia"
ON public.prospect_notas
FOR UPDATE
TO authenticated
USING (autor_id = auth.uid())
WITH CHECK (autor_id = auth.uid());

-- BORRAR: la nota propia, y Dirección cualquiera (moderación de la bitácora,
-- mismo criterio que ya tenía `prospect_messages`).
DROP POLICY IF EXISTS "Borrar la nota propia o dirección" ON public.prospect_notas;
CREATE POLICY "Borrar la nota propia o dirección"
ON public.prospect_notas
FOR DELETE
TO authenticated
USING (
  autor_id = auth.uid()
  OR public.get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'director'::text])
);

REVOKE ALL ON public.prospect_notas FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_notas TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) El resumen para el LISTADO de clientes
-- ─────────────────────────────────────────────────────────────────────────────
-- La columna «Último seguimiento» necesita, por proyecto: cuántas notas hay,
-- cuántos DÍAS distintos tienen seguimiento y cuándo fue la última. Bajarse la
-- bitácora entera al navegador para contarla allí sería descargar el libro para
-- sumar una columna, y crece sin techo. Se agrega en Postgres y viaja una fila
-- por proyecto.
--
-- SECURITY INVOKER (el que trae por defecto, y por eso NO se declara DEFINER):
-- la función se ejecuta con los permisos de quien llama, así que la RLS de
-- arriba filtra sola. Cada quien recibe el resumen de los proyectos que ya ve.
--
-- ⚠️ Los nombres del RETURNS TABLE son distintos de los de la tabla
-- (`proyecto_id` y no `prospect_id`): dentro del cuerpo son visibles y una
-- referencia que coincida da 42702 (referencia ambigua) — la trampa que ya
-- mordió en las funciones de Finanzas.
DROP FUNCTION IF EXISTS public.notas_resumen();
CREATE FUNCTION public.notas_resumen()
RETURNS TABLE (
  proyecto_id     uuid,
  total_notas     bigint,
  dias_con_nota   bigint,
  ultima_nota_at  timestamptz,
  ultimo_autor    text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT
    n.prospect_id,
    count(*)::bigint,
    -- Días de MÉXICO, no de UTC: una nota de las 19:00 del lunes es seguimiento
    -- del lunes, no del martes. Mismo criterio que `actividad_dia`.
    count(DISTINCT (n.created_at AT TIME ZONE 'America/Mexico_City')::date)::bigint,
    max(n.created_at),
    (array_agg(n.autor_nombre ORDER BY n.created_at DESC))[1]
  FROM public.prospect_notas n
  GROUP BY n.prospect_id;
$fn$;

COMMENT ON FUNCTION public.notas_resumen() IS
  'Una fila por proyecto: número de notas, días distintos con seguimiento, fecha de la última y quién la escribió. Respeta la RLS de quien llama.';

REVOKE ALL ON FUNCTION public.notas_resumen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notas_resumen() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Realtime (opcional)
-- ─────────────────────────────────────────────────────────────────────────────
-- Deja la puerta abierta a que dos personas viendo la misma ficha se vean las
-- notas al vuelo. Idempotente y tolerante a que la publicación no exista.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'prospect_notas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prospect_notas;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- PostgREST tiene que enterarse de la tabla y de la función nuevas o el front
-- recibiría 404 hasta el siguiente reinicio del proyecto.
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Verificación (informativa; sale en los NOTICE del editor SQL)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_politicas int;
  n_triggers  int;
BEGIN
  SELECT count(*) INTO n_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'prospect_notas';
  SELECT count(*) INTO n_triggers FROM pg_trigger
   WHERE tgrelid = 'public.prospect_notas'::regclass AND NOT tgisinternal;
  RAISE NOTICE 'Notas de seguimiento listas: % políticas RLS, % triggers, tabla vacía a la espera de la primera nota.',
    n_politicas, n_triggers;
END $$;
