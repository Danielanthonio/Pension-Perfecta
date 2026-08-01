-- =============================================================================
-- PensiónFlow — Finanzas y Comisiones: acciones de la Dirección y RLS
-- =============================================================================
-- Tercera y última parte de 20260802000000. Aquí vive todo lo que ESCRIBE:
-- revisar, aprobar, generar el corte, enviarlo a Finanzas, confirmar el depósito,
-- ajustar, revertir y mantener las tarifas.
--
-- REGLA DE ORO: las tablas NO tienen políticas de INSERT, UPDATE ni DELETE. Ni
-- para la Dirección. Todo cambio entra por una de estas funciones
-- `SECURITY DEFINER`, que validan la transición y dejan rastro en
-- `comision_auditoria`. Con una política de UPDATE abierta, una petición
-- fabricada a mano podría marcar un evento como `pagado` saltándose la
-- aprobación, o reescribir un monto ya reportado — justo lo que prohíben el §18
-- y el §20. Es el mismo criterio de `closer_actualiza_aliado`
-- (20260801000004): función con lista blanca, no política de tabla.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- REVISIÓN DE EVENTOS (§6.2, §6.3)
-- ═════════════════════════════════════════════════════════════════════════════
-- Aprobar, observar o devolver a pendiente. Las transiciones hacia
-- `enviado_finanzas`, `pagado` y `revertido` NO pasan por aquí: las gobiernan el
-- corte y la reversión, que arrastran más consecuencias.
CREATE OR REPLACE FUNCTION public.comisiones_set_estado(
  p_ids uuid[],
  p_estado text,
  p_comentario text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n        int := 0;
  v_bloqueados int;
  v_ahora    timestamptz := timezone('utc'::text, now());
BEGIN
  PERFORM public.fin_require_direccion();

  IF p_estado NOT IN ('aprobado', 'observado', 'pendiente_revision') THEN
    RAISE EXCEPTION 'Desde la revisión solo se puede aprobar, observar o devolver a pendiente.';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No se seleccionó ninguna comisión.';
  END IF;
  IF p_estado = 'observado' AND COALESCE(btrim(p_comentario), '') = '' THEN
    RAISE EXCEPTION 'Observar una comisión exige escribir el motivo.';
  END IF;

  -- §18: un pago confirmado es inmutable, y lo anulado ya tiene su reversión en
  -- camino. Se avisa en vez de ignorar en silencio: la Dirección debe saber que
  -- parte de su selección no se movió.
  SELECT count(*) INTO v_bloqueados
    FROM public.comision_eventos
   WHERE id = ANY (p_ids)
     AND (estado = 'pagado' OR anulado_at IS NOT NULL);

  IF v_bloqueados > 0 THEN
    RAISE EXCEPTION
      'La selección incluye % comisión(es) ya pagada(s) o anulada(s), que son inmutables. Quítalas de la selección o corrígelas con un ajuste.',
      v_bloqueados;
  END IF;

  INSERT INTO public.comision_auditoria
    (entidad, entidad_id, accion, estado_anterior, estado_nuevo, monto_anterior, comentario, actor_id, actor_nombre)
  SELECT 'evento', e.id,
         CASE p_estado WHEN 'aprobado' THEN 'aprobacion'
                       WHEN 'observado' THEN 'observacion'
                       ELSE 'reapertura' END,
         e.estado, p_estado, e.monto, p_comentario,
         auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  FROM public.comision_eventos e
  WHERE e.id = ANY (p_ids)
    AND e.estado IN ('pendiente_revision', 'aprobado', 'observado')
    AND e.estado <> p_estado;

  UPDATE public.comision_eventos e
     SET estado = p_estado,
         motivo_observacion = CASE WHEN p_estado = 'observado' THEN p_comentario ELSE NULL END,
         fecha_aprobacion   = CASE WHEN p_estado = 'aprobado' THEN v_ahora ELSE NULL END,
         aprobado_por       = CASE WHEN p_estado = 'aprobado' THEN auth.uid() ELSE NULL END,
         observaciones      = CASE
                                WHEN p_estado <> 'observado' AND COALESCE(btrim(p_comentario), '') <> ''
                                  THEN p_comentario
                                ELSE e.observaciones
                              END,
         updated_at = v_ahora
   WHERE e.id = ANY (p_ids)
     AND e.estado IN ('pendiente_revision', 'aprobado', 'observado')
     AND e.estado <> p_estado;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- AJUSTES MANUALES (§17)
-- ═════════════════════════════════════════════════════════════════════════════
-- Un ajuste NUNCA edita un evento existente: es una fila nueva, positiva o
-- negativa, con su motivo. Así el total cambia y el histórico sigue intacto.
CREATE OR REPLACE FUNCTION public.comision_ajuste(
  p_usuario_id uuid,
  p_monto numeric,
  p_motivo text,
  p_fecha date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_perfil record;
  v_fecha  timestamptz;
BEGIN
  PERFORM public.fin_require_direccion();

  IF p_monto IS NULL OR p_monto = 0 THEN
    RAISE EXCEPTION 'El ajuste necesita un importe distinto de cero.';
  END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Todo ajuste tiene que llevar motivo: es lo que Finanzas leerá para justificar el cargo o el abono.';
  END IF;

  SELECT id, full_name, role INTO v_perfil FROM public.profiles WHERE id = p_usuario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese beneficiario ya no existe.';
  END IF;

  v_fecha := COALESCE(p_fecha::timestamp AT TIME ZONE 'UTC', timezone('utc'::text, now()));

  INSERT INTO public.comision_eventos (
    usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
    referencia_tipo, monto, fecha_devengo, periodo_corte,
    estado, observaciones, clave_unica
  ) VALUES (
    v_perfil.id, v_perfil.full_name,
    -- La app guarda 'admin' para la Dirección; el libro mayor usa 'director'.
    CASE WHEN v_perfil.role IN ('admin', 'director') THEN 'director' ELSE v_perfil.role END,
    CASE WHEN p_monto >= 0 THEN 'ajuste_positivo' ELSE 'ajuste_negativo' END,
    'periodo', p_monto, v_fecha, public.fin_periodo(v_fecha, 'semanal'),
    'pendiente_revision', p_motivo,
    -- Un ajuste es único por definición: no hay operación que reconciliar, así
    -- que la clave lleva su propio identificador.
    'aj:' || gen_random_uuid()::text
  )
  RETURNING id INTO v_id;

  PERFORM public.fin_auditar('evento', v_id, 'ajuste_manual', NULL, 'pendiente_revision', NULL, p_monto, p_motivo);
  RETURN v_id;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- REVERSIÓN MANUAL (§17)
-- ═════════════════════════════════════════════════════════════════════════════
-- Misma bifurcación que la reversión automática de `comisiones_sincronizar`:
--   · aún no salió a Finanzas → se revierte en su sitio (la fila se conserva);
--   · ya se reportó o se pagó → intocable, y el descuento viaja en un evento
--     negativo que cae en el corte siguiente.
CREATE OR REPLACE FUNCTION public.comision_revertir(
  p_evento_id uuid,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o       record;
  v_id    uuid;
  v_ahora timestamptz := timezone('utc'::text, now());
BEGIN
  PERFORM public.fin_require_direccion();

  IF COALESCE(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Toda reversión tiene que llevar motivo.';
  END IF;

  SELECT * INTO o FROM public.comision_eventos WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa comisión ya no existe.';
  END IF;
  IF o.estado = 'revertido' OR o.anulado_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esa comisión ya estaba revertida.';
  END IF;

  IF o.estado IN ('enviado_finanzas', 'pagado') THEN
    INSERT INTO public.comision_eventos (
      usuario_id, usuario_nombre, rol_beneficiario, tipo_evento,
      referencia_tipo, referencia_id, prospecto_id, aliado_id, tipo_producto,
      monto, moneda, fecha_devengo, periodo_corte, estado,
      evento_original_id, observaciones, clave_unica
    ) VALUES (
      o.usuario_id, o.usuario_nombre, o.rol_beneficiario, 'reversion',
      'evento', o.id, o.prospecto_id, o.aliado_id, o.tipo_producto,
      -o.monto, o.moneda, v_ahora, public.fin_periodo(v_ahora, 'semanal'), 'pendiente_revision',
      o.id, p_motivo, 'rev:' || o.id::text
    )
    RETURNING id INTO v_id;

    UPDATE public.comision_eventos
       SET anulado_at = v_ahora, anulado_motivo = p_motivo, updated_at = v_ahora
     WHERE id = o.id;

    PERFORM public.fin_auditar('evento', o.id, 'reversion_manual', o.estado, 'anulado', o.monto, -o.monto, p_motivo);
  ELSE
    UPDATE public.comision_eventos
       SET estado = 'revertido', observaciones = p_motivo, updated_at = v_ahora
     WHERE id = o.id;
    v_id := o.id;
    PERFORM public.fin_auditar('evento', o.id, 'reversion_manual', o.estado, 'revertido', o.monto, 0, p_motivo);
  END IF;

  RETURN v_id;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- CORTES (§11, §14)
-- ═════════════════════════════════════════════════════════════════════════════
-- Generar un corte = congelar qué eventos entran y cuánto suman. A partir de ahí
-- los totales del corte no se recalculan: el §6.3 exige que nada cambie en
-- silencio después de la revisión.
CREATE OR REPLACE FUNCTION public.corte_generar(
  p_tipo text,
  p_desde date,
  p_hasta date,
  p_observaciones text DEFAULT NULL
)
RETURNS TABLE (
  corte_id             uuid,
  eventos              int,
  beneficiarios        int,
  observados_excluidos int,
  total_a_pagar        numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_obs     int;
  v_n       int;
  -- El total va a una variable propia y NO se lee con un
  -- `SELECT total_a_pagar ...` suelto: `total_a_pagar` es también un parámetro
  -- de SALIDA de esta función, y en plpgsql los nombres de los OUT son
  -- variables visibles en el cuerpo. Sin cualificar, Postgres aborta con 42702
  -- "column reference is ambiguous".
  v_total   numeric;
BEGIN
  PERFORM public.fin_require_direccion();

  IF p_tipo NOT IN ('semanal', 'mensual', 'trimestral', 'personalizado') THEN
    RAISE EXCEPTION 'Tipo de corte no válido.';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'El período del corte no es válido.';
  END IF;

  -- §18: una operación observada no entra al corte. Se cuenta para decirlo en
  -- pantalla, en vez de dejarla fuera sin explicación.
  SELECT count(*) INTO v_obs
    FROM public.comision_eventos e
   WHERE e.corte_id IS NULL
     AND e.estado = 'observado'
     AND e.anulado_at IS NULL
     AND (e.fecha_devengo AT TIME ZONE 'UTC')::date BETWEEN p_desde AND p_hasta;

  SELECT count(*) INTO v_n
    FROM public.comision_eventos e
   WHERE e.corte_id IS NULL
     AND e.estado IN ('pendiente_revision', 'aprobado')
     AND e.anulado_at IS NULL
     AND (e.fecha_devengo AT TIME ZONE 'UTC')::date BETWEEN p_desde AND p_hasta;

  IF v_n = 0 THEN
    RAISE EXCEPTION
      'No hay comisiones sueltas en ese período. % observada(s) quedaron fuera por tener inconsistencias sin resolver.',
      v_obs;
  END IF;

  INSERT INTO public.cortes_financieros (tipo_corte, fecha_inicio, fecha_fin, estado, creado_por, observaciones)
  VALUES (p_tipo, p_desde, p_hasta, 'borrador', auth.uid(), p_observaciones)
  RETURNING id INTO v_id;

  UPDATE public.comision_eventos e
     SET corte_id = v_id, updated_at = timezone('utc'::text, now())
   WHERE e.corte_id IS NULL
     AND e.estado IN ('pendiente_revision', 'aprobado')
     AND e.anulado_at IS NULL
     AND (e.fecha_devengo AT TIME ZONE 'UTC')::date BETWEEN p_desde AND p_hasta;

  UPDATE public.cortes_financieros c
     SET total_produccion = t.produccion,
         total_comisiones = t.comisiones,
         total_bonos      = t.bonos,
         total_salarios   = t.salarios,
         total_ajustes    = t.ajustes,
         total_a_pagar    = t.total,
         updated_at       = timezone('utc'::text, now())
    FROM (
      SELECT
        count(DISTINCT e.prospecto_id)::int AS produccion,
        COALESCE(sum(e.monto) FILTER (WHERE e.tipo_evento IN ('comision_financiamiento', 'comision_cierre_aliado', 'comision_primer_financiamiento', 'comision_aliado')), 0) AS comisiones,
        COALESCE(sum(e.monto) FILTER (WHERE e.tipo_evento IN ('bono_mensual', 'bono_trimestral')), 0) AS bonos,
        COALESCE(sum(e.monto) FILTER (WHERE e.tipo_evento = 'salario_fijo'), 0) AS salarios,
        COALESCE(sum(e.monto) FILTER (WHERE e.tipo_evento IN ('ajuste_positivo', 'ajuste_negativo', 'reversion')), 0) AS ajustes,
        COALESCE(sum(e.monto), 0) AS total
      FROM public.comision_eventos e
      WHERE e.corte_id = v_id
    ) t
   WHERE c.id = v_id;

  SELECT c.total_a_pagar INTO v_total FROM public.cortes_financieros c WHERE c.id = v_id;

  PERFORM public.fin_auditar(
    'corte', v_id, 'generacion', NULL, 'borrador', NULL, v_total,
    format('Corte %s del %s al %s · %s evento(s) · %s observado(s) excluido(s).', p_tipo, p_desde, p_hasta, v_n, v_obs)
  );

  RETURN QUERY
    SELECT v_id, v_n,
           (SELECT count(DISTINCT e.usuario_id)::int FROM public.comision_eventos e WHERE e.corte_id = v_id),
           v_obs,
           v_total;
END;
$$;

-- ── Aprobación del corte (§6.3) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.corte_aprobar(p_corte_id uuid, p_observaciones text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c       record;
  v_ahora timestamptz := timezone('utc'::text, now());
BEGIN
  PERFORM public.fin_require_direccion();

  SELECT * INTO c FROM public.cortes_financieros WHERE id = p_corte_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese corte ya no existe.'; END IF;
  IF c.estado NOT IN ('borrador', 'en_revision') THEN
    RAISE EXCEPTION 'Este corte ya fue aprobado o enviado; no se puede volver a aprobar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.comision_eventos WHERE corte_id = p_corte_id AND estado = 'observado') THEN
    RAISE EXCEPTION 'El corte tiene comisiones observadas. Resuélvelas o sácalas antes de aprobar.';
  END IF;

  UPDATE public.comision_eventos
     SET estado = 'aprobado', fecha_aprobacion = v_ahora, aprobado_por = auth.uid(), updated_at = v_ahora
   WHERE corte_id = p_corte_id
     AND estado = 'pendiente_revision'
     AND anulado_at IS NULL;

  UPDATE public.cortes_financieros
     SET estado = 'aprobado', fecha_aprobacion = v_ahora, aprobado_por = auth.uid(),
         fecha_revision = COALESCE(fecha_revision, v_ahora), revisado_por = COALESCE(revisado_por, auth.uid()),
         observaciones = COALESCE(p_observaciones, observaciones), updated_at = v_ahora
   WHERE id = p_corte_id;

  PERFORM public.fin_auditar('corte', p_corte_id, 'aprobacion', c.estado, 'aprobado', NULL, c.total_a_pagar, p_observaciones);
END;
$$;

-- ── Envío a Finanzas (§6.4) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.corte_enviar_finanzas(p_corte_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c       record;
  v_ahora timestamptz := timezone('utc'::text, now());
BEGIN
  PERFORM public.fin_require_direccion();

  SELECT * INTO c FROM public.cortes_financieros WHERE id = p_corte_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese corte ya no existe.'; END IF;
  IF c.estado <> 'aprobado' THEN
    RAISE EXCEPTION 'Solo se envía a Finanzas un corte aprobado.';
  END IF;

  UPDATE public.comision_eventos
     SET estado = 'enviado_finanzas', fecha_envio_finanzas = v_ahora, enviado_por = auth.uid(), updated_at = v_ahora
   WHERE corte_id = p_corte_id
     AND estado = 'aprobado'
     AND anulado_at IS NULL;

  UPDATE public.cortes_financieros
     SET estado = 'enviado_finanzas', fecha_envio_finanzas = v_ahora, enviado_por = auth.uid(), updated_at = v_ahora
   WHERE id = p_corte_id;

  PERFORM public.fin_auditar('corte', p_corte_id, 'envio_finanzas', c.estado, 'enviado_finanzas', NULL, c.total_a_pagar, NULL);
END;
$$;

-- ── Confirmación manual del depósito (§6.5, §15) ────────────────────────────
-- Un pago se registra POR PERSONA, no por corte entero: Finanzas deposita en
-- varias cuentas y casi nunca el mismo día. Los eventos de esa persona solo
-- quedan bloqueados cuando lo abonado cubre lo que se le debe; mientras tanto el
-- pago queda como parcial y el saldo sigue a la vista.
CREATE OR REPLACE FUNCTION public.corte_registrar_pago(
  p_corte_id uuid,
  p_usuario_id uuid,
  p_monto numeric,
  p_fecha date,
  p_metodo text,
  p_referencia text DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL,
  p_observaciones text DEFAULT NULL
)
RETURNS TABLE (pago_id uuid, saldo_pendiente numeric, corte_estado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c              record;
  v_nombre       text;
  v_pago_id      uuid;
  v_total_user   numeric;
  v_pagado_user  numeric;
  v_total_corte  numeric;
  v_pagado_corte numeric;
  v_estado       text;
  v_ahora        timestamptz := timezone('utc'::text, now());
BEGIN
  PERFORM public.fin_require_direccion();

  SELECT * INTO c FROM public.cortes_financieros WHERE id = p_corte_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese corte ya no existe.'; END IF;

  -- §18: no se marca como pagado un corte que no haya sido aprobado.
  IF c.estado NOT IN ('aprobado', 'enviado_finanzas', 'pagado_parcial') THEN
    RAISE EXCEPTION 'Este corte todavía no está aprobado: no se pueden registrar depósitos.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El importe del depósito tiene que ser mayor que cero.';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha del depósito.';
  END IF;
  IF p_metodo NOT IN ('transferencia', 'binance', 'efectivo', 'otro') THEN
    RAISE EXCEPTION 'Método de pago no válido.';
  END IF;

  SELECT COALESCE(sum(e.monto), 0) INTO v_total_user
    FROM public.comision_eventos e
   WHERE e.corte_id = p_corte_id AND e.usuario_id = p_usuario_id
     AND e.estado <> 'revertido' AND e.anulado_at IS NULL;

  IF v_total_user <= 0 THEN
    RAISE EXCEPTION 'Esa persona no tiene saldo a favor en este corte.';
  END IF;

  SELECT COALESCE(sum(g.monto_pagado), 0) INTO v_pagado_user
    FROM public.pagos_comisiones g
   WHERE g.corte_id = p_corte_id AND g.usuario_id = p_usuario_id;

  -- Un dedazo en el importe se convierte en dinero mal reportado: se corta aquí,
  -- diciendo cuánto queda realmente por depositar.
  IF v_pagado_user + p_monto > v_total_user THEN
    RAISE EXCEPTION 'El depósito excede el saldo. A esta persona le quedan % pendientes en este corte.',
      to_char(v_total_user - v_pagado_user, 'FM999,999,990.00');
  END IF;

  SELECT full_name INTO v_nombre FROM public.profiles WHERE id = p_usuario_id;

  INSERT INTO public.pagos_comisiones
    (corte_id, usuario_id, usuario_nombre, monto_pagado, moneda, fecha_pago, metodo_pago,
     referencia_bancaria, comprobante_url, registrado_por, observaciones)
  VALUES
    (p_corte_id, p_usuario_id, v_nombre, p_monto, c.moneda, p_fecha, p_metodo,
     p_referencia, p_comprobante_url, auth.uid(), p_observaciones)
  RETURNING id INTO v_pago_id;

  v_pagado_user := v_pagado_user + p_monto;

  -- Solo al quedar cubierto se bloquean los eventos de esa persona.
  IF v_pagado_user >= v_total_user THEN
    UPDATE public.comision_eventos
       SET estado = 'pagado', fecha_pago = p_fecha::timestamp AT TIME ZONE 'UTC',
           pagado_por = auth.uid(), referencia_pago = p_referencia, updated_at = v_ahora
     WHERE corte_id = p_corte_id AND usuario_id = p_usuario_id
       AND estado <> 'revertido' AND anulado_at IS NULL;
  END IF;

  SELECT COALESCE(sum(g.monto_pagado), 0) INTO v_pagado_corte
    FROM public.pagos_comisiones g WHERE g.corte_id = p_corte_id;
  SELECT c2.total_a_pagar INTO v_total_corte FROM public.cortes_financieros c2 WHERE c2.id = p_corte_id;

  v_estado := CASE WHEN v_total_corte > 0 AND v_pagado_corte >= v_total_corte THEN 'pagado' ELSE 'pagado_parcial' END;

  UPDATE public.cortes_financieros
     SET total_pagado = v_pagado_corte,
         estado       = v_estado,
         fecha_pago   = CASE WHEN v_estado = 'pagado' THEN v_ahora ELSE fecha_pago END,
         pagado_por   = CASE WHEN v_estado = 'pagado' THEN auth.uid() ELSE pagado_por END,
         updated_at   = v_ahora
   WHERE id = p_corte_id;

  PERFORM public.fin_auditar(
    'pago', v_pago_id, 'registro_pago', c.estado, v_estado, NULL, p_monto,
    format('Depósito a %s por %s vía %s. Referencia: %s',
           COALESCE(v_nombre, 'beneficiario'), to_char(p_monto, 'FM999,999,990.00'), p_metodo,
           COALESCE(p_referencia, 'sin folio'))
  );

  RETURN QUERY SELECT v_pago_id, v_total_user - v_pagado_user, v_estado;
END;
$$;

-- ── Anular un corte ─────────────────────────────────────────────────────────
-- Devuelve sus eventos al pool para rehacerlo. No se permite si ya hubo un
-- depósito: eso ya no es un borrador, es historia contable.
CREATE OR REPLACE FUNCTION public.corte_anular(p_corte_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  PERFORM public.fin_require_direccion();

  IF COALESCE(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Anular un corte exige escribir el motivo.';
  END IF;

  SELECT * INTO c FROM public.cortes_financieros WHERE id = p_corte_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese corte ya no existe.'; END IF;
  IF c.estado IN ('pagado', 'pagado_parcial') THEN
    RAISE EXCEPTION 'Este corte ya tiene depósitos registrados: no se puede anular. Corrige con un ajuste.';
  END IF;
  IF c.estado = 'anulado' THEN RETURN; END IF;

  UPDATE public.comision_eventos
     SET corte_id = NULL,
         estado = CASE WHEN estado IN ('aprobado', 'enviado_finanzas') THEN 'pendiente_revision' ELSE estado END,
         fecha_aprobacion = NULL, aprobado_por = NULL,
         fecha_envio_finanzas = NULL, enviado_por = NULL,
         updated_at = timezone('utc'::text, now())
   WHERE corte_id = p_corte_id AND estado <> 'pagado';

  UPDATE public.cortes_financieros
     SET estado = 'anulado', observaciones = p_motivo, updated_at = timezone('utc'::text, now())
   WHERE id = p_corte_id;

  PERFORM public.fin_auditar('corte', p_corte_id, 'anulacion', c.estado, 'anulado', c.total_a_pagar, 0, p_motivo);
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TARIFAS (§16)
-- ═════════════════════════════════════════════════════════════════════════════
-- Cambiar un importe NO edita la fila anterior: le cierra la vigencia el día
-- antes y abre una nueva. Es lo que permite que una comisión de julio conserve
-- para siempre el monto de julio.
CREATE OR REPLACE FUNCTION public.comision_tarifa_guardar(
  p_rol text,
  p_concepto text,
  p_producto text,
  p_umbral_min int,
  p_monto numeric,
  p_vigente_desde date,
  p_vigente_hasta date DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_previa record;
BEGIN
  PERFORM public.fin_require_direccion();

  IF p_monto IS NULL OR p_monto < 0 THEN
    RAISE EXCEPTION 'El importe de la tarifa no puede ser negativo.';
  END IF;
  IF p_vigente_desde IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha desde la que rige la tarifa.';
  END IF;
  IF p_vigente_hasta IS NOT NULL AND p_vigente_hasta < p_vigente_desde THEN
    RAISE EXCEPTION 'La vigencia termina antes de empezar.';
  END IF;

  -- Vigencia abierta que la nueva tarifa reemplaza.
  SELECT * INTO v_previa
    FROM public.comision_tarifas t
   WHERE t.activo
     AND t.rol_beneficiario = p_rol
     AND t.concepto = p_concepto
     AND t.producto IS NOT DISTINCT FROM p_producto
     AND t.umbral_min = COALESCE(p_umbral_min, 0)
     AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= p_vigente_desde)
   ORDER BY t.vigente_desde DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_previa.vigente_desde >= p_vigente_desde THEN
      -- La anterior arranca el mismo día o después: no hay historia que
      -- preservar, se retira. (No se borra: el §20 prohíbe eliminar y los
      -- eventos ya devengados siguen apuntando a su `tarifa_id`.)
      UPDATE public.comision_tarifas SET activo = false, updated_at = timezone('utc'::text, now())
       WHERE id = v_previa.id;
    ELSE
      UPDATE public.comision_tarifas
         SET vigente_hasta = p_vigente_desde - 1, updated_at = timezone('utc'::text, now())
       WHERE id = v_previa.id;
    END IF;
    PERFORM public.fin_auditar('tarifa', v_previa.id, 'cierre_vigencia', 'vigente', 'cerrada',
                               v_previa.monto, p_monto,
                               format('Reemplazada por una tarifa nueva a partir del %s.', p_vigente_desde));
  END IF;

  INSERT INTO public.comision_tarifas
    (rol_beneficiario, concepto, producto, umbral_min, monto, vigente_desde, vigente_hasta, notas, creado_por)
  VALUES
    (p_rol, p_concepto, p_producto, COALESCE(p_umbral_min, 0), p_monto, p_vigente_desde, p_vigente_hasta, p_notas, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.fin_auditar('tarifa', v_id, 'alta_tarifa', NULL, 'vigente',
                             COALESCE(v_previa.monto, NULL), p_monto,
                             format('%s · %s%s · desde %s', p_rol, p_concepto,
                                    COALESCE(' · ' || p_producto, ''), p_vigente_desde));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.comision_tarifa_cerrar(p_id uuid, p_vigente_hasta date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t record;
BEGIN
  PERFORM public.fin_require_direccion();

  SELECT * INTO t FROM public.comision_tarifas WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa tarifa ya no existe.'; END IF;
  IF p_vigente_hasta IS NULL OR p_vigente_hasta < t.vigente_desde THEN
    RAISE EXCEPTION 'La fecha de término tiene que ser posterior al inicio de la vigencia.';
  END IF;

  UPDATE public.comision_tarifas
     SET vigente_hasta = p_vigente_hasta, updated_at = timezone('utc'::text, now())
   WHERE id = p_id;

  PERFORM public.fin_auditar('tarifa', p_id, 'cierre_vigencia', 'vigente', 'cerrada', t.monto, t.monto,
                             format('Vigencia cerrada el %s.', p_vigente_hasta));
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- CONFIGURACIÓN
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.comision_config_guardar(
  p_director_id uuid DEFAULT NULL,
  p_arranque date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fin_require_direccion();

  IF p_director_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_director_id AND role IN ('admin', 'director')
  ) THEN
    RAISE EXCEPTION 'El beneficiario de las comisiones de Dirección tiene que ser una cuenta con rol de dirección.';
  END IF;

  UPDATE public.comision_config
     SET director_beneficiario_id = COALESCE(p_director_id, director_beneficiario_id),
         arranque   = COALESCE(p_arranque, arranque),
         updated_by = auth.uid(),
         updated_at = timezone('utc'::text, now())
   WHERE id;

  PERFORM public.fin_auditar('config', NULL, 'configuracion', NULL, NULL, NULL, NULL,
                             'Se actualizó la configuración del módulo de comisiones.');
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════
-- Solo LECTURA, y solo para la Dirección. Ninguna tabla tiene política de
-- escritura: todo cambio pasa por las funciones de arriba, que validan la
-- transición y dejan bitácora. El §2.3 deja explícitamente fuera a Account
-- Managers, Closers y Aliados; la vista personal "cada quien ve lo suyo" que el
-- brief plantea para una etapa posterior se resolverá con una política SELECT
-- adicional sobre `usuario_id = auth.uid()`, sin tocar nada de esto.
ALTER TABLE public.comision_tarifas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comision_eventos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cortes_financieros  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_comisiones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comision_auditoria  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comision_config     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dirección lee las tarifas" ON public.comision_tarifas;
CREATE POLICY "Dirección lee las tarifas" ON public.comision_tarifas
  FOR SELECT TO authenticated USING (public.fin_is_direccion());

DROP POLICY IF EXISTS "Dirección lee el libro mayor" ON public.comision_eventos;
CREATE POLICY "Dirección lee el libro mayor" ON public.comision_eventos
  FOR SELECT TO authenticated USING (public.fin_is_direccion());

DROP POLICY IF EXISTS "Dirección lee los cortes" ON public.cortes_financieros;
CREATE POLICY "Dirección lee los cortes" ON public.cortes_financieros
  FOR SELECT TO authenticated USING (public.fin_is_direccion());

DROP POLICY IF EXISTS "Dirección lee los pagos" ON public.pagos_comisiones;
CREATE POLICY "Dirección lee los pagos" ON public.pagos_comisiones
  FOR SELECT TO authenticated USING (public.fin_is_direccion());

DROP POLICY IF EXISTS "Dirección lee la bitácora" ON public.comision_auditoria;
CREATE POLICY "Dirección lee la bitácora" ON public.comision_auditoria
  FOR SELECT TO authenticated USING (public.fin_is_direccion());

DROP POLICY IF EXISTS "Dirección lee la configuración" ON public.comision_config;
CREATE POLICY "Dirección lee la configuración" ON public.comision_config
  FOR SELECT TO authenticated USING (public.fin_is_direccion());

COMMIT;
