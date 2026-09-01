-- =============================================================================
-- PensiónFlow — Migración: hitos ALCANZADOS por el proyecto (embudo acumulado)
-- =============================================================================
-- PROBLEMA QUE RESUELVE
-- Todas las métricas (Embudo Comercial, Indicadores de Gestión, ficha de aliados,
-- ficha de closers) contaban por el estado ACTUAL del proyecto. Consecuencia: al
-- pasar un proyecto a "Cerrado Perdido" se le restaba de Proyectos, de Evaluados y
-- de Aprobados, y la Tasa de Aprobación se movía hacia atrás. Lo mismo pasaba al
-- CERRARLO GANADO: `firma_programada` no está en el bucket de aprobados, así que
-- ganar el trato también borraba la aprobación.
--
-- Una aprobación es un HECHO con fecha: ocurrió. Perder al cliente después (o
-- ganarlo) es un desenlace posterior, no una des-aprobación.
--
-- QUÉ HACE
-- Sella en el propio expediente la PRIMERA vez que alcanzó cada hito. Las columnas
-- solo se escriben si están en NULL: un hito alcanzado no se borra nunca.
--   · hito_condicionado_at — primera vez condicionado (cualquier subetapa)
--   · hito_rechazado_at    — primera vez rechazado
--   · hito_aprobado_at     — primera vez aprobado (o cerrado ganado: implica aprobación)
--   · hito_otorgado_at     — primera vez con financiamiento otorgado
-- "Evaluado" no lleva columna: es tener cualquiera de las cuatro.
--
-- Puramente aditiva y autosuficiente: no usa update_updated_at_column() ni toca
-- profiles.is_active (ninguno existe en producción). Es idempotente.
-- =============================================================================

-- ── 1) Columnas ──────────────────────────────────────────────────────────────
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS hito_condicionado_at timestamptz,
  ADD COLUMN IF NOT EXISTS hito_rechazado_at    timestamptz,
  ADD COLUMN IF NOT EXISTS hito_aprobado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS hito_otorgado_at     timestamptz;

COMMENT ON COLUMN public.prospects.hito_aprobado_at IS
  'Primera vez que el proyecto alcanzó la aprobación. No se borra al perderlo ni al ganarlo.';

-- ── 2) Trigger que sella el hito al cambiar de estado ────────────────────────
-- BEFORE, para escribir sobre NEW y no disparar un UPDATE extra. Corre después de
-- trg_assign_am_to_prospect y trg_set_prospect_creator (los BEFORE se disparan en
-- orden alfabético); son independientes entre sí.
CREATE OR REPLACE FUNCTION public.sellar_hitos_prospecto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Buckets: DEBEN coincidir con src/app/admin/_pipelineBuckets.ts.
  aprobado_st  text[] := ARRAY['aprobado_listo','asesoria_agendada','doc_proceso','analisis_riesgo','firma_contrato'];
  otorgado_st  text[] := ARRAY['firma_programada','pagado_comision'];
  cond_st      text[] := ARRAY['falta_reporte','falta_afore','pendiente_documentos','falta_semanas','falta_afore_cuenta','posible_simulacion','agenda_futura','aportacion'];
  t timestamptz;
BEGIN
  t := CASE WHEN TG_OP = 'INSERT' THEN COALESCE(NEW.created_at, now()) ELSE now() END;

  IF NEW.status = ANY(cond_st) AND NEW.hito_condicionado_at IS NULL THEN
    NEW.hito_condicionado_at := t;
  END IF;

  IF NEW.status = 'rechazado' AND NEW.hito_rechazado_at IS NULL THEN
    NEW.hito_rechazado_at := t;
  END IF;

  -- Otorgado implica aprobado: un financiamiento no se ejecuta sin haberse aprobado.
  -- Sellar ambos mantiene el embudo encajado (Aprobados ⊇ Fin. Otorgado) aunque el
  -- proyecto haya saltado pasos.
  IF NEW.status = ANY(aprobado_st) OR NEW.status = ANY(otorgado_st) THEN
    IF NEW.hito_aprobado_at IS NULL THEN
      NEW.hito_aprobado_at := t;
    END IF;
  END IF;

  IF NEW.status = ANY(otorgado_st) AND NEW.hito_otorgado_at IS NULL THEN
    NEW.hito_otorgado_at := t;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sellar_hitos_prospecto ON public.prospects;
CREATE TRIGGER trg_sellar_hitos_prospecto
BEFORE INSERT OR UPDATE OF status ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.sellar_hitos_prospecto();

-- ── 3) Backfill A: desde el historial de estados ─────────────────────────────
-- prospect_status_history guarda cada cambio con su fecha desde 2026-07-05 y para
-- el histórico previo tiene al menos el estado vigente al sembrarse.
WITH hitos AS (
  SELECT h.prospect_id,
         MIN(h.changed_at) FILTER (
           WHERE h.status = ANY(ARRAY['falta_reporte','falta_afore','pendiente_documentos','falta_semanas','falta_afore_cuenta','posible_simulacion','agenda_futura','aportacion'])
         ) AS cond_at,
         MIN(h.changed_at) FILTER (WHERE h.status = 'rechazado') AS rech_at,
         MIN(h.changed_at) FILTER (
           WHERE h.status = ANY(ARRAY['aprobado_listo','asesoria_agendada','doc_proceso','analisis_riesgo','firma_contrato','firma_programada','pagado_comision'])
         ) AS apro_at,
         MIN(h.changed_at) FILTER (
           WHERE h.status = ANY(ARRAY['firma_programada','pagado_comision'])
         ) AS otor_at
  FROM public.prospect_status_history h
  GROUP BY h.prospect_id
)
UPDATE public.prospects p
SET hito_condicionado_at = COALESCE(p.hito_condicionado_at, hitos.cond_at),
    hito_rechazado_at    = COALESCE(p.hito_rechazado_at,    hitos.rech_at),
    hito_aprobado_at     = COALESCE(p.hito_aprobado_at,     hitos.apro_at),
    hito_otorgado_at     = COALESCE(p.hito_otorgado_at,     hitos.otor_at)
FROM hitos
WHERE hitos.prospect_id = p.id;

-- ── 4) Backfill B: por el estado ACTUAL, para lo que el historial no alcance ──
UPDATE public.prospects p
SET hito_condicionado_at = COALESCE(p.hito_condicionado_at, p.updated_at, p.created_at)
WHERE p.hito_condicionado_at IS NULL
  AND p.status = ANY(ARRAY['falta_reporte','falta_afore','pendiente_documentos','falta_semanas','falta_afore_cuenta','posible_simulacion','agenda_futura','aportacion']);

UPDATE public.prospects p
SET hito_rechazado_at = COALESCE(p.hito_rechazado_at, p.updated_at, p.created_at)
WHERE p.hito_rechazado_at IS NULL
  AND p.status = 'rechazado';

UPDATE public.prospects p
SET hito_aprobado_at = COALESCE(p.hito_aprobado_at, p.updated_at, p.created_at)
WHERE p.hito_aprobado_at IS NULL
  AND p.status = ANY(ARRAY['aprobado_listo','asesoria_agendada','doc_proceso','analisis_riesgo','firma_contrato','firma_programada','pagado_comision']);

UPDATE public.prospects p
SET hito_otorgado_at = COALESCE(p.hito_otorgado_at, p.updated_at, p.created_at)
WHERE p.hito_otorgado_at IS NULL
  AND p.status = ANY(ARRAY['firma_programada','pagado_comision']);

-- ── 5) Coherencia: otorgado siempre implica aprobado ─────────────────────────
UPDATE public.prospects p
SET hito_aprobado_at = p.hito_otorgado_at
WHERE p.hito_otorgado_at IS NOT NULL
  AND p.hito_aprobado_at IS NULL;

-- ── 6) Índices para los reportes por rango ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prospects_hito_aprobado ON public.prospects(hito_aprobado_at);
CREATE INDEX IF NOT EXISTS idx_prospects_hito_otorgado ON public.prospects(hito_otorgado_at);

-- =============================================================================
-- 7) El módulo Closers cuenta también por hito alcanzado
-- =============================================================================
-- En producción la ficha del closer NO lee `prospects` (no tiene permiso): manda
-- la RPC. Si las RPC siguieran contando por estado actual, la misma aprobación
-- valdría distinto según la pantalla. Postgres no deja parchear el cuerpo de una
-- función, así que las dos que cuentan buckets se reproducen enteras, copiadas de
-- 20260804000001 (closers_overview) y 20260804000000 (closer_aliados) con los
-- filtros de bucket cambiados por `closers_hito(...)`.

-- Predicado de hito, espejo de fueAprobado/fueCondicionado/... en
-- src/app/admin/_pipelineBuckets.ts. Cae al estado actual si no hay sello, para
-- que nunca devuelva menos de lo que devolvía antes.
CREATE OR REPLACE FUNCTION public.closers_hito(
  bucket   text,
  p_status text,
  p_cond   timestamptz,
  p_rech   timestamptz,
  p_apro   timestamptz,
  p_otor   timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE bucket
    WHEN 'condicionados' THEN
      p_cond IS NOT NULL OR p_status = ANY (public.closers_stage('condicionados'))
    WHEN 'rechazados' THEN
      p_rech IS NOT NULL OR p_status = ANY (public.closers_stage('rechazados'))
    -- Aprobado incluye a lo ya otorgado: para otorgarse tuvo que aprobarse.
    WHEN 'aprobados' THEN
      p_apro IS NOT NULL
      OR p_status = ANY (public.closers_stage('aprobados'))
      OR p_status = ANY (public.closers_stage('ventas'))
    WHEN 'ventas' THEN
      p_otor IS NOT NULL OR p_status = ANY (public.closers_stage('ventas'))
    -- Perdido es un desenlace, no un hito: siempre es el estado de HOY.
    WHEN 'perdidos' THEN
      p_status = ANY (public.closers_stage('perdidos'))
    WHEN 'evaluados' THEN
      p_cond IS NOT NULL OR p_rech IS NOT NULL OR p_apro IS NOT NULL OR p_otor IS NOT NULL
      OR p_status = ANY (public.closers_stage('evaluados'))
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.closers_hito(text, text, timestamptz, timestamptz, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.closers_overview(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
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
  proyectos AS (
    SELECT pr.aliado_id, pr.status, pr.created_at,
           pr.hito_condicionado_at, pr.hito_rechazado_at, pr.hito_aprobado_at, pr.hito_otorgado_at
    FROM public.prospects pr
    WHERE COALESCE(pr.notes_director, '') NOT LIKE '[DELETED:%'
      AND COALESCE(pr.notes_director, '') NOT LIKE '[PURGED:%'
  ),
  por_aliado AS (
    SELECT
      a.id                                        AS aliado_id,
      a.closer_origen_id                          AS closer_id,
      a.fecha_incorporacion_closer                AS incorporado_at,
      count(pj.aliado_id)                         AS clientes_total,
      count(*) FILTER (WHERE public.closers_hito('ventas', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at))  AS ventas_total,
      count(*) FILTER (WHERE pj.aliado_id IS NOT NULL AND pj.created_at >= now() - interval '90 days') AS clientes_90d,
      max(pj.created_at)                          AS ultimo_cliente_at,
      count(*) FILTER (WHERE pj.aliado_id IS NOT NULL AND pj.en_rango) AS clientes_periodo,
      count(*) FILTER (WHERE pj.en_rango AND public.closers_hito('evaluados', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at))     AS clientes_evaluados,
      count(*) FILTER (WHERE pj.en_rango AND public.closers_hito('aprobados', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at))     AS clientes_aprobados,
      count(*) FILTER (WHERE pj.en_rango AND public.closers_hito('condicionados', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at)) AS clientes_condicionados,
      count(*) FILTER (WHERE pj.en_rango AND public.closers_hito('rechazados', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at))    AS clientes_rechazados,
      count(*) FILTER (WHERE pj.en_rango AND public.closers_hito('perdidos', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at))      AS clientes_perdidos,
      count(*) FILTER (WHERE pj.en_rango AND public.closers_hito('ventas', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at))        AS ventas_periodo
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

CREATE OR REPLACE FUNCTION public.closer_aliados(
  p_closer_id uuid,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  aliado_id           uuid,
  aliado_nombre       text,
  aliado_email        text,
  aliado_tipo         text,
  empresa_id          uuid,
  empresa_nombre      text,
  fecha_incorporacion timestamptz,
  es_closer_actual    boolean,
  creado_por          uuid,
  creado_por_mi       boolean,
  clientes_total      bigint,
  clientes_periodo    bigint,
  clientes_en_proceso bigint,
  clientes_aprobados  bigint,
  ventas              bigint,
  clientes_90d        bigint,
  ultimo_cliente_at   timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH yo AS (
    SELECT auth.uid() AS me, public.closers_my_role() AS mi_rol
  ),
  permitido AS (
    SELECT (
      (SELECT mi_rol FROM yo) IN ('admin', 'director')
      OR ((SELECT mi_rol FROM yo) = 'closer' AND (SELECT me FROM yo) = p_closer_id)
    ) AS ok
  ),
  proyectos AS (
    SELECT pr.aliado_id, pr.status, pr.created_at,
           pr.hito_condicionado_at, pr.hito_rechazado_at, pr.hito_aprobado_at, pr.hito_otorgado_at
    FROM public.prospects pr
    WHERE COALESCE(pr.notes_director, '') NOT LIKE '[DELETED:%'
      AND COALESCE(pr.notes_director, '') NOT LIKE '[PURGED:%'
  )
  SELECT
    a.id,
    a.full_name,
    a.email,
    COALESCE(a.aliado_tipo, 'aliado'),
    a.empresa_multialiado_id,
    e.nombre,
    a.fecha_incorporacion_closer,
    (a.closer_actual_id IS NOT DISTINCT FROM p_closer_id),
    a.created_by,
    (a.created_by IS NOT NULL AND a.created_by = p_closer_id),
    count(pj.aliado_id),
    count(*) FILTER (WHERE pj.aliado_id IS NOT NULL AND pj.en_rango),
    -- "En proceso" = sigue vivo en el embudo HOY: ni venta, ni rechazo, ni perdido.
    -- Es una cola de trabajo, no un hito, así que sí mira el estado actual.
    count(*) FILTER (
      WHERE pj.aliado_id IS NOT NULL
        AND NOT (pj.status = ANY (public.closers_stage('ventas')))
        AND NOT (pj.status = ANY (public.closers_stage('rechazados')))
        AND NOT (pj.status = ANY (public.closers_stage('perdidos')))
    ),
    count(*) FILTER (WHERE public.closers_hito('aprobados', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at)),
    count(*) FILTER (WHERE public.closers_hito('ventas', pj.status, pj.hito_condicionado_at, pj.hito_rechazado_at, pj.hito_aprobado_at, pj.hito_otorgado_at)),
    count(*) FILTER (WHERE pj.aliado_id IS NOT NULL AND pj.created_at >= now() - interval '90 days'),
    max(pj.created_at)
  FROM public.profiles a
  LEFT JOIN public.empresas_multialiado e ON e.id = a.empresa_multialiado_id
  LEFT JOIN LATERAL (
    SELECT p.*,
           (p_desde IS NULL OR (p.created_at AT TIME ZONE 'UTC')::date >= p_desde)
       AND (p_hasta IS NULL OR (p.created_at AT TIME ZONE 'UTC')::date <= p_hasta) AS en_rango
    FROM proyectos p
    WHERE p.aliado_id = a.id
  ) pj ON true
  WHERE (SELECT ok FROM permitido)
    AND a.role = 'aliado'
    AND a.closer_origen_id = p_closer_id
  GROUP BY a.id, a.full_name, a.email, a.aliado_tipo, a.empresa_multialiado_id,
           e.nombre, a.fecha_incorporacion_closer, a.closer_actual_id, a.created_by
  ORDER BY a.fecha_incorporacion_closer DESC NULLS LAST, a.full_name;
$$;
