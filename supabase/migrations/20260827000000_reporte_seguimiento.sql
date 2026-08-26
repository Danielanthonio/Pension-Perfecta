-- =============================================================================
-- PensiónFlow — REPORTE DE SEGUIMIENTO: qué se atiende, quién lo atiende y
-- cuánto de eso lo está sosteniendo GoHighLevel en vez del Account Manager.
-- =============================================================================
-- Desde la migración 20260825000000 cada proyecto tiene bitácora
-- (`prospect_notas`) y desde la 20260826000000 esa bitácora distingue lo que se
-- escribe AQUÍ (`origen='plataforma'`) de lo que se trae de GoHighLevel
-- (`origen='ghl'`). Con eso ya se puede contestar en la ficha «¿cuándo se tocó
-- por última vez a este cliente?».
--
-- Lo que NO se puede contestar todavía es la pregunta de Dirección, que es la de
-- gestión y no la del expediente:
--
--     «De la cartera de cada Account Manager, ¿cuánta está realmente atendida,
--      cuánta lleva semanas sin que nadie escriba una línea, y cuánta parece
--      atendida solo porque GoHighLevel trajo notas de allá?»
--
-- Esa última distinción es el motivo de esta migración. Una nota importada de
-- GHL cuenta como contacto con el cliente, pero NO como seguimiento hecho en la
-- plataforma por el AM responsable. Si se suman en el mismo montón, un AM que no
-- ha abierto un expediente en tres semanas aparece con la cartera «al día»
-- porque el barrido nocturno le rellenó la bitácora. El reporte tiene que poder
-- separar los dos números, y para separarlos hay que contarlos por separado en
-- la base.
--
-- POR QUÉ SE AGREGA EN POSTGRES Y NO EN EL NAVEGADOR
-- La bitácora ya son miles de renglones y crece con cada seguimiento; bajarla
-- entera para contarla en el cliente es descargar el libro para sumar una
-- columna. Mismo criterio que `notas_resumen()` (20260825000000) y que las
-- funciones de actividad (20260809000000).
--
-- POR QUÉ *NO* SON SECURITY DEFINER
-- Las dos funciones se ejecutan con los permisos de quien llama (SECURITY
-- INVOKER, que es el modo por defecto y por eso no se declara). Así la RLS de
-- `prospect_notas` —que hereda la de `prospects`— filtra sola: Dirección recibe
-- la cartera entera y un Account Manager solo la suya, sin que esta migración
-- tenga que reimplementar el modelo de acceso ni pueda equivocarse al copiarlo.
--
-- EL DÍA ES EL DÍA DE MÉXICO
-- `seguimiento_notas_por_dia` corta en `America/Mexico_City`, igual que
-- `actividad_dia` y que el `dias_con_nota` de `notas_resumen()`. Aquí se COMPARAN
-- personas entre sí, así que todas tienen que estar medidas con el mismo reloj;
-- es distinto del listado de clientes, que rotula cada nota en el huso de quien
-- mira porque allí no se compara a nadie.
--
-- Aditiva y sin efectos: dos funciones nuevas y un índice. No toca ninguna tabla,
-- ninguna política, ningún trigger ni ninguna función existente.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) El índice que hace barata la serie temporal
-- ─────────────────────────────────────────────────────────────────────────────
-- Los índices que ya hay cubren «las notas de UN proyecto» (por `prospect_id`).
-- El reporte pregunta lo contrario: «todas las notas ENTRE dos fechas», sin
-- proyecto. Sin este índice eso es un recorrido completo de la tabla cada vez
-- que alguien cambia el período.
CREATE INDEX IF NOT EXISTS prospect_notas_fecha_idx
  ON public.prospect_notas (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Una fila por proyecto, con los dos seguimientos separados
-- ─────────────────────────────────────────────────────────────────────────────
-- Solo salen los proyectos que tienen AL MENOS una nota. Los que no tienen
-- ninguna no están aquí, y ESO ES EL DATO: el reporte los reconoce porque los
-- busca por diferencia contra su universo de proyectos («sin ningún registro»).
-- Devolver una fila de ceros por cada proyecto sin nota sería mandar cientos de
-- renglones vacíos para decir lo mismo.
--
-- La clasificación por autor usa `autor_rol`, que es el SNAPSHOT del rol que
-- tenía quien escribió (20260825000000). Un AM que mañana sea director no
-- reescribe el pasado: sus notas de hoy siguen contando como notas del AM.
--
-- ⚠️ Los nombres del RETURNS TABLE son DISTINTOS de los de la tabla a propósito
-- (`proyecto_id` y no `prospect_id`): dentro del cuerpo son visibles y una
-- referencia que coincida da 42702 (referencia ambigua) — la trampa que ya mordió
-- en las funciones de Finanzas.
DROP FUNCTION IF EXISTS public.seguimiento_por_proyecto();
CREATE FUNCTION public.seguimiento_por_proyecto()
RETURNS TABLE (
  proyecto_id             uuid,
  -- Notas escritas EN LA PLATAFORMA. Es el seguimiento del que responde el AM.
  notas_plataforma        bigint,
  -- Notas traídas de GoHighLevel. Cuentan como contacto con el cliente, no como
  -- trabajo hecho aquí.
  notas_ghl               bigint,
  -- Desglose de las de plataforma por el rol de quien las escribió.
  notas_aliado            bigint,
  notas_am                bigint,
  notas_direccion         bigint,
  -- Días DISTINTOS (de México) con al menos una nota de plataforma: mide
  -- constancia. Diez notas del mismo martes son un día de seguimiento, no diez.
  dias_con_nota           bigint,
  primera_nota_at         timestamptz,
  -- Las dos fechas que el reporte compara: la última vez que alguien escribió
  -- aquí y la última vez que hubo algo en GHL.
  ultima_plataforma_at    timestamptz,
  ultima_ghl_at           timestamptz,
  ultimo_autor_plataforma text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT
    n.prospect_id,
    count(*) FILTER (WHERE n.origen = 'plataforma')::bigint,
    count(*) FILTER (WHERE n.origen = 'ghl')::bigint,
    count(*) FILTER (WHERE n.origen = 'plataforma' AND n.autor_rol = 'aliado')::bigint,
    count(*) FILTER (WHERE n.origen = 'plataforma' AND n.autor_rol = 'account_manager')::bigint,
    count(*) FILTER (WHERE n.origen = 'plataforma' AND n.autor_rol IN ('admin', 'director'))::bigint,
    count(DISTINCT (n.created_at AT TIME ZONE 'America/Mexico_City')::date)
      FILTER (WHERE n.origen = 'plataforma')::bigint,
    min(n.created_at),
    max(n.created_at) FILTER (WHERE n.origen = 'plataforma'),
    max(n.created_at) FILTER (WHERE n.origen = 'ghl'),
    (array_agg(n.autor_nombre ORDER BY n.created_at DESC)
       FILTER (WHERE n.origen = 'plataforma'))[1]
  FROM public.prospect_notas n
  GROUP BY n.prospect_id
  -- Orden estable: el navegador pagina de mil en mil (PostgREST no devuelve más)
  -- y sin un orden fijo dos páginas podrían traer el mismo proyecto y saltarse
  -- otro.
  ORDER BY n.prospect_id;
$fn$;

COMMENT ON FUNCTION public.seguimiento_por_proyecto() IS
  'Una fila por proyecto CON notas: seguimiento hecho en la plataforma y seguimiento traído de GoHighLevel, contados por separado, con el desglose por rol del autor y las dos últimas fechas. Respeta la RLS de quien llama.';

REVOKE ALL ON FUNCTION public.seguimiento_por_proyecto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seguimiento_por_proyecto() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) El ritmo: cuántas notas se escriben cada día y quién las escribe
-- ─────────────────────────────────────────────────────────────────────────────
-- Contesta «¿el equipo está anotando aquí o todo lo está sosteniendo el barrido
-- de GHL?» a lo largo del tiempo. La atribución de este panel es por AUTORÍA
-- (quién escribió la nota), no por cartera: una nota es trabajo de quien la
-- teclea, aunque caiga en el expediente de otro. El panel lo dice en su
-- subtítulo, porque es una pregunta distinta de la de cobertura.
--
-- Se agrupa además por autor para que el reporte pueda quedarse con las notas de
-- los account managers elegidos en la botonera. Las de GoHighLevel no tienen
-- autor (`autor_id` NULL): son de la casa y se enseñan siempre.
--
-- Rango abierto por los dos lados: NULL = sin tope, igual que las funciones de
-- actividad y de finanzas.
DROP FUNCTION IF EXISTS public.seguimiento_notas_por_dia(date, date);
CREATE FUNCTION public.seguimiento_notas_por_dia(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  dia         date,
  origen_nota text,
  rol         text,
  autor       uuid,
  autor_nom   text,
  notas       bigint,
  -- Proyectos DISTINTOS tocados ese día por ese autor: cinco notas en el mismo
  -- expediente son un cliente atendido, no cinco.
  proyectos   bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT
    (n.created_at AT TIME ZONE 'America/Mexico_City')::date,
    n.origen,
    n.autor_rol,
    n.autor_id,
    n.autor_nombre,
    count(*)::bigint,
    count(DISTINCT n.prospect_id)::bigint
  FROM public.prospect_notas n
  WHERE (p_desde IS NULL OR (n.created_at AT TIME ZONE 'America/Mexico_City')::date >= p_desde)
    AND (p_hasta IS NULL OR (n.created_at AT TIME ZONE 'America/Mexico_City')::date <= p_hasta)
  GROUP BY 1, 2, 3, 4, 5
  ORDER BY 1, 2, 4;
$fn$;

COMMENT ON FUNCTION public.seguimiento_notas_por_dia(date, date) IS
  'Notas escritas por día (día de México), separadas por origen (plataforma / GoHighLevel), rol y autor. Alimenta la curva de ritmo de seguimiento del módulo Reportes. Respeta la RLS de quien llama.';

REVOKE ALL ON FUNCTION public.seguimiento_notas_por_dia(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seguimiento_notas_por_dia(date, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) PostgREST tiene que ver las funciones nuevas
-- ─────────────────────────────────────────────────────────────────────────────
-- Sin esto el front recibe 404 hasta el siguiente reinicio del proyecto.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Verificación (informativa; sale en los NOTICE del editor SQL)
-- ─────────────────────────────────────────────────────────────────────────────
-- Fuera de la transacción a propósito: si algo de esto fallara, no puede tumbar
-- una migración que ya se aplicó bien.
DO $$
DECLARE
  n_fn      int;
  n_notas   bigint;
  n_plat    bigint;
  n_ghl     bigint;
  n_proy    bigint;
BEGIN
  SELECT count(*) INTO n_fn FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('seguimiento_por_proyecto', 'seguimiento_notas_por_dia');

  SELECT count(*),
         count(*) FILTER (WHERE origen = 'plataforma'),
         count(*) FILTER (WHERE origen = 'ghl'),
         count(DISTINCT prospect_id)
    INTO n_notas, n_plat, n_ghl, n_proy
    FROM public.prospect_notas;

  RAISE NOTICE 'Reporte de seguimiento listo: % de 2 funciones. La bitácora tiene % notas sobre % proyectos — % escritas en la plataforma y % traídas de GoHighLevel.',
    n_fn, n_notas, n_proy, n_plat, n_ghl;
END $$;
