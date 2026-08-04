-- =============================================================================
-- PensiónFlow — Autoría del alta de un aliado y auditoría administrativa
-- =============================================================================
-- Pedido por Dirección el 2026-08-04 (especificación "Creación y Administración
-- de Aliados por Closer y Account Manager").
--
-- EL PROBLEMA QUE RESUELVE
-- Hasta hoy el sistema solo sabía QUIÉN CERRÓ a un aliado (`closer_origen_id`),
-- no QUIÉN LE ABRIÓ LA CUENTA. Son cosas distintas y la especificación las
-- separa en dos permisos distintos (§7 vs §8/§9):
--
--   · un aliado creado POR un closer          → ese closer lo administra
--     (ve credenciales, edita, elimina)
--   · un aliado creado por un AM y ATRIBUIDO   → ese closer solo lo ve y le
--     a un closer                                trabaja el proceso comercial
--
-- Con una sola columna no se puede distinguir: si el AM da de alta a un aliado y
-- se lo atribuye a Ana, `closer_origen_id` = Ana en los dos casos. Por eso nace
-- `created_by`.
--
-- LA AUTORÍA NO SE LA PREGUNTAMOS AL NAVEGADOR
-- `created_by` lo estampa un trigger BEFORE INSERT a partir de `auth.uid()`, no
-- el cliente. Un perfil no puede nacer diciendo que lo creó otro. El WITH CHECK
-- de las políticas de INSERT lo vuelve a exigir por si algún día el trigger se
-- desactiva: dos barreras, como en 20260801000001.
--
-- LO QUE NO SE HACE AQUÍ, A PROPÓSITO
--   · `is_active` NO se añade (§11 pide "estado de la cuenta"). Esa columna no
--     existe en producción y media app filtra por `is_active !== false`:
--     crearla haría que el botón "Desactivar" —que hoy no persiste— empezara a
--     ocultar usuarios de golpe. Es un cambio con su propio riesgo y su propia
--     migración.
--   · El BORRADO por parte del Account Manager. El §10 lo deja en "Según
--     permisos", que no define nada. Se mantiene como está hoy (solo Dirección)
--     y se añade únicamente el caso que la especificación sí define sin
--     ambigüedad: el closer borra a los aliados que él creó (§8).
--
-- Todo es ADITIVO e IDEMPOTENTE y va en una transacción.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) AUTORÍA Y ÚLTIMA MODIFICACIÓN (§11)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_by_role text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.created_by IS
  'Quién ABRIÓ esta cuenta. Distinto de closer_origen_id (quién la cerró comercialmente): de esta columna dependen los permisos de administración del closer sobre el aliado (§8/§9).';
COMMENT ON COLUMN public.profiles.created_by_role IS
  'Rol que tenía el creador en el momento del alta. Descriptivo: ningún permiso lo consulta.';

CREATE INDEX IF NOT EXISTS idx_profiles_created_by
  ON public.profiles (created_by) WHERE created_by IS NOT NULL;

-- 1.a Backfill de lo que SÍ se puede demostrar --------------------------------
-- El historial de asignaciones guarda el alta inicial de cada aliado. Cuando el
-- que la registró es el MISMO closer al que se atribuyó (`asignado_por =
-- closer_nuevo_id`), la única forma de que esa fila exista es que ese closer
-- diera el alta él mismo: su política solo le deja escribir movimientos a su
-- propio nombre (20260801000001).
--
-- El resto se queda en NULL a propósito. Un alta hecha por Dirección o por un AM
-- y atribuida a un closer NO convierte a ese closer en creador, y NULL significa
-- exactamente "no consta quién abrió esta cuenta" — que es la verdad para los
-- aliados anteriores a este registro. NULL nunca concede permisos.
UPDATE public.profiles p
   SET created_by = h.asignado_por,
       created_by_role = 'closer'
  FROM (
    SELECT DISTINCT ON (aliado_id) aliado_id, asignado_por
      FROM public.closer_aliado_asignaciones
     WHERE tipo_movimiento = 'asignacion_inicial'
       AND closer_anterior_id IS NULL
       AND asignado_por IS NOT NULL
       AND asignado_por = closer_nuevo_id
     ORDER BY aliado_id, fecha_asignacion ASC, created_at ASC
  ) h
 WHERE p.id = h.aliado_id
   AND p.created_by IS NULL;

-- 1.b El trigger que estampa la autoría ---------------------------------------
-- SECURITY DEFINER porque tiene que leer el rol del creador en `profiles`, y el
-- RLS del que inserta puede no alcanzar esa fila.
--
-- OJO con el alcance: este trigger corre en CADA insert y update de `profiles`,
-- incluido el auto-registro y la auto-recuperación del perfil en el primer
-- login. Por eso no toca ninguna columna que no cree esta migración —
-- especialmente NO menciona `is_active`, que no existe en producción— y nunca
-- lanza excepción: si algo no se puede resolver, deja el campo en NULL.
CREATE OR REPLACE FUNCTION public.profiles_stamp_autoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Un usuario que se registra a sí mismo no tiene creador: `auth.uid() = id`.
    IF NEW.created_by IS NULL
       AND auth.uid() IS NOT NULL
       AND auth.uid() IS DISTINCT FROM NEW.id THEN
      NEW.created_by := auth.uid();
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.created_by_role IS NULL THEN
      NEW.created_by_role := (SELECT role FROM public.profiles WHERE id = NEW.created_by);
    END IF;
  ELSE
    NEW.updated_at := now();
    -- `auth.uid()` es NULL cuando escribe la service_role (endpoints de
    -- servidor) o un job: se deja el autor anterior en vez de borrarlo.
    IF auth.uid() IS NOT NULL THEN
      NEW.updated_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_stamp_autoria ON public.profiles;
CREATE TRIGGER trg_profiles_stamp_autoria
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_stamp_autoria();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) HISTORIAL DE AUDITORÍA (§14)
-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only, igual que `closer_aliado_asignaciones`: sin políticas de UPDATE
-- ni DELETE, así que nadie reescribe lo que pasó. Tampoco lleva FK sobre
-- `aliado_id`, por el mismo motivo que aquella tabla: si el INSERT del perfil lo
-- bloquea el RLS, el perfil se materializa en el primer login y una FK impediría
-- registrar justamente el evento que no se puede perder.
CREATE TABLE IF NOT EXISTS public.aliado_auditoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aliado_id     uuid NOT NULL,
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_rol     text,
  accion        text NOT NULL
                  CHECK (accion IN ('alta', 'edicion', 'credenciales_vistas',
                                    'credenciales_cambiadas', 'estado',
                                    'eliminacion', 'atribucion_closer')),
  datos_antes   jsonb,
  datos_despues jsonb,
  motivo        text,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.aliado_auditoria IS
  'Historial append-only de acciones administrativas sobre un aliado (§14). El actor lo estampa la base desde auth.uid(): no se puede firmar en nombre de otro.';

CREATE INDEX IF NOT EXISTS idx_aliado_auditoria_aliado
  ON public.aliado_auditoria (aliado_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aliado_auditoria_actor
  ON public.aliado_auditoria (actor_id);

ALTER TABLE public.aliado_auditoria ENABLE ROW LEVEL SECURITY;

-- Helper para no consultar `profiles` desde una política y arrastrar su RLS.
CREATE OR REPLACE FUNCTION public.aliado_lo_cree_yo(p_aliado_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_aliado_id
       AND created_by IS NOT NULL
       AND created_by = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Direccion y AM leen la auditoria" ON public.aliado_auditoria;
CREATE POLICY "Direccion y AM leen la auditoria"
  ON public.aliado_auditoria
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND (public.closers_is_direccion() OR public.closers_my_role() = 'account_manager')
  );

DROP POLICY IF EXISTS "Closer lee la auditoria de sus altas" ON public.aliado_auditoria;
CREATE POLICY "Closer lee la auditoria de sus altas"
  ON public.aliado_auditoria
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND public.closers_my_role() = 'closer'
    AND (actor_id = auth.uid() OR public.aliado_lo_cree_yo(aliado_id))
  );

-- NO hay política de INSERT: la tabla solo se escribe por la función de abajo,
-- que es SECURITY DEFINER y firma con auth.uid(). Así el registro no depende de
-- que el cliente diga la verdad sobre quién es.
CREATE OR REPLACE FUNCTION public.registrar_auditoria_aliado(
  p_aliado_id uuid,
  p_accion    text,
  p_antes     jsonb DEFAULT NULL,
  p_despues   jsonb DEFAULT NULL,
  p_motivo    text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;
  IF p_aliado_id IS NULL THEN
    RAISE EXCEPTION 'Falta el aliado sobre el que se registra la acción.';
  END IF;

  INSERT INTO public.aliado_auditoria (
    aliado_id, actor_id, actor_rol, accion, datos_antes, datos_despues, motivo
  ) VALUES (
    p_aliado_id, auth.uid(), public.closers_my_role(), p_accion, p_antes, p_despues,
    nullif(btrim(coalesce(p_motivo, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_auditoria_aliado(uuid, text, jsonb, jsonb, text) IS
  'Única puerta de escritura de aliado_auditoria. Firma la acción con auth.uid(): nadie puede registrarla a nombre de otro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) CREDENCIALES DE ACCESO (§8 / §9)
-- ─────────────────────────────────────────────────────────────────────────────
-- El closer ve las credenciales SOLO de los aliados que él creó. Se sirven por
-- función y no leyendo la fila porque el RLS de Postgres es ciego a COLUMNAS: la
-- política que le deja ver a sus aliados atribuidos le entrega la fila entera.
-- Esta función es el camino que la aplicación usa y el que deja rastro en la
-- auditoría; el día que se pase a leer `profiles` por lista explícita de
-- columnas, se podrá REVOKE la columna y cerrar también el acceso crudo.
CREATE OR REPLACE FUNCTION public.credenciales_aliado(p_aliado_id uuid)
RETURNS TABLE (email text, password_provisional text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol      text := public.closers_my_role();
  v_direccion boolean := public.closers_is_direccion();
  v_aliado   record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;

  SELECT p.id, p.role, p.email AS correo, p.password_provisional AS clave, p.created_by
    INTO v_aliado
    FROM public.profiles p
   WHERE p.id = p_aliado_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese aliado ya no existe.';
  END IF;
  IF v_aliado.role <> 'aliado' THEN
    RAISE EXCEPTION 'Esta función solo entrega credenciales de aliados.';
  END IF;

  IF NOT (
    v_direccion
    OR v_rol = 'account_manager'
    OR (v_rol = 'closer' AND v_aliado.created_by IS NOT NULL AND v_aliado.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Solo puedes ver las credenciales de los aliados que diste de alta.';
  END IF;

  PERFORM public.registrar_auditoria_aliado(p_aliado_id, 'credenciales_vistas', NULL, NULL, NULL);

  RETURN QUERY SELECT v_aliado.correo, v_aliado.clave;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) EL CLOSER ADMINISTRA SOLO LO QUE CREÓ (§8 / §9)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cambio respecto de 20260801000004: antes bastaba con ser el closer de origen o
-- el actual. La especificación lo acota a HABER CREADO la cuenta. Un aliado que
-- le abrió el AM y le atribuyó a él lo ve y le trabaja el proceso comercial,
-- pero no le corrige el nombre ni le carga el contrato: eso es administración.
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
  v_rol          text := public.closers_my_role();
  v_es_direccion boolean := public.closers_is_direccion();
  v_aliado       record;
  v_nombre       text := btrim(coalesce(p_full_name, ''));
  v_contrato     text := nullif(btrim(coalesce(p_contrato_url, '')), '');
  v_telefono     text := nullif(btrim(coalesce(p_phone, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;

  SELECT id, role, full_name, phone, closer_origen_id, closer_actual_id, contrato_url, created_by
    INTO v_aliado
    FROM public.profiles
   WHERE id = p_aliado_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese aliado ya no existe.';
  END IF;

  IF v_aliado.role <> 'aliado' THEN
    RAISE EXCEPTION 'Esta función solo edita perfiles de aliados.';
  END IF;

  -- Alcance: Dirección con cualquiera; el AM con cualquier aliado (es quien
  -- responde por la cartera); el closer solo con los que él dio de alta.
  IF NOT (
    v_es_direccion
    OR v_rol = 'account_manager'
    OR (v_rol = 'closer' AND v_aliado.created_by IS NOT NULL AND v_aliado.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Solo puedes administrar los aliados que diste de alta. Este lo abrió otra persona: puedes verlo y trabajar su proceso comercial, pero no editarlo.';
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

  PERFORM public.registrar_auditoria_aliado(
    p_aliado_id,
    'edicion',
    jsonb_build_object('full_name', v_aliado.full_name, 'phone', v_aliado.phone,
                       'contrato_url', v_aliado.contrato_url),
    jsonb_build_object('full_name', v_nombre, 'phone', v_telefono,
                       'contrato_url', v_contrato),
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.closer_actualiza_aliado(uuid, text, text, text) IS
  'Edición acotada de un aliado: SOLO nombre, teléfono y enlace del contrato. El closer únicamente puede con los aliados que él creó (§8); ver uno atribuido no da derecho a editarlo (§9).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) LA LISTA DE ALIADOS DEL CLOSER DICE QUIÉN LOS CREÓ
-- ─────────────────────────────────────────────────────────────────────────────
-- Se añaden dos columnas de salida, así que hay que DROP + CREATE: Postgres no
-- deja cambiar el RETURNS TABLE de una función con CREATE OR REPLACE.
--
-- El WHERE sigue anclado en `closer_origen_id` a propósito: esta lista ES la
-- producción del closer y tiene que cuadrar al aliado con lo que suma
-- `closers_overview`. Los dos casos del §7 caen aquí igual, porque atribuir un
-- aliado a un closer fija su `closer_origen_id`.
DROP FUNCTION IF EXISTS public.closer_aliados(uuid, date, date);
CREATE FUNCTION public.closer_aliados(
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
    a.created_by,
    -- "Lo creé yo" desde el punto de vista del closer de esta ficha. NULL nunca
    -- concede permisos: un aliado sin creador conocido no lo administra nadie
    -- salvo Dirección y el AM.
    (a.created_by IS NOT NULL AND a.created_by = p_closer_id),
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
           e.nombre, a.fecha_incorporacion_closer, a.closer_actual_id, a.created_by
  ORDER BY a.fecha_incorporacion_closer DESC NULLS LAST, a.full_name;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) LAS POLÍTICAS DE ALTA VUELVEN A EXIGIR LA AUTORÍA
-- ─────────────────────────────────────────────────────────────────────────────
-- La condición se escribe como "NULL o yo mismo" y no como "= auth.uid()" para
-- que el orden de despliegue no rompa nada: si la migración llega antes que el
-- código (que es el orden correcto), un alta que todavía no manda `created_by`
-- sigue funcionando y el trigger le pone el valor bueno igual.

-- 6.a El closer da de alta a sus aliados (era 20260801000001).
DROP POLICY IF EXISTS "Closers dan de alta a sus aliados" ON public.profiles;
CREATE POLICY "Closers dan de alta a sus aliados"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.closers_my_role() = 'closer'
    AND role = 'aliado'
    AND closer_origen_id = auth.uid()
    AND closer_actual_id = auth.uid()
    AND account_manager_id IS NULL
    AND (closer_asignado_por IS NULL OR closer_asignado_por = auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );

COMMENT ON POLICY "Closers dan de alta a sus aliados" ON public.profiles IS
  'El alta de un aliado ES la producción del closer. Solo puede crear role=aliado, atribuido a sí mismo y firmado por él: el WITH CHECK impide fabricar admins, robar atribución ajena o abrir una cuenta a nombre de otro.';

-- 6.b Admin / Director / Account Manager (era 20260803000000).
--     Se conserva íntegra la acotación del AM a ('aliado','closer') y se le
--     suma la firma. Original, por si hubiera que revertir:
--       ((get_user_role(auth.uid()) = 'admin') OR (... = 'director')
--        OR ((... = 'account_manager') AND role IN ('aliado','closer'))
--        OR (auth.uid() = id))
DROP POLICY IF EXISTS "Admins y Account Managers pueden crear perfiles" ON public.profiles;
CREATE POLICY "Admins y Account Managers pueden crear perfiles"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (
    (
      (
        public.get_user_role(auth.uid()) = 'admin'
        OR public.get_user_role(auth.uid()) = 'director'
        OR (
          public.get_user_role(auth.uid()) = 'account_manager'
          AND role IN ('aliado', 'closer')
        )
      )
      AND (created_by IS NULL OR created_by = auth.uid())
    )
    -- El auto-registro va aparte: ahí no hay creador que valga.
    OR auth.uid() = id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) PERMISOS
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.profiles_stamp_autoria()                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aliado_lo_cree_yo(uuid)                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_auditoria_aliado(uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.credenciales_aliado(uuid)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closer_actualiza_aliado(uuid, text, text, text)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.closer_aliados(uuid, date, date)                          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.aliado_lo_cree_yo(uuid)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria_aliado(uuid, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credenciales_aliado(uuid)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.closer_actualiza_aliado(uuid, text, text, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.closer_aliados(uuid, date, date)                          TO authenticated;

GRANT SELECT ON public.aliado_auditoria TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
