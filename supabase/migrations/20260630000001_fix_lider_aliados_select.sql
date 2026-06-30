-- =============================================================================
-- PensiónFlow - Migración: Permitir a aliados ver sus propios líderes
-- =============================================================================

-- 1. Eliminar la política anterior restrictiva
DROP POLICY IF EXISTS "Aliados_no_ven_relaciones" ON public.lider_aliados;

-- 2. Crear la nueva política que permite a aliados consultar sus líderes
CREATE POLICY "Aliados_ven_sus_propios_lideres"
  ON public.lider_aliados
  FOR SELECT
  USING (auth.uid() = aliado_asignado_id);
