-- =============================================================================
-- PensiónFlow - Migración: subetapa "Agenda Futura" del condicionamiento
-- =============================================================================
-- Puramente aditiva. Agrega el estado 'agenda_futura' como una nueva subetapa de
-- "Condicionado" (junto a aportacion / falta_semanas / falta_afore_cuenta /
-- posible_simulacion). Se usa cuando el expediente se pospone para una nueva
-- evaluación en una fecha futura definida por el Director o el Account Manager.
--
-- Además agrega la columna `reeval_date` (nullable) para registrar la fecha de la
-- nueva evaluación agendada. Nullable: los prospectos existentes quedan en NULL.
-- No modifica ningún prospecto existente: solo amplía el CHECK de la columna
-- status para permitir el nuevo valor y añade la columna de fecha.
-- La línea de tiempo (prospect_status_history + trigger) ya acepta cualquier
-- estado, así que no requiere cambios.
-- =============================================================================

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS reeval_date date;

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_status_check;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_status_check CHECK (status IN (
    'evaluacion_pendiente',
    'rechazado',
    'aprobado_listo',
    'asesoria_agendada',
    'doc_proceso',
    'analisis_riesgo',
    'firma_contrato',
    'firma_programada',
    'pagado_comision',
    'aportacion',
    'falta_reporte',
    'falta_afore',
    'pendiente_documentos',
    'cerrado_perdido',
    'falta_semanas',
    'falta_afore_cuenta',
    'posible_simulacion',
    'agenda_futura'
  ));
