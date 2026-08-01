-- =============================================================================
-- PensiónFlow — El contrato del aliado pasa a ser advertencia, no requisito
-- =============================================================================
-- Decisión de Dirección el 2026-08-01, el mismo día: el enlace al contrato se
-- sigue pidiendo y se sigue avisando de que hace falta para cobrar comisiones,
-- pero NO bloquea el alta. Con 228 aliados vivos sin contrato, exigirlo desde el
-- primer día habría convertido una regla de orden en un freno a la operación.
--
-- Esto revierte ÚNICAMENTE la condición añadida en 20260801000002. Se conservan:
--   * las columnas `contrato_url` / `contrato_url_at` (el dato se sigue guardando),
--   * el índice `idx_profiles_aliados_sin_contrato` (para listar a quién le falta),
--   * el resto del WITH CHECK de 20260801000001, que es lo que impide que un
--     closer se fabrique un admin o le cuelgue el alta a otro.
--
-- Si algún día vuelve a ser obligatorio, basta con reponer las dos líneas de
-- `contrato_url` en esta misma política.
-- =============================================================================

BEGIN;

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
  );

COMMENT ON POLICY "Closers dan de alta a sus aliados" ON public.profiles IS
  'El alta de un aliado ES la producción del closer. Solo role=aliado y atribuido a sí mismo. El contrato se pide y se advierte en la app, pero NO se exige aquí (decisión del 2026-08-01).';

NOTIFY pgrst, 'reload schema';

COMMIT;
