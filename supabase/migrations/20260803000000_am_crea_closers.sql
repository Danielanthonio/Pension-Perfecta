-- =============================================================================
-- PensiónFlow — El Account Manager incorpora closers y los atribuye a un aliado
-- =============================================================================
-- Pedido por Dirección el 2026-08-03. Hasta hoy el closer era una figura que solo
-- podía nacer de la mano de la Dirección, y eso convertía a una persona en cuello
-- de botella de la captación. El AM pasa a poder hacer dos cosas, EXACTAMENTE
-- dos:
--
--   1) Crear un usuario con rol `closer`.
--   2) Atribuir un aliado a un closer  ← "la asignación de closer a un aliado
--      solamente": no reasignar, no reescribir mérito, no borrar.
--
-- LO QUE NO SE LE DA, Y POR QUÉ
--   · Reatribuir a un aliado que YA tiene closer de origen. Ese dato es la base
--     de todas las métricas del módulo Closers y del cálculo de comisiones:
--     cambiarlo mueve dinero. Sigue siendo de Dirección (§23).
--   · El módulo de métricas /admin/closers. El AM no mide la captación, la
--     habilita. Su RLS tampoco le daría los datos: las RPC filtran por dentro.
--   · Crear directores u otros AM. Ver el punto 2 de abajo.
--
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) El AM tiene que VER a los closers
-- ─────────────────────────────────────────────────────────────────────────────
-- Sin esto lo demás es papel mojado: el selector "Closer responsable" del alta de
-- aliados se dibuja a partir de `profiles`, y hoy un AM no ve ni una sola fila
-- con role='closer' (sus políticas de SELECT solo alcanzan 'aliado' y
-- 'account_manager'). El efecto real era peor que un selector vacío: la pantalla
-- de alta bloquea con "no existe ningún closer" cuando la lista viene vacía, así
-- que un AM no habría podido dar de alta NI UN ALIADO.
--
-- Las políticas PERMISSIVE se combinan con OR: esto solo amplía. Sin recursión,
-- porque `closers_my_role()` es SECURITY DEFINER.
DROP POLICY IF EXISTS "AMs ven a los closers" ON public.profiles;
CREATE POLICY "AMs ven a los closers"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND role = 'closer'
    AND public.closers_my_role() = 'account_manager'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Qué roles puede crear un Account Manager
-- ─────────────────────────────────────────────────────────────────────────────
-- La política de INSERT que había daba el alta por el ROL DE QUIEN LLAMA y no
-- miraba el rol que se estaba escribiendo. Con la pantalla vieja no se notaba
-- —el formulario del AM forzaba 'aliado'—, pero la puerta estaba abierta: una
-- petición fabricada a mano permitía a un AM crearse un perfil con role='admin'
-- y entrar a la consola de Dirección. Ahora que la pantalla del AM sí ofrece
-- elegir rol, el límite tiene que estar en la base y no en el formulario.
--
-- Se sustituye la política por la MISMA, con una sola diferencia: la rama del
-- account_manager exige que el rol escrito sea 'aliado' o 'closer'. Dirección y
-- el auto-registro (`auth.uid() = id`) quedan intactos.
--
-- Revertir = volver a crear la política con la rama del AM sin la condición de
-- rol (queda escrita íntegra en el comentario de abajo).
--   OR (get_user_role(auth.uid()) = 'account_manager')
DROP POLICY IF EXISTS "Admins y Account Managers pueden crear perfiles" ON public.profiles;
CREATE POLICY "Admins y Account Managers pueden crear perfiles"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.get_user_role(auth.uid()) = 'director'
    OR (
      public.get_user_role(auth.uid()) = 'account_manager'
      AND role IN ('aliado', 'closer')
    )
    OR auth.uid() = id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) La asignación closer → aliado
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UNA FUNCIÓN Y NO UNA POLÍTICA DE UPDATE — el mismo motivo que en
-- `closer_actualiza_aliado` (20260801000004): el RLS de Postgres es ciego a las
-- COLUMNAS. Una política de UPDATE que dejara al AM tocar la fila del aliado para
-- escribir `closer_origen_id` le dejaría también escribir `role`, `is_active` o
-- `password_provisional` con una petición fabricada. La lista blanca de columnas
-- solo se puede imponer desde dentro de una función.
--
-- Además resuelve de un golpe el otro problema: un AM tampoco tiene hoy UPDATE
-- sobre los perfiles de aliado (desde que el AM es por PROYECTO, la condición
-- `account_manager_id = auth.uid()` ya casi nunca se cumple). Al ser SECURITY
-- DEFINER, la función no depende de eso.
--
-- La escritura del historial va DENTRO de la misma llamada, por la misma razón:
-- `closer_aliado_asignaciones` solo acepta INSERT de Dirección, y no se le va a
-- abrir una política al AM para que el registro se pueda escribir suelto.
CREATE OR REPLACE FUNCTION public.asigna_closer_a_aliado(
  p_aliado_ids uuid[],
  p_closer_id  uuid,
  -- 'backfill' es lo que usa el módulo de asignación masiva (conserva la fecha de
  -- alta de cada aliado); 'asignacion_inicial', el alta puntual.
  p_tipo       text DEFAULT 'backfill',
  p_motivo     text DEFAULT NULL,
  p_fecha      timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol          text    := public.closers_my_role();
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

  -- Reasignar (mover al closer ACTUAL dejando el de origen quieto) es otro
  -- movimiento y otra pantalla. Aquí no entra.
  IF p_tipo IS NULL OR p_tipo NOT IN ('asignacion_inicial', 'backfill') THEN
    RAISE EXCEPTION 'Esta función solo hace la atribución inicial de un aliado.';
  END IF;

  IF p_closer_id IS NULL THEN
    RAISE EXCEPTION 'Falta el closer al que se atribuye el aliado.';
  END IF;

  SELECT role INTO v_closer_rol FROM public.profiles WHERE id = p_closer_id;
  IF v_closer_rol IS DISTINCT FROM 'closer' THEN
    RAISE EXCEPTION 'El destino de la atribución tiene que ser un usuario con rol closer.';
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

    -- El límite del AM. Dirección sí puede reescribir el origen desde aquí.
    IF NOT v_es_direccion AND v_aliado.closer_origen_id IS NOT NULL THEN
      RAISE EXCEPTION
        '% ya tiene closer de origen. Cambiar una atribución existente mueve métricas y comisiones: eso lo hace Dirección.',
        v_aliado.full_name;
    END IF;

    -- Fecha de incorporación: la que mande el que llama; si no, la que ya tenía;
    -- si no, la de alta del aliado. Nunca "hoy" por descuido, o el gráfico de
    -- captación pintaría un pico falso el día del backfill.
    v_fecha := coalesce(p_fecha, v_aliado.fecha_incorporacion_closer, v_aliado.created_at, now());

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
$$;

COMMENT ON FUNCTION public.asigna_closer_a_aliado(uuid[], uuid, text, text, timestamptz) IS
  'Atribución INICIAL de uno o varios aliados a un closer, con su registro en el historial. Dirección puede además reescribir una atribución existente; un Account Manager, no.';

REVOKE ALL ON FUNCTION public.asigna_closer_a_aliado(uuid[], uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asigna_closer_a_aliado(uuid[], uuid, text, text, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
