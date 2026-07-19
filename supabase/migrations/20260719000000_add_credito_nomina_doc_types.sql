-- =============================================================================
-- PensiónFlow - Migración: tipos de documento para Crédito de nómina
-- =============================================================================
-- Puramente aditiva. Amplía el CHECK de `documents.file_type` para admitir los
-- dos documentos que integran el expediente de un prospecto de Crédito de nómina:
--   'RESOLUCION' → Resolución de Pensión del cliente (de aquí el OCR lee CURP y NSS)
--   'INE'        → Identificación oficial (INE) del cliente
-- Los prospectos de Modalidad 40/10 siguen usando 'IMSS' y 'AFORE' sin cambios.
-- No modifica ningún documento existente. El nombre del constraint generado por
-- el CHECK inline de la tabla es `documents_file_type_check`.
-- =============================================================================

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_file_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_file_type_check CHECK (
    file_type IS NULL
    OR file_type IN ('AFORE', 'IMSS', 'OTROS', 'RESOLUCION', 'INE')
  );
