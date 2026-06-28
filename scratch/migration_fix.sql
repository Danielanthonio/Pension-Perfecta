ALTER TABLE prospects ADD COLUMN IF NOT EXISTS credito_nomina numeric DEFAULT 0;

ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_status_check 
  CHECK (status IN (
      'evaluacion_pendiente',
      'rechazado',
      'aprobado_listo',
      'asesoria_agendada',
      'doc_proceso',
      'analisis_riesgo',
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
