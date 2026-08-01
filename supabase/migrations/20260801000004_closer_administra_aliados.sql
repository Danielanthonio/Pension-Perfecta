-- =============================================================================
-- PensiónFlow — El closer administra a sus propios aliados
-- =============================================================================
-- Pedido por Dirección el 2026-08-01: al closer le faltaba poder mantener a los
-- aliados que él mismo incorporó — corregir el nombre, el teléfono y cargar el
-- enlace del contrato. ELIMINAR queda fuera por decisión expresa: el closer
-- administra, no borra.
--
-- POR QUÉ UNA FUNCIÓN Y NO UNA POLÍTICA DE UPDATE
-- El RLS de Postgres es ciego a las COLUMNAS: una política de UPDATE sobre
-- `profiles` autorizaría la fila entera, y con una petición fabricada a mano el
-- closer podría tocar `closer_origen_id` (robar o regalar el mérito de una
-- captación), `role` (ascenderse), `empresa_multialiado_id` o
-- `password_provisional`. Una función `SECURITY DEFINER` con lista blanca de
-- columnas solo puede escribir lo que aquí se enumera, venga como venga la
-- petición. Es el mismo criterio con el que se hicieron las RPC de métricas.
--
-- EL BORRADO SIGUE SIENDO DE DIRECCIÓN. Esta función no borra nada, y
-- /api/admin/delete-user continúa exigiendo rol director/admin: un closer que
-- llame a ese endpoint recibe 403. Es coherente con lo que ya impedía el RLS —
-- `profiles` nunca ha tenido política de DELETE— y con que borrar una cuenta
-- arrastra proyectos, expedientes y comisiones.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.closer_actualiza_aliado(
  p_aliado_id     uuid,
  p_full_name     text,
  p_phone         text DEFAULT NULL,
  p_contrato_url  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol         text := public.closers_my_role();
  v_es_direccion boolean := public.closers_is_direccion();
  v_aliado      record;
  v_nombre      text := btrim(coalesce(p_full_name, ''));
  v_contrato    text := nullif(btrim(coalesce(p_contrato_url, '')), '');
  v_telefono    text := nullif(btrim(coalesce(p_phone, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;

  SELECT id, role, closer_origen_id, closer_actual_id, contrato_url
    INTO v_aliado
    FROM public.profiles
   WHERE id = p_aliado_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese aliado ya no existe.';
  END IF;

  IF v_aliado.role <> 'aliado' THEN
    RAISE EXCEPTION 'Esta función solo edita perfiles de aliados.';
  END IF;

  -- Alcance: la Dirección puede con cualquiera; un closer, solo con los suyos
  -- (los que captó o los que gestiona hoy). Cualquier otro rol, fuera.
  IF NOT (
    v_es_direccion
    OR (v_rol = 'closer' AND (v_aliado.closer_origen_id = auth.uid() OR v_aliado.closer_actual_id = auth.uid()))
  ) THEN
    RAISE EXCEPTION 'No puedes editar a este aliado.';
  END IF;

  IF length(v_nombre) < 3 THEN
    RAISE EXCEPTION 'El nombre del aliado necesita al menos 3 caracteres.';
  END IF;

  -- Lista blanca. Todo lo demás —rol, atribución, empresa, contraseña— queda
  -- fuera del alcance de esta función a propósito.
  UPDATE public.profiles
     SET full_name    = v_nombre,
         phone        = v_telefono,
         contrato_url = v_contrato,
         -- El sello solo se mueve cuando el enlace CAMBIA de verdad: si no,
         -- una edición del nombre haría parecer que el contrato se revisó hoy.
         contrato_url_at = CASE
           WHEN v_contrato IS DISTINCT FROM v_aliado.contrato_url THEN now()
           ELSE contrato_url_at
         END
   WHERE id = p_aliado_id;
END;
$$;

COMMENT ON FUNCTION public.closer_actualiza_aliado(uuid, text, text, text) IS
  'Edición acotada de un aliado por su closer (o por Dirección): SOLO nombre, teléfono y enlace del contrato. Existe para no abrir una política de UPDATE sobre profiles, que sería ciega a columnas.';

REVOKE ALL ON FUNCTION public.closer_actualiza_aliado(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.closer_actualiza_aliado(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
