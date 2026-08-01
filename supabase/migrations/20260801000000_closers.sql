-- =============================================================================
-- PensiónFlow — Migración: Módulo Closers (captación de aliados)
-- =============================================================================
-- El closer es la capa que faltaba ANTES del aliado:
--
--     Dirección → Closer → Aliado → Proyecto (prospects) → Embudo
--
-- Un closer prospecta, contacta y cierra ALIADOS nuevos. Este módulo mide su
-- productividad en dos planos que NO deben mezclarse (regla del §17 del brief):
--
--   1. Captación  → ¿cuántos aliados incorporó?      lente: fecha_incorporacion_closer
--   2. Calidad    → ¿esos aliados producen clientes  lente: prospects.created_at
--                    y ventas?
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIONES DE MODELADO (y por qué)
-- ─────────────────────────────────────────────────────────────────────────────
-- · NO existe tabla `aliados`: un aliado es una fila de `profiles` con
--   role='aliado'. Por eso la atribución vive en `profiles` (igual que los datos
--   bancarios de 20260731000000) y no en una entidad nueva que duplicaría al
--   usuario. Los "proyectos/clientes" son `prospects`, ligados por `aliado_id`.
--
-- · Se separan `closer_origen_id` (quién lo cerró — MÉRITO HISTÓRICO, no cambia
--   con las reasignaciones) y `closer_actual_id` (quién lo acompaña hoy —
--   GESTIÓN OPERATIVA). Todas las métricas de este módulo usan `closer_origen_id`,
--   tal como pide el §23. La reasignación mueve solo el "actual".
--
-- · `closer_aliado_asignaciones` es un HISTORIAL append-only: sin políticas de
--   UPDATE ni DELETE, así que ni el director puede reescribir el pasado.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ ESTA MIGRACIÓN ES AUTOSUFICIENTE
-- ─────────────────────────────────────────────────────────────────────────────
-- `supabase/schema.sql` NO está aplicado completo en producción (ver
-- 20260729000000): funciones como `update_updated_at_column()` no existen allá.
-- Aquí no se invoca NINGÚN helper de ese archivo — ni siquiera `get_user_role()`,
-- que sí existe en prod pero no lo crea ninguna migración. Todo lo que se usa se
-- define abajo con nombre propio con prefijo `closers_`, para no pisar nada.
--
-- Tampoco se toca `is_active`: esa columna NO EXISTE en la tabla `profiles` de
-- producción (ver 20260722000001 / 20260723000000). Una función que la
-- referenciara compilaría pero reventaría en ejecución. Por eso "aliado activo"
-- se deriva de la ACTIVIDAD REAL (tener clientes recientes), no de una bandera.
--
-- Todo es ADITIVO e IDEMPOTENTE y va dentro de una transacción: si un statement
-- falla, Postgres aborta y no queda nada a medias.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) EL ROL 'closer' DEBE CABER EN profiles.role
-- ─────────────────────────────────────────────────────────────────────────────
-- `profiles.role` tiene un CHECK que hoy solo admite ('admin','aliado',
-- 'account_manager'). Insertar 'closer' fallaría con 23514. Como el nombre del
-- constraint puede variar (fue creado a mano en prod, no por una migración), se
-- localiza por la COLUMNA a la que aplica y no por su nombre.
--
-- Se incluye 'director' en la lista nueva a propósito: la app escribe 'admin'
-- para la dirección, pero varias políticas comparan contra 'director'. Admitir
-- ambos evita que una fila legítima ya existente haga fallar el ADD CONSTRAINT
-- (que valida todas las filas y, si falla, aborta la migración entera).
DO $$
DECLARE
  c record;
  invalidos int;
BEGIN
  -- 1.a Aborta ANTES de tocar nada si hay algún rol inesperado en la tabla.
  SELECT count(*) INTO invalidos
  FROM public.profiles
  WHERE role IS NOT NULL
    AND role NOT IN ('admin', 'director', 'aliado', 'account_manager', 'closer');

  IF invalidos > 0 THEN
    RAISE EXCEPTION
      'Hay % perfil(es) con un role fuera de la lista esperada. Revisa: SELECT DISTINCT role FROM public.profiles;',
      invalidos;
  END IF;

  -- 1.b Elimina cualquier CHECK que aplique sobre la columna `role`.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.profiles'::regclass
      AND con.contype = 'c'
      AND att.attname = 'role'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IS NULL OR role IN ('admin', 'director', 'aliado', 'account_manager', 'closer'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ATRIBUCIÓN CLOSER → ALIADO (columnas en profiles)
-- ─────────────────────────────────────────────────────────────────────────────
-- Las cuatro columnas quedan en NULL para los aliados que ya existen: eso es
-- exactamente "Sin atribución", un cubo legítimo del tablero. No se inventa
-- historia comercial; la Dirección los va atribuyendo con el asignador masivo.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS closer_origen_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS closer_actual_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Fecha de cierre del aliado (§39). Deliberadamente distinta de `created_at`:
-- un usuario pudo migrarse o importarse mucho antes de que se le atribuyera un
-- closer, y las métricas mensuales se calculan sobre ESTA fecha.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fecha_incorporacion_closer timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS closer_asignado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.closer_origen_id IS
  'Closer que INCORPORÓ a este aliado. Mérito histórico: no cambia al reasignar. Base de todas las métricas del módulo Closers.';
COMMENT ON COLUMN public.profiles.closer_actual_id IS
  'Closer que acompaña HOY a este aliado. Solo gestión operativa y permisos de lectura.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) HISTORIAL DE ASIGNACIONES (append-only)
-- ─────────────────────────────────────────────────────────────────────────────
-- OJO — `aliado_id` NO lleva FOREIGN KEY a propósito. `createProfile()` en la app
-- tiene una ruta de "auto-recuperación": si el INSERT en `profiles` lo bloquea el
-- RLS, la cuenta de auth queda creada y el perfil se materializa en el primer
-- login. En ese hueco el perfil todavía no existe, y una FK impediría registrar
-- la asignación — que es justo el dato que no podemos perder. Sin FK, el
-- historial siempre se puede escribir. El precio es limpiar estas filas al borrar
-- un usuario, y de eso se encarga /api/admin/delete-user.
CREATE TABLE IF NOT EXISTS public.closer_aliado_asignaciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aliado_id          uuid NOT NULL,
  closer_anterior_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closer_nuevo_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closer_origen_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo_movimiento    text NOT NULL
                       CHECK (tipo_movimiento IN ('asignacion_inicial', 'reasignacion', 'backfill', 'desasignacion')),
  motivo             text,
  asignado_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fecha_asignacion   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.closer_aliado_asignaciones IS
  'Historial append-only de la atribución closer↔aliado. Sin políticas UPDATE/DELETE: el pasado no se reescribe.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_closer_origen
  ON public.profiles (closer_origen_id) WHERE closer_origen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_closer_actual
  ON public.profiles (closer_actual_id) WHERE closer_actual_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_fecha_incorporacion_closer
  ON public.profiles (fecha_incorporacion_closer);
-- Listar rápido "aliados todavía sin closer" (lo que alimenta el asignador masivo).
CREATE INDEX IF NOT EXISTS idx_profiles_aliados_sin_closer
  ON public.profiles (role) WHERE closer_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_aliado ON public.prospects (aliado_id);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON public.prospects (status);

CREATE INDEX IF NOT EXISTS idx_caa_aliado
  ON public.closer_aliado_asignaciones (aliado_id, fecha_asignacion DESC);
CREATE INDEX IF NOT EXISTS idx_caa_closer_nuevo
  ON public.closer_aliado_asignaciones (closer_nuevo_id);
CREATE INDEX IF NOT EXISTS idx_caa_closer_origen
  ON public.closer_aliado_asignaciones (closer_origen_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) HELPERS
-- ─────────────────────────────────────────────────────────────────────────────
-- `closers_my_role()` es SECURITY DEFINER a propósito: corre con los privilegios
-- del dueño y BYPASSA el RLS de `profiles`. Sin esto, una política de `profiles`
-- que consultara `profiles` se auto-dispararía → 42P17 "infinite recursion", que
-- es exactamente el incidente que sacó a TODOS los usuarios de la app en
-- 20260723000001. Mismo patrón que `get_user_role()` y `am_ids_for_my_prospects()`.
CREATE OR REPLACE FUNCTION public.closers_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.closers_is_direccion()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.closers_my_role() IN ('admin', 'director');
$$;

-- Etapas del embudo. Es un ESPEJO EXACTO de src/app/admin/_pipelineBuckets.ts:
-- si allá cambia un bucket, aquí también, o los números del módulo Closers
-- dejarán de cuadrar con el Dashboard y con Reportes.
CREATE OR REPLACE FUNCTION public.closers_stage(bucket text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE bucket
    -- Dictamen aprobado + el pipeline de cierre HASTA Firma de Contrato.
    WHEN 'aprobados' THEN
      ARRAY['aprobado_listo', 'asesoria_agendada', 'doc_proceso', 'analisis_riesgo', 'firma_contrato']
    WHEN 'condicionados' THEN
      ARRAY['falta_reporte', 'falta_afore', 'pendiente_documentos', 'falta_semanas',
            'falta_afore_cuenta', 'posible_simulacion', 'agenda_futura', 'aportacion']
    -- VENTA = financiamiento otorgado. No se inventa un estado nuevo (§25):
    -- Cerrada Ganada (firma_programada) + Pagada Cerrada (pagado_comision).
    WHEN 'ventas' THEN
      ARRAY['firma_programada', 'pagado_comision']
    WHEN 'perdidos' THEN
      ARRAY['cerrado_perdido', 'cerrado_riesgo', 'cerrado_desiste']
    WHEN 'rechazados' THEN
      ARRAY['rechazado']
    -- Evaluados = todo lo que ya tiene dictamen. El único estado excluido es
    -- evaluacion_pendiente (y los cerrados perdidos, que se cuentan aparte).
    WHEN 'evaluados' THEN
      ARRAY['aprobado_listo', 'asesoria_agendada', 'doc_proceso', 'analisis_riesgo', 'firma_contrato',
            'falta_reporte', 'falta_afore', 'pendiente_documentos', 'falta_semanas',
            'falta_afore_cuenta', 'posible_simulacion', 'agenda_futura', 'aportacion',
            'rechazado', 'firma_programada', 'pagado_comision']
    ELSE ARRAY[]::text[]
  END;
$$;

-- Tipo de aliado (§10), derivado de lo que el sistema YA modela: `aliado_tipo`
-- ('aliado' | 'lider') más la pertenencia a una empresa multialiado. No se
-- inventa una columna nueva para clasificar algo que ya está clasificado.
CREATE OR REPLACE FUNCTION public.closers_tipo_aliado(p_aliado_tipo text, p_empresa uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_aliado_tipo = 'lider' THEN 'lider'
    WHEN p_empresa IS NOT NULL   THEN 'empresa'
    ELSE 'independiente'
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RPC: RESUMEN POR CLOSER
-- ─────────────────────────────────────────────────────────────────────────────
-- Toda la agregación ocurre AQUÍ, en Postgres (§32): el navegador nunca descarga
-- los proyectos para contarlos, y una sola llamada resuelve la tabla completa en
-- lugar de una consulta por closer.
--
-- SECURITY DEFINER = bypassa el RLS, así que el alcance se impone DENTRO:
--   · dirección (admin/director) → todos los closers
--   · closer                     → únicamente su propia fila
--   · cualquier otro rol         → cero filas
-- Devuelve solo AGREGADOS. Un closer nunca recibe por aquí el nombre, la CURP ni
-- el NSS de un cliente: la decisión de producto es que el closer mide, no opera.
--
-- Dos lentes de fecha que nunca se mezclan (§17):
--   · aliados_periodo  → fecha_incorporacion_closer  (productividad de captación)
--   · clientes_*       → prospects.created_at        (productividad comercial)
-- Los sufijos _total ignoran el período; los demás lo respetan.
--
-- NOTA DE ZONA HORARIA: el corte de día se hace en UTC, igual que el resto de la
-- app (Reportes y Gestión de Clientes comparan `created_at` recortado a 10
-- caracteres, que es la fecha UTC). Es una desviación consciente del §26: si aquí
-- se agrupara en America/Mexico_City, los proyectos creados entre las 18:00 y la
-- medianoche caerían en un día distinto al que muestra Reportes y la Dirección
-- vería dos cifras diferentes para el mismo rango. Si algún día se cambia, hay
-- que cambiarlo en TODOS los módulos a la vez.
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
    WHERE c.role = 'closer'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) RPC: SERIE TEMPORAL DE ALIADOS INCORPORADOS (gráfico principal, §9)
-- ─────────────────────────────────────────────────────────────────────────────
-- Devuelve un renglón por (closer, cubo temporal). El front decide si pinta
-- barras o líneas, una serie por closer o el consolidado. Los cubos VACÍOS los
-- rellena el front: aquí no se generan para no inventar filas.
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
  JOIN public.profiles c ON c.id = a.closer_origen_id AND c.role = 'closer'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RPC: ALIADOS DE UN CLOSER, CON SU PRODUCTIVIDAD (§14)
-- ─────────────────────────────────────────────────────────────────────────────
-- El guardia del `p_closer_id` es imprescindible: la función es SECURITY DEFINER,
-- así que sin él un closer podría pedir la ficha de otro pasando su uuid.
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
    SELECT pr.aliado_id, pr.status, pr.created_at
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
    count(pj.aliado_id),
    count(*) FILTER (WHERE pj.aliado_id IS NOT NULL AND pj.en_rango),
    -- "En proceso" = sigue vivo en el embudo: ni venta, ni rechazo, ni perdido.
    count(*) FILTER (
      WHERE pj.aliado_id IS NOT NULL
        AND NOT (pj.status = ANY (public.closers_stage('ventas')))
        AND NOT (pj.status = ANY (public.closers_stage('rechazados')))
        AND NOT (pj.status = ANY (public.closers_stage('perdidos')))
    ),
    count(*) FILTER (WHERE pj.status = ANY (public.closers_stage('aprobados'))),
    count(*) FILTER (WHERE pj.status = ANY (public.closers_stage('ventas'))),
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
           e.nombre, a.fecha_incorporacion_closer, a.closer_actual_id
  ORDER BY a.fecha_incorporacion_closer DESC NULLS LAST, a.full_name;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) PERMISOS DE EJECUCIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Estas funciones bypassan el RLS, así que NADIE anónimo debe poder llamarlas.
REVOKE ALL ON FUNCTION public.closers_my_role()                                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closers_is_direccion()                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closers_overview(date, date, text, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closers_serie(date, date, text, text, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closer_aliados(uuid, date, date)                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.closers_my_role()                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.closers_is_direccion()                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.closers_overview(date, date, text, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.closers_serie(date, date, text, text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.closer_aliados(uuid, date, date)                     TO authenticated;

-- `closers_stage` y `closers_tipo_aliado` son tablas de constantes, sin datos:
-- pueden quedar abiertas a usuarios autenticados sin exponer nada.
GRANT EXECUTE ON FUNCTION public.closers_stage(text)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.closers_tipo_aliado(text, uuid)                      TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) RLS
-- ─────────────────────────────────────────────────────────────────────────────

-- 10.a `profiles`: política ADITIVA para el rol closer.
-- En Postgres las políticas SELECT se combinan con OR, así que esto solo AMPLÍA
-- lo visible; jamás restringe lo que ya podían ver dirección, AM o aliados.
-- Endurecer el SELECT de `profiles` rompería el selector de asignación de
-- proyectos (ver 20260722000002): no se toca.
--
-- No hay recursión: `closers_my_role()` es SECURITY DEFINER y el resto de la
-- condición solo mira columnas de la FILA que se está evaluando.
DROP POLICY IF EXISTS "Closers ven sus aliados atribuidos" ON public.profiles;
CREATE POLICY "Closers ven sus aliados atribuidos"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND public.closers_my_role() = 'closer'
    AND role = 'aliado'
    AND (closer_origen_id = auth.uid() OR closer_actual_id = auth.uid())
  );

-- Un closer necesita verse a sí mismo en el selector y en su ficha. La política
-- "auth.uid() = id" de 20260630000000 ya lo cubre; esta añade que la DIRECCIÓN
-- vea a los closers aunque alguna política futura se estreche. Es redundante
-- hoy a propósito: barata y a prueba de cambios.
DROP POLICY IF EXISTS "Direccion ve a los closers" ON public.profiles;
CREATE POLICY "Direccion ve a los closers"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND role = 'closer'
    AND public.closers_is_direccion()
  );

-- IMPORTANTE — lo que NO se hace aquí: no se crea ninguna política que le dé al
-- rol closer acceso a `prospects`. Un closer NO lee expedientes de clientes
-- (nombre, CURP, NSS, teléfono). El RLS de Postgres es por FILA, no por columna:
-- dar acceso a la tabla entregaría la PII completa. Sus números llegan
-- exclusivamente por las RPC agregadas de arriba.

-- 10.b Historial de asignaciones.
ALTER TABLE public.closer_aliado_asignaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Direccion ve el historial de asignaciones" ON public.closer_aliado_asignaciones;
CREATE POLICY "Direccion ve el historial de asignaciones"
  ON public.closer_aliado_asignaciones
  FOR SELECT
  TO public
  USING (public.closers_is_direccion());

DROP POLICY IF EXISTS "Closer ve su propio historial" ON public.closer_aliado_asignaciones;
CREATE POLICY "Closer ve su propio historial"
  ON public.closer_aliado_asignaciones
  FOR SELECT
  TO public
  USING (
    public.closers_my_role() = 'closer'
    AND auth.uid() IN (closer_nuevo_id, closer_anterior_id, closer_origen_id)
  );

-- Solo la Dirección escribe. Sin políticas de UPDATE ni DELETE: append-only (§22).
DROP POLICY IF EXISTS "Direccion registra asignaciones" ON public.closer_aliado_asignaciones;
CREATE POLICY "Direccion registra asignaciones"
  ON public.closer_aliado_asignaciones
  FOR INSERT
  TO public
  WITH CHECK (public.closers_is_direccion());

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) Recargar el caché de esquemas de PostgREST (Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
