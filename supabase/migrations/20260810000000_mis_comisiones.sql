-- =============================================================================
-- PensiónFlow — «Mis comisiones»: cada quien ve LO SUYO
-- =============================================================================
-- Pedido por Dirección el 2026-08-10. El Account Manager y el Closer entran al
-- módulo de Finanzas, pero solo a su propia liquidación y a las tarifas con las
-- que se le calcula. Nada de otras personas, nada de totales de la empresa.
--
-- Es exactamente la puerta que 20260802000002 dejó anunciada al final de su
-- bloque de RLS («la vista personal "cada quien ve lo suyo" ... se resolverá con
-- una política SELECT adicional sobre usuario_id = auth.uid()»). Se cumple el
-- fondo y se cambia la forma, por lo que explica el apartado siguiente.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ RPC Y NO UNA POLÍTICA DE RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Una política `usuario_id = auth.uid()` sobre `comision_eventos` sería correcta
-- en cuanto a QUÉ FILAS se ven, pero abriría la tabla a `select *` desde el
-- navegador: el RLS es ciego a columnas y entregaría también `clave_unica`,
-- `evento_original_id`, `aprobado_por`, `pagado_por`… la fontanería interna del
-- libro mayor. Y sobre todo, obligaría a que el navegador sumara sus propias
-- comisiones, que es justo lo que el módulo no hace en ningún sitio.
--
-- Estas funciones devuelven EL DATO YA AGREGADO y solo las columnas que la
-- pantalla enseña. El alcance lo imponen por dentro, con `auth.uid()`, que el
-- cliente no puede falsificar: no hay parámetro «usuario» en ninguna firma, así
-- que no existe forma de pedir la liquidación de otra persona. Ninguna tabla
-- gana una política nueva.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ VE Y QUÉ NO
-- ─────────────────────────────────────────────────────────────────────────────
-- SÍ  · Sus movimientos: cuánto, por qué operación, en qué estado va y cuándo se
--       le depositó. Incluidos los que aún están pendientes de revisión, porque
--       la pregunta que trae a esta pantalla es «¿cuánto llevo?».
--   · Sus depósitos, con fecha, método y referencia bancaria.
--   · Las tarifas de SU rol (y las de cualquier rol bajo el que haya devengado
--     alguna vez, para que un cambio de puesto no le esconda su propio pasado).
-- NO  · Importes de nadie más, ni totales de la empresa, ni el número de
--       beneficiarios: ninguna función agrega por encima de `auth.uid()`.
--   · Las tarifas de OTROS roles. Lo que cobra un aliado o un closer no es
--     asunto de un Account Manager.
--   · Los cortes, la bitácora, la producción global, las inconsistencias, los
--     datos bancarios de nadie (ni los suyos: para eso está su propio perfil).
--   · Nada que escriba. Aquí no hay una sola función de escritura: no puede
--     aprobar, observar, ajustar ni marcar como pagado. Es una consulta.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SOLO ACCOUNT MANAGER Y CLOSER
-- ─────────────────────────────────────────────────────────────────────────────
-- El portero `mis_comisiones_puedo_ver()` mira el ROL, no la lista de acceso de
-- Finanzas: son dos preguntas distintas y así siguen (20260802000003). La
-- Dirección y el rol `finanzas` no lo necesitan —tienen el módulo completo— y el
-- aliado tiene su propio portal. Ampliarlo el día de mañana es tocar una sola
-- función y ningún permiso.
--
-- AUTOSUFICIENTE A PROPÓSITO
-- `schema.sql` NO está aplicado en producción y esta migración no da por hecha
-- ninguna función compartida: declara su propio `mis_com_rol()` en vez de
-- apoyarse en `fin_my_role()`, para no quedar atada a un cuerpo que vive en otra
-- migración y que otro despliegue podría reemplazar.
--
-- NO se referencia `profiles.is_active`: esa columna no existe en producción.
--
-- Todo es ADITIVO e IDEMPOTENTE y va dentro de una transacción. No toca tablas,
-- ni políticas, ni roles, ni el portero del módulo de Dirección.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) PORTERO
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER para saltarse el RLS de `profiles`: una función que consulta
-- `profiles` desde una política de `profiles` se auto-dispara → 42P17 «infinite
-- recursion», el incidente que sacó a todo el mundo de la app el 2026-07-23.
CREATE OR REPLACE FUNCTION public.mis_com_rol()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$fn$;

-- Quién tiene vista personal de comisiones. Deliberadamente por ROL y no por
-- `comision_config.acceso_ids`: esa lista responde «¿puede ver el libro mayor
-- COMPLETO?», que es una pregunta distinta y mucho más grande.
CREATE OR REPLACE FUNCTION public.mis_comisiones_puedo_ver()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT auth.uid() IS NOT NULL
     AND coalesce(public.mis_com_rol() IN ('account_manager', 'closer'), false);
$fn$;

COMMENT ON FUNCTION public.mis_comisiones_puedo_ver() IS
  'Portero de la vista personal de comisiones: Account Managers y Closers. No sustituye a fin_is_direccion(), que sigue guardando el libro mayor completo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) LECTURAS
-- ─────────────────────────────────────────────────────────────────────────────
-- Las cinco funciones comparten la misma columna vertebral:
--
--     WHERE public.mis_comisiones_puedo_ver() AND e.usuario_id = auth.uid()
--
-- No hay parámetro de usuario en ninguna firma. Quien no pase el portero recibe
-- 0 filas —no un error—, igual que el resto de lecturas del módulo: una pantalla
-- vacía se explica sola y no filtra si el dato existe o no.
--
-- ⚠️ Todas las referencias a columnas van CUALIFICADAS (`e.monto`, no `monto`):
-- en una función SQL los nombres del RETURNS TABLE son visibles dentro del
-- cuerpo y una referencia desnuda aborta con 42702 «referencia ambigua». Es el
-- mismo tropiezo que documenta 20260802000001.

-- ── Las tarjetas de arriba ───────────────────────────────────────────────────
-- Mismas reglas de conteo que `comisiones_resumen`, para que lo que ve el AM
-- cuadre al peso con la fila que la Dirección ve de él: se excluyen revertidos y
-- anulados, y «pendiente de pago» incluye lo observado, que sigue siendo dinero
-- comprometido mientras no se resuelva.
DROP FUNCTION IF EXISTS public.mis_comisiones_resumen(date, date);
CREATE FUNCTION public.mis_comisiones_resumen(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  total_generado           numeric,
  total_pendiente_revision numeric,
  total_aprobado           numeric,
  total_enviado_finanzas   numeric,
  total_pagado             numeric,
  total_pendiente_pago     numeric,
  total_observado          numeric,
  comisiones               numeric,
  bonos                    numeric,
  salario                  numeric,
  ajustes                  numeric,
  eventos                  bigint,
  eventos_observados       bigint,
  operaciones              bigint,
  primer_devengo           timestamptz,
  ultimo_devengo           timestamptz,
  ultimo_pago              timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  WITH ev AS (
    SELECT e.*
    FROM public.comision_eventos e
    WHERE public.mis_comisiones_puedo_ver()
      AND e.usuario_id = auth.uid()
      AND e.estado <> 'revertido'
      AND e.anulado_at IS NULL
      AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
      AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
  )
  SELECT
    coalesce(sum(ev.monto), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.estado = 'pendiente_revision'), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.estado = 'aprobado'), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.estado = 'enviado_finanzas'), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.estado = 'pagado'), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.estado <> 'pagado'), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.estado = 'observado'), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.tipo_evento IN ('comision_financiamiento', 'comision_cierre_aliado',
                                                            'comision_primer_financiamiento', 'comision_aliado')), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.tipo_evento IN ('bono_mensual', 'bono_trimestral')), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.tipo_evento = 'salario_fijo'), 0),
    coalesce(sum(ev.monto) FILTER (WHERE ev.tipo_evento IN ('ajuste_positivo', 'ajuste_negativo', 'reversion')), 0),
    count(*)::bigint,
    count(*) FILTER (WHERE ev.estado = 'observado')::bigint,
    -- Operaciones que respaldan el dinero: proyectos DISTINTOS más aliados
    -- DISTINTOS cerrados. No es «número de eventos»: un mismo financiamiento
    -- puede pagar dos conceptos, y contarlo dos veces inflaría la producción.
    (count(DISTINCT ev.prospecto_id) FILTER (WHERE ev.tipo_evento IN ('comision_financiamiento',
                                                                      'comision_primer_financiamiento',
                                                                      'comision_aliado'))
     + count(DISTINCT ev.aliado_id) FILTER (WHERE ev.tipo_evento = 'comision_cierre_aliado'))::bigint,
    min(ev.fecha_devengo),
    max(ev.fecha_devengo),
    max(ev.fecha_pago)
  FROM ev;
$fn$;

COMMENT ON FUNCTION public.mis_comisiones_resumen(date, date) IS
  'Totales propios del período para un Account Manager o un Closer. Sin parámetro de usuario: el alcance lo pone auth.uid() por dentro.';

-- ── El detalle: un renglón por movimiento ────────────────────────────────────
-- A diferencia del resumen, aquí SÍ se ven los revertidos y los anulados. Son
-- los que más falta hacen: una comisión que aparece y luego desaparece sin
-- explicación es exactamente la clase de agujero que trae a alguien a preguntar.
--
-- Se devuelve el nombre del cliente y el del aliado —son la prueba de por qué se
-- cobró ese peso— pero NO el Account Manager del proyecto, que sí lleva
-- `comisiones_eventos`: para un Closer eso sería información de otra persona.
DROP FUNCTION IF EXISTS public.mis_comisiones_eventos(date, date, text, text, int);
CREATE FUNCTION public.mis_comisiones_eventos(
  p_desde       date DEFAULT NULL,
  p_hasta       date DEFAULT NULL,
  p_estado      text DEFAULT NULL,
  p_tipo_evento text DEFAULT NULL,
  p_limite      int  DEFAULT 500
)
RETURNS TABLE (
  id                   uuid,
  rol_beneficiario     text,
  tipo_evento          text,
  tipo_producto        text,
  monto                numeric,
  moneda               text,
  produccion           int,
  fecha_devengo        timestamptz,
  periodo_corte        text,
  estado               text,
  motivo_observacion   text,
  observaciones        text,
  prospecto_id         uuid,
  cliente_nombre       text,
  aliado_id            uuid,
  aliado_nombre        text,
  corte_id             uuid,
  anulado_at           timestamptz,
  fecha_aprobacion     timestamptz,
  fecha_envio_finanzas timestamptz,
  fecha_pago           timestamptz,
  referencia_pago      text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT
    e.id, e.rol_beneficiario, e.tipo_evento, e.tipo_producto, e.monto, e.moneda, e.produccion,
    e.fecha_devengo, e.periodo_corte, e.estado, e.motivo_observacion, e.observaciones,
    e.prospecto_id, pr.full_name, e.aliado_id, al.full_name,
    e.corte_id, e.anulado_at, e.fecha_aprobacion, e.fecha_envio_finanzas, e.fecha_pago, e.referencia_pago
  FROM public.comision_eventos e
  LEFT JOIN public.prospects pr ON pr.id = e.prospecto_id
  LEFT JOIN public.profiles  al ON al.id = e.aliado_id
  WHERE public.mis_comisiones_puedo_ver()
    AND e.usuario_id = auth.uid()
    AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
    AND (p_estado IS NULL OR e.estado = p_estado)
    AND (p_tipo_evento IS NULL OR e.tipo_evento = p_tipo_evento)
  ORDER BY e.fecha_devengo DESC, e.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limite, 500), 2000));
$fn$;

COMMENT ON FUNCTION public.mis_comisiones_eventos(date, date, text, text, int) IS
  'Movimientos propios con la operación que los originó. Incluye revertidos y anulados a propósito: un importe que desaparece sin rastro es peor que uno tachado.';

-- ── La curva del período ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.mis_comisiones_serie(date, date, text);
CREATE FUNCTION public.mis_comisiones_serie(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_grano text DEFAULT 'semana'
)
RETURNS TABLE (
  periodo   date,
  generado  numeric,
  pagado    numeric,
  pendiente numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT
    (date_trunc(
      CASE p_grano WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week'
                   WHEN 'mes' THEN 'month' WHEN 'trimestre' THEN 'quarter'
                   ELSE 'year' END,
      e.fecha_devengo AT TIME ZONE 'UTC'
    ))::date,
    coalesce(sum(e.monto), 0),
    coalesce(sum(e.monto) FILTER (WHERE e.estado = 'pagado'), 0),
    coalesce(sum(e.monto) FILTER (WHERE e.estado <> 'pagado'), 0)
  FROM public.comision_eventos e
  WHERE public.mis_comisiones_puedo_ver()
    AND e.usuario_id = auth.uid()
    AND e.estado <> 'revertido'
    AND e.anulado_at IS NULL
    AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
  GROUP BY 1
  ORDER BY 1;
$fn$;

-- ── De qué se compone el total ───────────────────────────────────────────────
-- El desglose por concepto es lo que convierte «me tocan $8,400» en «me tocan
-- $8,400 porque cerré 12 Mod 40 y 3 nóminas».
DROP FUNCTION IF EXISTS public.mis_comisiones_por_concepto(date, date);
CREATE FUNCTION public.mis_comisiones_por_concepto(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  tipo_evento   text,
  tipo_producto text,
  eventos       bigint,
  monto         numeric,
  pagado        numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT
    e.tipo_evento,
    e.tipo_producto,
    count(*)::bigint,
    coalesce(sum(e.monto), 0),
    coalesce(sum(e.monto) FILTER (WHERE e.estado = 'pagado'), 0)
  FROM public.comision_eventos e
  WHERE public.mis_comisiones_puedo_ver()
    AND e.usuario_id = auth.uid()
    AND e.estado <> 'revertido'
    AND e.anulado_at IS NULL
    AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
  GROUP BY e.tipo_evento, e.tipo_producto
  ORDER BY 4 DESC;
$fn$;

-- ── Los depósitos recibidos ──────────────────────────────────────────────────
-- Se filtran por la FECHA DE PAGO y no por la del devengo: la pregunta aquí es
-- «¿qué me depositaron este mes?», que no tiene por qué coincidir con «¿qué
-- generé este mes?» —un corte de julio se deposita en agosto—.
--
-- `registrado_por` se deja fuera a propósito: quién de Finanzas capturó el
-- depósito es asunto interno del módulo, no del beneficiario.
DROP FUNCTION IF EXISTS public.mis_comisiones_pagos(date, date, int);
CREATE FUNCTION public.mis_comisiones_pagos(
  p_desde  date DEFAULT NULL,
  p_hasta  date DEFAULT NULL,
  p_limite int  DEFAULT 200
)
RETURNS TABLE (
  id                  uuid,
  corte_id            uuid,
  monto_pagado        numeric,
  moneda              text,
  fecha_pago          date,
  metodo_pago         text,
  referencia_bancaria text,
  comprobante_url     text,
  observaciones       text,
  created_at          timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT
    pg.id, pg.corte_id, pg.monto_pagado, pg.moneda, pg.fecha_pago, pg.metodo_pago,
    pg.referencia_bancaria, pg.comprobante_url, pg.observaciones, pg.created_at
  FROM public.pagos_comisiones pg
  WHERE public.mis_comisiones_puedo_ver()
    AND pg.usuario_id = auth.uid()
    AND (p_desde IS NULL OR pg.fecha_pago >= p_desde)
    AND (p_hasta IS NULL OR pg.fecha_pago <= p_hasta)
  ORDER BY pg.fecha_pago DESC, pg.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limite, 200), 1000));
$fn$;

COMMENT ON FUNCTION public.mis_comisiones_pagos(date, date, int) IS
  'Depósitos recibidos por el propio usuario, filtrados por FECHA DE PAGO (no de devengo): lo cobrado en el período, que rara vez es lo generado en el período.';

-- ── Las tarifas con las que se me calcula ────────────────────────────────────
-- Solo las de SU rol. Lo que cobra un aliado, un closer o la Dirección no es
-- asunto de un Account Manager, y este módulo es justamente donde más caro sale
-- enseñar de más.
--
-- El alcance no es «mi rol de hoy» sino «los roles bajo los que he devengado
-- alguna vez», más el actual: a quien pasó de closer a AM no se le puede
-- esconder la tarifa que explica sus comisiones viejas, que siguen en pantalla.
--
-- Se devuelven también las vigencias CERRADAS, marcadas con `vigente_hoy =
-- false`: sin ellas, una comisión de julio calculada a la tarifa vieja parece un
-- error de la plataforma.
DROP FUNCTION IF EXISTS public.mis_comisiones_tarifas();
CREATE FUNCTION public.mis_comisiones_tarifas()
RETURNS TABLE (
  id               uuid,
  rol_beneficiario text,
  concepto         text,
  producto         text,
  umbral_min       int,
  monto            numeric,
  moneda           text,
  vigente_desde    date,
  vigente_hasta    date,
  notas            text,
  vigente_hoy      boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  WITH mis_roles AS (
    SELECT public.mis_com_rol() AS rol
    WHERE public.mis_comisiones_puedo_ver()
    UNION
    SELECT DISTINCT e.rol_beneficiario
    FROM public.comision_eventos e
    WHERE public.mis_comisiones_puedo_ver()
      AND e.usuario_id = auth.uid()
  )
  SELECT
    t.id, t.rol_beneficiario, t.concepto, t.producto, t.umbral_min, t.monto, t.moneda,
    t.vigente_desde, t.vigente_hasta, t.notas,
    (t.vigente_desde <= current_date AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= current_date))
  FROM public.comision_tarifas t
  WHERE t.activo
    AND t.rol_beneficiario IN (SELECT mis_roles.rol FROM mis_roles WHERE mis_roles.rol IS NOT NULL)
  ORDER BY t.rol_beneficiario, t.concepto, t.producto NULLS FIRST, t.umbral_min, t.vigente_desde DESC;
$fn$;

COMMENT ON FUNCTION public.mis_comisiones_tarifas() IS
  'Tarifas del propio rol (y de los roles bajo los que el usuario haya devengado). Nunca las de otros roles: en Finanzas, enseñar de más es el error caro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) PERMISOS
-- ─────────────────────────────────────────────────────────────────────────────
-- Solo EXECUTE, y solo a `authenticated`. Ninguna tabla cambia de permisos ni
-- gana una política: quien no llame a estas funciones sigue sin ver una fila de
-- `comision_eventos`, igual que ayer.
REVOKE ALL ON FUNCTION public.mis_com_rol()                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_comisiones_puedo_ver()                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_comisiones_resumen(date, date)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_comisiones_eventos(date, date, text, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_comisiones_serie(date, date, text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_comisiones_por_concepto(date, date)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_comisiones_pagos(date, date, int)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_comisiones_tarifas()                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mis_com_rol()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_comisiones_puedo_ver()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_comisiones_resumen(date, date)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_comisiones_eventos(date, date, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_comisiones_serie(date, date, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_comisiones_por_concepto(date, date)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_comisiones_pagos(date, date, int)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_comisiones_tarifas()                        TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) COMPROBACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Se comprueba lo que de verdad puede romperse en producción: que las tablas del
-- módulo existan (esta migración es inútil sin ellas) y que las siete funciones
-- hayan quedado creadas. No se comprueba el resultado de las consultas porque
-- dependen de `auth.uid()`, que en una migración es NULL.
DO $$
DECLARE
  v_faltan int;
BEGIN
  IF to_regclass('public.comision_eventos') IS NULL
     OR to_regclass('public.comision_tarifas') IS NULL
     OR to_regclass('public.pagos_comisiones') IS NULL THEN
    RAISE EXCEPTION 'Faltan tablas del módulo de Finanzas (20260802000000). La vista personal no se sostiene sin el libro mayor.';
  END IF;

  SELECT count(*) INTO v_faltan
  FROM (VALUES
    ('mis_com_rol'), ('mis_comisiones_puedo_ver'), ('mis_comisiones_resumen'),
    ('mis_comisiones_eventos'), ('mis_comisiones_serie'), ('mis_comisiones_por_concepto'),
    ('mis_comisiones_pagos'), ('mis_comisiones_tarifas')
  ) AS esperadas(nombre)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc pr
    JOIN pg_namespace ns ON ns.oid = pr.pronamespace
    WHERE ns.nspname = 'public' AND pr.proname = esperadas.nombre
  );

  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'Quedaron % función(es) de «Mis comisiones» sin crear. Se aborta.', v_faltan;
  END IF;

  RAISE NOTICE 'Vista personal de comisiones lista para Account Managers y Closers.';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
