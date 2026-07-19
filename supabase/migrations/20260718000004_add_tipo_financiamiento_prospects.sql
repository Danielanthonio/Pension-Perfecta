-- =============================================================================
-- PensiónFlow - Migración: tipo de financiamiento del prospecto (captura)
-- =============================================================================
-- Puramente aditiva. Agrega la columna `tipo_financiamiento` a la tabla
-- `prospects` para registrar con qué tipo de producto ingresó el prospecto:
--   'credito_nomina'  → Crédito de nómina
--   'modalidad_40_10' → Modalidad 40/10
-- Lo elige el ALIADO al capturar (ventana bloqueante en "Subir Prospecto") y
-- sirve para diferenciar el origen del expediente ante el Director y el Account
-- Manager. Es independiente de la columna `modalidad` (40/10) que el Director/AM
-- fija al aprobar. Nullable: los prospectos existentes quedan sin tipo hasta que
-- se capture/edite uno nuevo. No modifica ningún prospecto existente.
-- =============================================================================

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS tipo_financiamiento text;

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_tipo_financiamiento_check;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_tipo_financiamiento_check CHECK (
    tipo_financiamiento IS NULL
    OR tipo_financiamiento IN ('credito_nomina', 'modalidad_40_10')
  );
