-- =============================================================================
-- PensiónFlow — Finanzas: el acceso deja de ser "cualquier rol de dirección"
-- =============================================================================
-- Al desplegar el módulo salió a la luz que `role = 'admin'` lo tienen hoy SEIS
-- cuentas, y solo una es la Dirección real (Raúl Villouta, 2026-08-01). El resto
-- son cuentas de control, de prueba y de personas del equipo que necesitan
-- `admin` para Gestión de Clientes o Usuarios, pero que NO deben ver el libro
-- mayor: ahí están los sueldos de todo el equipo, sus CLABE y sus ID de Binance.
--
-- POR QUÉ UNA LISTA Y NO UN CAMBIO DE ROLES
-- Bajarles el rol a esas cinco cuentas les alteraría el acceso a TODA la app
-- (clientes, aliados, usuarios, reportes) para arreglar un problema que solo
-- existe en Finanzas. Se estrecha el portero de este módulo y nada más.
--
-- POR QUÉ UNA LISTA Y NO "el beneficiario configurado"
-- Sería más corto comprobar `auth.uid() = fin_director_id()`, pero eso mezcla dos
-- cosas distintas: QUIÉN COBRA las comisiones de Dirección y QUIÉN PUEDE MIRAR el
-- módulo. El día que se quiera que un contador consulte sin cobrar nada, o que el
-- beneficiario cambie sin mover los permisos, la mezcla estorba.
--
-- ⚠️ ORDEN: esta migración TAMBIÉN fija el beneficiario. Si solo se estrechara el
-- portero, `fin_director_id()` seguiría cayendo en la cuenta de dirección más
-- antigua (Daniel Roa) y las comisiones de Dirección se le acumularían a él. Las
-- dos cosas van juntas, en la misma transacción, para que no exista un estado
-- intermedio incorrecto.
--
-- ⚠️ FRENO DE SEGURIDAD: si la cuenta de Raúl no existiera, la migración ABORTA
-- entera. Dejar `acceso_ids` vacío bloquearía el módulo para todo el mundo —
-- incluida `comision_config_guardar`, que también pasa por este portero—, y solo
-- se podría desbloquear con SQL. Es preferible fallar y no aplicar nada.
--
-- Aditiva e idempotente. No toca roles, ni políticas de otras tablas, ni el
-- portero del módulo Closers (`closers_is_direccion`, que es independiente).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) QUIÉN PUEDE ENTRAR
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.comision_config
  ADD COLUMN IF NOT EXISTS acceso_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.comision_config.acceso_ids IS
  'Cuentas que pueden abrir Finanzas y Comisiones. Deliberadamente independiente de `director_beneficiario_id`: una cosa es quién cobra y otra quién mira. Para dar acceso a alguien más: UPDATE public.comision_config SET acceso_ids = acceso_ids || ''<uuid>''::uuid WHERE id;';

DO $$
DECLARE
  v_raul uuid := '63c313e9-ba38-4a98-96e8-3d991c822273';  -- Raul villouta
  v_existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_raul AND role IN ('admin', 'director')
  ) INTO v_existe;

  IF NOT v_existe THEN
    RAISE EXCEPTION
      'No se encontró la cuenta de dirección %. Sin ella, restringir el acceso dejaría el módulo de Finanzas bloqueado para todos. No se aplicó nada.',
      v_raul;
  END IF;

  -- Semilla idempotente: solo si todavía no hay nadie autorizado. Si la Dirección
  -- ya amplió la lista a mano, re-aplicar la migración no la pisa.
  UPDATE public.comision_config
     SET acceso_ids = ARRAY[v_raul],
         updated_at = timezone('utc'::text, now())
   WHERE id AND coalesce(array_length(acceso_ids, 1), 0) = 0;

  -- El beneficiario de las comisiones de Dirección, por la misma razón: sin esto
  -- `fin_director_id()` cae en la cuenta más antigua, que no es la correcta.
  UPDATE public.comision_config
     SET director_beneficiario_id = v_raul,
         updated_at = timezone('utc'::text, now())
   WHERE id AND director_beneficiario_id IS NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) EL PORTERO
-- ─────────────────────────────────────────────────────────────────────────────
-- Se reemplaza el cuerpo, no la firma: las 21 RPC del módulo y las 6 políticas
-- de RLS ya llaman a esta función y quedan estrechadas todas a la vez, sin tocar
-- ninguna de ellas.
CREATE OR REPLACE FUNCTION public.fin_is_direccion()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.comision_config c
       WHERE c.id
         AND auth.uid() = ANY (c.acceso_ids)
     );
$$;

COMMENT ON FUNCTION public.fin_is_direccion() IS
  'Portero ÚNICO del módulo de Finanzas. Ya no basta con tener rol de dirección: hay que estar en comision_config.acceso_ids. El libro mayor expone sueldos y datos bancarios de todo el equipo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) "¿PUEDO VER ESTO?" PARA LA INTERFAZ
-- ─────────────────────────────────────────────────────────────────────────────
-- Sin esto, una cuenta `admin` no autorizada pasaría el filtro de la pantalla
-- (que solo mira el rol), vería el módulo vacío y recibiría un error al
-- sincronizar. Con esto la app le dice de frente que no tiene acceso.
-- No es SECURITY DEFINER por capricho: `comision_config` está bajo RLS y una
-- cuenta no autorizada no puede leerla para responderse sola.
CREATE OR REPLACE FUNCTION public.fin_puedo_ver()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.fin_is_direccion();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) COMPROBACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n int;
  v_ben uuid;
BEGIN
  SELECT coalesce(array_length(acceso_ids, 1), 0), director_beneficiario_id
    INTO v_n, v_ben
    FROM public.comision_config WHERE id;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'La lista de acceso quedó vacía: el módulo sería inaccesible. Se aborta.';
  END IF;
  IF v_ben IS NULL THEN
    RAISE EXCEPTION 'El beneficiario de las comisiones de Dirección quedó sin fijar. Se aborta.';
  END IF;

  RAISE NOTICE 'Finanzas: % cuenta(s) con acceso; comisiones de Dirección a %.', v_n, v_ben;
END $$;

COMMIT;
