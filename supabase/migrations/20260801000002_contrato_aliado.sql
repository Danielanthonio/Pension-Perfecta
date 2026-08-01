-- =============================================================================
-- PensiónFlow — Contrato firmado del aliado (obligatorio al darlo de alta)
-- =============================================================================
-- Regla dicha por Dirección el 2026-08-01: al incorporar un aliado hay que dejar
-- el enlace al CONTRATO firmado con esa persona. No es papeleo opcional: cuando
-- llega el pago de comisiones se revisa que la documentación esté completa, y un
-- aliado sin contrato traba su propio pago y el del closer que lo trajo.
--
-- Se guarda el ENLACE, no el archivo. Los contratos ya viven donde los firman
-- (Drive, el gestor de firma electrónica, etc.) y duplicarlos aquí obligaría a
-- mantener dos copias, decidir cuál manda y cargar con la custodia de un
-- documento con datos personales. El enlace es el dato que de verdad se usa al
-- revisar el pago.
--
-- ADITIVA: dos columnas nuevas, un índice y la reescritura de UNA política
-- creada por nosotros ayer (20260801000001). No se toca nada anterior.
--
-- ⚠️ Deliberadamente NO se pone NOT NULL en la columna: hay 227 aliados vivos
-- que se dieron de alta antes de esta regla y quedarían con la fila inválida.
-- La obligatoriedad se impone donde sí puede imponerse sin romper el pasado: en
-- el alta que hace un closer (el WITH CHECK de su política) y en los formularios.
-- Los aliados históricos se ven en el índice de abajo, para irlos completando.
-- =============================================================================

BEGIN;

-- 1) Dónde está el contrato firmado -------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contrato_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contrato_url_at timestamptz;

COMMENT ON COLUMN public.profiles.contrato_url IS
  'Enlace al contrato firmado con el aliado. Obligatorio en el alta hecha por un closer; se revisa al pagar comisiones.';
COMMENT ON COLUMN public.profiles.contrato_url_at IS
  'Cuándo se registró o actualizó el enlace del contrato.';

-- 2) "¿Quién no tiene contrato?" ----------------------------------------------
-- La pregunta que se hará Dirección cada quincena de pago.
CREATE INDEX IF NOT EXISTS idx_profiles_aliados_sin_contrato
  ON public.profiles (role)
  WHERE contrato_url IS NULL;

-- 3) El closer no puede dar de alta sin contrato -------------------------------
-- Misma política de ayer, con una condición más. Se reescribe entera (DROP +
-- CREATE) porque Postgres no permite añadir condiciones a un WITH CHECK ya
-- creado. Sigue siendo ADITIVA respecto al resto: no toca la política de
-- Dirección/AM, que conserva su comportamiento anterior.
--
-- El `<> ''` no sobra: un formulario que mande la cadena vacía pasaría un
-- IS NOT NULL sin problema y dejaría el contrato igual de ausente.
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
    AND contrato_url IS NOT NULL
    AND btrim(contrato_url) <> ''
  );

COMMENT ON POLICY "Closers dan de alta a sus aliados" ON public.profiles IS
  'El alta de un aliado ES la producción del closer. Solo role=aliado, atribuido a sí mismo y CON el enlace al contrato firmado: sin contrato no hay alta, porque sin contrato no hay pago de comisión.';

NOTIFY pgrst, 'reload schema';

COMMIT;
