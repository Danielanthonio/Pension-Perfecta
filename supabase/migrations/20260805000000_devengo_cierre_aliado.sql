-- =============================================================================
-- PensiónFlow — La comisión de cierre vuelve a devengarse
-- =============================================================================
-- Reportado por Dirección el 2026-08-04: "no aparecen los closers en el reporte
-- de Finanzas".
--
-- EL DIAGNÓSTICO
-- No era la pantalla. Liquidaciones se construye entera desde `comision_eventos`
-- y un closer solo puede generar dos tipos de evento —el cierre de aliado y el
-- primer financiamiento de su aliado—, los dos colgados de la MISMA columna:
-- `profiles.aliado_cerrado_por_id`. Esa columna se rellenó una sola vez, en el
-- backfill de 20260802000000, y desde entonces no la escribe nadie. Medido en
-- producción: 263 aliados atribuidos, 1 con beneficiario de cierre. De ahí que
-- Liquidaciones mostrara un único renglón de 300 MXN.
--
-- LA CORRECCIÓN
-- El propio 20260802000000 ya había escrito cuál era la regla buena, y el motor
-- de modo local la implementa desde el primer día (`cerradorDe` en
-- finanzasMetrics.ts):
--
--     COALESCE(aliado_cerrado_por_id, closer_origen_id)
--
-- El SQL de 20260802000001 no la aplicó: lee la columna a pelo. Esta migración
-- la aplica en los siete puntos donde hacía falta, y con eso el arreglo es de
-- LECTURA: no se toca ni una fila de `profiles`, no se inventa autoría y no se
-- pisa el `updated_at` de 262 aliados. La columna conserva su sentido original
-- —un override explícito para cuando quien cobra el cierre no es el closer de
-- origen— y sigue mandando cuando está puesta.
--
--   · `comisiones_sincronizar`  → el devengo del cierre (bloque C), el del
--     primer financiamiento (bloque D) y las DOS comprobaciones de reversión
--     del bloque H. Sin parchear H, los eventos que crea el bloque C se
--     revertirían solos en la misma llamada.
--   · `comisiones_produccion`   → la dimensión "closer" de la pestaña
--     Producción, que si no seguía agrupando todo bajo "sin responsable".
--   · `comisiones_inconsistencias` → deja de avisar de aliados sin cerrador
--     que sí lo tienen.
--
-- QUÉ PASA AL RECALCULAR EL DEVENGO (medido en la transacción antes del COMMIT)
--   Raul villouta (Dirección)  204 cierres   61 200 MXN
--   Alfonso Cueto               19 cierres    5 700 MXN
--   Julio Segovia               14 cierres    4 200 MXN
--   Prueba closer                2 cierres      600 MXN
--                              ─────────── 239 eventos NUEVOS · 71 700 MXN
--
-- El libro queda en 240 cierres y 72 000 MXN: el que faltaba ya estaba
-- devengado desde el backfill de agosto y el ON CONFLICT lo respeta.
--
-- Todo entra en estado `pendiente_revision`: no paga nada hasta que Dirección
-- lo apruebe y genere el corte. Quedan fuera 23 aliados de mayo y junio porque
-- son anteriores al arranque configurado (2026-07-01) y el devengo nunca cruza
-- ese tope.
--
-- REVERSIÓN
-- Las tres funciones se restauran con el cuerpo anterior (guardado en el
-- scratchpad de la sesión) y los eventos generados se anulan con
-- `comision_revertir`, que es justamente para lo que existe.
--
-- Todo es ADITIVO e IDEMPOTENTE y va dentro de una transacción.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Las tres funciones van copiadas VERBATIM de 20260802000001_finanzas_rpc.sql
-- (comprobado byte a byte contra el cuerpo vivo en producción) con los siete
-- COALESCE como única diferencia. Reescribirlas a mano habría sido la forma más
-- fácil de perder por el camino una regla del motor de devengo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.comisiones_sincronizar(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  eventos_totales    int,
  eventos_nuevos     int,
  eventos_revertidos int,
  eventos_anulados   int,
  eventos_observados int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desde     date;
  v_hasta     date;
  v_director  uuid;
  v_dir_nom   text;
  v_antes     bigint;
  v_nuevos    int := 0;
  v_revert    int := 0;
  v_anulados  int := 0;
  v_observ    int := 0;
  v_n         int;
  v_invalidos uuid[];
  v_ahora     timestamptz := timezone('utc'::text, now());
  r           record;
BEGIN
  PERFORM public.fin_require_direccion();

  -- Nunca se devenga antes del arranque configurado: sin ese tope la primera
  -- sincronización fabricaría comisiones y salarios de todo el histórico del CRM.
  v_desde := GREATEST(COALESCE(p_desde, public.fin_arranque()), public.fin_arranque());
  v_hasta := COALESCE(p_hasta, (v_ahora AT TIME ZONE 'UTC')::date);
  IF v_hasta < v_desde THEN
    RAISE EXCEPTION 'El rango de sincronización está invertido.';
  END IF;

  v_director := public.fin_director_id();
  SELECT full_name INTO v_dir_nom FROM public.profiles WHERE id = v_director;

  SELECT count(*) INTO v_antes FROM public.comision_eventos;

  -- ───────────────────────────────────────────────────────────────────────────
  -- A) Comisión del DIRECTOR por cada financiamiento del equipo (§5.1)
  -- ───────────────────────────────────────────────────────────────────────────
  -- Sin producto determinable el evento nace `observado` y con monto 0: la
  -- Dirección lo ve, corrige la modalidad del proyecto y la siguiente pasada lo
  -- recalcula sola. No se adivina un importe (§18).
  IF v_director IS NOT NULL THEN
    INSERT INTO public.comision_eventos (
      usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
      referencia_tipo, referencia_id, prospecto_id, aliado_id, tipo_producto,
      monto, moneda, tarifa_id, fecha_devengo, periodo_corte,
      estado, motivo_observacion, clave_unica
    )
    SELECT
      v_director, v_dir_nom, 'director', 'comision_financiamiento',
      'prospecto', v.prospecto_id, v.prospecto_id, v.aliado_id, v.producto,
      COALESCE(t.monto, 0), COALESCE(t.moneda, 'MXN'), t.tarifa_id,
      v.fecha_ejecucion, public.fin_periodo(v.fecha_ejecucion, 'semanal'),
      CASE WHEN t.tarifa_id IS NULL THEN 'observado' ELSE 'pendiente_revision' END,
      CASE
        WHEN v.producto IS NULL THEN 'El proyecto no tiene modalidad (40/10) ni está marcado como crédito de nómina: no se puede determinar el producto.'
        WHEN t.tarifa_id IS NULL THEN 'No hay tarifa de Dirección vigente para ' || public.fin_producto_label(v.producto) || ' en la fecha de ejecución.'
      END,
      'fin:' || v.prospecto_id::text || ':' || v_director::text
    FROM public.fin_ventas(v_desde, v_hasta) v
    LEFT JOIN LATERAL public.fin_tarifa(
      'director', 'comision_financiamiento', v.producto,
      (v.fecha_ejecucion AT TIME ZONE 'UTC')::date, 0
    ) t ON true
    ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
    DO UPDATE SET
      usuario_nombre     = EXCLUDED.usuario_nombre,
      tipo_producto      = EXCLUDED.tipo_producto,
      monto              = EXCLUDED.monto,
      tarifa_id          = EXCLUDED.tarifa_id,
      fecha_devengo      = EXCLUDED.fecha_devengo,
      periodo_corte      = EXCLUDED.periodo_corte,
      estado             = EXCLUDED.estado,
      motivo_observacion = EXCLUDED.motivo_observacion,
      updated_at         = timezone('utc'::text, now())
    WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');
  END IF;

  -- ───────────────────────────────────────────────────────────────────────────
  -- B) Comisión del ACCOUNT MANAGER que gestionó la operación (§5.3)
  -- ───────────────────────────────────────────────────────────────────────────
  -- Un proyecto sin AM no genera evento —no hay a quién pagarle— y aparece en
  -- `comisiones_inconsistencias` para que la Dirección lo asigne (§18).
  INSERT INTO public.comision_eventos (
    usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
    referencia_tipo, referencia_id, prospecto_id, aliado_id, tipo_producto,
    monto, moneda, tarifa_id, fecha_devengo, periodo_corte,
    estado, motivo_observacion, clave_unica
  )
  SELECT
    v.account_manager_id, am.full_name, 'account_manager', 'comision_financiamiento',
    'prospecto', v.prospecto_id, v.prospecto_id, v.aliado_id, v.producto,
    COALESCE(t.monto, 0), COALESCE(t.moneda, 'MXN'), t.tarifa_id,
    v.fecha_ejecucion, public.fin_periodo(v.fecha_ejecucion, 'semanal'),
    CASE WHEN t.tarifa_id IS NULL THEN 'observado' ELSE 'pendiente_revision' END,
    CASE
      WHEN v.producto IS NULL THEN 'El proyecto no tiene modalidad (40/10) ni está marcado como crédito de nómina: no se puede determinar el producto.'
      WHEN t.tarifa_id IS NULL THEN 'No hay tarifa de Account Manager vigente para ' || public.fin_producto_label(v.producto) || ' en la fecha de ejecución.'
    END,
    'fin:' || v.prospecto_id::text || ':' || v.account_manager_id::text
  FROM public.fin_ventas(v_desde, v_hasta) v
  JOIN public.profiles am ON am.id = v.account_manager_id
  LEFT JOIN LATERAL public.fin_tarifa(
    'account_manager', 'comision_financiamiento', v.producto,
    (v.fecha_ejecucion AT TIME ZONE 'UTC')::date, 0
  ) t ON true
  WHERE v.account_manager_id IS NOT NULL
  ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
  DO UPDATE SET
    usuario_nombre     = EXCLUDED.usuario_nombre,
    tipo_producto      = EXCLUDED.tipo_producto,
    monto              = EXCLUDED.monto,
    tarifa_id          = EXCLUDED.tarifa_id,
    fecha_devengo      = EXCLUDED.fecha_devengo,
    periodo_corte      = EXCLUDED.periodo_corte,
    estado             = EXCLUDED.estado,
    motivo_observacion = EXCLUDED.motivo_observacion,
    updated_at         = timezone('utc'::text, now())
  WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');

  -- ───────────────────────────────────────────────────────────────────────────
  -- C) Comisión por CIERRE DE ALIADO (§4.2, §5.1, §5.2)
  -- ───────────────────────────────────────────────────────────────────────────
  -- El beneficiario es quien lo cerró y la tarifa depende de SU rol: si lo cerró
  -- un closer cobra el closer; si lo cerró la Dirección cobra la Dirección. Por
  -- eso el §5.1 aclara que el Director no cobra los aliados de un closer: no es
  -- una excepción, es que solo hay UN evento de cierre por aliado.
  INSERT INTO public.comision_eventos (
    usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
    referencia_tipo, referencia_id, aliado_id,
    monto, moneda, tarifa_id, fecha_devengo, periodo_corte,
    estado, motivo_observacion, clave_unica
  )
  SELECT
    c.id, c.full_name,
    CASE WHEN c.role = 'closer' THEN 'closer' ELSE 'director' END,
    'comision_cierre_aliado',
    'aliado', a.id, a.id,
    COALESCE(t.monto, 0), COALESCE(t.moneda, 'MXN'), t.tarifa_id,
    cierre.fecha, public.fin_periodo(cierre.fecha, 'semanal'),
    CASE WHEN t.tarifa_id IS NULL THEN 'observado' ELSE 'pendiente_revision' END,
    CASE WHEN t.tarifa_id IS NULL THEN 'No hay tarifa de cierre de aliado vigente para ese rol en la fecha del alta.' END,
    'alia:' || a.id::text
  FROM public.profiles a
  -- Regla de lectura del §4.2: la columna propia manda, y si no hay nadie ahí
  -- vale la atribución del módulo Closers. Sin este COALESCE la comisión de
  -- cierre solo se devengaba para los aliados del backfill de 20260802000000.
  JOIN public.profiles c ON c.id = COALESCE(a.aliado_cerrado_por_id, a.closer_origen_id)
  -- Fecha del cierre: la de incorporación atribuida, y si no la hay, el alta de
  -- la cuenta. Nunca `updated_at`, que se mueve por cualquier edición del perfil.
  CROSS JOIN LATERAL (SELECT COALESCE(a.fecha_incorporacion_closer, a.created_at) AS fecha) cierre
  LEFT JOIN LATERAL public.fin_tarifa(
    CASE WHEN c.role = 'closer' THEN 'closer' ELSE 'director' END,
    'comision_cierre_aliado', NULL, (cierre.fecha AT TIME ZONE 'UTC')::date, 0
  ) t ON true
  WHERE a.role = 'aliado'
    AND c.role IN ('closer', 'admin', 'director')
    AND (cierre.fecha AT TIME ZONE 'UTC')::date BETWEEN v_desde AND v_hasta
  ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
  DO UPDATE SET
    usuario_id         = EXCLUDED.usuario_id,
    usuario_nombre     = EXCLUDED.usuario_nombre,
    rol_beneficiario   = EXCLUDED.rol_beneficiario,
    monto              = EXCLUDED.monto,
    tarifa_id          = EXCLUDED.tarifa_id,
    fecha_devengo      = EXCLUDED.fecha_devengo,
    periodo_corte      = EXCLUDED.periodo_corte,
    estado             = EXCLUDED.estado,
    motivo_observacion = EXCLUDED.motivo_observacion,
    updated_at         = timezone('utc'::text, now())
  WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');

  -- ───────────────────────────────────────────────────────────────────────────
  -- D) Comisión del CLOSER por el PRIMER financiamiento de su aliado (§5.2)
  -- ───────────────────────────────────────────────────────────────────────────
  -- "Primero" se resuelve sobre TODA la historia, no sobre el rango: si no, un
  -- rango estrecho declararía primero a un financiamiento que no lo es.
  --
  -- `fin_ventas` solo devuelve operaciones que HOY están ejecutadas, así que un
  -- financiamiento capturado y cancelado antes de ejecutarse nunca puede ser el
  -- primero — exactamente lo que pide el §5.2.
  WITH primeras AS (
    SELECT DISTINCT ON (v.aliado_id)
      v.aliado_id, v.prospecto_id, v.producto, v.fecha_ejecucion
    FROM public.fin_ventas(NULL, NULL) v
    WHERE v.aliado_id IS NOT NULL
    ORDER BY v.aliado_id, v.fecha_ejecucion, v.prospecto_id
  )
  INSERT INTO public.comision_eventos (
    usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
    referencia_tipo, referencia_id, prospecto_id, aliado_id, tipo_producto,
    monto, moneda, tarifa_id, fecha_devengo, periodo_corte,
    estado, motivo_observacion, clave_unica
  )
  SELECT
    c.id, c.full_name, 'closer', 'comision_primer_financiamiento',
    'prospecto', pr.prospecto_id, pr.prospecto_id, pr.aliado_id, pr.producto,
    COALESCE(t.monto, 0), COALESCE(t.moneda, 'MXN'), t.tarifa_id,
    pr.fecha_ejecucion, public.fin_periodo(pr.fecha_ejecucion, 'semanal'),
    CASE WHEN t.tarifa_id IS NULL THEN 'observado' ELSE 'pendiente_revision' END,
    CASE
      WHEN pr.producto IS NULL THEN 'El primer financiamiento del aliado no tiene producto determinable.'
      WHEN t.tarifa_id IS NULL THEN 'No hay tarifa de primer financiamiento vigente para ' || public.fin_producto_label(pr.producto) || '.'
    END,
    -- Una sola comisión de primer financiamiento por aliado (§18): la clave es
    -- el aliado, no el proyecto.
    '1fin:' || pr.aliado_id::text
  FROM primeras pr
  JOIN public.profiles a ON a.id = pr.aliado_id AND a.role = 'aliado'
  -- Solo si lo cerró un CLOSER. Cerrado por la Dirección → ningún closer cobra.
  JOIN public.profiles c ON c.id = COALESCE(a.aliado_cerrado_por_id, a.closer_origen_id)
                        AND c.role = 'closer'
  LEFT JOIN LATERAL public.fin_tarifa(
    'closer', 'comision_primer_financiamiento', pr.producto,
    (pr.fecha_ejecucion AT TIME ZONE 'UTC')::date, 0
  ) t ON true
  WHERE (pr.fecha_ejecucion AT TIME ZONE 'UTC')::date BETWEEN v_desde AND v_hasta
  ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
  DO UPDATE SET
    usuario_id         = EXCLUDED.usuario_id,
    usuario_nombre     = EXCLUDED.usuario_nombre,
    prospecto_id       = EXCLUDED.prospecto_id,
    referencia_id      = EXCLUDED.referencia_id,
    tipo_producto      = EXCLUDED.tipo_producto,
    monto              = EXCLUDED.monto,
    tarifa_id          = EXCLUDED.tarifa_id,
    fecha_devengo      = EXCLUDED.fecha_devengo,
    periodo_corte      = EXCLUDED.periodo_corte,
    estado             = EXCLUDED.estado,
    motivo_observacion = EXCLUDED.motivo_observacion,
    updated_at         = timezone('utc'::text, now())
  WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');

  -- ───────────────────────────────────────────────────────────────────────────
  -- E) Comisión del ALIADO (§5.4 — pendiente de definición)
  -- ───────────────────────────────────────────────────────────────────────────
  -- El brief no fija todavía el esquema económico del aliado, así que no hay
  -- tarifas sembradas y este bloque no produce nada. El JOIN es INNER a
  -- propósito: sin tarifa no hay evento, ni de monto cero. En cuanto la Dirección
  -- dé de alta una tarifa (rol `aliado`, concepto `comision_aliado`) desde el
  -- panel, empieza a devengar sola — sin tocar código ni esquema.
  INSERT INTO public.comision_eventos (
    usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
    referencia_tipo, referencia_id, prospecto_id, aliado_id, tipo_producto,
    monto, moneda, tarifa_id, fecha_devengo, periodo_corte, estado, clave_unica
  )
  SELECT
    al.id, al.full_name, 'aliado', 'comision_aliado',
    'prospecto', v.prospecto_id, v.prospecto_id, v.aliado_id, v.producto,
    t.monto, t.moneda, t.tarifa_id,
    v.fecha_ejecucion, public.fin_periodo(v.fecha_ejecucion, 'semanal'),
    'pendiente_revision',
    'ali_fin:' || v.prospecto_id::text
  FROM public.fin_ventas(v_desde, v_hasta) v
  JOIN public.profiles al ON al.id = v.aliado_id AND al.role = 'aliado'
  JOIN LATERAL public.fin_tarifa(
    'aliado', 'comision_aliado', v.producto,
    (v.fecha_ejecucion AT TIME ZONE 'UTC')::date, 0
  ) t ON true
  ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
  DO UPDATE SET
    usuario_nombre = EXCLUDED.usuario_nombre,
    tipo_producto  = EXCLUDED.tipo_producto,
    monto          = EXCLUDED.monto,
    tarifa_id      = EXCLUDED.tarifa_id,
    fecha_devengo  = EXCLUDED.fecha_devengo,
    periodo_corte  = EXCLUDED.periodo_corte,
    updated_at     = timezone('utc'::text, now())
  WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');

  -- ───────────────────────────────────────────────────────────────────────────
  -- F) SALARIO FIJO y BONOS MENSUALES, mes a mes (§5.1, §5.3, §11.2)
  -- ───────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT
      gs::date                                        AS mes_inicio,
      (gs + interval '1 month' - interval '1 day')::date AS mes_fin,
      to_char(gs, 'YYYY-MM')                          AS etiqueta
    FROM generate_series(
      date_trunc('month', v_desde::timestamp),
      date_trunc('month', v_hasta::timestamp),
      interval '1 month'
    ) gs
  LOOP
    -- F.1 Salario fijo del Account Manager -----------------------------------
    -- Se devenga aunque el mes esté en curso, para que la Dirección vea el
    -- compromiso completo del período y no una nómina que aparece el día 30.
    INSERT INTO public.comision_eventos (
      usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
      referencia_tipo, monto, moneda, tarifa_id,
      fecha_devengo, periodo_corte, estado, clave_unica
    )
    SELECT
      am.id, am.full_name, 'account_manager', 'salario_fijo',
      'periodo', t.monto, t.moneda, t.tarifa_id,
      r.mes_fin::timestamp AT TIME ZONE 'UTC', r.etiqueta, 'pendiente_revision',
      'sal:' || am.id::text || ':' || r.etiqueta
    FROM public.profiles am
    JOIN LATERAL public.fin_tarifa('account_manager', 'salario_fijo', NULL, r.mes_fin, 0) t ON true
    WHERE am.role = 'account_manager'
      -- Nadie cobra un mes anterior a su alta.
      AND (am.created_at AT TIME ZONE 'UTC')::date <= r.mes_fin
    ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
    DO UPDATE SET
      usuario_nombre = EXCLUDED.usuario_nombre,
      monto          = EXCLUDED.monto,
      tarifa_id      = EXCLUDED.tarifa_id,
      updated_at     = timezone('utc'::text, now())
    WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');

    -- F.2 Bono mensual del Director — sobre la producción de TODO el equipo ---
    IF v_director IS NOT NULL THEN
      INSERT INTO public.comision_eventos (
        usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
        referencia_tipo, monto, moneda, tarifa_id, produccion,
        fecha_devengo, periodo_corte, estado, clave_unica
      )
      SELECT
        v_director, v_dir_nom, 'director', 'bono_mensual',
        'periodo', t.monto, t.moneda, t.tarifa_id, prod.n,
        r.mes_fin::timestamp AT TIME ZONE 'UTC', r.etiqueta, 'pendiente_revision',
        'bmen:' || v_director::text || ':' || r.etiqueta
      FROM (SELECT count(*)::int AS n FROM public.fin_ventas(r.mes_inicio, r.mes_fin)) prod
      -- INNER: si la producción no llega al tramo mínimo no hay tarifa y no hay bono.
      JOIN LATERAL public.fin_tarifa('director', 'bono_mensual', NULL, r.mes_fin, prod.n) t ON true
      ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
      DO UPDATE SET
        monto      = EXCLUDED.monto,
        tarifa_id  = EXCLUDED.tarifa_id,
        produccion = EXCLUDED.produccion,
        updated_at = timezone('utc'::text, now())
      WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');
    END IF;

    -- F.3 Bono mensual individual del Account Manager ------------------------
    INSERT INTO public.comision_eventos (
      usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
      referencia_tipo, monto, moneda, tarifa_id, produccion,
      fecha_devengo, periodo_corte, estado, clave_unica
    )
    SELECT
      am.id, am.full_name, 'account_manager', 'bono_mensual',
      'periodo', t.monto, t.moneda, t.tarifa_id, prod.n,
      r.mes_fin::timestamp AT TIME ZONE 'UTC', r.etiqueta, 'pendiente_revision',
      'bmen:' || am.id::text || ':' || r.etiqueta
    FROM public.profiles am
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS n
      FROM public.fin_ventas(r.mes_inicio, r.mes_fin) v
      WHERE v.account_manager_id = am.id
    ) prod
    JOIN LATERAL public.fin_tarifa('account_manager', 'bono_mensual', NULL, r.mes_fin, prod.n) t ON true
    WHERE am.role = 'account_manager'
    ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
    DO UPDATE SET
      monto      = EXCLUDED.monto,
      tarifa_id  = EXCLUDED.tarifa_id,
      produccion = EXCLUDED.produccion,
      updated_at = timezone('utc'::text, now())
    WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');

    -- F.4 Bonos que dejaron de alcanzar su tramo -----------------------------
    -- Un bono es provisional hasta que se aprueba: si una venta del mes se cae,
    -- la producción baja y el tramo puede desaparecer. Los INSERT de arriba no
    -- pueden detectarlo (sin tarifa no hay fila que actualizar), así que el
    -- retiro se hace aquí, y solo sobre lo que aún NO se ha aprobado.
    UPDATE public.comision_eventos e
       SET estado        = 'revertido',
           observaciones = 'La producción del mes dejó de alcanzar el tramo mínimo del bono.',
           updated_at    = timezone('utc'::text, now())
     WHERE e.tipo_evento = 'bono_mensual'
       AND e.periodo_corte = r.etiqueta
       AND e.estado IN ('pendiente_revision', 'observado')
       AND e.anulado_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.fin_tarifa(
           e.rol_beneficiario, 'bono_mensual', NULL, r.mes_fin,
           (SELECT count(*)::int
              FROM public.fin_ventas(r.mes_inicio, r.mes_fin) v
             WHERE e.rol_beneficiario = 'director' OR v.account_manager_id = e.usuario_id)
         )
       );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_revert := v_revert + v_n;
  END LOOP;

  -- ───────────────────────────────────────────────────────────────────────────
  -- G) BONO TRIMESTRAL del Account Manager (§5.3, §11.3)
  -- ───────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT
      gs::date                                          AS tri_inicio,
      (gs + interval '3 months' - interval '1 day')::date AS tri_fin,
      to_char(gs, 'YYYY') || '-Q' || to_char(gs, 'Q')     AS etiqueta
    FROM generate_series(
      date_trunc('quarter', v_desde::timestamp),
      date_trunc('quarter', v_hasta::timestamp),
      interval '3 months'
    ) gs
  LOOP
    INSERT INTO public.comision_eventos (
      usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
      referencia_tipo, monto, moneda, tarifa_id, produccion,
      fecha_devengo, periodo_corte, estado, clave_unica
    )
    SELECT
      am.id, am.full_name, 'account_manager', 'bono_trimestral',
      'periodo', t.monto, t.moneda, t.tarifa_id, prod.n,
      r.tri_fin::timestamp AT TIME ZONE 'UTC', r.etiqueta, 'pendiente_revision',
      'btri:' || am.id::text || ':' || r.etiqueta
    FROM public.profiles am
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS n
      FROM public.fin_ventas(r.tri_inicio, r.tri_fin) v
      WHERE v.account_manager_id = am.id
    ) prod
    JOIN LATERAL public.fin_tarifa('account_manager', 'bono_trimestral', NULL, r.tri_fin, prod.n) t ON true
    WHERE am.role = 'account_manager'
    ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
    DO UPDATE SET
      monto      = EXCLUDED.monto,
      tarifa_id  = EXCLUDED.tarifa_id,
      produccion = EXCLUDED.produccion,
      updated_at = timezone('utc'::text, now())
    WHERE comision_eventos.estado IN ('pendiente_revision', 'observado');

    UPDATE public.comision_eventos e
       SET estado        = 'revertido',
           observaciones = 'La producción del trimestre dejó de alcanzar el tramo mínimo del bono.',
           updated_at    = timezone('utc'::text, now())
     WHERE e.tipo_evento = 'bono_trimestral'
       AND e.periodo_corte = r.etiqueta
       AND e.estado IN ('pendiente_revision', 'observado')
       AND e.anulado_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.fin_tarifa(
           e.rol_beneficiario, 'bono_trimestral', NULL, r.tri_fin,
           (SELECT count(*)::int
              FROM public.fin_ventas(r.tri_inicio, r.tri_fin) v
             WHERE v.account_manager_id = e.usuario_id)
         )
       );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_revert := v_revert + v_n;
  END LOOP;

  -- ───────────────────────────────────────────────────────────────────────────
  -- H) REVERSIONES (§17)
  -- ───────────────────────────────────────────────────────────────────────────
  -- Un evento deja de ser válido cuando su operación de origen ya no cumple la
  -- condición: la venta se cayó, el proyecto se mandó a la papelera, cambió el
  -- Account Manager del proyecto, se reatribuyó el cierre del aliado, o dejó de
  -- ser el primer financiamiento.
  --
  -- Se calcula el conjunto UNA vez y se guarda en un array: el resto del bloque
  -- son tres statements sobre ese mismo conjunto, y así no se recorre el libro
  -- mayor tres veces ni se corre el riesgo de que las tres consultas discrepen.
  WITH ventas AS (
    SELECT * FROM public.fin_ventas(NULL, NULL)
  ),
  primeras AS (
    -- `fecha_ejecucion` va en la lista de selección aunque solo se use para
    -- ordenar: mantiene la consulta válida bajo cualquier variante de la regla
    -- ORDER BY / DISTINCT y hace evidente cuál es el criterio de "primero".
    SELECT DISTINCT ON (v.aliado_id) v.aliado_id, v.prospecto_id, v.fecha_ejecucion
    FROM ventas v
    WHERE v.aliado_id IS NOT NULL
    ORDER BY v.aliado_id, v.fecha_ejecucion, v.prospecto_id
  )
  SELECT array_agg(e.id)
    INTO v_invalidos
    FROM public.comision_eventos e
   WHERE e.estado <> 'revertido'
     AND e.anulado_at IS NULL
     AND e.tipo_evento IN ('comision_financiamiento', 'comision_cierre_aliado',
                           'comision_primer_financiamiento', 'comision_aliado')
     AND NOT (
       CASE e.tipo_evento
         WHEN 'comision_financiamiento' THEN EXISTS (
           SELECT 1 FROM ventas v
            WHERE v.prospecto_id = e.prospecto_id
              AND (
                (e.rol_beneficiario = 'director' AND e.usuario_id = v_director)
                OR (e.rol_beneficiario = 'account_manager' AND v.account_manager_id = e.usuario_id)
              )
         )
         WHEN 'comision_cierre_aliado' THEN EXISTS (
           SELECT 1 FROM public.profiles a
            WHERE a.id = e.aliado_id
              AND a.role = 'aliado'
              AND COALESCE(a.aliado_cerrado_por_id, a.closer_origen_id) = e.usuario_id
         )
         WHEN 'comision_primer_financiamiento' THEN EXISTS (
           SELECT 1 FROM primeras pr
             JOIN public.profiles a ON a.id = pr.aliado_id
            WHERE pr.aliado_id = e.aliado_id
              AND pr.prospecto_id = e.prospecto_id
              AND COALESCE(a.aliado_cerrado_por_id, a.closer_origen_id) = e.usuario_id
         )
         WHEN 'comision_aliado' THEN EXISTS (
           SELECT 1 FROM ventas v
            WHERE v.prospecto_id = e.prospecto_id AND v.aliado_id = e.usuario_id
         )
         ELSE true
       END
     );

  v_invalidos := COALESCE(v_invalidos, ARRAY[]::uuid[]);

  IF array_length(v_invalidos, 1) > 0 THEN
    -- H.1 Todavía NO había salido a Finanzas → se revierte en su sitio.
    -- La fila no se borra (§17): queda con estado `revertido` y su motivo.
    UPDATE public.comision_eventos
       SET estado        = 'revertido',
           observaciones = COALESCE(observaciones || ' · ', '') ||
                           'Revertida automáticamente: la operación de origen dejó de cumplir la condición.',
           updated_at    = timezone('utc'::text, now())
     WHERE id = ANY (v_invalidos)
       AND estado IN ('pendiente_revision', 'observado', 'aprobado');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_revert := v_revert + v_n;

    -- H.2 Ya se reportó o se pagó → NO se toca (el §6.5 la deja inmutable):
    -- se emite un evento negativo equivalente, con fecha de HOY, que cae en el
    -- corte siguiente y se ve como un descuento con su motivo a la vista.
    INSERT INTO public.comision_eventos (
      usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
      referencia_tipo, referencia_id, prospecto_id, aliado_id, tipo_producto,
      monto, moneda, fecha_devengo, periodo_corte, estado,
      evento_original_id, observaciones, clave_unica
    )
    SELECT
      o.usuario_id, o.usuario_nombre, o.rol_beneficiario, 'reversion',
      'evento', o.id, o.prospecto_id, o.aliado_id, o.tipo_producto,
      -o.monto, o.moneda, v_ahora, public.fin_periodo(v_ahora, 'semanal'), 'pendiente_revision',
      o.id,
      'Reversión de una comisión ya reportada a Finanzas: la operación de origen se anuló o cambió de responsable.',
      'rev:' || o.id::text
    FROM public.comision_eventos o
    WHERE o.id = ANY (v_invalidos)
      AND o.estado IN ('enviado_finanzas', 'pagado')
      AND o.anulado_at IS NULL
    ON CONFLICT (clave_unica) WHERE estado <> 'revertido' AND anulado_at IS NULL
    DO NOTHING;

    UPDATE public.comision_eventos
       SET anulado_at     = v_ahora,
           anulado_motivo = 'La operación de origen dejó de cumplir la condición. El descuento viaja en el corte siguiente.',
           updated_at     = v_ahora
     WHERE id = ANY (v_invalidos)
       AND estado IN ('enviado_finanzas', 'pagado')
       AND anulado_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_anulados := v_anulados + v_n;

    INSERT INTO public.comision_auditoria
      (entidad, entidad_id, accion, estado_anterior, estado_nuevo, monto_anterior, comentario, actor_id, actor_nombre)
    SELECT
      'evento', e.id, 'reversion_automatica', e.estado,
      CASE WHEN e.anulado_at IS NOT NULL THEN 'anulado' ELSE 'revertido' END,
      e.monto,
      'Detectada por comisiones_sincronizar: la operación de origen ya no cumple la condición.',
      auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    FROM public.comision_eventos e
    WHERE e.id = ANY (v_invalidos);
  END IF;

  -- ───────────────────────────────────────────────────────────────────────────
  SELECT count(*) - v_antes INTO v_nuevos FROM public.comision_eventos;

  SELECT count(*) INTO v_observ
    FROM public.comision_eventos
   WHERE estado = 'observado' AND anulado_at IS NULL;

  PERFORM public.fin_auditar(
    'evento', NULL, 'sincronizacion', NULL, NULL, NULL, NULL,
    format('Rango %s → %s · %s evento(s) nuevo(s), %s revertido(s), %s anulado(s).',
           v_desde, v_hasta, v_nuevos, v_revert, v_anulados)
  );

  RETURN QUERY
    SELECT (SELECT count(*)::int FROM public.comision_eventos),
           v_nuevos, v_revert, v_anulados, v_observ;
END;
$$;

CREATE OR REPLACE FUNCTION public.comisiones_produccion(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  -- 'producto' | 'account_manager' | 'closer' | 'aliado'
  p_dimension text DEFAULT 'producto'
)
RETURNS TABLE (
  clave        text,
  etiqueta     text,
  financiamientos int,
  mod_40       int,
  mod_10       int,
  credito_nomina int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH permiso AS (SELECT public.fin_is_direccion() AS ok),
  v AS (
    SELECT ventas.*
    FROM public.fin_ventas(p_desde, p_hasta) ventas, permiso
    WHERE permiso.ok
  ),
  etiquetado AS (
    SELECT
      v.producto,
      CASE p_dimension
        WHEN 'producto'        THEN COALESCE(v.producto, 'sin_producto')
        WHEN 'account_manager' THEN COALESCE(v.account_manager_id::text, 'sin_am')
        WHEN 'aliado'          THEN COALESCE(v.aliado_id::text, 'sin_aliado')
        WHEN 'closer'          THEN COALESCE(al.aliado_cerrado_por_id::text, al.closer_origen_id::text, 'sin_cerrador')
        ELSE 'todos'
      END AS clave,
      CASE p_dimension
        WHEN 'producto'        THEN public.fin_producto_label(v.producto)
        WHEN 'account_manager' THEN COALESCE(am.full_name, 'Sin Account Manager')
        WHEN 'aliado'          THEN COALESCE(al.full_name, 'Sin aliado')
        WHEN 'closer'          THEN COALESCE(cl.full_name, 'Sin responsable de cierre')
        ELSE 'Total'
      END AS etiqueta
    FROM v
    LEFT JOIN public.profiles am ON am.id = v.account_manager_id
    LEFT JOIN public.profiles al ON al.id = v.aliado_id
    LEFT JOIN public.profiles cl ON cl.id = COALESCE(al.aliado_cerrado_por_id, al.closer_origen_id)
  )
  -- Las referencias van CUALIFICADAS (`et.`) a propósito: `clave` y `etiqueta`
  -- son también nombres de columna de SALIDA de esta función, y en una función
  -- SQL los nombres de parámetro son visibles dentro del cuerpo. Sin cualificar,
  -- Postgres aborta con 42702 "column reference is ambiguous".
  SELECT
    et.clave, et.etiqueta,
    count(*)::int,
    count(*) FILTER (WHERE et.producto = 'mod_40')::int,
    count(*) FILTER (WHERE et.producto = 'mod_10')::int,
    count(*) FILTER (WHERE et.producto = 'credito_nomina')::int
  FROM etiquetado et
  GROUP BY et.clave, et.etiqueta
  ORDER BY 3 DESC, 2;
$$;

CREATE OR REPLACE FUNCTION public.comisiones_inconsistencias(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  tipo           text,
  severidad      text,
  titulo         text,
  detalle        text,
  prospecto_id   uuid,
  aliado_id      uuid,
  referencia     text,
  fecha          timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH permiso AS (SELECT public.fin_is_direccion() AS ok),
  v AS (SELECT ventas.* FROM public.fin_ventas(p_desde, p_hasta) ventas, permiso WHERE permiso.ok)

  -- Financiamiento sin aliado: sin él no se puede calcular la comisión del
  -- closer (primer financiamiento) ni la del propio aliado.
  SELECT 'venta_sin_aliado', 'alta',
         'Financiamiento sin aliado identificado',
         'No se puede calcular la comisión del Closer ni la del Aliado.',
         v.prospecto_id, NULL::uuid, v.cliente_nombre, v.fecha_ejecucion
  FROM v WHERE v.aliado_id IS NULL

  UNION ALL
  -- Operación sin Account Manager: nadie a quien pagarle la gestión.
  SELECT 'venta_sin_am', 'alta',
         'Financiamiento sin Account Manager',
         'La operación no genera comisión de gestión hasta que se le asigne un Account Manager.',
         v.prospecto_id, v.aliado_id, v.cliente_nombre, v.fecha_ejecucion
  FROM v WHERE v.account_manager_id IS NULL

  UNION ALL
  -- Sin producto no hay tarifa aplicable: la comisión queda en cero y observada.
  SELECT 'venta_sin_producto', 'alta',
         'Financiamiento sin producto determinable',
         'Falta la modalidad (40 / 10) o marcarlo como crédito de nómina; sin eso no hay tarifa que aplicar.',
         v.prospecto_id, v.aliado_id, v.cliente_nombre, v.fecha_ejecucion
  FROM v WHERE v.producto IS NULL

  UNION ALL
  -- Aliado con producción pero sin responsable de cierre: se pierde la comisión
  -- de cierre y la de primer financiamiento.
  SELECT 'aliado_sin_cerrador', 'media',
         'Aliado sin responsable de cierre',
         'No se puede determinar quién cobra el cierre ni el primer financiamiento de este aliado.',
         NULL::uuid, a.id, a.full_name, COALESCE(a.fecha_incorporacion_closer, a.created_at)
  FROM public.profiles a, permiso
  WHERE permiso.ok
    AND a.role = 'aliado'
    AND COALESCE(a.aliado_cerrado_por_id, a.closer_origen_id) IS NULL
    AND EXISTS (SELECT 1 FROM v WHERE v.aliado_id = a.id)

  UNION ALL
  -- Eventos que el motor ya marcó como observados y siguen sin resolverse.
  SELECT 'evento_observado', 'media',
         'Comisión observada',
         COALESCE(e.motivo_observacion, 'Revisar antes de aprobar.'),
         e.prospecto_id, e.aliado_id,
         COALESCE(e.usuario_nombre, 'Beneficiario'), e.fecha_devengo
  FROM public.comision_eventos e, permiso
  WHERE permiso.ok
    AND e.estado = 'observado'
    AND e.anulado_at IS NULL
    AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)

  UNION ALL
  -- Alguien a quien hay que pagarle y no ha registrado cómo cobrar.
  SELECT 'sin_datos_cobro', 'media',
         'Beneficiario sin datos de cobro',
         'No tiene CLABE ni ID de Binance registrado: Finanzas no puede depositarle.',
         NULL::uuid, NULL::uuid, COALESCE(p.full_name, 'Sin nombre'), NULL::timestamptz
  FROM public.profiles p, permiso
  WHERE permiso.ok
    AND p.clabe IS NULL AND p.binance_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.comision_eventos e
      WHERE e.usuario_id = p.id AND e.estado NOT IN ('revertido', 'pagado') AND e.anulado_at IS NULL
    )

  ORDER BY 2, 8 DESC NULLS LAST;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Documentación de las dos columnas, que hasta hoy se contradecían entre sí
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.profiles.aliado_cerrado_por_id IS
  'Quién CERRÓ a este aliado, para la comisión de cierre del §4.2. Override explícito: si está en NULL vale closer_origen_id (regla de lectura COALESCE(aliado_cerrado_por_id, closer_origen_id), aplicada desde 20260805000000).';

COMMENT ON COLUMN public.profiles.closer_origen_id IS
  'Quién INCORPORÓ a este aliado: un closer o una cuenta de dirección. Mérito histórico: no cambia al reasignar. Base de todas las métricas del módulo Closers y, desde 20260805000000, también de la comisión de cierre cuando aliado_cerrado_por_id está vacío.';

COMMIT;
