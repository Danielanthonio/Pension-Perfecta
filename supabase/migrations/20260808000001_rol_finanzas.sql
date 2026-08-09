-- =============================================================================
-- PensiónFlow — Rol `finanzas`: entra al libro mayor y a nada más
-- =============================================================================
-- Pedido por Dirección el 2026-08-08. Hasta hoy el módulo de Finanzas y
-- Comisiones solo lo abrían las cuentas listadas a mano en
-- `comision_config.acceso_ids` (20260802000003), y todas ellas son cuentas de
-- DIRECCIÓN: quien entra a cobrar y pagar ve, además, el pipeline completo, la
-- gestión de aliados y la de usuarios.
--
-- Este rol invierte el recorte: `finanzas` ve el libro mayor COMPLETO y ninguna
-- otra pantalla de la consola.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UN ROL Y NO OTRA ENTRADA EN `acceso_ids`
-- ─────────────────────────────────────────────────────────────────────────────
-- `acceso_ids` responde "¿puede mirar Finanzas?". No responde "¿puede mirar el
-- resto de la app?", porque eso lo decide el ROL. Meter a un contador en la
-- lista con rol `admin` le abriría Gestión de Clientes y Gestión de Usuarios,
-- que es exactamente lo que se quiere evitar. Las dos preguntas siguen
-- separadas: la lista sigue mandando para las cuentas de dirección y el rol
-- nuevo entra por su propia puerta.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ PUEDE HACER DENTRO
-- ─────────────────────────────────────────────────────────────────────────────
-- Lo mismo que la Dirección: revisar, aprobar, generar cortes, registrar pagos
-- y editar tarifas. Es un rol OPERATIVO de finanzas, no un espectador; un
-- contador que no puede registrar el depósito que acaba de hacer no sirve de
-- nada. Si algún día se quiere una variante de solo lectura, el sitio es
-- `fin_require_direccion()` (portero de las 21 RPC de escritura), que se puede
-- estrechar sin tocar `fin_is_direccion()` (portero de lectura).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ **NO** SE LE DA, Y POR QUÉ
-- ─────────────────────────────────────────────────────────────────────────────
-- · Lectura de `prospects`. No existe ninguna política que se lo dé y no se
--   añade: los importes ya le llegan agregados por las RPC, que devuelven el
--   nombre del cliente pero nunca su CURP, su NSS ni su teléfono.
-- · Lectura ABIERTA de `profiles`. El RLS de Postgres es CIEGO A COLUMNAS: una
--   política que le dejara ver la fila de cada aliado para poder pintar un
--   selector de nombres le entregaría también `password_provisional`. En su
--   lugar se le da `fin_directorio()`, que devuelve tres columnas y nada más.
--   Mismo criterio que `credencialesAliado` (20260804000000).
-- · Cobrar. `comision_eventos.rol_beneficiario` sigue admitiendo solo
--   ('director','account_manager','closer','aliado'): este rol administra el
--   dinero de otros, no devenga.
--
-- Aditiva e idempotente. No toca roles existentes, ni `acceso_ids`, ni el
-- beneficiario de las comisiones de Dirección, ni el portero del módulo Closers
-- (`closers_is_direccion`, que es independiente y sigue excluyendo a `finanzas`).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) EL ROL 'finanzas' DEBE CABER EN profiles.role
-- ─────────────────────────────────────────────────────────────────────────────
-- Mismo procedimiento que en 20260801000000 cuando entró `closer`: el CHECK se
-- localiza por la COLUMNA a la que aplica y no por su nombre, porque el de
-- producción se creó a mano y el nombre puede no coincidir.
DO $$
DECLARE
  c record;
  invalidos int;
BEGIN
  -- 1.a Aborta ANTES de tocar nada si hay algún rol inesperado en la tabla: el
  -- ADD CONSTRAINT valida todas las filas y, si falla, se cae la migración
  -- entera. Mejor un mensaje que diga qué revisar.
  SELECT count(*) INTO invalidos
  FROM public.profiles
  WHERE role IS NOT NULL
    AND role NOT IN ('admin', 'director', 'aliado', 'account_manager', 'closer', 'finanzas');

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
  CHECK (role IS NULL OR role IN ('admin', 'director', 'aliado', 'account_manager', 'closer', 'finanzas'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) EL PORTERO DE FINANZAS ADMITE AL ROL NUEVO
-- ─────────────────────────────────────────────────────────────────────────────
-- Se reemplaza el CUERPO, no la firma: las 21 RPC del módulo y las 6 políticas
-- de RLS ya llaman a esta función y quedan ampliadas todas a la vez, sin tocar
-- ninguna de ellas. La lista `acceso_ids` sigue mandando igual que antes para
-- las cuentas de dirección; el rol `finanzas` se suma con un OR.
--
-- El nombre de la función se conserva a propósito (renombrarla obligaría a
-- reescribir 27 sitios y a mantener un alias para no romper nada a medio
-- despliegue). Lo que dice hoy es "¿puede este usuario entrar al módulo?".
CREATE OR REPLACE FUNCTION public.fin_is_direccion()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       -- El rol dedicado: existe para esto y para nada más.
       public.fin_my_role() = 'finanzas'
       -- Las cuentas de dirección autorizadas una por una (20260802000003).
       OR EXISTS (
         SELECT 1
         FROM public.comision_config c
         WHERE c.id
           AND auth.uid() = ANY (c.acceso_ids)
       )
     );
$$;

COMMENT ON FUNCTION public.fin_is_direccion() IS
  'Portero ÚNICO del módulo de Finanzas: entra el rol `finanzas` (que no ve nada más de la app) o una cuenta de dirección listada en comision_config.acceso_ids. Tener rol de dirección NO basta por sí solo: el libro mayor expone sueldos y datos bancarios de todo el equipo.';

-- El mensaje de rechazo ya no es cierto ("exclusivo de la Dirección") y es lo
-- único que ve el usuario cuando una RPC lo frena.
CREATE OR REPLACE FUNCTION public.fin_require_direccion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;
  IF NOT public.fin_is_direccion() THEN
    RAISE EXCEPTION 'No tienes acceso al módulo de Finanzas y Comisiones.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) EL DIRECTORIO MÍNIMO PARA LOS SELECTORES DE LA PANTALLA
-- ─────────────────────────────────────────────────────────────────────────────
-- Dos controles del módulo se dibujan con una lista de personas, no con
-- importes: "a quién le hago este ajuste manual" y "quién cobra las comisiones
-- de Dirección". Hasta hoy salían del `profiles` que el navegador ya tenía
-- cargado, que para una cuenta de dirección es la tabla entera.
--
-- Una cuenta con rol `finanzas` no ve `profiles` (a propósito, ver la cabecera),
-- así que esos dos selectores le saldrían vacíos y el ajuste manual quedaría
-- inservible. Esta función da EXACTAMENTE lo que los selectores necesitan —id,
-- nombre y rol— y nada más: ni teléfono, ni CURP, ni CLABE, ni la contraseña
-- provisional que el RLS, ciego a columnas, no sabría esconder.
--
-- Devuelve 0 filas a quien no pasa el portero, igual que el resto de las RPC de
-- lectura del módulo (patrón de 20260802000001).
CREATE OR REPLACE FUNCTION public.fin_directorio()
RETURNS TABLE (
  id     uuid,
  nombre text,
  rol    text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id,
         coalesce(nullif(btrim(p.full_name), ''), p.email, 'Sin nombre') AS nombre,
         -- La app escribe 'admin' para la Dirección; la pantalla compara contra
         -- 'director'. Se normaliza aquí para que el cliente no tenga que saberlo.
         CASE WHEN p.role IN ('admin', 'director') THEN 'director' ELSE p.role END AS rol
    FROM public.profiles p
   WHERE public.fin_is_direccion()
     -- Solo quien puede COBRAR en el sistema. El propio rol `finanzas` queda
     -- fuera: no devenga nada, así que ofrecerlo como destino de un ajuste
     -- manual solo invita a un asiento imposible.
     AND p.role IN ('admin', 'director', 'account_manager', 'closer', 'aliado')
   ORDER BY 2;
$$;

COMMENT ON FUNCTION public.fin_directorio() IS
  'Personas que pueden aparecer en los selectores del módulo de Finanzas (ajuste manual y beneficiario de las comisiones de Dirección): id, nombre y rol normalizado. Existe para no tener que abrir `profiles` —fila completa, contraseña provisional incluida— a una cuenta con rol `finanzas`.';

REVOKE ALL ON FUNCTION public.fin_directorio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_directorio() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) COMPROBACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_acceso int;
BEGIN
  -- El CHECK admite el rol nuevo.
  BEGIN
    PERFORM 1 FROM public.profiles WHERE role = 'finanzas';
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'El rol `finanzas` no es consultable en profiles.role: %', SQLERRM;
  END;

  -- La lista de acceso de las cuentas de dirección sigue en pie: si esta
  -- migración la hubiera dejado vacía, las cuentas de Raúl y Daniel perderían
  -- el módulo y solo se recuperaría con SQL.
  SELECT coalesce(array_length(acceso_ids, 1), 0) INTO v_acceso
    FROM public.comision_config WHERE id;

  IF v_acceso = 0 THEN
    RAISE EXCEPTION 'comision_config.acceso_ids quedó vacío: las cuentas de dirección perderían Finanzas. Se aborta.';
  END IF;

  RAISE NOTICE 'Rol `finanzas` habilitado. Cuentas de dirección con acceso por lista: %.', v_acceso;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
