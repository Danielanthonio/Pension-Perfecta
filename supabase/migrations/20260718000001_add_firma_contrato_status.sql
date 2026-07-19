-- =============================================================================
-- PensiónFlow - Migración: nueva etapa "Firma de Contrato" en el pipeline
-- =============================================================================
-- Puramente aditiva. Inserta el estado 'firma_contrato' entre 'analisis_riesgo'
-- (Análisis de Riesgo) y 'firma_programada' (Cerrada Ganada). No modifica ningún
-- prospecto existente: solo amplía el CHECK de la columna status para permitir el
-- nuevo valor. La línea de tiempo (prospect_status_history + trigger) ya acepta
-- cualquier estado, así que no requiere cambios.
-- =============================================================================

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
    'posible_simulacion'
  ));
