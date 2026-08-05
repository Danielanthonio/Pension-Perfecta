-- =============================================================================
-- PensiónFlow — La Dirección puede figurar como responsable del cierre
-- =============================================================================
-- Pedido por Dirección el 2026-08-04: "el director debe ser seleccionable como
-- un closer, ya que también gana por cierre de aliado según la política de
-- tarifas de finanzas".
--
-- QUÉ HACE
--   1. La atribución admite una cuenta de dirección como responsable del cierre,
--      no solo un `role='closer'`.
--   2. El tablero de Closers cuenta a las cuentas de dirección QUE TIENEN
--      aliados atribuidos, para que lo que se atribuye se pueda auditar.
--
-- ⚠️ LO QUE ESTA MIGRACIÓN NO HACE, POR DECISIÓN EXPRESA DE DANIEL (2026-08-04)
-- Al preparar esto se encontró que la comisión de cierre NO SE ESTÁ DEVENGANDO
-- PARA NADIE, ni para los closers ni para la Dirección:
--
--   · Finanzas (20260802000000) paga el cierre a quien figure en
--     `profiles.aliado_cerrado_por_id`, con tarifa según su rol. Hay tarifa
--     vigente de 300 MXN tanto para 'closer' como para 'director'.
--   · Esa columna se rellenó UNA sola vez, en el backfill de aquella migración,
--     y desde entonces NADIE la escribe: ni el alta de un aliado, ni la
--     atribución masiva, ni la reasignación.
--   · Medido en producción el 2026-08-04: de 37 aliados atribuidos, 36 tienen
--     `closer_origen_id` y `aliado_cerrado_por_id` en NULL. Solo se ha devengado
--     1 comisión de cierre de las 37 que corresponderían.
--
-- Se planteó cerrarlo aquí (sincronizar la columna desde el trigger y poner al
-- día los 36 atrasados, unos 10 800 MXN que aparecerían en la siguiente
-- reconciliación en estado `pendiente_revision`) y Dirección decidió NO tocar
-- comisiones en este cambio. Así que después de esta migración la Dirección será
-- seleccionable como responsable del cierre, pero seguirá SIN cobrarlo — igual
-- que los closers hoy. Cuando se quiera cerrar, hacen falta tres cosas:
--
--     a) que el alta y `asigna_closer_a_aliado` escriban aliado_cerrado_por_id,
--     b) que siga a closer_origen_id cuando la atribución cambie,
--     c) UPDATE public.profiles SET aliado_cerrado_por_id = closer_origen_id
--         WHERE role='aliado' AND closer_origen_id IS NOT NULL
--           AND aliado_cerrado_por_id IS NULL;
--
-- Todo es ADITIVO e IDEMPOTENTE y va dentro de una transacción.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) QUIÉN CUENTA COMO RESPONSABLE DE UN CIERRE
-- ─────────────────────────────────────────────────────────────────────────────
-- Un closer siempre. Una cuenta de dirección, solo si de verdad tiene aliados
-- atribuidos: si no, el tablero de Closers se llenaría de seis renglones a cero
-- que no miden nada.
CREATE OR REPLACE FUNCTION public.closers_cuenta_como_cerrador(p_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT p_role = 'closer'
      OR (
        p_role IN ('admin', 'director')
        AND EXISTS (
          SELECT 1 FROM public.profiles a
           WHERE a.role = 'aliado' AND a.closer_origen_id = p_id
        )
      );
$fn$;

COMMENT ON COLUMN public.profiles.closer_origen_id IS
  'Quién INCORPORÓ a este aliado: un closer o una cuenta de dirección. Mérito histórico: no cambia al reasignar. Base de todas las métricas del módulo Closers. OJO: la comisión de cierre NO cuelga de aquí sino de aliado_cerrado_por_id, y hoy nadie mantiene esa columna sincronizada (ver 20260804000001).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) LA ATRIBUCIÓN ADMITE A LA DIRECCIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Único cambio de fondo respecto de 20260803000000: el destino puede ser un
-- closer o una cuenta de dirección. Todo lo demás —quién puede llamarla, que el
-- AM no reescriba atribuciones existentes, el historial— queda igual.
CREATE OR REPLACE FUNCTION public.asigna_closer_a_aliado(
  p_aliado_ids uuid[],
  p_closer_id  uuid,
  p_tipo       text DEFAULT 'backfill',
  p_motivo     text DEFAULT NULL,
  p_fecha      timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rol          text := public.closers_my_role();
  v_es_direccion boolean := public.closers_is_direccion();
  v_closer_rol   text;
  v_aliado       record;
  v_fecha        timestamptz;
  v_n            integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;
  IF NOT (v_es_direccion OR v_rol = 'account_manager') THEN
    RAISE EXCEPTION 'No tienes permiso para atribuir aliados a un closer.';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('asignacion_inicial', 'backfill') THEN
    RAISE EXCEPTION 'Esta función solo hace la atribución inicial de un aliado.';
  END IF;
  IF p_closer_id IS NULL THEN
    RAISE EXCEPTION 'Falta el closer al que se atribuye el aliado.';
  END IF;

  SELECT role INTO v_closer_rol FROM public.profiles WHERE id = p_closer_id;
  -- La Dirección entra aquí como una opción más: también cierra aliados.
  IF v_closer_rol IS NULL OR v_closer_rol NOT IN ('closer', 'admin', 'director') THEN
    RAISE EXCEPTION 'El destino de la atribución tiene que ser un closer o una cuenta de dirección.';
  END IF;

  FOR v_aliado IN
    SELECT id, full_name, role, closer_origen_id, closer_actual_id,
           fecha_incorporacion_closer, created_at
      FROM public.profiles
     WHERE id = ANY (p_aliado_ids)
  LOOP
    IF v_aliado.role <> 'aliado' THEN
      RAISE EXCEPTION 'Solo se atribuyen perfiles de aliado (% no lo es).', v_aliado.full_name;
    END IF;
    IF NOT v_es_direccion AND v_aliado.closer_origen_id IS NOT NULL THEN
      RAISE EXCEPTION '% ya tiene closer de origen. Cambiar una atribución existente mueve métricas y comisiones: eso lo hace Dirección.', v_aliado.full_name;
    END IF;

    v_fecha := coalesce(p_fecha, v_aliado.fecha_incorporacion_closer, v_aliado.created_at, now());

    -- `aliado_cerrado_por_id` NO se escribe aquí a propósito: ver el aviso de la
    -- cabecera. Tocarlo devengaría comisiones, y esa decisión se dejó fuera.
    UPDATE public.profiles
       SET closer_origen_id           = p_closer_id,
           closer_actual_id           = p_closer_id,
           fecha_incorporacion_closer = v_fecha,
           closer_asignado_por        = auth.uid()
     WHERE id = v_aliado.id;

    INSERT INTO public.closer_aliado_asignaciones (
      aliado_id, closer_anterior_id, closer_nuevo_id, closer_origen_id,
      tipo_movimiento, motivo, asignado_por, fecha_asignacion
    ) VALUES (
      v_aliado.id, v_aliado.closer_actual_id, p_closer_id, p_closer_id,
      p_tipo, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid(), v_fecha
    );

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asigna_closer_a_aliado(uuid[], uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asigna_closer_a_aliado(uuid[], uuid, text, text, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.closers_cuenta_como_cerrador(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.closers_cuenta_como_cerrador(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) EL TABLERO DE CLOSERS CUENTA TAMBIÉN LOS CIERRES DE LA DIRECCIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Las dos funciones van copiadas de 20260801000000 con UNA línea cambiada cada
-- una: la que decidía que solo un `role='closer'` podía encabezar la lista. Se
-- reproducen enteras porque Postgres no deja parchear el cuerpo de una función.
CREATE OR REPLACE FUNCTION public.closers_overview(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  -- Filtros del §10. NULL = "todos".
  --   p_tipo_aliado:   'independiente' | 'empresa' | 'lider'
  --   p_estado_aliado: 'activos' (con clientes en 90 días) | 'sin_actividad'
  p_tipo_aliado text DEFAULT NULL,
  p_estado_aliado text DEFAULT NULL
)
RETURNS TABLE (
  closer_id             uuid,
  closer_nombre         text,
  closer_email          text,
  closer_telefono       text,
  closer_avatar_url     text,
  closer_created_at     timestamptz,
  aliados_total         bigint,
  aliados_periodo       bigint,
  aliados_productivos   bigint,
  aliados_sin_actividad bigint,
  aliados_activos_90d   bigint,
  ultimo_aliado_at      timestamptz,
  clientes_total        bigint,
  ventas_total          bigint,
  clientes_periodo      bigint,
  clientes_evaluados    bigint,
  clientes_aprobados    bigint,
  clientes_condicionados bigint,
  clientes_rechazados   bigint,
  clientes_perdidos     bigint,
  ventas_periodo        bigint,
  ultimo_cliente_at     timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH yo AS (
    SELECT auth.uid() AS me, public.closers_my_role() AS mi_rol
  ),
  closers AS (
    SELECT c.id, c.full_name, c.email, c.phone, c.avatar_url, c.created_at
    FROM public.profiles c, yo
    WHERE public.closers_cuenta_como_cerrador(c.id, c.role)
      AND (
        yo.mi_rol IN ('admin', 'director')
        OR (yo.mi_rol = 'closer' AND c.id = yo.me)
      )
  ),
  -- Los proyectos borrados (papelera) y purgados no cuentan para nadie: la app
  -- los marca prefijando notes_director, no con una columna.
  proyectos AS (
    SELECT pr.aliado_id, pr.status, pr.created_at
    FROM public.prospects pr
    WHERE COALESCE(pr.notes_director, '') NOT LIKE '[DELETED:%'
      AND COALESCE(pr.notes_director, '') NOT LIKE '[PURGED:%'
  ),
  -- Un renglón por aliado atribuido, con sus proyectos ya contados.
  por_aliado AS (
    SELECT
      a.id                                        AS aliado_id,
      a.closer_origen_id                          AS closer_id,
      a.fecha_incorporacion_closer                AS incorporado_at,
      count(pj.aliado_id)                         AS clientes_total,
      count(*) FILTER (WHERE pj.status = ANY (public.closers_stage('ventas')))  AS ventas_total,
      count(*) FILTER (WHERE pj.aliado_id IS NOT NULL AND pj.created_at >= now() - interval '90 days') AS clientes_90d,
      max(pj.created_at)                          AS ultimo_cliente_at,
      -- Bloque acotado al período (lente `created_at`).
      count(*) FILTER (WHERE pj.aliado_id IS NOT NULL AND pj.en_rango) AS clientes_periodo,
      count(*) FILTER (WHERE pj.en_rango AND pj.status = ANY (public.closers_stage('evaluados')))     AS clientes_evaluados,
      count(*) FILTER (WHERE pj.en_rango AND pj.status = ANY (public.closers_stage('aprobados')))     AS clientes_aprobados,
      count(*) FILTER (WHERE pj.en_rango AND pj.status = ANY (public.closers_stage('condicionados'))) AS clientes_condicionados,
      count(*) FILTER (WHERE pj.en_rango AND pj.status = ANY (public.closers_stage('rechazados')))    AS clientes_rechazados,
      count(*) FILTER (WHERE pj.en_rango AND pj.status = ANY (public.closers_stage('perdidos')))      AS clientes_perdidos,
      count(*) FILTER (WHERE pj.en_rango AND pj.status = ANY (public.closers_stage('ventas')))        AS ventas_periodo
    FROM public.profiles a
    JOIN closers c ON c.id = a.closer_origen_id
    LEFT JOIN LATERAL (
      SELECT p.*,
             (p_desde IS NULL OR (p.created_at AT TIME ZONE 'UTC')::date >= p_desde)
         AND (p_hasta IS NULL OR (p.created_at AT TIME ZONE 'UTC')::date <= p_hasta) AS en_rango
      FROM proyectos p
      WHERE p.aliado_id = a.id
    ) pj ON true
    WHERE a.role = 'aliado'
      AND (
        p_tipo_aliado IS NULL
        OR public.closers_tipo_aliado(a.aliado_tipo, a.empresa_multialiado_id) = p_tipo_aliado
      )
    GROUP BY a.id, a.closer_origen_id, a.fecha_incorporacion_closer
  ),
  -- El filtro de ESTADO se aplica después de agregar, porque "activo" depende de
  -- los clientes del aliado y no de una columna suya (`profiles.is_active` no
  -- existe en producción).
  --
  -- Las referencias van CUALIFICADAS (`pa.`) a propósito: `clientes_total` es
  -- también el nombre de una columna de salida de esta función, y en una función
  -- SQL los nombres de parámetro son visibles dentro del cuerpo. Sin cualificar,
  -- la referencia queda expuesta a esa colisión.
  filtrado AS (
    SELECT pa.* FROM por_aliado pa
    WHERE p_estado_aliado IS NULL
       OR (p_estado_aliado = 'activos' AND pa.clientes_90d > 0)
       OR (p_estado_aliado = 'sin_actividad' AND pa.clientes_total = 0)
  )
  SELECT
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.avatar_url,
    c.created_at,
    count(pa.aliado_id)                                                              AS aliados_total,
    count(*) FILTER (
      WHERE pa.incorporado_at IS NOT NULL
        AND (p_desde IS NULL OR (pa.incorporado_at AT TIME ZONE 'UTC')::date >= p_desde)
        AND (p_hasta IS NULL OR (pa.incorporado_at AT TIME ZONE 'UTC')::date <= p_hasta)
    )                                                                                AS aliados_periodo,
    count(*) FILTER (WHERE pa.clientes_total > 0)                                    AS aliados_productivos,
    count(*) FILTER (WHERE pa.aliado_id IS NOT NULL AND pa.clientes_total = 0)        AS aliados_sin_actividad,
    -- "Activo" = con actividad comprobable. `profiles.is_active` NO existe en
    -- producción, así que una bandera daría siempre true y no diría nada.
    count(*) FILTER (WHERE pa.clientes_90d > 0)                                      AS aliados_activos_90d,
    max(pa.incorporado_at)                                                           AS ultimo_aliado_at,
    COALESCE(sum(pa.clientes_total), 0)::bigint                                      AS clientes_total,
    COALESCE(sum(pa.ventas_total), 0)::bigint                                        AS ventas_total,
    COALESCE(sum(pa.clientes_periodo), 0)::bigint                                    AS clientes_periodo,
    COALESCE(sum(pa.clientes_evaluados), 0)::bigint                                  AS clientes_evaluados,
    COALESCE(sum(pa.clientes_aprobados), 0)::bigint                                  AS clientes_aprobados,
    COALESCE(sum(pa.clientes_condicionados), 0)::bigint                              AS clientes_condicionados,
    COALESCE(sum(pa.clientes_rechazados), 0)::bigint                                 AS clientes_rechazados,
    COALESCE(sum(pa.clientes_perdidos), 0)::bigint                                   AS clientes_perdidos,
    COALESCE(sum(pa.ventas_periodo), 0)::bigint                                      AS ventas_periodo,
    max(pa.ultimo_cliente_at)                                                        AS ultimo_cliente_at
  FROM closers c
  LEFT JOIN filtrado pa ON pa.closer_id = c.id
  GROUP BY c.id, c.full_name, c.email, c.phone, c.avatar_url, c.created_at
  ORDER BY 7 DESC, c.full_name;
$$;
CREATE OR REPLACE FUNCTION public.closers_serie(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_grano text DEFAULT 'mes',
  p_tipo_aliado text DEFAULT NULL,
  p_estado_aliado text DEFAULT NULL
)
RETURNS TABLE (
  closer_id uuid,
  periodo   date,
  aliados   bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH yo AS (
    SELECT auth.uid() AS me, public.closers_my_role() AS mi_rol
  ),
  grano AS (
    SELECT CASE lower(coalesce(p_grano, 'mes'))
             WHEN 'dia'    THEN 'day'
             WHEN 'semana' THEN 'week'
             WHEN 'anio'   THEN 'year'
             WHEN 'año'    THEN 'year'
             ELSE 'month'
           END AS unidad
  )
  SELECT
    a.closer_origen_id,
    (date_trunc((SELECT unidad FROM grano), a.fecha_incorporacion_closer AT TIME ZONE 'UTC'))::date,
    count(*)::bigint
  FROM public.profiles a
  JOIN public.profiles c ON c.id = a.closer_origen_id AND c.role IN ('closer', 'admin', 'director')
  CROSS JOIN yo
  WHERE a.role = 'aliado'
    AND a.fecha_incorporacion_closer IS NOT NULL
    AND (yo.mi_rol IN ('admin', 'director') OR (yo.mi_rol = 'closer' AND c.id = yo.me))
    AND (p_desde IS NULL OR (a.fecha_incorporacion_closer AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (a.fecha_incorporacion_closer AT TIME ZONE 'UTC')::date <= p_hasta)
    AND (
      p_tipo_aliado IS NULL
      OR public.closers_tipo_aliado(a.aliado_tipo, a.empresa_multialiado_id) = p_tipo_aliado
    )
    AND (
      p_estado_aliado IS NULL
      OR (p_estado_aliado = 'activos' AND EXISTS (
            SELECT 1 FROM public.prospects pr
            WHERE pr.aliado_id = a.id
              AND pr.created_at >= now() - interval '90 days'
              AND COALESCE(pr.notes_director, '') NOT LIKE '[DELETED:%'
              AND COALESCE(pr.notes_director, '') NOT LIKE '[PURGED:%'))
      OR (p_estado_aliado = 'sin_actividad' AND NOT EXISTS (
            SELECT 1 FROM public.prospects pr
            WHERE pr.aliado_id = a.id
              AND COALESCE(pr.notes_director, '') NOT LIKE '[DELETED:%'
              AND COALESCE(pr.notes_director, '') NOT LIKE '[PURGED:%'))
    )
  GROUP BY 1, 2
  ORDER BY 2, 1;
$$;

REVOKE ALL ON FUNCTION public.closers_overview(date, date, text, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closers_serie(date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.closers_overview(date, date, text, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.closers_serie(date, date, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
