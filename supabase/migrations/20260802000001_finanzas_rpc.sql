-- =============================================================================
-- PensiónFlow — Finanzas y Comisiones: motor de devengo, lecturas y acciones
-- =============================================================================
-- Segunda mitad de 20260802000000. Va aparte porque son cosas distintas: allá
-- vive el ESQUEMA (que se aplica una vez) y aquí la LÓGICA (que se reemplaza con
-- CREATE OR REPLACE cada vez que cambia una regla de negocio). Separadas, ajustar
-- una fórmula no obliga a releer 500 líneas de DDL.
--
-- Toda la agregación ocurre en Postgres. El navegador nunca descarga el libro
-- mayor para sumarlo: una llamada resuelve cada bloque de la pantalla.
--
-- Todas las funciones son SECURITY DEFINER —bypassan el RLS— así que el alcance
-- se impone DENTRO, con `fin_require_direccion()`. El módulo es exclusivo de la
-- Dirección (§2).
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- MOTOR DE DEVENGO (§6.1 y §17)
-- ═════════════════════════════════════════════════════════════════════════════
-- Reconciliación idempotente, no un trigger. Ver la justificación en la cabecera
-- de 20260802000000. Hace las dos direcciones:
--
--   ADELANTE  → crea los eventos que faltan por operaciones ya ejecutadas.
--   ATRÁS     → detecta eventos cuya operación dejó de cumplir la condición y
--               los revierte (o los anula y descuenta en el corte siguiente, si
--               ya salieron a Finanzas).
--
-- Y RECALCULA lo que todavía no se ha aprobado: mientras un evento sigue en
-- `pendiente_revision` u `observado`, cada pasada actualiza su monto, su producto
-- y su observación. En cuanto se aprueba, queda congelado — el §6.3 prohíbe
-- recalcular en silencio, así que a partir de ahí cualquier cambio viaja en un
-- evento de ajuste o de reversión.
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
  JOIN public.profiles c ON c.id = a.aliado_cerrado_por_id
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
  JOIN public.profiles c ON c.id = a.aliado_cerrado_por_id AND c.role = 'closer'
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
              AND a.aliado_cerrado_por_id = e.usuario_id
         )
         WHEN 'comision_primer_financiamiento' THEN EXISTS (
           SELECT 1 FROM primeras pr
             JOIN public.profiles a ON a.id = pr.aliado_id
            WHERE pr.aliado_id = e.aliado_id
              AND pr.prospecto_id = e.prospecto_id
              AND a.aliado_cerrado_por_id = e.usuario_id
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

COMMENT ON FUNCTION public.comisiones_sincronizar(date, date) IS
  'Reconciliación idempotente del devengo (§6.1) y de las reversiones (§17). La llama la app al abrir el módulo; no es un trigger para no poder romper el pipeline comercial desde la contabilidad.';

-- ═════════════════════════════════════════════════════════════════════════════
-- LECTURAS
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Tarjetas superiores (§8.1) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comisiones_resumen(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_rol text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (
  produccion_financiamientos int,
  produccion_aliados         int,
  produccion_primeros        int,
  total_generado             numeric,
  total_pendiente_revision   numeric,
  total_aprobado             numeric,
  total_enviado_finanzas     numeric,
  total_pagado               numeric,
  total_pendiente_pago       numeric,
  total_observado            numeric,
  total_ajustes              numeric,
  eventos_total              int,
  eventos_observados         int,
  beneficiarios              int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH permiso AS (SELECT public.fin_is_direccion() AS ok),
  ev AS (
    SELECT e.*
    FROM public.comision_eventos e, permiso
    WHERE permiso.ok
      AND e.estado <> 'revertido'
      AND e.anulado_at IS NULL
      AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
      AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
      AND (p_rol IS NULL OR e.rol_beneficiario = p_rol)
      AND (p_usuario_id IS NULL OR e.usuario_id = p_usuario_id)
  )
  SELECT
    -- Producción: proyectos DISTINTOS que respaldan las comisiones del período.
    -- Se cuenta sobre `prospecto_id` distinto y no sumando eventos, porque un
    -- mismo financiamiento genera hasta cuatro comisiones.
    (SELECT count(DISTINCT prospecto_id)::int FROM ev WHERE tipo_evento IN ('comision_financiamiento', 'comision_aliado')),
    (SELECT count(DISTINCT aliado_id)::int    FROM ev WHERE tipo_evento = 'comision_cierre_aliado'),
    (SELECT count(*)::int                     FROM ev WHERE tipo_evento = 'comision_primer_financiamiento'),
    COALESCE((SELECT sum(monto) FROM ev), 0),
    COALESCE((SELECT sum(monto) FROM ev WHERE estado = 'pendiente_revision'), 0),
    COALESCE((SELECT sum(monto) FROM ev WHERE estado = 'aprobado'), 0),
    COALESCE((SELECT sum(monto) FROM ev WHERE estado = 'enviado_finanzas'), 0),
    COALESCE((SELECT sum(monto) FROM ev WHERE estado = 'pagado'), 0),
    -- Pendiente de pago = todo lo devengado que aún no se depositó, incluido lo
    -- observado: mientras no se resuelva, sigue siendo dinero comprometido.
    COALESCE((SELECT sum(monto) FROM ev WHERE estado <> 'pagado'), 0),
    COALESCE((SELECT sum(monto) FROM ev WHERE estado = 'observado'), 0),
    COALESCE((SELECT sum(monto) FROM ev WHERE tipo_evento IN ('ajuste_positivo', 'ajuste_negativo', 'reversion')), 0),
    (SELECT count(*)::int FROM ev),
    (SELECT count(*)::int FROM ev WHERE estado = 'observado'),
    (SELECT count(DISTINCT usuario_id)::int FROM ev);
$$;

-- ── Tabla de liquidaciones: una fila por beneficiario (§9) ───────────────────
CREATE OR REPLACE FUNCTION public.comisiones_liquidaciones(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_rol text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_corte_id uuid DEFAULT NULL
)
RETURNS TABLE (
  usuario_id        uuid,
  usuario_nombre    text,
  rol_beneficiario  text,
  avatar_url        text,
  produccion        int,
  comision_base     numeric,
  bonos             numeric,
  salario           numeric,
  ajustes           numeric,
  total_a_pagar     numeric,
  total_pagado      numeric,
  total_pendiente   numeric,
  eventos           int,
  eventos_observados int,
  estado_resumen    text,
  fecha_envio       timestamptz,
  fecha_pago        timestamptz,
  -- Cómo cobra esta persona, para que el corte llegue a Finanzas con el dato.
  -- Aliado → transferencia (CLABE); Dirección y AM → Binance (20260731000000).
  clabe             text,
  banco             text,
  titular_cuenta    text,
  binance_id        text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH permiso AS (SELECT public.fin_is_direccion() AS ok),
  ev AS (
    SELECT e.*
    FROM public.comision_eventos e, permiso
    WHERE permiso.ok
      AND e.estado <> 'revertido'
      AND e.anulado_at IS NULL
      AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
      AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
      AND (p_rol IS NULL OR e.rol_beneficiario = p_rol)
      AND (p_estado IS NULL OR e.estado = p_estado)
      AND (p_corte_id IS NULL OR e.corte_id = p_corte_id)
  )
  SELECT
    ev.usuario_id,
    -- El perfil manda si existe; si la cuenta se borró, queda el nombre que el
    -- evento congeló. Un libro mayor no puede quedarse sin beneficiario.
    COALESCE(p.full_name, ev.usuario_nombre, 'Cuenta eliminada'),
    ev.rol_beneficiario,
    p.avatar_url,
    count(DISTINCT ev.prospecto_id) FILTER (WHERE ev.tipo_evento IN ('comision_financiamiento', 'comision_primer_financiamiento', 'comision_aliado'))::int
      + count(DISTINCT ev.aliado_id) FILTER (WHERE ev.tipo_evento = 'comision_cierre_aliado')::int,
    COALESCE(sum(ev.monto) FILTER (WHERE ev.tipo_evento IN ('comision_financiamiento', 'comision_cierre_aliado', 'comision_primer_financiamiento', 'comision_aliado')), 0),
    COALESCE(sum(ev.monto) FILTER (WHERE ev.tipo_evento IN ('bono_mensual', 'bono_trimestral')), 0),
    COALESCE(sum(ev.monto) FILTER (WHERE ev.tipo_evento = 'salario_fijo'), 0),
    COALESCE(sum(ev.monto) FILTER (WHERE ev.tipo_evento IN ('ajuste_positivo', 'ajuste_negativo', 'reversion')), 0),
    COALESCE(sum(ev.monto), 0),
    COALESCE(sum(ev.monto) FILTER (WHERE ev.estado = 'pagado'), 0),
    COALESCE(sum(ev.monto) FILTER (WHERE ev.estado <> 'pagado'), 0),
    count(*)::int,
    count(*) FILTER (WHERE ev.estado = 'observado')::int,
    -- Estado de la FILA = el punto MENOS avanzado de sus eventos. La Dirección
    -- necesita ver lo que falta por hacer, no lo que ya se hizo: una persona con
    -- nueve comisiones pagadas y una observada sigue teniendo trabajo pendiente.
    CASE
      WHEN count(*) FILTER (WHERE ev.estado = 'observado') > 0           THEN 'observado'
      WHEN count(*) FILTER (WHERE ev.estado = 'pendiente_revision') > 0  THEN 'pendiente_revision'
      WHEN count(*) FILTER (WHERE ev.estado = 'aprobado') > 0            THEN 'aprobado'
      WHEN count(*) FILTER (WHERE ev.estado = 'enviado_finanzas') > 0    THEN 'enviado_finanzas'
      ELSE 'pagado'
    END,
    max(ev.fecha_envio_finanzas),
    max(ev.fecha_pago),
    p.clabe, p.banco, p.titular_cuenta, p.binance_id
  FROM ev
  LEFT JOIN public.profiles p ON p.id = ev.usuario_id
  GROUP BY ev.usuario_id, ev.rol_beneficiario, p.full_name, ev.usuario_nombre,
           p.avatar_url, p.clabe, p.banco, p.titular_cuenta, p.binance_id
  ORDER BY 10 DESC, 2;
$$;

-- ── Serie temporal del gráfico (§8.2) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comisiones_serie(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_grano text DEFAULT 'semana',
  p_rol text DEFAULT NULL
)
RETURNS TABLE (
  periodo   date,
  rol       text,
  generado  numeric,
  pagado    numeric,
  pendiente numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH permiso AS (SELECT public.fin_is_direccion() AS ok)
  SELECT
    (date_trunc(
      CASE p_grano WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week'
                   WHEN 'mes' THEN 'month' WHEN 'trimestre' THEN 'quarter'
                   ELSE 'year' END,
      e.fecha_devengo AT TIME ZONE 'UTC'
    ))::date,
    e.rol_beneficiario,
    COALESCE(sum(e.monto), 0),
    COALESCE(sum(e.monto) FILTER (WHERE e.estado = 'pagado'), 0),
    COALESCE(sum(e.monto) FILTER (WHERE e.estado <> 'pagado'), 0)
  FROM public.comision_eventos e, permiso
  WHERE permiso.ok
    AND e.estado <> 'revertido'
    AND e.anulado_at IS NULL
    AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
    AND (p_rol IS NULL OR e.rol_beneficiario = p_rol)
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- ── Producción del período (§8.4) ───────────────────────────────────────────
-- Mira `prospects` directamente, no el libro mayor: la producción es un hecho
-- comercial y existe aunque todavía no haya devengado ninguna comisión (por
-- ejemplo un financiamiento sin Account Manager asignado).
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
        WHEN 'closer'          THEN COALESCE(al.aliado_cerrado_por_id::text, 'sin_cerrador')
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
    LEFT JOIN public.profiles cl ON cl.id = al.aliado_cerrado_por_id
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

-- ── Eventos con su operación de origen (§10, drill-down) ────────────────────
CREATE OR REPLACE FUNCTION public.comisiones_eventos(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_rol text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_tipo_evento text DEFAULT NULL,
  p_producto text DEFAULT NULL,
  p_corte_id uuid DEFAULT NULL,
  p_limite int DEFAULT 500
)
RETURNS TABLE (
  id                 uuid,
  usuario_id         uuid,
  usuario_nombre     text,
  rol_beneficiario   text,
  tipo_evento        text,
  tipo_producto      text,
  monto              numeric,
  moneda             text,
  produccion         int,
  fecha_devengo      timestamptz,
  periodo_corte      text,
  estado             text,
  motivo_observacion text,
  observaciones      text,
  prospecto_id       uuid,
  cliente_nombre     text,
  aliado_id          uuid,
  aliado_nombre      text,
  account_manager    text,
  corte_id           uuid,
  anulado_at         timestamptz,
  fecha_aprobacion   timestamptz,
  fecha_envio_finanzas timestamptz,
  fecha_pago         timestamptz,
  referencia_pago    text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    e.id, e.usuario_id,
    COALESCE(u.full_name, e.usuario_nombre, 'Cuenta eliminada'),
    e.rol_beneficiario, e.tipo_evento, e.tipo_producto, e.monto, e.moneda, e.produccion,
    e.fecha_devengo, e.periodo_corte, e.estado, e.motivo_observacion, e.observaciones,
    e.prospecto_id, pr.full_name, e.aliado_id, al.full_name, am.full_name,
    e.corte_id, e.anulado_at, e.fecha_aprobacion, e.fecha_envio_finanzas, e.fecha_pago, e.referencia_pago
  FROM public.comision_eventos e
  LEFT JOIN public.profiles u   ON u.id  = e.usuario_id
  LEFT JOIN public.prospects pr ON pr.id = e.prospecto_id
  LEFT JOIN public.profiles al  ON al.id = e.aliado_id
  LEFT JOIN public.profiles am  ON am.id = pr.account_manager_id
  WHERE public.fin_is_direccion()
    AND (p_desde IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date >= p_desde)
    AND (p_hasta IS NULL OR (e.fecha_devengo AT TIME ZONE 'UTC')::date <= p_hasta)
    AND (p_usuario_id IS NULL OR e.usuario_id = p_usuario_id)
    AND (p_rol IS NULL OR e.rol_beneficiario = p_rol)
    AND (p_estado IS NULL OR e.estado = p_estado)
    AND (p_tipo_evento IS NULL OR e.tipo_evento = p_tipo_evento)
    AND (p_producto IS NULL OR e.tipo_producto = p_producto)
    AND (p_corte_id IS NULL OR e.corte_id = p_corte_id)
  ORDER BY e.fecha_devengo DESC, e.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 5000));
$$;

-- ── Validaciones obligatorias (§18) ─────────────────────────────────────────
-- Lo que el sistema NO puede calcular bien y necesita una mano humana. Es la
-- lista de trabajo previa a aprobar un corte.
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
    AND a.aliado_cerrado_por_id IS NULL
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

-- ── Cortes ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cortes_listar(p_limite int DEFAULT 60)
RETURNS TABLE (
  id uuid, tipo_corte text, fecha_inicio date, fecha_fin date, moneda text,
  total_produccion int, total_comisiones numeric, total_bonos numeric,
  total_salarios numeric, total_ajustes numeric, total_a_pagar numeric,
  total_pagado numeric, estado text,
  creado_por_nombre text, aprobado_por_nombre text, enviado_por_nombre text,
  fecha_aprobacion timestamptz, fecha_envio_finanzas timestamptz, fecha_pago timestamptz,
  observaciones text, beneficiarios int, eventos int, created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    c.id, c.tipo_corte, c.fecha_inicio, c.fecha_fin, c.moneda,
    c.total_produccion, c.total_comisiones, c.total_bonos,
    c.total_salarios, c.total_ajustes, c.total_a_pagar,
    c.total_pagado, c.estado,
    cr.full_name, ap.full_name, en.full_name,
    c.fecha_aprobacion, c.fecha_envio_finanzas, c.fecha_pago,
    c.observaciones,
    (SELECT count(DISTINCT e.usuario_id)::int FROM public.comision_eventos e WHERE e.corte_id = c.id),
    (SELECT count(*)::int FROM public.comision_eventos e WHERE e.corte_id = c.id),
    c.created_at
  FROM public.cortes_financieros c
  LEFT JOIN public.profiles cr ON cr.id = c.creado_por
  LEFT JOIN public.profiles ap ON ap.id = c.aprobado_por
  LEFT JOIN public.profiles en ON en.id = c.enviado_por
  WHERE public.fin_is_direccion()
  ORDER BY c.fecha_inicio DESC, c.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 60), 500));
$$;

-- ── Bitácora (§20) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comisiones_auditoria(
  p_entidad text DEFAULT NULL,
  p_entidad_id uuid DEFAULT NULL,
  p_limite int DEFAULT 200
)
RETURNS TABLE (
  id uuid, entidad text, entidad_id uuid, accion text,
  estado_anterior text, estado_nuevo text,
  monto_anterior numeric, monto_nuevo numeric,
  comentario text, actor_nombre text, created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH permiso AS (SELECT public.fin_is_direccion() AS ok)
  SELECT a.id, a.entidad, a.entidad_id, a.accion, a.estado_anterior, a.estado_nuevo,
         a.monto_anterior, a.monto_nuevo, a.comentario,
         COALESCE(a.actor_nombre, 'Sistema'), a.created_at
  FROM public.comision_auditoria a, permiso
  WHERE permiso.ok
    AND (p_entidad IS NULL OR a.entidad = p_entidad)
    AND (p_entidad_id IS NULL OR a.entidad_id = p_entidad_id)
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 200), 2000));
$$;

-- ── Pagos registrados (§15) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comisiones_pagos(
  p_corte_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_limite int DEFAULT 200
)
RETURNS TABLE (
  id uuid, corte_id uuid, usuario_id uuid, usuario_nombre text,
  monto_pagado numeric, moneda text, fecha_pago date, metodo_pago text,
  referencia_bancaria text, comprobante_url text, observaciones text,
  registrado_por_nombre text, created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT g.id, g.corte_id, g.usuario_id,
         COALESCE(u.full_name, g.usuario_nombre, 'Cuenta eliminada'),
         g.monto_pagado, g.moneda, g.fecha_pago, g.metodo_pago,
         g.referencia_bancaria, g.comprobante_url, g.observaciones,
         rp.full_name, g.created_at
  FROM public.pagos_comisiones g
  LEFT JOIN public.profiles u  ON u.id  = g.usuario_id
  LEFT JOIN public.profiles rp ON rp.id = g.registrado_por
  WHERE public.fin_is_direccion()
    AND (p_corte_id IS NULL OR g.corte_id = p_corte_id)
    AND (p_usuario_id IS NULL OR g.usuario_id = p_usuario_id)
  ORDER BY g.fecha_pago DESC, g.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 200), 2000));
$$;

COMMIT;
