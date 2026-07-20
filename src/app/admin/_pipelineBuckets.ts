// Buckets de estado compartidos por el Dashboard del director (admin/page.tsx),
// el módulo Reportes (admin/reportes/page.tsx) y cualquier KPI que deba cuadrar con
// el Embudo Comercial. Fuente única de verdad para que los conteos no diverjan.
//
// "Aprobado" = dictamen de aprobación + el pipeline de cierre HASTA Firma de Contrato
// (Agenda Asesoría, Firma Carta Compromiso, Análisis de Riesgo, Firma de Contrato). Un
// proyecto se mantiene "Aprobado" mientras avanza esos pasos. Al ejecutarse el
// financiamiento (Cerrada Ganada = firma_programada) pasa a "Fin. Otorgado", ya NO cuenta
// aquí. Esto hace que el conteo del embudo "Fin. Otorgado" cuadre con la línea de tiempo.
export const APPROVED_STAGE = ["aprobado_listo", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato"];
export const CONDITIONED_STAGE = ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "agenda_futura", "aportacion"];
// "Fin. Otorgado" = financiamiento otorgado/ejecutado: Cerrada Ganada (firma_programada, se
// ejecutan las líneas de captura) y Pagado/Cerrado (pagado_comision, comisión ya liberada).
export const FIN_OTORGADO_STAGE = ["firma_programada", "pagado_comision"];
export const FINANCED_APPROVED = ["aprobado_listo", "aportacion", "asesoria_agendada", "doc_proceso", "analisis_riesgo", "firma_contrato", "firma_programada", "pagado_comision"];
// "Evaluados" = proyectos con dictamen/respuesta (aprobado, condicionado, rechazado o
// fin. otorgado). El único estado previo al dictamen que se excluye es evaluacion_pendiente.
export const EVALUATED_STAGE = [...APPROVED_STAGE, ...CONDITIONED_STAGE, "rechazado", ...FIN_OTORGADO_STAGE];
