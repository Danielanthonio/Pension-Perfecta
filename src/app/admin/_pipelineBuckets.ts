// Buckets de estado compartidos por el Dashboard del director (admin/page.tsx),
// el módulo Reportes (admin/reportes/page.tsx) y cualquier KPI que deba cuadrar con
// el Embudo Comercial. Fuente única de verdad para que los conteos no diverjan.
//
// "Aprobado" = misma etapa que usa Gestión Clientes (getStageAndSubStage → stage "aprobado"):
// el dictamen de aprobación + todo el pipeline de cierre posterior (Agenda Asesoría, Firma Carta
// Compromiso, Análisis de Riesgo, Firma de Contrato, Cerrada Ganada). Ya fueron aprobados.
export const APPROVED_STAGE = ["aprobado_listo", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato", "firma_programada"];
export const CONDITIONED_STAGE = ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "agenda_futura", "aportacion"];
export const FINANCED_APPROVED = ["aprobado_listo", "aportacion", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato", "firma_programada", "pagado_comision"];
// "Evaluados" = proyectos con dictamen/respuesta (aprobado, condicionado, rechazado u otorgado).
// El único estado previo al dictamen que se excluye es evaluacion_pendiente.
export const EVALUATED_STAGE = [...APPROVED_STAGE, ...CONDITIONED_STAGE, "rechazado", "pagado_comision"];
