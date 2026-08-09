-- =============================================================================
-- PensiónFlow — Actividad y tiempo en plataforma de los Account Managers
-- =============================================================================
-- Pedido por Dirección el 2026-08-09. Vive dentro del reporte «ACCOUNT MANAGER»
-- del módulo Reportes, como un panel más al final.
--
-- QUÉ RESUELVE
-- Un AM con pocos cierres puede tenerlos por dos motivos opuestos: no le entran
-- clientes, o no trabaja los que tiene. El pipeline no distingue esos dos casos
-- porque solo ve el resultado. Aquí se registra el ESFUERZO: cuánto tiempo está
-- dentro de la plataforma y qué hace mientras está.
--
-- LAS DOS TABLAS
--   · `actividad_sesiones` — TIEMPO. Un renglón por (AM, día). Se alimenta de
--     latidos: el navegador avisa «sigo aquí» cada minuto y el servidor suma el
--     hueco transcurrido desde el latido anterior.
--   · `actividad_eventos`  — QUÉ HACE. Un renglón por acción (abrir el
--     expediente de un cliente, cambiar de etapa, agendar, subir documento…).
--
-- POR QUÉ EL TIEMPO LO PONE EL SERVIDOR Y NO EL NAVEGADOR
-- El reporte compara a unas personas con otras, así que el dato no puede salir
-- de un número que el cliente teclee en la petición. El navegador solo dice
-- «estoy aquí AHORA»; el reloj (`now()`), el hueco entre latidos y su tope los
-- pone Postgres. Por eso NO hay GRANT de INSERT/UPDATE sobre estas tablas: se
-- escriben únicamente por las funciones SECURITY DEFINER de abajo, que firman
-- con `auth.uid()`. Lo peor que puede hacer un cliente hostil es latir más
-- seguido, que no suma ni un segundo de más.
--
-- EL HUECO SE TOPA EN 3 MINUTOS
-- Si entre dos latidos pasan más de 3 minutos, el usuario NO estaba: se abre un
-- tramo nuevo y el hueco no se cuenta. Así una pestaña olvidada, un portátil
-- dormido o una tarde entera con la sesión colgada no inflan el tiempo. (El
-- cierre por inactividad de la app ya bota la sesión a los 5 minutos.)
--
-- SOLO ACCOUNT MANAGERS
-- Las funciones de escritura comprueban el rol de quien llama y no registran
-- nada para nadie más. Decisión de alcance de Dirección: se mide a los AM entre
-- sí, no a toda la plantilla.
--
-- AUTOSUFICIENTE A PROPÓSITO
-- `schema.sql` NO está aplicado en producción: aquí no se supone que exista
-- ninguna función compartida. `reportes_es_direccion()` llegó con la migración
-- 20260808000000 y se vuelve a declarar idéntica más abajo para que esta no
-- dependa del orden de aplicación.
--
-- NO se referencia `profiles.is_active`: esa columna no existe en producción.
--
-- Todo es ADITIVO e IDEMPOTENTE y va dentro de una transacción.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) HELPERS
-- ─────────────────────────────────────────────────────────────────────────────
-- Idénticas a las de 20260808000000. Se repiten con CREATE OR REPLACE (misma
-- firma, mismo cuerpo) para que esta migración se sostenga sola sobre una base
-- limpia; sobre producción es un no-op.
CREATE OR REPLACE FUNCTION public.reportes_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$fn$;

CREATE OR REPLACE FUNCTION public.reportes_es_direccion()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(public.reportes_my_role() IN ('admin', 'director'), false);
$fn$;

REVOKE ALL ON FUNCTION public.reportes_my_role()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reportes_es_direccion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reportes_my_role()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reportes_es_direccion() TO authenticated;

-- El día de trabajo es el día en MÉXICO, no en UTC. Cortar en UTC mandaría todo
-- lo hecho a partir de las 18:00 al día siguiente —y el último día del mes, al
-- mes siguiente—, así que el lunes por la tarde aparecería como martes.
-- México no aplica horario de verano desde 2022, así que el desfase es fijo.
CREATE OR REPLACE FUNCTION public.actividad_dia(p_momento timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT (p_momento AT TIME ZONE 'America/Mexico_City')::date;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) TIEMPO: tramos de sesión
-- ─────────────────────────────────────────────────────────────────────────────
-- Un tramo es un rato SEGUIDO dentro de la plataforma. Un día normal es un solo
-- tramo; salir a comer y volver hace dos. Que sean tramos y no una fila diaria
-- da gratis la hora de entrada, la de salida y cuántas veces se conectó.
CREATE TABLE IF NOT EXISTS public.actividad_sesiones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Día de México al que se imputa el tramo. Un tramo que cruza la medianoche se
  -- parte solo: al cambiar el día, el latido siguiente abre tramo nuevo.
  dia              date        NOT NULL,
  inicio           timestamptz NOT NULL DEFAULT now(),
  ultimo_latido    timestamptz NOT NULL DEFAULT now(),
  -- Segundos con la plataforma delante (pestaña visible). Los suma el servidor.
  segundos         integer     NOT NULL DEFAULT 0,
  -- Subconjunto del anterior: segundos en los que además hubo interacción real
  -- (ratón, teclado, scroll) en los últimos 2 minutos. `segundos` mide presencia;
  -- `segundos_activos` mide trabajo. La diferencia entre los dos es la pantalla
  -- abierta sin tocarla.
  segundos_activos integer     NOT NULL DEFAULT 0,
  latidos          integer     NOT NULL DEFAULT 1,
  CONSTRAINT actividad_sesiones_segundos_no_negativos CHECK (segundos >= 0 AND segundos_activos >= 0),
  CONSTRAINT actividad_sesiones_activos_acotados      CHECK (segundos_activos <= segundos)
);

COMMENT ON TABLE public.actividad_sesiones IS
  'Tiempo dentro de la plataforma, en tramos seguidos, por Account Manager y día de México. Lo escribe SOLO actividad_latido(): el navegador nunca envía duraciones.';
COMMENT ON COLUMN public.actividad_sesiones.segundos IS
  'Segundos de presencia (pestaña visible). Huecos de más de 3 minutos no cuentan: abren tramo nuevo.';
COMMENT ON COLUMN public.actividad_sesiones.segundos_activos IS
  'Segundos de presencia CON interacción reciente. segundos − segundos_activos = pantalla abierta sin tocar.';

CREATE INDEX IF NOT EXISTS actividad_sesiones_user_dia_idx ON public.actividad_sesiones (user_id, dia);
CREATE INDEX IF NOT EXISTS actividad_sesiones_dia_idx      ON public.actividad_sesiones (dia);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) QUÉ HACE: bitácora de acciones
-- ─────────────────────────────────────────────────────────────────────────────
-- `tipo` es un slug libre (con tope de longitud) y NO un enum ni un CHECK contra
-- una lista: el catálogo vive en el cliente (`src/utils/actividad.ts`), así que
-- añadir una actividad nueva es un cambio de front y no una migración. El
-- reporte agrupa por el slug tal cual y rotula lo que no conoce con su propio
-- slug, que es feo pero nunca miente.
CREATE TABLE IF NOT EXISTS public.actividad_eventos (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sesion_id  uuid        REFERENCES public.actividad_sesiones(id) ON DELETE SET NULL,
  tipo       text        NOT NULL,
  -- Etiqueta corta y legible de lo que se tocó (el módulo, la etapa nueva…).
  detalle    text,
  -- Proyecto o perfil afectado. A propósito SIN clave foránea: la bitácora tiene
  -- que sobrevivir al borrado de lo que apunta, y no puede impedirlo.
  entidad_id uuid,
  ocurrio_en timestamptz NOT NULL DEFAULT now(),
  dia        date        NOT NULL,
  CONSTRAINT actividad_eventos_tipo_acotado    CHECK (char_length(tipo) BETWEEN 1 AND 40),
  CONSTRAINT actividad_eventos_detalle_acotado CHECK (detalle IS NULL OR char_length(detalle) <= 160)
);

COMMENT ON TABLE public.actividad_eventos IS
  'Bitácora de lo que hace un Account Manager dentro de la plataforma. Solo lectura para todos: se escribe por actividad_registrar().';
COMMENT ON COLUMN public.actividad_eventos.tipo IS
  'Slug de la actividad (vista_modulo, abre_expediente, cambia_etapa…). El catálogo de etiquetas vive en el cliente.';

CREATE INDEX IF NOT EXISTS actividad_eventos_user_dia_idx  ON public.actividad_eventos (user_id, dia);
CREATE INDEX IF NOT EXISTS actividad_eventos_dia_tipo_idx  ON public.actividad_eventos (dia, tipo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ESCRITURA (las dos únicas puertas)
-- ─────────────────────────────────────────────────────────────────────────────

-- Latido. El navegador lo llama cada minuto mientras la pestaña esté VISIBLE.
-- Devuelve el tramo vigente para que el evento que venga detrás se cuelgue de él.
--
-- Silencioso a propósito: si quien llama no es un Account Manager, o no hay
-- sesión, devuelve NULL sin error. Esto lo invoca un temporizador de fondo y no
-- puede reventarle la pantalla a nadie.
CREATE OR REPLACE FUNCTION public.actividad_latido(p_activo boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- Hueco máximo que se acepta como «seguía delante». Más que esto es una
  -- ausencia: se abre tramo nuevo y el tiempo intermedio no se regala.
  c_gracia  constant interval := interval '3 minutes';
  v_me      uuid := auth.uid();
  v_ahora   timestamptz := now();
  v_dia     date;
  v_id      uuid;
  v_ultimo  timestamptz;
  v_delta   integer;
BEGIN
  IF v_me IS NULL THEN
    RETURN NULL;
  END IF;
  IF public.reportes_my_role() IS DISTINCT FROM 'account_manager' THEN
    RETURN NULL;
  END IF;

  v_dia := public.actividad_dia(v_ahora);

  SELECT s.id, s.ultimo_latido
    INTO v_id, v_ultimo
  FROM public.actividad_sesiones s
  WHERE s.user_id = v_me
    AND s.dia = v_dia
  ORDER BY s.ultimo_latido DESC
  LIMIT 1;

  -- Primer latido del día, o vuelta después de una ausencia: tramo nuevo. Arranca
  -- en cero porque el minuto que va del primer latido al segundo aún no ha
  -- pasado; el reporte prefiere quedarse corto a inventar tiempo.
  --
  -- Sin bloqueo a propósito: dos pestañas que arrancan a la vez pueden crear dos
  -- tramos y dejar uno huérfano a cero. Solo afecta al recuento de «conexiones»
  -- —el TIEMPO no se duplica, porque a partir de ahí las dos empujan el tramo de
  -- `ultimo_latido` más reciente— y no compensa serializar cada latido de cada AM
  -- para afinar una columna secundaria.
  IF v_id IS NULL OR v_ahora - v_ultimo > c_gracia THEN
    INSERT INTO public.actividad_sesiones (user_id, dia, inicio, ultimo_latido, segundos, segundos_activos, latidos)
    VALUES (v_me, v_dia, v_ahora, v_ahora, 0, 0, 1)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- El hueco real, topado en la gracia: latir más seguido no suma más tiempo, y
  -- dos pestañas abiertas del mismo usuario tampoco lo cuentan dos veces (las dos
  -- empujan el MISMO tramo, cada una desde el último latido de la otra).
  v_delta := greatest(0, least(extract(epoch FROM (v_ahora - v_ultimo))::integer, extract(epoch FROM c_gracia)::integer));

  UPDATE public.actividad_sesiones s
     SET ultimo_latido    = v_ahora,
         segundos         = s.segundos + v_delta,
         segundos_activos = s.segundos_activos + CASE WHEN coalesce(p_activo, false) THEN v_delta ELSE 0 END,
         latidos          = s.latidos + 1
   WHERE s.id = v_id;

  RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.actividad_latido(boolean) IS
  'Registra presencia AHORA y suma al tramo vigente el hueco desde el latido anterior (tope 3 min). Solo para account_manager; para cualquier otro rol devuelve NULL sin escribir.';

-- Registra una acción. Late de paso: hacer algo es la mejor prueba de estar.
--
-- Antirrebote de 60 s por (tipo, entidad): React monta dos veces en desarrollo,
-- el usuario recarga, vuelve atrás… y el mismo «abre_expediente» llegaría tres
-- veces seguidas e inflaría el ranking de actividades. Abrir la misma ficha por
-- la tarde SÍ cuenta otra vez: la ventana es de un minuto, no del día.
CREATE OR REPLACE FUNCTION public.actividad_registrar(
  p_tipo      text,
  p_detalle   text DEFAULT NULL,
  p_entidad   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid := auth.uid();
  v_tipo   text := nullif(btrim(coalesce(p_tipo, '')), '');
  v_sesion uuid;
BEGIN
  IF v_me IS NULL OR v_tipo IS NULL THEN
    RETURN;
  END IF;
  IF public.reportes_my_role() IS DISTINCT FROM 'account_manager' THEN
    RETURN;
  END IF;

  v_tipo := left(v_tipo, 40);
  v_sesion := public.actividad_latido(true);

  IF EXISTS (
    SELECT 1
    FROM public.actividad_eventos e
    WHERE e.user_id = v_me
      AND e.tipo = v_tipo
      AND e.entidad_id IS NOT DISTINCT FROM p_entidad
      AND e.ocurrio_en > now() - interval '60 seconds'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.actividad_eventos (user_id, sesion_id, tipo, detalle, entidad_id, ocurrio_en, dia)
  VALUES (v_me, v_sesion, v_tipo, left(nullif(btrim(coalesce(p_detalle, '')), ''), 160), p_entidad, now(), public.actividad_dia(now()));
END;
$fn$;

COMMENT ON FUNCTION public.actividad_registrar(text, text, uuid) IS
  'Anota una acción del Account Manager y de paso late. Ignora repeticiones del mismo (tipo, entidad) dentro de 60 s.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) LECTURA (agregada en Postgres, nunca en el navegador)
-- ─────────────────────────────────────────────────────────────────────────────
-- Tres llamadas resuelven el panel entero. La bitácora puede tener decenas de
-- miles de renglones al mes: bajarla al navegador para contarla allí sería
-- descargar el libro entero para sumar una columna.
--
-- El alcance se impone DENTRO, porque son SECURITY DEFINER: Dirección lo ve
-- todo, un Account Manager solo lo suyo, y cualquier otro rol no ve nada.
--
-- ⚠️ Todas las referencias a columnas van cualificadas (`s.segundos`, no
-- `segundos`): los nombres del RETURNS TABLE son visibles dentro del cuerpo y
-- una referencia desnuda da 42702 (referencia ambigua).

DROP FUNCTION IF EXISTS public.actividad_resumen(date, date);
CREATE FUNCTION public.actividad_resumen(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  am_id            uuid,
  am_nombre        text,
  segundos         bigint,
  segundos_activos bigint,
  dias_activos     bigint,
  tramos           bigint,
  eventos          bigint,
  primer_dia       date,
  ultimo_dia       date,
  ultima_conexion  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  WITH yo AS (
    SELECT auth.uid() AS me, public.reportes_es_direccion() AS dir
  ),
  visibles AS (
    SELECT s.*
    FROM public.actividad_sesiones s, yo
    WHERE (yo.dir OR s.user_id = yo.me)
      AND (p_desde IS NULL OR s.dia >= p_desde)
      AND (p_hasta IS NULL OR s.dia <= p_hasta)
  ),
  ev AS (
    SELECT e.user_id, count(*) AS n
    FROM public.actividad_eventos e, yo
    WHERE (yo.dir OR e.user_id = yo.me)
      AND (p_desde IS NULL OR e.dia >= p_desde)
      AND (p_hasta IS NULL OR e.dia <= p_hasta)
    GROUP BY e.user_id
  )
  SELECT
    v.user_id,
    coalesce(pf.full_name, 'Account Manager'),
    sum(v.segundos)::bigint,
    sum(v.segundos_activos)::bigint,
    count(DISTINCT v.dia)::bigint,
    count(*)::bigint,
    coalesce(max(ev.n), 0)::bigint,
    min(v.dia),
    max(v.dia),
    max(v.ultimo_latido)
  FROM visibles v
  LEFT JOIN public.profiles pf ON pf.id = v.user_id
  LEFT JOIN ev ON ev.user_id = v.user_id
  GROUP BY v.user_id, pf.full_name
  ORDER BY sum(v.segundos) DESC;
$fn$;

COMMENT ON FUNCTION public.actividad_resumen(date, date) IS
  'Totales de tiempo y actividad por Account Manager en el rango. Dirección los ve todos; un AM solo el suyo.';

DROP FUNCTION IF EXISTS public.actividad_por_dia(date, date);
CREATE FUNCTION public.actividad_por_dia(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  am_id            uuid,
  dia              date,
  segundos         bigint,
  segundos_activos bigint,
  tramos           bigint,
  eventos          bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  WITH yo AS (
    SELECT auth.uid() AS me, public.reportes_es_direccion() AS dir
  ),
  t AS (
    SELECT s.user_id, s.dia,
           sum(s.segundos)::bigint         AS seg,
           sum(s.segundos_activos)::bigint AS act,
           count(*)::bigint                AS n
    FROM public.actividad_sesiones s, yo
    WHERE (yo.dir OR s.user_id = yo.me)
      AND (p_desde IS NULL OR s.dia >= p_desde)
      AND (p_hasta IS NULL OR s.dia <= p_hasta)
    GROUP BY s.user_id, s.dia
  ),
  e AS (
    SELECT ev.user_id, ev.dia, count(*)::bigint AS n
    FROM public.actividad_eventos ev, yo
    WHERE (yo.dir OR ev.user_id = yo.me)
      AND (p_desde IS NULL OR ev.dia >= p_desde)
      AND (p_hasta IS NULL OR ev.dia <= p_hasta)
    GROUP BY ev.user_id, ev.dia
  )
  -- FULL JOIN y no LEFT: un día con acciones pero sin tramo de tiempo no debería
  -- existir (registrar late), pero si llega a existir se ve, en vez de
  -- desaparecer en silencio.
  SELECT
    coalesce(t.user_id, e.user_id),
    coalesce(t.dia, e.dia),
    coalesce(t.seg, 0),
    coalesce(t.act, 0),
    coalesce(t.n, 0),
    coalesce(e.n, 0)
  FROM t
  FULL JOIN e ON e.user_id = t.user_id AND e.dia = t.dia
  ORDER BY 2, 1;
$fn$;

COMMENT ON FUNCTION public.actividad_por_dia(date, date) IS
  'Tiempo y número de acciones por Account Manager y día. Alimenta la curva diaria y la acumulada del panel.';

DROP FUNCTION IF EXISTS public.actividad_por_tipo(date, date);
CREATE FUNCTION public.actividad_por_tipo(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  am_id     uuid,
  tipo      text,
  eventos   bigint,
  ultima_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  WITH yo AS (
    SELECT auth.uid() AS me, public.reportes_es_direccion() AS dir
  )
  SELECT e.user_id, e.tipo, count(*)::bigint, max(e.ocurrio_en)
  FROM public.actividad_eventos e, yo
  WHERE (yo.dir OR e.user_id = yo.me)
    AND (p_desde IS NULL OR e.dia >= p_desde)
    AND (p_hasta IS NULL OR e.dia <= p_hasta)
  GROUP BY e.user_id, e.tipo
  ORDER BY count(*) DESC;
$fn$;

COMMENT ON FUNCTION public.actividad_por_tipo(date, date) IS
  'Ranking de actividades por Account Manager: cuántas veces hizo cada cosa en el rango.';

-- Poda manual de la bitácora. No hay `pg_cron` en el plan contratado, así que
-- esto no se ejecuta solo: existe para que Dirección pueda recortar el histórico
-- si la base crece más de la cuenta. Los TRAMOS de tiempo no se tocan (son cuatro
-- renglones por AM y día, y son el histórico que da valor al reporte).
CREATE OR REPLACE FUNCTION public.actividad_purga(p_dias integer DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n bigint;
BEGIN
  IF NOT public.reportes_es_direccion() THEN
    RAISE EXCEPTION 'Solo la Dirección puede purgar la bitácora de actividad.';
  END IF;
  DELETE FROM public.actividad_eventos e
   WHERE e.dia < (public.actividad_dia(now()) - greatest(coalesce(p_dias, 180), 30));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS Y PERMISOS
-- ─────────────────────────────────────────────────────────────────────────────
-- Lectura: Dirección todo, cada AM lo suyo. Escritura: NADIE de forma directa —
-- no se concede INSERT/UPDATE/DELETE, así que el único camino son las funciones
-- SECURITY DEFINER de arriba y el tiempo no se puede falsificar desde el
-- navegador.
ALTER TABLE public.actividad_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividad_eventos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actividad_sesiones_lectura ON public.actividad_sesiones;
CREATE POLICY actividad_sesiones_lectura ON public.actividad_sesiones
  FOR SELECT
  TO authenticated
  USING (public.reportes_es_direccion() OR user_id = auth.uid());

DROP POLICY IF EXISTS actividad_eventos_lectura ON public.actividad_eventos;
CREATE POLICY actividad_eventos_lectura ON public.actividad_eventos
  FOR SELECT
  TO authenticated
  USING (public.reportes_es_direccion() OR user_id = auth.uid());

REVOKE ALL ON public.actividad_sesiones FROM PUBLIC, anon;
REVOKE ALL ON public.actividad_eventos  FROM PUBLIC, anon;
GRANT SELECT ON public.actividad_sesiones TO authenticated;
GRANT SELECT ON public.actividad_eventos  TO authenticated;

REVOKE ALL ON FUNCTION public.actividad_dia(timestamptz)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_latido(boolean)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_registrar(text, text, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_resumen(date, date)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_por_dia(date, date)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_por_tipo(date, date)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_purga(integer)                   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.actividad_dia(timestamptz)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_latido(boolean)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_registrar(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_resumen(date, date)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_por_dia(date, date)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_por_tipo(date, date)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_purga(integer)              TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
