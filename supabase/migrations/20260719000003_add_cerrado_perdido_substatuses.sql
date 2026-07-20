-- =============================================================================
-- PensiónFlow - Migración: subetapas de "Cerrado Perdido"
-- =============================================================================
-- Puramente aditiva. Cerrado Perdido pasa de un motivo en texto libre a DOS
-- subetapas con estado propio en la BD, para que el selector de etapa/subetapa
-- las "recuerde" al recargar (igual que Aprobado / Condicionado / Fin. Otorgado):
--   - 'cerrado_riesgo'  = Cerrado Perdido · Análisis de riesgo rechazado
--   - 'cerrado_desiste' = Cerrado Perdido · Desiste
-- El estado legacy 'cerrado_perdido' se conserva como válido (los prospectos ya
-- cerrados no se tocan; se muestran como "Desiste" por defecto y su motivo real
-- sigue en las notas / historial).
--
-- No modifica ningún prospecto existente: solo amplía el CHECK de la columna
-- status. La línea de tiempo (prospect_status_history + trigger) ya acepta
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
    'cerrado_riesgo',
    'cerrado_desiste',
    'falta_semanas',
    'falta_afore_cuenta',
    'posible_simulacion',
    'agenda_futura'
  ));
