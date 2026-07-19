-- =============================================================================
-- PensiónFlow - Migración: modalidad de aprobación (40 / 10) del prospecto
-- =============================================================================
-- Puramente aditiva. Agrega la columna `modalidad` a la tabla `prospects` para
-- registrar con qué modalidad (40 o 10) fue aprobado el cliente por el Director
-- o el Account Manager. Nullable: los prospectos existentes quedan sin modalidad
-- hasta que se apruebe/edite. El aliado ve esta modalidad en su portal y solo se
-- le abre la agenda (meeting_link_m40 / meeting_link_m10) que corresponda.
-- No modifica ningún prospecto existente.
-- =============================================================================

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS modalidad text;

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_modalidad_check;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_modalidad_check CHECK (
    modalidad IS NULL OR modalidad IN ('40', '10')
  );
